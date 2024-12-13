'use strict'
const { context, trace, SpanStatusCode } = require('@opentelemetry/api')
const { getRPCMetadata, RPCType } = require('@opentelemetry/core')
const { ATTR_HTTP_ROUTE } = require('@opentelemetry/semantic-conventions')
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
  'onResponse',
  'onError'
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
                [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - route -> ${hook}`,
                [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.ROUTE,
                [ATTR_HTTP_ROUTE]: routeOptions.url,
                [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
                  handlerLike.name ?? ANONYMOUS_FUNCTION_NAME
              })
            } else if (Array.isArray(handlerLike)) {
              const wrappedHandlers = []

              for (const handler of handlerLike) {
                wrappedHandlers.push(
                  handlerWrapper(handler, {
                    [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - route -> ${hook}`,
                    [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.ROUTE,
                    [ATTR_HTTP_ROUTE]: routeOptions.url,
                    [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
                      handler.name ?? ANONYMOUS_FUNCTION_NAME
                  })
                )
              }

              routeOptions[hook] = wrappedHandlers
            }
          }
        }

        // We always want to add the onSend hook to the route to be executed last
        if (routeOptions.onSend != null) {
          routeOptions.onSend = Array.isArray(routeOptions.onSend)
            ? [...routeOptions.onSend, onSendHook]
            : [routeOptions.onSend, onSendHook]
        } else {
          routeOptions.onSend = onSendHook
        }

        // We always want to add the onError hook to the route to be executed last
        if (routeOptions.onError != null) {
          routeOptions.onError = Array.isArray(routeOptions.onError)
            ? [...routeOptions.onError, onErrorHook]
            : [routeOptions.onError, onErrorHook]
        } else {
          routeOptions.onError = onErrorHook
        }

        routeOptions.handler = handlerWrapper(routeOptions.handler, {
          [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - route-handler`,
          [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.HANDLER,
          [ATTR_HTTP_ROUTE]: routeOptions.url,
          [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
            routeOptions.handler.name.length > 0
              ? routeOptions.handler.name
              : ANONYMOUS_FUNCTION_NAME
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
              [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - onRequest`,
              [ATTRIBUTE_NAMES.FASTIFY_TYPE]: 'hook',
              [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]: '@fastify/otel',
              [ATTR_HTTP_ROUTE]: request.routeOptions.url
            }
          })

          request[kRequestSpans] = [span]
        }

        hookDone()
      })

      instance.addHook = addHookPatched.bind(instance)

      done()

      function onSendHook (request, _reply, payload, hookDone) {
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

        hookDone(null, payload)
      }

      function onErrorHook (request, reply, error, hookDone) {
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
      }

      function addHookPatched (name, hook) {
        if (FASTIFY_HOOKS.includes(name)) {
          addHookOriginal(
            name,
            handlerWrapper(hook, {
              [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - ${name}`,
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
        return function handlerWrapped (...args) {
          /** @type {FastifyInstrumentation} */
          const instrumentation = this[kInstrumentation]

          if (instrumentation.isEnabled() === false) {
            return handler.call(this, ...args)
          }

          const span = instrumentation.tracer.startSpan(
            `handler - ${
              handler.name?.length > 0
                ? handler.name
                : this.pluginName ?? ANONYMOUS_FUNCTION_NAME
            }`,
            {
              attributes: spanAttributes
            }
          )

          args[0][kRequestSpans].push(span)

          return context.with(
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
