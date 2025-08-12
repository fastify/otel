const { default: fastify } = require('fastify')
const { test, after, describe } = require('node:test')
const { resourceFromAttributes } = require('@opentelemetry/resources')
const { NodeSDK } = require('@opentelemetry/sdk-node')
const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions')
const FastifyOtelInstrumentation = require('..')
const { ExportResultCode } = require('@opentelemetry/core')
const assert = require('node:assert')

describe('FastifyOtelInstrumentation with opentelemetry.NodeSDK', () => {
  test('should export correct spans', async () => {
    const traceExporter = {
      spans: [],
      export: (spans, resultCallback) => {
        traceExporter.spans.push(...spans)
        resultCallback({ code: ExportResultCode.SUCCESS })
      },
      shutdown: async () => {},
    }

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'test-service' }),
      traceExporter,
    })
    sdk.start()
    after(() => sdk.shutdown())

    const app = await fastify()
    await app.register(new FastifyOtelInstrumentation().plugin())
    app.get('/qq', async () => 'hello world')

    await app.listen()
    after(() => app.close())

    const response = await fetch(
      `http://localhost:${app.server.address().port}/qq`
    )
    assert.equal(response.status, 200)

    await sdk.shutdown() // flush spans

    const spans = traceExporter.spans
    assert.equal(spans.length, 2)

    assert.deepStrictEqual(spans[0].name, 'handler - fastify -> @fastify/otel')
    assert.deepStrictEqual(spans[0].attributes, {
      'fastify.type': 'request-handler',
      'hook.callback.name': 'anonymous',
      'hook.name': 'fastify -> @fastify/otel - route-handler',
      'http.route': '/qq',
      'service.name': 'fastify',
    })
    assert.deepStrictEqual(spans[1].name, 'request')
    assert.deepStrictEqual(spans[1].attributes, {
      'fastify.root': '@fastify/otel',
      'http.request.method': 'GET',
      'http.response.status_code': 200,
      'http.route': '/qq',
      'service.name': 'fastify',
    })
  })
})
