const {
  test,
  describe,
  before,
  after,
  afterEach,
  beforeEach
} = require('node:test')
// const http = require('node:http')

const { InstrumentationBase } = require('@opentelemetry/instrumentation')
const {
  AsyncHooksContextManager
} = require('@opentelemetry/context-async-hooks')
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const {
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor
} = require('@opentelemetry/sdk-trace-base')
const { Span, context, SpanStatusCode } = require('@opentelemetry/api')
const {
  getPackageVersion,
  runTestFixture,
  TestCollector
} = require('@opentelemetry/contrib-test-utils')
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http')
const semver = require('semver')
const Fastify = require('fastify')

const FastifyInstrumentation = require('..')

describe('Interface', () => {
  test('should exports support', t => {
    t.assert.equal(FastifyInstrumentation.name, 'FastifyInstrumentation')
    t.assert.equal(
      FastifyInstrumentation.default.name,
      'FastifyInstrumentation'
    )
    t.assert.equal(
      FastifyInstrumentation.FastifyInstrumentation.name,
      'FastifyInstrumentation'
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
        'http.request.method': 'GET',
        'http.response.status_code': 200
      })
      t.assert.deepStrictEqual(end.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route-handler',
        'fastify.type': 'request-handler',
        'http.route': '/',
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
        'http.request.method': 'GET',
        'http.response.status_code': 200
      })
      t.assert.deepStrictEqual(end.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route-handler',
        'fastify.type': 'request-handler',
        'http.route': '/',
        'hook.callback.name': 'helloworld'
      })
      t.assert.equal(end.parentSpanId, start.spanContext().spanId)
      t.assert.equal(response.status, 200)
      t.assert.equal(await response.text(), 'hello world')
    })

    test('should create span for different hooks', { only: true }, async t => {
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
        'http.request.method': 'GET',
        'http.response.status_code': 200
      })
      t.assert.deepStrictEqual(start.attributes, {
        'fastify.root': '@fastify/otel',
        'http.route': '/',
        'http.request.method': 'GET',
        'http.response.status_code': 200
      })
      t.assert.deepStrictEqual(onReq1.attributes, {
        'fastify.type': 'route-hook',
        'hook.callback.name': 'onRequest1',
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route -> onRequest',
        'http.route': '/'
      })
      t.assert.deepStrictEqual(onReq2.attributes, {
        'fastify.type': 'route-hook',
        'hook.callback.name': 'anonymous',
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route -> onRequest',
        'http.route': '/'
      })
      t.assert.deepStrictEqual(preHandler.attributes, {
        'fastify.type': 'route-hook',
        'hook.callback.name': 'preHandler',
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route -> preHandler',
        'http.route': '/'
      })
      t.assert.deepStrictEqual(end.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route-handler',
        'fastify.type': 'request-handler',
        'http.route': '/',
        'hook.callback.name': 'helloworld'
      })
      t.assert.equal(end.parentSpanId, start.spanContext().spanId)
      t.assert.equal(response.status, 200)
      t.assert.equal(await response.text(), 'hello world')
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
        'http.response.status_code': 404
      })
      t.assert.deepStrictEqual(fof.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - not-found-handler',
        'fastify.type': 'hook',
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
        'http.response.status_code': 404
      })
      t.assert.deepStrictEqual(preHandler.attributes, {
        'hook.name':
          'fastify -> @fastify/otel@0.0.0 - not-found-handler - preHandler',
        'fastify.type': 'hook',
        'hook.callback.name': 'preHandler'
      })
      t.assert.deepStrictEqual(preValidation.attributes, {
        'hook.name':
          'fastify -> @fastify/otel@0.0.0 - not-found-handler - preValidation',
        'fastify.type': 'hook',
        'hook.callback.name': 'preValidation'
      })
      t.assert.deepStrictEqual(fof.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - not-found-handler',
        'fastify.type': 'hook',
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
        'http.response.status_code': 404
      })
      t.assert.deepStrictEqual(preHandler.attributes, {
        'hook.name':
          'fastify -> @fastify/otel@0.0.0 - not-found-handler - preHandler',
        'fastify.type': 'hook',
        'hook.callback.name': 'preHandler'
      })
      t.assert.deepStrictEqual(preValidation.attributes, {
        'hook.name':
          'fastify -> @fastify/otel@0.0.0 - not-found-handler - preValidation',
        'fastify.type': 'hook',
        'hook.callback.name': 'preValidation'
      })
      t.assert.deepStrictEqual(fof.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - not-found-handler',
        'fastify.type': 'hook',
        'hook.callback.name': 'anonymous'
      })
      t.assert.equal(fof.parentSpanId, start.spanContext().spanId)
      t.assert.equal(preValidation.parentSpanId, start.spanContext().spanId)
      t.assert.equal(preHandler.parentSpanId, start.spanContext().spanId)
    })

    test('should end spans upon error', { only: true }, async t => {
      const app = Fastify()
      const plugin = instrumentation.plugin()

      await app.register(plugin)

      app.get(
        '/',
        {
          // onError: function decorated (request, reply, error, done) {
          //   console.log('error', error)
          //   done(error)
          // },
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
        'http.response.status_code': 500
      })
      t.assert.deepStrictEqual(end.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route-handler',
        'fastify.type': 'request-handler',
        'http.route': '/',
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

    test('should end spans upon error (with hook)', { only: true }, async t => {
      const app = Fastify()
      const plugin = instrumentation.plugin()

      await app.register(plugin)

      app.get(
        '/',
        {
          // TODO: Test better; this should support an array of hooks
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
        'http.response.status_code': 500
      })
      t.assert.deepStrictEqual(error.attributes, {
        'fastify.type': 'hook',
        'hook.callback.name': 'decorated',
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - onError',
        'http.route': '/'
      })
      t.assert.deepStrictEqual(end.attributes, {
        'hook.name': 'fastify -> @fastify/otel@0.0.0 - route-handler',
        'fastify.type': 'request-handler',
        'http.route': '/',
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
})
