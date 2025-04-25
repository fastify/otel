'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert')
const Fastify = require(process.env.FASTIFY_VERSION || 'fastify')

const { InstrumentationBase } = require('@opentelemetry/instrumentation')

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

  test('FastifyInstrumentation#plugin should expose the right set of APIs', async t => {
    /** @type {import('fastify').FastifyInstance} */
    const app = Fastify()
    const instrumentation = new FastifyInstrumentation()
    const plugin = instrumentation.plugin()

    await app.register(plugin)

    app.get('/', (request, reply) => {
      const otel = request.opentelemetry()

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

    await app.inject({
      method: 'GET',
      url: '/'
    })
  })
})
