import assert from 'node:assert/strict'
import { exporter, instrumentation, sdk } from './sdk-bootstrap.mjs'

const fastifyPackage = process.env.FASTIFY_VERSION || 'fastify'
const { default: Fastify } = await import(fastifyPackage)
const app = Fastify()

try {
  if (process.argv[2] === 'plugin') {
    await app.register(instrumentation.plugin())
  }
  app.get('/users/:id', async function users () { return 'ok' })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const response = await fetch(`http://127.0.0.1:${app.server.address().port}/users/123`, {
    headers: { traceparent: '00-11111111111111111111111111111111-2222222222222222-01' }
  })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'ok')
  // Closing the server waits for the response to finish before inspecting spans.
  await app.close()
  process.stdout.write(JSON.stringify(exporter.getFinishedSpans().map(span => ({
    name: span.name,
    kind: span.kind,
    scope: span.instrumentationScope.name,
    context: span.spanContext(),
    parent: span.parentSpanContext,
    attributes: span.attributes
  }))))
} finally {
  await app.close()
  instrumentation.disable()
  await sdk.shutdown()
}
