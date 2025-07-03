'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert')
const Fastify = require(process.env.FASTIFY_VERSION || 'fastify')

const { InstrumentationBase } = require('@opentelemetry/instrumentation')
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const { InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base')

const FastifyInstrumentation = require('..')
const { FastifyOtelInstrumentation } = require('..')

describe('Interface', () => {
  test('should exports support', t => {
    assert.equal(FastifyInstrumentation.name, 'FastifyOtelInstrumentation')
    assert.equal(
      FastifyOtelInstrumentation.name,
      'FastifyOtelInstrumentation'
    )
    assert.equal(
      FastifyInstrumentation.FastifyOtelInstrumentation.name,
      'FastifyOtelInstrumentation'
    )
    assert.strictEqual(
      Object.getPrototypeOf(FastifyInstrumentation),
      InstrumentationBase
    )
    assert.strictEqual(new FastifyInstrumentation({ servername: 'test' }).servername, 'test')
  })

  test('FastifyInstrumentation#plugin should return a valid Fastify Plugin', async t => {
    const app = Fastify()
    const instrumentation = new FastifyInstrumentation()
    const plugin = instrumentation.plugin()

    assert.equal(typeof plugin, 'function')
    assert.equal(plugin.length, 3)

    app.register(plugin)

    await app.ready()
  })

  test('FastifyOtelInstrumentationOpts#ignorePaths - should be a valid string or function', async t => {
    assert.throws(() => new FastifyInstrumentation({ ignorePaths: 123 }))
    assert.throws(() => new FastifyInstrumentation({ ignorePaths: '' }))
    assert.throws(() => new FastifyInstrumentation({ ignorePaths: {} }))
    assert.doesNotThrow(() => new FastifyInstrumentation({ ignorePaths: () => true }))
    assert.doesNotThrow(() => new FastifyInstrumentation({ ignorePaths: '/foo' }))
  })

  test('NamedFastifyInstrumentation#plugin should return a valid Fastify Plugin', async t => {
    const app = Fastify()
    const instrumentation = new FastifyOtelInstrumentation()
    const plugin = instrumentation.plugin()

    assert.equal(typeof plugin, 'function')
    assert.equal(plugin.length, 3)

    app.register(plugin)

    await app.ready()
  })

  test('FastifyInstrumentation#plugin should expose the right set of APIs', async () => {
    /** @type {import('fastify').FastifyInstance} */
    const app = Fastify()
    const instrumentation = new FastifyInstrumentation()
    const plugin = instrumentation.plugin()

    await app.register(plugin)

    app.get('/', (request, reply) => {
      const otel = request.opentelemetry()

      assert.equal(otel.enabled, true)
      assert.equal(typeof otel.span.spanContext().spanId, 'string')
      assert.equal(typeof otel.tracer, 'object')
      assert.equal(typeof otel.context, 'object')
      assert.equal(typeof otel.inject, 'function')
      assert.equal(otel.inject.length, 2)
      assert.ok(!otel.inject({}))
      assert.equal(typeof otel.extract, 'function')
      assert.equal(otel.extract.length, 2)
      assert.equal(typeof (otel.extract({})), 'object')

      return 'world'
    })

    const res = await app.inject({
      method: 'GET',
      url: '/'
    })
    assert.equal(res.payload, 'world')
  })

  test('FastifyRequest#opentelemetry() returns FastifyDisabledOtelRequestContext when disabled for a request', async () => {
    /** @type {import('fastify').FastifyInstance} */
    const app = Fastify()
    const instrumentation = new FastifyInstrumentation()
    const plugin = instrumentation.plugin()

    await app.register(plugin)

    app.get('/', { config: { otel: false } }, (request) => {
      const otel = request.opentelemetry()

      assert.equal(otel.enabled, false)
      assert.equal(otel.span, null)
      assert.equal(typeof otel.tracer, 'object')
      assert.equal(otel.context, null)
      assert.equal(typeof otel.inject, 'function')
      assert.equal(otel.inject.length, 2)
      assert.ok(!otel.inject({}))
      assert.equal(typeof otel.extract, 'function')
      assert.equal(otel.extract.length, 2)
      assert.equal(typeof (otel.extract({})), 'object')

      return 'world'
    })

    app.get('/withOtel', { config: { otel: true } }, (request) => {
      const otel = request.opentelemetry()

      assert.equal(otel.enabled, true)
      assert.equal(typeof otel.span.spanContext().spanId, 'string')
      assert.equal(typeof otel.tracer, 'object')
      assert.equal(typeof otel.context, 'object')
      assert.equal(typeof otel.inject, 'function')
      assert.equal(otel.inject.length, 2)
      assert.ok(!otel.inject({}))
      assert.equal(typeof otel.extract, 'function')
      assert.equal(otel.extract.length, 2)
      assert.equal(typeof (otel.extract({})), 'object')

      return 'world'
    })

    app.get('/withOnRequest', { config: { otel: false }, async onRequest (req) { req.fakeData = 123 } }, (request) => {
      const otel = request.opentelemetry()

      assert.equal(request.fakeData, 123)
      assert.equal(otel.enabled, false)
      assert.equal(otel.span, null)
      assert.equal(typeof otel.tracer, 'object')
      assert.equal(otel.context, null)
      assert.equal(typeof otel.inject, 'function')
      assert.equal(otel.inject.length, 2)
      assert.ok(!otel.inject({}))
      assert.equal(typeof otel.extract, 'function')
      assert.equal(otel.extract.length, 2)
      assert.equal(typeof (otel.extract({})), 'object')

      return 'world'
    })

    app.get(
      '/withManyOnRequest',
      {
        config: { otel: false },
        onRequest: [
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
      async function helloworld (request) {
        const otel = request.opentelemetry()

        assert.equal(otel.enabled, false)
        assert.equal(otel.span, null)
        assert.equal(typeof otel.tracer, 'object')
        assert.equal(otel.context, null)
        assert.equal(typeof otel.inject, 'function')
        assert.equal(otel.inject.length, 2)
        assert.ok(!otel.inject({}))
        assert.equal(typeof otel.extract, 'function')
        assert.equal(otel.extract.length, 2)
        assert.equal(typeof (otel.extract({})), 'object')

        return 'world'
      }
    )

    const res1 = await app.inject({
      method: 'GET',
      url: '/'
    })
    assert.equal(res1.statusCode, 200)
    assert.equal(res1.payload, 'world')

    const res2 = await app.inject({
      method: 'GET',
      url: '/withOtel'
    })
    assert.equal(res2.statusCode, 200)
    assert.equal(res2.payload, 'world')

    const res3 = await app.inject({
      method: 'GET',
      url: '/withOnRequest'
    })
    assert.equal(res3.statusCode, 200)
    assert.equal(res3.payload, 'world')
  })

  test('FastifyInstrumentation#requestHook should be invoked and can mutate span', async () => {
    /** @type {import('fastify').FastifyInstance} */
    const app = Fastify()

    let hookCalled = false
    const exporter = new InMemorySpanExporter()
    const provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)]
    })
    provider.register()

    const instrumentation = new FastifyInstrumentation({
      requestHook: (span, request) => {
        hookCalled = true
        span.setAttribute('x-user', request.headers['x-user'] ?? 'anon')
      }
    })
    instrumentation.setTracerProvider(provider)

    await app.register(instrumentation.plugin())

    app.get('/', () => 'ok')

    const res = await app.inject({
      method: 'GET',
      url: '/',
      headers: { 'x-user': 'baki' },
    })

    assert.equal(res.statusCode, 200)
    assert.equal(res.payload, 'ok')
    assert.equal(hookCalled, true)

    const spans = exporter.getFinishedSpans()
    assert.equal(spans.length, 2)

    const rootSpan = spans.find(s => s.name === 'request')
    assert.ok(rootSpan)
    assert.equal(rootSpan.attributes['x-user'], 'baki')
  })

  test('FastifyInstrumentation#requestHook should not crash when it throws', async () => {
    /** @type {import('fastify').FastifyInstance} */
    const app = Fastify()

    const instrumentation = new FastifyInstrumentation({
      requestHook: () => {
        throw new Error('test')
      }
    })

    await app.register(instrumentation.plugin())

    app.get('/', () => 'ok')

    const res = await app.inject({
      method: 'GET',
      url: '/'
    })

    assert.equal(res.statusCode, 200)
    assert.equal(res.payload, 'ok')
  })
})
