'use strict'

const { test, describe } = require('node:test')
const Fastify = require(process.env.FASTIFY_VERSION || 'fastify')

const { InstrumentationBase } = require('@opentelemetry/instrumentation')

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
    t.assert.strictEqual(new FastifyInstrumentation({ servername: 'test' }).servername, 'test')
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
