const {
  test,
  describe,
  before,
  after,
  afterEach,
  beforeEach
} = require('node:test')

const { InstrumentationBase } = require('@opentelemetry/instrumentation')
const {
  AsyncHooksContextManager
} = require('@opentelemetry/context-async-hooks')
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const {
  InMemorySpanExporter,
  SimpleSpanProcessor
} = require('@opentelemetry/sdk-trace-base')
const { context, SpanStatusCode } = require('@opentelemetry/api')

const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http')

const Fastify = require('fastify')

const FastifyInstrumentation = require('..')

describe('Interface', () => {
  test('should exports support', t => {
    t.assert.equal(FastifyInstrumentation.name, 'FastifyOtelInstrumentation')
    t.assert.equal(
      FastifyInstrumentation.default.name,
      'FastifyOtelInstrumentation'
    )
    t.assert.equal(
      FastifyInstrumentation.FastifyOtelInstrumentation.name,
      'FastifyOtelInstrumentation'
    )
    t.assert.strictEqual(
      Object.getPrototypeOf(FastifyInstrumentation),
      InstrumentationBase
    )
  })

  test('FastifyInstrumentation#plugin should return a valid Fastify Plugin', async t => {
    const app = Fastify()
    const instrumentation = new FastifyInstrumentation()
    const plugin = instrumentation.plugin()

    t.assert.equal(typeof plugin, 'function')
    t.assert.equal(plugin.length, 3)

    app.register(plugin)

    await app.ready()
  })
})

describe('FastifyInstrumentation', () => {
  const httpInstrumentation = new HttpInstrumentation()
  const instrumentation = new FastifyInstrumentation()
  const contextManager = new AsyncHooksContextManager()
  const memoryExporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider()
  const spanProcessor = new SimpleSpanProcessor(memoryExporter)

  provider.addSpanProcessor(spanProcessor)
  context.setGlobalContextManager(contextManager)
  httpInstrumentation.setTracerProvider(provider)
  instrumentation.setTracerProvider(provider)

  describe('Instrumentation#disabled', () => {
    test('should not create spans if disabled', async t => {
      before(() => {
        contextManager.enable()
      })

      after(() => {
        contextManager.disable()
        spanProcessor.forceFlush()
        memoryExporter.reset()
        instrumentation.disable()
        httpInstrumentation.disable()
      })

      const app = Fastify()
      const plugin = instrumentation.plugin()

      await app.register(plugin)

      app.get('/', async (request, reply) => 'hello world')

      instrumentation.disable()

      t.plan(3)

      const response = await app.inject({
        method: 'GET',
        url: '/'
      })

      const spans = memoryExporter
        .getFinishedSpans()
        .find(span => span.instrumentationLibrary.name === '@fastify/otel')

      t.assert.ok(spans == null)
      t.assert.equal(response.statusCode, 200)
      t.assert.equal(response.body, 'hello world')
    })
  })

  describe('Instrumentation#enabled', () => {
    beforeEach(() => {
      instrumentation.enable()
      httpInstrumentation.enable()
      contextManager.enable()
    })

    afterEach(() => {
      contextManager.disable()
      instrumentation.disable()
      httpInstrumentation.disable()
      spanProcessor.forceFlush()
      memoryExporter.reset()
    })

    test('should create anonymous span (simple case)', async t => {
      const app = Fastify()
      const plugin = instrumentation.plugin()

      await app.register(plugin)

      app.get('/', async (request, reply) => 'hello world')

      await app.listen()

      after(() => app.close())

      const response = await fetch(
        `http://localhost:${app.server.address().port}/`
      )

      const spans = memoryExporter
        .getFinishedSpans()
        .filter(span => span.instrumentationLibrary.name === '@fastify/otel')

      const [end, start] = spans

      t.plan(5)
      t.assert.equal(spans.length, 2)
      t.assert.deepStrictEqual(start.attributes, {
        'fastify.root': '@fastify/otel',
        'http.route': '/',
        'service.name': 'fastify',
        'http.request.method': 'GET',
        'http.response.status_code': 200
      })
      t.assert.deepStrictEqual(end.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route-handler',
        'fastify.type': 'request-handler',
        'http.route': '/',
        'service.name': 'fastify',
        'hook.callback.name': 'anonymous'
      })
      t.assert.equal(response.status, 200)
      t.assert.equal(await response.text(), 'hello world')
    })

    test('should create named span (simple case)', async t => {
      const app = Fastify()
      const plugin = instrumentation.plugin()

      await app.register(plugin)

      app.get('/', async function helloworld () {
        return 'hello world'
      })

      await app.listen()

      after(() => app.close())

      const response = await fetch(
        `http://localhost:${app.server.address().port}/`
      )

      const spans = memoryExporter
        .getFinishedSpans()
        .filter(span => span.instrumentationLibrary.name === '@fastify/otel')

      const [end, start] = spans

      t.plan(6)
      t.assert.equal(spans.length, 2)
      t.assert.deepStrictEqual(start.attributes, {
        'fastify.root': '@fastify/otel',
        'http.route': '/',
        'service.name': 'fastify',
        'http.request.method': 'GET',
        'http.response.status_code': 200
      })
      t.assert.deepStrictEqual(end.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route-handler',
        'fastify.type': 'request-handler',
        'http.route': '/',
        'service.name': 'fastify',
        'hook.callback.name': 'helloworld'
      })
      t.assert.equal(end.parentSpanId, start.spanContext().spanId)
      t.assert.equal(response.status, 200)
      t.assert.equal(await response.text(), 'hello world')
    })

    test('should create span for different hooks', async t => {
      const app = Fastify()
      const plugin = instrumentation.plugin()

      await app.register(plugin)

      app.get(
        '/',
        {
          preHandler: function preHandler (request, reply, done) {
            done()
          },
          onRequest: [
            function onRequest1 (request, reply, done) {
              done()
            },
            function (request, reply, done) {
              done()
            }
          ]
        },
        async function helloworld () {
          return 'hello world'
        }
      )

      await app.listen()

      after(() => app.close())

      const response = await fetch(
        `http://localhost:${app.server.address().port}/`
      )

      const spans = memoryExporter
        .getFinishedSpans()
        .filter(span => span.instrumentationLibrary.name === '@fastify/otel')

      const [preHandler, onReq2, onReq1, end, start] = spans

      t.plan(10)
      t.assert.equal(spans.length, 5)
      t.assert.deepStrictEqual(start.attributes, {
        'fastify.root': '@fastify/otel',
        'http.route': '/',
        'service.name': 'fastify',
        'http.request.method': 'GET',
        'http.response.status_code': 200
      })
      t.assert.deepStrictEqual(start.attributes, {
        'fastify.root': '@fastify/otel',
        'http.route': '/',
        'service.name': 'fastify',
        'http.request.method': 'GET',
        'http.response.status_code': 200
      })
      t.assert.deepStrictEqual(onReq1.attributes, {
        'fastify.type': 'route-hook',
        'hook.callback.name': 'onRequest1',
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route -> onRequest',
        'http.route': '/',
        'service.name': 'fastify',
      })
      t.assert.deepStrictEqual(onReq2.attributes, {
        'fastify.type': 'route-hook',
        'hook.callback.name': 'anonymous',
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route -> onRequest',
        'http.route': '/',
        'service.name': 'fastify',
      })
      t.assert.deepStrictEqual(preHandler.attributes, {
        'fastify.type': 'route-hook',
        'hook.callback.name': 'preHandler',
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route -> preHandler',
        'http.route': '/',
        'service.name': 'fastify',
      })
      t.assert.deepStrictEqual(end.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route-handler',
        'fastify.type': 'request-handler',
        'http.route': '/',
        'hook.callback.name': 'helloworld',
        'service.name': 'fastify',
      })
      t.assert.equal(end.parentSpanId, start.spanContext().spanId)
      t.assert.equal(response.status, 200)
      t.assert.equal(await response.text(), 'hello world')
    })

    test('should create span for different hooks (patched)', async t => {
      const app = Fastify()
      const plugin = instrumentation.plugin()

      await app.register(plugin)

      app.get(
        '/',
        {
          onSend: function onSend (request, reply, payload, done) {
            done(null, payload)
          }
        },
        async function helloworld () {
          return 'hello world'
        }
      )

      app.addHook('preValidation', function (request, reply, done) {
        done()
      })

      // Should not be patched
      app.addHook('onReady', function (done) {
        done()
      })

      await app.listen()

      after(() => app.close())

      const response = await fetch(
        `http://localhost:${app.server.address().port}/`
      )

      const spans = memoryExporter
        .getFinishedSpans()
        .filter(span => span.instrumentationLibrary.name === '@fastify/otel')

      const [preValidation, end, start, onReq1] = spans

      t.plan(9)
      t.assert.equal(spans.length, 4)
      t.assert.deepStrictEqual(start.attributes, {
        'fastify.root': '@fastify/otel',
        'http.route': '/',
        'http.request.method': 'GET',
        'service.name': 'fastify',
        'http.response.status_code': 200
      })
      t.assert.deepStrictEqual(start.attributes, {
        'fastify.root': '@fastify/otel',
        'http.route': '/',
        'http.request.method': 'GET',
        'service.name': 'fastify',
        'http.response.status_code': 200
      })
      t.assert.deepStrictEqual(onReq1.attributes, {
        'fastify.type': 'route-hook',
        'hook.callback.name': 'onSend',
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route -> onSend',
        'service.name': 'fastify',
        'http.route': '/'
      })
      t.assert.deepStrictEqual(preValidation.attributes, {
        'fastify.type': 'hook',
        'hook.callback.name': 'anonymous',
        'service.name': 'fastify',
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - preValidation'
      })
      t.assert.deepStrictEqual(end.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route-handler',
        'fastify.type': 'request-handler',
        'http.route': '/',
        'service.name': 'fastify',
        'hook.callback.name': 'helloworld'
      })
      t.assert.equal(end.parentSpanId, start.spanContext().spanId)
      t.assert.equal(response.status, 200)
      t.assert.equal(await response.text(), 'hello world')
    })

    test('should create span for different hooks (error scenario)', async t => {
      const app = Fastify()
      const plugin = instrumentation.plugin()

      await app.register(plugin)

      app.get('/', async function helloworld () {
        return 'hello world'
      })

      app.addHook('preHandler', function (request, reply, done) {
        throw new Error('error')
      })

      await app.listen()

      after(() => app.close())

      const response = await fetch(
        `http://localhost:${app.server.address().port}/`
      )

      const spans = memoryExporter
        .getFinishedSpans()
        .filter(span => span.instrumentationLibrary.name === '@fastify/otel')

      const [preHandler, start] = spans

      t.plan(6)
      t.assert.equal(spans.length, 2)
      t.assert.deepStrictEqual(start.attributes, {
        'fastify.root': '@fastify/otel',
        'http.route': '/',
        'http.request.method': 'GET',
        'service.name': 'fastify',
        'http.response.status_code': 500
      })
      t.assert.deepStrictEqual(preHandler.attributes, {
        'fastify.type': 'hook',
        'hook.callback.name': 'anonymous',
        'service.name': 'fastify',
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - preHandler'
      })
      t.assert.equal(preHandler.status.code, SpanStatusCode.ERROR)
      t.assert.equal(preHandler.parentSpanId, start.spanContext().spanId)
      t.assert.equal(response.status, 500)
    })

    test('should create named span (404)', async t => {
      const app = Fastify()
      const plugin = instrumentation.plugin()

      await app.register(plugin)

      app.get('/', async function helloworld () {
        return 'hello world'
      })

      await app.listen()

      after(() => app.close())

      const response = await fetch(
        `http://localhost:${app.server.address().port}/`,
        { method: 'POST' }
      )

      const spans = memoryExporter
        .getFinishedSpans()
        .filter(span => span.instrumentationLibrary.name === '@fastify/otel')

      const [start] = spans

      t.plan(3)
      t.assert.equal(response.status, 404)
      t.assert.equal(spans.length, 1)
      t.assert.deepStrictEqual(start.attributes, {
        'fastify.root': '@fastify/otel',
        'http.route': '/',
        'http.request.method': 'POST',
        'service.name': 'fastify',
        'http.response.status_code': 404
      })
    })

    test('should create named span (404 - customized)', async t => {
      const app = Fastify()
      const plugin = instrumentation.plugin()

      await app.register(plugin)

      app.setNotFoundHandler(async function notFoundHandler (request, reply) {
        reply.code(404).send('not found')
      })

      app.get('/', async function helloworld () {
        return 'hello world'
      })

      await app.listen()

      after(() => app.close())

      const response = await fetch(
        `http://localhost:${app.server.address().port}/`,
        { method: 'POST' }
      )

      const spans = memoryExporter
        .getFinishedSpans()
        .filter(span => span.instrumentationLibrary.name === '@fastify/otel')

      const [start, fof] = spans

      t.plan(4)
      t.assert.equal(response.status, 404)
      t.assert.equal(spans.length, 2)
      t.assert.deepStrictEqual(start.attributes, {
        'fastify.root': '@fastify/otel',
        'http.route': '/',
        'http.request.method': 'POST',
        'service.name': 'fastify',
        'http.response.status_code': 404
      })
      t.assert.deepStrictEqual(fof.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - not-found-handler',
        'fastify.type': 'hook',
        'service.name': 'fastify',
        'hook.callback.name': 'notFoundHandler'
      })
    })

    test('should create named span (404 - customized with hooks)', async t => {
      const app = Fastify()
      const plugin = instrumentation.plugin()

      await app.register(plugin)

      app.setNotFoundHandler(
        {
          preHandler: function preHandler (request, reply, done) {
            done()
          },
          preValidation: function preValidation (request, reply, done) {
            done()
          }
        },
        async function notFoundHandler (request, reply) {
          reply.code(404).send('not found')
        }
      )

      app.get(
        '/',
        {
          schema: {
            headers: {
              type: 'object',
              properties: {
                'x-foo': { type: 'string' }
              }
            }
          }
        },
        async function helloworld () {
          return 'hello world'
        }
      )

      await app.listen()

      after(() => app.close())

      const response = await fetch(
        `http://localhost:${app.server.address().port}/`,
        { method: 'POST' }
      )

      const spans = memoryExporter
        .getFinishedSpans()
        .filter(span => span.instrumentationLibrary.name === '@fastify/otel')

      const [preHandler, preValidation, start, fof] = spans

      t.plan(9)
      t.assert.equal(response.status, 404)
      t.assert.equal(spans.length, 4)
      t.assert.deepStrictEqual(start.attributes, {
        'fastify.root': '@fastify/otel',
        'http.route': '/',
        'http.request.method': 'POST',
        'service.name': 'fastify',
        'http.response.status_code': 404
      })
      t.assert.deepStrictEqual(preHandler.attributes, {
        'hook.name':
          'fastify -> @fastify/otel@0.0.0 - not-found-handler - preHandler',
        'fastify.type': 'hook',
        'service.name': 'fastify',
        'hook.callback.name': 'preHandler'
      })
      t.assert.deepStrictEqual(preValidation.attributes, {
        'hook.name':
          'fastify -> @fastify/otel@0.0.0 - not-found-handler - preValidation',
        'fastify.type': 'hook',
        'service.name': 'fastify',
        'hook.callback.name': 'preValidation'
      })
      t.assert.deepStrictEqual(fof.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - not-found-handler',
        'fastify.type': 'hook',
        'service.name': 'fastify',
        'hook.callback.name': 'anonymous'
      })
      t.assert.equal(fof.parentSpanId, start.spanContext().spanId)
      t.assert.equal(preValidation.parentSpanId, start.spanContext().spanId)
      t.assert.equal(preHandler.parentSpanId, start.spanContext().spanId)
    })

    test('should create named span (404 - customized with hooks)', async t => {
      const app = Fastify()
      const plugin = instrumentation.plugin()

      await app.register(plugin)

      app.setNotFoundHandler(
        {
          preHandler: function preHandler (request, reply, done) {
            done()
          },
          preValidation: function preValidation (request, reply, done) {
            done()
          }
        },
        async function notFoundHandler (request, reply) {
          reply.code(404).send('not found')
        }
      )

      app.get(
        '/',
        {
          schema: {
            headers: {
              type: 'object',
              properties: {
                'x-foo': { type: 'string' }
              }
            }
          }
        },
        async function helloworld () {
          return 'hello world'
        }
      )

      await app.listen()

      after(() => app.close())

      const response = await fetch(
        `http://localhost:${app.server.address().port}/`,
        { method: 'POST' }
      )

      const spans = memoryExporter
        .getFinishedSpans()
        .filter(span => span.instrumentationLibrary.name === '@fastify/otel')

      const [preHandler, preValidation, start, fof] = spans

      t.plan(9)
      t.assert.equal(response.status, 404)
      t.assert.equal(spans.length, 4)
      t.assert.deepStrictEqual(start.attributes, {
        'fastify.root': '@fastify/otel',
        'http.route': '/',
        'http.request.method': 'POST',
        'service.name': 'fastify',
        'http.response.status_code': 404
      })
      t.assert.deepStrictEqual(preHandler.attributes, {
        'hook.name':
          'fastify -> @fastify/otel@0.0.0 - not-found-handler - preHandler',
        'fastify.type': 'hook',
        'service.name': 'fastify',
        'hook.callback.name': 'preHandler'
      })
      t.assert.deepStrictEqual(preValidation.attributes, {
        'hook.name':
          'fastify -> @fastify/otel@0.0.0 - not-found-handler - preValidation',
        'fastify.type': 'hook',
        'service.name': 'fastify',
        'hook.callback.name': 'preValidation'
      })
      t.assert.deepStrictEqual(fof.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - not-found-handler',
        'fastify.type': 'hook',
        'service.name': 'fastify',
        'hook.callback.name': 'anonymous'
      })
      t.assert.equal(fof.parentSpanId, start.spanContext().spanId)
      t.assert.equal(preValidation.parentSpanId, start.spanContext().spanId)
      t.assert.equal(preHandler.parentSpanId, start.spanContext().spanId)
    })

    test('should end spans upon error', async t => {
      const app = Fastify()
      const plugin = instrumentation.plugin()

      await app.register(plugin)

      app.get(
        '/',
        {
          errorHandler: function errorHandler (error, request, reply) {
            throw error
          }
        },
        async function helloworld () {
          throw new Error('error')
        }
      )

      await app.listen()

      after(() => app.close())

      const response = await fetch(
        `http://localhost:${app.server.address().port}/`
      )

      const spans = memoryExporter
        .getFinishedSpans()
        .filter(span => span.instrumentationLibrary.name === '@fastify/otel')

      const [end, start] = spans

      t.plan(6)
      t.assert.equal(spans.length, 2)
      t.assert.deepStrictEqual(start.attributes, {
        'fastify.root': '@fastify/otel',
        'http.route': '/',
        'http.request.method': 'GET',
        'service.name': 'fastify',
        'http.response.status_code': 500
      })
      t.assert.deepStrictEqual(end.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route-handler',
        'fastify.type': 'request-handler',
        'http.route': '/',
        'service.name': 'fastify',
        'hook.callback.name': 'helloworld'
      })
      t.assert.equal(end.parentSpanId, start.spanContext().spanId)
      t.assert.equal(response.status, 500)
      t.assert.deepStrictEqual(await response.json(), {
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'error'
      })
    })

    test('should end spans upon error (with hook)', async t => {
      const app = Fastify()
      const plugin = instrumentation.plugin()

      await app.register(plugin)

      app.get(
        '/',
        {
          onError: function decorated (_request, _reply, _error, done) {
            done()
          },
          errorHandler: function errorHandler (error, request, reply) {
            throw error
          }
        },
        async function helloworld () {
          throw new Error('error')
        }
      )

      await app.listen()

      after(() => app.close())

      const response = await fetch(
        `http://localhost:${app.server.address().port}/`
      )

      const spans = memoryExporter
        .getFinishedSpans()
        .filter(span => span.instrumentationLibrary.name === '@fastify/otel')

      const [end, start, error] = spans

      t.plan(7)
      t.assert.equal(spans.length, 3)
      t.assert.deepStrictEqual(start.attributes, {
        'fastify.root': '@fastify/otel',
        'http.route': '/',
        'http.request.method': 'GET',
        'service.name': 'fastify',
        'http.response.status_code': 500
      })
      t.assert.deepStrictEqual(error.attributes, {
        'fastify.type': 'route-hook',
        'hook.callback.name': 'decorated',
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route -> onError',
        'http.route': '/',
        'service.name': 'fastify',
      })
      t.assert.deepStrictEqual(end.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route-handler',
        'fastify.type': 'request-handler',
        'http.route': '/',
        'service.name': 'fastify',
        'hook.callback.name': 'helloworld'
      })
      t.assert.equal(end.parentSpanId, start.spanContext().spanId)
      t.assert.equal(response.status, 500)
      t.assert.deepStrictEqual(await response.json(), {
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'error'
      })
    })

    test('should end spans upon error (with hook [array])', async t => {
      const app = Fastify()
      const plugin = instrumentation.plugin()

      await app.register(plugin)

      app.get(
        '/',
        {
          onError: [
            function decorated (_request, _reply, _error, done) {
              done()
            },
            function decorated2 (_request, _reply, _error, done) {
              done()
            }
          ],
          errorHandler: function errorHandler (error, request, reply) {
            throw error
          }
        },
        async function helloworld () {
          throw new Error('error')
        }
      )

      await app.listen()

      after(() => app.close())

      const response = await fetch(
        `http://localhost:${app.server.address().port}/`
      )

      const spans = memoryExporter
        .getFinishedSpans()
        .filter(span => span.instrumentationLibrary.name === '@fastify/otel')

      const [end, start, error2, error] = spans

      t.plan(8)
      t.assert.equal(spans.length, 4)
      t.assert.deepStrictEqual(start.attributes, {
        'fastify.root': '@fastify/otel',
        'http.route': '/',
        'http.request.method': 'GET',
        'service.name': 'fastify',
        'http.response.status_code': 500
      })
      t.assert.deepStrictEqual(error.attributes, {
        'fastify.type': 'route-hook',
        'hook.callback.name': 'decorated',
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route -> onError',
        'service.name': 'fastify',
        'http.route': '/'
      })
      t.assert.deepStrictEqual(error2.attributes, {
        'fastify.type': 'route-hook',
        'hook.callback.name': 'decorated2',
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route -> onError',
        'service.name': 'fastify',
        'http.route': '/'
      })
      t.assert.deepStrictEqual(end.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route-handler',
        'fastify.type': 'request-handler',
        'http.route': '/',
        'service.name': 'fastify',
        'hook.callback.name': 'helloworld'
      })
      t.assert.equal(end.parentSpanId, start.spanContext().spanId)
      t.assert.equal(response.status, 500)
      t.assert.deepStrictEqual(await response.json(), {
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'error'
      })
    })
  })

  describe('Encapulated Context', () => {
    describe('Instrumentation#disabled', () => {
      test('should not create spans if disabled', async t => {
        before(() => {
          contextManager.enable()
        })

        after(() => {
          contextManager.disable()
          spanProcessor.forceFlush()
          memoryExporter.reset()
          instrumentation.disable()
          httpInstrumentation.disable()
        })

        const app = Fastify()
        const plugin = instrumentation.plugin()

        await app.register(plugin)

        await app.register(function plugin (instance, _opts, done) {
          instance.get('/', async (request, reply) => 'hello world')
          done()
        })

        instrumentation.disable()

        t.plan(3)

        const response = await app.inject({
          method: 'GET',
          url: '/'
        })

        const spans = memoryExporter
          .getFinishedSpans()
          .find(span => span.instrumentationLibrary.name === '@fastify/otel')

        t.assert.ok(spans == null)
        t.assert.equal(response.statusCode, 200)
        t.assert.equal(response.body, 'hello world')
      })
    })

    describe('Instrumentation#enabled', () => {
      beforeEach(() => {
        instrumentation.enable()
        httpInstrumentation.enable()
        contextManager.enable()
      })

      afterEach(() => {
        contextManager.disable()
        instrumentation.disable()
        httpInstrumentation.disable()
        spanProcessor.forceFlush()
        memoryExporter.reset()
      })

      test('should create anonymous span (simple case)', async t => {
        const app = Fastify()
        const plugin = instrumentation.plugin()

        await app.register(plugin)

        await app.register(function plugin (instance, _opts, done) {
          instance.get('/', async (request, reply) => 'hello world')
          done()
        })

        await app.listen()

        after(() => app.close())

        const response = await fetch(
          `http://localhost:${app.server.address().port}/`
        )

        const spans = memoryExporter
          .getFinishedSpans()
          .filter(span => span.instrumentationLibrary.name === '@fastify/otel')

        const [end, start] = spans

        t.plan(5)
        t.assert.equal(spans.length, 2)
        t.assert.deepStrictEqual(start.attributes, {
          'fastify.root': '@fastify/otel',
          'http.route': '/',
          'http.request.method': 'GET',
          'service.name': 'fastify',
          'http.response.status_code': 200
        })
        t.assert.deepStrictEqual(end.attributes, {
          'hook.name': 'plugin - route-handler',
          'fastify.type': 'request-handler',
          'service.name': 'fastify',
          'http.route': '/',
          'hook.callback.name': 'anonymous'
        })
        t.assert.equal(response.status, 200)
        t.assert.equal(await response.text(), 'hello world')
      })

      test('should create named span (simple case)', async t => {
        const app = Fastify()
        const plugin = instrumentation.plugin()

        await app.register(async function nested (instance, _opts) {
          await instance.register(plugin)

          instance.get('/', async function helloworld () {
            return 'hello world'
          })
        })

        await app.listen()

        after(() => app.close())

        const response = await fetch(
          `http://localhost:${app.server.address().port}/`
        )

        const spans = memoryExporter
          .getFinishedSpans()
          .filter(span => span.instrumentationLibrary.name === '@fastify/otel')

        const [end, start] = spans

        t.plan(6)
        t.assert.equal(spans.length, 2)
        t.assert.deepStrictEqual(start.attributes, {
          'fastify.root': '@fastify/otel',
          'http.route': '/',
          'http.request.method': 'GET',
          'service.name': 'fastify',
          'http.response.status_code': 200
        })
        t.assert.deepStrictEqual(end.attributes, {
          'hook.name': 'nested -> @fastify/otel@0.0.0 - route-handler',
          'fastify.type': 'request-handler',
          'http.route': '/',
          'service.name': 'fastify',
          'hook.callback.name': 'helloworld'
        })
        t.assert.equal(end.parentSpanId, start.spanContext().spanId)
        t.assert.equal(response.status, 200)
        t.assert.equal(await response.text(), 'hello world')
      })

      test('should create span for different hooks (patched)', async t => {
        const app = Fastify()
        const plugin = instrumentation.plugin()

        await app.register(plugin)

        await app.register(function nested (instance, _opts, done) {
          instance.get(
            '/',
            {
              onSend: function onSend (request, reply, payload, done) {
                done(null, payload)
              }
            },
            async function helloworld () {
              return 'hello world'
            }
          )

          instance.addHook('preValidation', function (request, reply, done) {
            done()
          })

          // Should not be patched
          instance.addHook('onReady', function (done) {
            done()
          })

          done()
        })

        await app.listen()

        after(() => app.close())

        const response = await fetch(
          `http://localhost:${app.server.address().port}/`
        )

        const spans = memoryExporter
          .getFinishedSpans()
          .filter(span => span.instrumentationLibrary.name === '@fastify/otel')

        const [preValidation, end, start, onReq1] = spans

        t.plan(9)
        t.assert.equal(spans.length, 4)
        t.assert.deepStrictEqual(start.attributes, {
          'fastify.root': '@fastify/otel',
          'http.route': '/',
          'http.request.method': 'GET',
          'service.name': 'fastify',
          'http.response.status_code': 200
        })
        t.assert.deepStrictEqual(start.attributes, {
          'fastify.root': '@fastify/otel',
          'http.route': '/',
          'http.request.method': 'GET',
          'service.name': 'fastify',
          'http.response.status_code': 200
        })
        t.assert.deepStrictEqual(onReq1.attributes, {
          'fastify.type': 'route-hook',
          'hook.callback.name': 'onSend',
          'hook.name': 'nested - route -> onSend',
          'service.name': 'fastify',
          'http.route': '/'
        })
        t.assert.deepStrictEqual(preValidation.attributes, {
          'fastify.type': 'hook',
          'hook.callback.name': 'anonymous',
          'service.name': 'fastify',
          'hook.name': 'fastify -> @fastify/otel@0.0.0 - preValidation'
        })
        t.assert.deepStrictEqual(end.attributes, {
          'hook.name': 'nested - route-handler',
          'fastify.type': 'request-handler',
          'http.route': '/',
          'service.name': 'fastify',
          'hook.callback.name': 'helloworld'
        })
        t.assert.equal(end.parentSpanId, start.spanContext().spanId)
        t.assert.equal(response.status, 200)
        t.assert.equal(await response.text(), 'hello world')
      })

      test('should respect context (error scenario)', async t => {
        const app = Fastify()
        const plugin = instrumentation.plugin()

        await app.register(async function nested (instance, _opts) {
          await instance.register(plugin)
          instance.get('/', async function helloworld () {
            return 'hello world'
          })
        })

        // If registered under encapsulated context, hooks should be registered
        // under the encapsulated context
        app.addHook('preHandler', function (request, reply, done) {
          throw new Error('error')
        })

        await app.listen()

        after(() => app.close())

        const response = await fetch(
          `http://localhost:${app.server.address().port}/`
        )

        const spans = memoryExporter
          .getFinishedSpans()
          .filter(span => span.instrumentationLibrary.name === '@fastify/otel')

        const [start] = spans

        t.plan(3)
        t.assert.equal(spans.length, 1)
        t.assert.deepStrictEqual(start.attributes, {
          'fastify.root': '@fastify/otel',
          'http.route': '/',
          'http.request.method': 'GET',
          'service.name': 'fastify',
          'http.response.status_code': 500
        })
        t.assert.equal(response.status, 500)
      })
    })
  })
})
