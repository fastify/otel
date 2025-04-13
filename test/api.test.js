'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert')
const Fastify = require(process.env.FASTIFY_VERSION || 'fastify')

const { InstrumentationBase } = require('@opentelemetry/instrumentation')
const { trace, context } = require('@opentelemetry/api')

const FastifyInstrumentation = require('..')

describe('Interface', () => {
  test('should exports support', t => {
    assert.equal(FastifyInstrumentation.name, 'FastifyOtelInstrumentation')
    assert.equal(
      FastifyInstrumentation.default.name,
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

  test('FastifyInstrumentation#plugin should expose the right set of APIs', async t => {
    /** @type {import('fastify').FastifyInstance} */
    const app = Fastify()
    const instrumentation = new FastifyInstrumentation()
    const plugin = instrumentation.plugin()

    t.plan(9)

    await app.register(plugin)

    app.get('/', (request, reply) => {
      const otel = request.opentelemetry()

      t.assert.equal(typeof otel.span.spanContext().spanId, 'string')
      t.assert.equal(typeof otel.tracer, 'object')
      t.assert.equal(typeof otel.context, 'object')
      t.assert.equal(typeof otel.inject, 'function')
      t.assert.equal(otel.inject.length, 2)
      t.assert.ok(!otel.inject({}))
      t.assert.equal(typeof otel.extract, 'function')
      t.assert.equal(otel.extract.length, 2)
      t.assert.equal(typeof (otel.extract({})), 'object')

      return 'world'
    })

    await app.inject({
      method: 'GET',
      url: '/'
    })
  })
})
