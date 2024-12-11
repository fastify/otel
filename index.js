'use strict'
const { context, trace, SpanStatusCode } = require('@opentelemetry/api')
const { getRPCMetadata, RPCType } = require('@opentelemetry/core')
const {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition
} = require('@opentelemetry/instrumentation')

const fp = require('fastify-plugin')

const {
  version: PACKAGE_VERSION,
  name: PACKAGE_NAME
} = require('./package.json')

// Constants
const SUPPORTED_VERSIONS = '>=5.0.0 <6'
const FASTIFY_HOOKS = [
  'onRequest',
  'preParsing',
  'preValidation',
  'preHandler',
  'preSerialization',
  'onSend',
  'onResponse'
]
const ATTRIBUTE_NAMES = {
  HOOK_NAME: 'hook.name',
  FASTIFY_TYPE: 'fastify.type',
  HOOK_CALLBACK_NAME: 'hook.callback.name'
}
const HOOK_TYPES = {
  ROUTE: 'route-hook',
  INSTANCE: 'hook',
  HANDLER: 'request-handler'
}
const ANONYMOUS_FUNCTION_NAME = 'anonymous'

// Symbols
const kInstrumentation = Symbol('fastify instrumentation instance')
const kRequestSpans = Symbol('fastify instrumentation request spans')

class FastifyInstrumentation extends InstrumentationBase {
  static FastifyInstrumentation = FastifyInstrumentation
  static default = FastifyInstrumentation

  constructor (config) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config)
  }

  init () {
    return [
      new InstrumentationNodeModuleDefinition('fastify', [SUPPORTED_VERSIONS])
    ]
  }

  plugin () {
    const instrumentation = this

    return fp(FastifyInstrumentationPlugin, {
      fastify: SUPPORTED_VERSIONS,
      name: `@fastify/otel@${PACKAGE_VERSION}`
    })

    function FastifyInstrumentationPlugin (instance, opts, done) {
      const addHookOriginal = instance.addHook.bind(instance)

      instance.decorate(kInstrumentation, instrumentation)
      instance.decorateRequest(kRequestSpans, null)

      instance.addHook('onRoute', function (routeOptions) {
        for (const hook of FASTIFY_HOOKS) {
          if (routeOptions[hook] != null) {
            const handlerLike = routeOptions[hook]

            if (typeof handlerLike === 'function') {
              routeOptions[hook] = handlerWrapper(handlerLike, {
                [ATTRIBUTE_NAMES.HOOK_NAME]: `route-${hook}`,
                [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.ROUTE,
                [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
                  handlerLike.name ?? ANONYMOUS_FUNCTION_NAME
              })
            } else if (Array.isArray(handlerLike)) {
              const wrappedHandlers = []

              for (const handler of handlerLike) {
                wrappedHandlers.push(
                  handlerWrapper(handler, {
                    [ATTRIBUTE_NAMES.HOOK_NAME]: `route-${hook}`,
                    [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.ROUTE,
                    [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
                      handler.name ?? ANONYMOUS_FUNCTION_NAME
                  })
                )
              }

              routeOptions[hook] = wrappedHandlers
            }
          }
        }

        routeOptions.handler = handlerWrapper(routeOptions.handler, {
          [ATTRIBUTE_NAMES.HOOK_NAME]: 'route-handler',
          [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.HANDLER,
          [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
            routeOptions.handler.name ?? ANONYMOUS_FUNCTION_NAME
        })
      })

      instance.addHook('onRequest', function (request, _reply, hookDone) {
        if (this[kInstrumentation].isEnabled() === true) {
          const rpcMetadata = getRPCMetadata(context.active())

          if (
            request.routeOptions.url != null &&
            rpcMetadata?.type === RPCType.HTTP
          ) {
            rpcMetadata.route = request.routeOptions.url
          }

          const span = this[kInstrumentation].tracer.startSpan('request', {
            attributes: {
              // TODO: abstract to constants
              'hook.name': 'onRequest',
              'fastify.type': 'hook',
              'plugin.name': '@fastify/otel'
            }
          })

          request[kRequestSpans] = [span]
        }

        hookDone()
      })

      instance.addHook('onResponse', function (request, _reply, hookDone) {
        const spans = request[kRequestSpans]

        if (spans != null && spans.length !== 0) {
          for (const span of spans) {
            span.setStatus({
              code: SpanStatusCode.OK,
              message: 'OK'
            })
            span.end()
          }
        }

        request[kRequestSpans] = null

        hookDone()
      })

      instance.addHook('onError', function (request, _reply, error, hookDone) {
        const spans = request[kRequestSpans]

        if (spans != null && spans.length !== 0) {
          for (const span of spans) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message
            })
            span.recordException(error)
            span.end()
          }
        }

        request[kRequestSpans] = null

        hookDone()
      })

      instance.addHook = addHookPatched.bind(instance)

      done()

      function addHookPatched (name, hook) {
        if (FASTIFY_HOOKS.includes(name)) {
          addHookOriginal(
            name,
            handlerWrapper(hook, {
              [ATTRIBUTE_NAMES.HOOK_NAME]: name,
              [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.INSTANCE,
              [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
                hook.name ?? ANONYMOUS_FUNCTION_NAME
            })
          )
        } else {
          addHookOriginal(name, hook)
        }
      }

      function handlerWrapper (handler, spanAttributes = {}) {
        return function (...args) {
          const instrumenation = this[kInstrumentation]

          if (instrumenation.isEnabled() === false) {
            return handler.call(this, ...args)
          }

          const span = instrumenation.tracer.startSpan('request', {
            attributes: spanAttributes
          })

          console.log(args)
          args[0][kRequestSpans].push(span)

          return context.with(
            context.active(),
            trace.setSpan(context.active(), span),
            function () {
              try {
                const res = handler.call(this, ...args)

                if (typeof res?.then === 'function') {
                  return res.then(
                    result => {
                      span.end()
                      return result
                    },
                    error => {
                      span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: error.message
                      })
                      span.recordException(error)
                      span.end()
                      return Promise.reject(error)
                    }
                  )
                }

                span.end()
                return res
              } catch (error) {
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message
                })
                span.recordException(error)
                span.end()
              }
            },
            this
          )
        }
      }
    }
  }
}

module.exports = FastifyInstrumentation
