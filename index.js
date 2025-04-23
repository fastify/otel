'use strict'
const dc = require('node:diagnostics_channel')
const { context, trace, SpanStatusCode, propagation, diag } = require('@opentelemetry/api')
const { getRPCMetadata, RPCType } = require('@opentelemetry/core')
const {
  ATTR_HTTP_ROUTE,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_SERVICE_NAME
} = require('@opentelemetry/semantic-conventions')
const { InstrumentationBase } = require('@opentelemetry/instrumentation')

const {
  version: PACKAGE_VERSION,
  name: PACKAGE_NAME
} = require('./package.json')

// Constants
const SUPPORTED_VERSIONS = '>=4.0.0 <6'
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
  HOOK_CALLBACK_NAME: 'hook.callback.name',
  ROOT: 'fastify.root'
}
const HOOK_TYPES = {
  ROUTE: 'route-hook',
  INSTANCE: 'hook',
  HANDLER: 'request-handler'
}
const ANONYMOUS_FUNCTION_NAME = 'anonymous'

// Symbols
const kInstrumentation = Symbol('fastify otel instance')
const kRequestSpan = Symbol('fastify otel request spans')
const kRequestContext = Symbol('fastify otel request context')
const kAddHookOriginal = Symbol('fastify otel addhook original')
const kSetNotFoundOriginal = Symbol('fastify otel setnotfound original')
const kIgnorePaths = Symbol('fastify otel ignore path')

class FastifyOtelInstrumentation extends InstrumentationBase {
  servername = ''
  logger = null

  constructor (config) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config)
    this.servername = config?.servername ?? process.env.OTEL_SERVICE_NAME ?? 'fastify'
    this.logger = diag.createComponentLogger({ namespace: PACKAGE_NAME })
    this[kIgnorePaths] = null

    if (config?.ignorePaths != null || process.env.OTEL_FASTIFY_IGNORE_PATHS != null) {
      const ignorePaths = config?.ignorePaths ?? process.env.OTEL_FASTIFY_IGNORE_PATHS

      if ((typeof ignorePaths !== 'string' || ignorePaths.length === 0) && typeof ignorePaths !== 'function') {
        throw new TypeError(
          'ignorePaths must be a string or a function'
        )
      }

      let globMatcher = null

      this[kIgnorePaths] = (routeOptions) => {
        if (typeof ignorePaths === 'function') {
          return ignorePaths(routeOptions)
        } else {
          // Using minimatch to match the path until path.matchesGlob is out of experimental
          // path.matchesGlob uses minimatch internally
          if (globMatcher == null) {
            globMatcher = require('minimatch').minimatch
          }

          return globMatcher(routeOptions.url, ignorePaths)
        }
      }
    }
  }

  enable () {
    if (this._handleInitialization === undefined && this.getConfig().registerOnInitialization) {
      const FastifyInstrumentationPlugin = this.plugin()
      this._handleInitialization = (message) => {
        message.fastify.register(FastifyInstrumentationPlugin)
      }
      dc.subscribe('fastify.initialization', this._handleInitialization)
    }
    return super.enable()
  }

  disable () {
    if (this._handleInitialization) {
      dc.unsubscribe('fastify.initialization', this._handleInitialization)
      this._handleInitialization = undefined
    }
    return super.disable()
  }

  // We do not do patching in this instrumentation
  init () {
    return []
  }

  plugin () {
    const instrumentation = this

    FastifyInstrumentationPlugin[Symbol.for('skip-override')] = true
    FastifyInstrumentationPlugin[Symbol.for('fastify.display-name')] = '@fastify/otel'
    FastifyInstrumentationPlugin[Symbol.for('plugin-meta')] = {
      fastify: SUPPORTED_VERSIONS,
      name: '@fastify/otel',
    }

    return FastifyInstrumentationPlugin

    function FastifyInstrumentationPlugin (instance, opts, done) {
      instance.decorate(kInstrumentation, instrumentation)
      // addHook and notfoundHandler are essentially inherited from the prototype
      // what is important is to bound it to the right instance
      instance.decorate(kAddHookOriginal, instance.addHook)
      instance.decorate(kSetNotFoundOriginal, instance.setNotFoundHandler)
      instance.decorateRequest('opentelemetry', function openetelemetry () {
        const ctx = this[kRequestContext]
        const span = this[kRequestSpan]
        return {
          span,
          tracer: instrumentation.tracer,
          context: ctx,
          inject: (carrier, setter) => {
            return propagation.inject(ctx, carrier, setter)
          },
          extract: (carrier, getter) => {
            return propagation.extract(ctx, carrier, getter)
          }
        }
      })
      instance.decorateRequest(kRequestSpan, null)
      instance.decorateRequest(kRequestContext, null)

      instance.addHook('onRoute', function (routeOptions) {
        if (instrumentation[kIgnorePaths]?.(routeOptions) === true) {
          instrumentation.logger.debug(
            `Ignoring route instrumentation ${routeOptions.method} ${routeOptions.url} because it matches the ignore path`
          )
          return
        }

        for (const hook of FASTIFY_HOOKS) {
          if (routeOptions[hook] != null) {
            const handlerLike = routeOptions[hook]

            if (typeof handlerLike === 'function') {
              routeOptions[hook] = handlerWrapper(handlerLike, {
                [ATTR_SERVICE_NAME]:
                  instance[kInstrumentation].servername,
                [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - route -> ${hook}`,
                [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.ROUTE,
                [ATTR_HTTP_ROUTE]: routeOptions.url,
                [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
                  handlerLike.name?.length > 0
                    ? handlerLike.name
                    : ANONYMOUS_FUNCTION_NAME /* c8 ignore next */
              })
            } else if (Array.isArray(handlerLike)) {
              const wrappedHandlers = []

              for (const handler of handlerLike) {
                wrappedHandlers.push(
                  handlerWrapper(handler, {
                    [ATTR_SERVICE_NAME]:
                      instance[kInstrumentation].servername,
                    [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - route -> ${hook}`,
                    [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.ROUTE,
                    [ATTR_HTTP_ROUTE]: routeOptions.url,
                    [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
                      handler.name?.length > 0
                        ? handler.name
                        : ANONYMOUS_FUNCTION_NAME
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
          [ATTR_SERVICE_NAME]: instance[kInstrumentation].servername,
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
        if (this[kInstrumentation].isEnabled() === false) {
          return hookDone()
        } else if (this[kInstrumentation][kIgnorePaths]?.({
          url: request.url,
          method: request.method,
        }) === true) {
          this[kInstrumentation].logger.debug(
            `Ignoring request ${request.method} ${request.url} because it matches the ignore path`
          )
          return hookDone()
        }

        let ctx = context.active()

        if (trace.getSpan(ctx) == null) {
          ctx = propagation.extract(ctx, request.headers)
        }

        const rpcMetadata = getRPCMetadata(ctx)

        if (
          request.routeOptions.url != null &&
          rpcMetadata?.type === RPCType.HTTP
        ) {
          rpcMetadata.route = request.routeOptions.url
        }

        /** @type {import('@opentelemetry/api').Span} */
        const span = this[kInstrumentation].tracer.startSpan('request', {
          attributes: {
            [ATTR_SERVICE_NAME]:
              instance[kInstrumentation].servername,
            [ATTRIBUTE_NAMES.ROOT]: '@fastify/otel',
            [ATTR_HTTP_ROUTE]: request.url,
            [ATTR_HTTP_REQUEST_METHOD]: request.method
          }
        }, ctx)

        request[kRequestContext] = trace.setSpan(ctx, span)
        request[kRequestSpan] = span

        context.with(request[kRequestContext], () => {
          hookDone()
        })
      })

      // onResponse is the last hook to be executed, only added for 404 handlers
      instance.addHook('onResponse', function (request, reply, hookDone) {
        const span = request[kRequestSpan]

        if (span != null) {
          span.setStatus({
            code: SpanStatusCode.OK,
            message: 'OK'
          })
          span.setAttributes({
            [ATTR_HTTP_RESPONSE_STATUS_CODE]: 404
          })
          span.end()
        }

        request[kRequestSpan] = null

        hookDone()
      })

      instance.addHook = addHookPatched
      instance.setNotFoundHandler = setNotFoundHandlerPatched

      done()

      function onSendHook (request, reply, payload, hookDone) {
        /** @type {import('@opentelemetry/api').Span} */
        const span = request[kRequestSpan]

        if (span != null) {
          if (reply.statusCode < 500) {
            span.setStatus({
              code: SpanStatusCode.OK,
              message: 'OK'
            })
          }

          span.setAttributes({
            [ATTR_HTTP_RESPONSE_STATUS_CODE]: reply.statusCode
          })
          span.end()
        }

        request[kRequestSpan] = null

        hookDone(null, payload)
      }

      function onErrorHook (request, reply, error, hookDone) {
        /** @type {Span} */
        const span = request[kRequestSpan]

        if (span != null) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message
          })
          span.recordException(error)
        }

        hookDone()
      }

      function addHookPatched (name, hook) {
        const addHookOriginal = this[kAddHookOriginal]

        if (FASTIFY_HOOKS.includes(name)) {
          return addHookOriginal.call(
            this,
            name,
            handlerWrapper(hook, {
              [ATTR_SERVICE_NAME]: instance[kInstrumentation].servername,
              [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - ${name}`,
              [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.INSTANCE,
              [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
                hook.name?.length > 0
                  ? hook.name
                  : ANONYMOUS_FUNCTION_NAME /* c8 ignore next */
            })
          )
        } else {
          return addHookOriginal.call(this, name, hook)
        }
      }

      function setNotFoundHandlerPatched (hooks, handler) {
        const setNotFoundHandlerOriginal = this[kSetNotFoundOriginal]
        if (typeof hooks === 'function') {
          handler = handlerWrapper(hooks, {
            [ATTR_SERVICE_NAME]: instance[kInstrumentation].servername,
            [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - not-found-handler`,
            [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.INSTANCE,
            [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
              hooks.name?.length > 0
                ? hooks.name
                : ANONYMOUS_FUNCTION_NAME /* c8 ignore next */
          })
          setNotFoundHandlerOriginal.call(this, handler)
        } else {
          if (hooks.preValidation != null) {
            hooks.preValidation = handlerWrapper(hooks.preValidation, {
              [ATTR_SERVICE_NAME]: instance[kInstrumentation].servername,
              [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - not-found-handler - preValidation`,
              [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.INSTANCE,
              [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
                hooks.preValidation.name?.length > 0
                  ? hooks.preValidation.name
                  : ANONYMOUS_FUNCTION_NAME /* c8 ignore next */
            })
          }

          if (hooks.preHandler != null) {
            hooks.preHandler = handlerWrapper(hooks.preHandler, {
              [ATTR_SERVICE_NAME]:
                instance[kInstrumentation].servername,
              [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - not-found-handler - preHandler`,
              [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.INSTANCE,
              [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
                hooks.preHandler.name?.length > 0
                  ? hooks.preHandler.name
                  : ANONYMOUS_FUNCTION_NAME /* c8 ignore next */
            })
          }

          handler = handlerWrapper(handler, {
            [ATTR_SERVICE_NAME]: instance[kInstrumentation].servername,
            [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - not-found-handler`,
            [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.INSTANCE,
            [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
              handler.name?.length > 0
                ? handler.name
                : ANONYMOUS_FUNCTION_NAME /* c8 ignore next */
          })
          setNotFoundHandlerOriginal.call(this, hooks, handler)
        }
      }

      function handlerWrapper (handler, spanAttributes = {}) {
        return function handlerWrapped (...args) {
          /** @type {FastifyOtelInstrumentation} */
          const instrumentation = this[kInstrumentation]
          const [request] = args

          if (instrumentation.isEnabled() === false) {
            return handler.call(this, ...args)
          }

          const ctx = request[kRequestContext] ?? context.active()
          const span = instrumentation.tracer.startSpan(
            `handler - ${
              handler.name?.length > 0
                ? handler.name
                : this.pluginName /* c8 ignore next */ ??
                  ANONYMOUS_FUNCTION_NAME /* c8 ignore next */
            }`,
            {
              attributes: spanAttributes
            },
            ctx
          )

          return context.with(
            trace.setSpan(ctx, span),
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
                throw error
              }
            },
            this
          )
        }
      }
    }
  }
}

module.exports = FastifyOtelInstrumentation
module.exports.FastifyOtelInstrumentation = FastifyOtelInstrumentation
