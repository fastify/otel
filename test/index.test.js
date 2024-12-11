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
  describe('Instrumentation#disabled', () => {
    instrumentation.setTracerProvider(provider)
    httpInstrumentation.setTracerProvider(provider)
    context.setGlobalContextManager(contextManager)

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
      contextManager.enable()
    })

    afterEach(() => {
      contextManager.disable()
      instrumentation.disable()
      httpInstrumentation.disable()
      spanProcessor.forceFlush()
      memoryExporter.reset()
    })

    test('should anonymous span', async t => {
      const app = Fastify()
      const plugin = instrumentation.plugin()

      await app.register(plugin)

      app.get('/', async (request, reply) => 'hello world')

      t.plan(3)

      //  Might need to call HTTP
      const response = await app.inject({
        method: 'GET',
        url: '/'
      })

      const spans = memoryExporter
        .getFinishedSpans()
        .find(span => span.instrumentationLibrary.name === '@fastify/otel')

      console.log(spans)

      t.assert.ok(spans == null)
      t.assert.equal(response.statusCode, 200)
      t.assert.equal(response.body, 'hello world')
    })
  })
})
