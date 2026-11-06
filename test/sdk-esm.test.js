'use strict'

const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const { join } = require('node:path')
const { SpanKind } = require('@opentelemetry/api')

const execFileAsync = promisify(execFile)
const fixtures = process.env.FASTIFY_OTEL_FIXTURES || join(__dirname, '..', 'fixtures')
const bootstrap = pathToFileURL(join(fixtures, 'sdk-bootstrap.mjs')).href
const application = join(fixtures, 'sdk-request.mjs')

for (const registration of ['automatic', 'plugin']) {
  test(`native ESM preserves HTTP parenting with ${registration} registration`, async () => {
    // A fresh Node process ensures --import initializes telemetry before the app
    // and uses native import resolution instead of a test runner's module cache.
    const { stdout } = await execFileAsync(process.execPath, [
      '--import', bootstrap, application, registration
    ], { timeout: 10000 })
    const spans = JSON.parse(stdout)
    const serverSpans = spans.filter(span => span.kind === SpanKind.SERVER)
    const fastifySpans = spans.filter(span => span.scope === '@fastify/otel')

    assert.equal(serverSpans.length, 1, 'each HTTP request must have exactly one SERVER span')
    const server = serverSpans[0]
    assert.equal(server.scope, '@opentelemetry/instrumentation-http')
    assert.equal(server.name, 'GET /users/:id')
    assert.equal(server.attributes['http.route'], '/users/:id')
    assert.equal(server.context.traceId, '11111111111111111111111111111111')
    assert.equal(server.parent.spanId, '2222222222222222')

    assert.equal(fastifySpans.length, 2, 'request and handler spans must both be exported')
    const request = fastifySpans.find(span => span.name === 'request')
    const handler = fastifySpans.find(span => span.attributes['fastify.type'] === 'request-handler')
    assert.ok(request, 'Fastify request span is missing')
    assert.ok(handler, 'Fastify handler span is missing')
    assert.equal(request.kind, SpanKind.INTERNAL)
    assert.equal(request.parent.spanId, server.context.spanId)
    assert.equal(handler.parent.spanId, request.context.spanId)
    for (const span of fastifySpans) {
      assert.equal(span.context.traceId, server.context.traceId)
      assert.equal(span.attributes['http.route'], '/users/:id')
    }
  })
}
