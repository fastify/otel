import { expect } from 'tstyche'
import { InstrumentationBase, InstrumentationConfig } from '@opentelemetry/instrumentation'
import { Context, Span, TextMapGetter, TextMapSetter, Tracer } from '@opentelemetry/api'
import { fastify as Fastify, FastifyInstance, FastifyPluginCallback, FastifyRequest } from 'fastify'

import FastifyInstrumentation, { FastifyOtelInstrumentation } from '.'
import { FastifyOtelInstrumentationOpts } from './types'

expect(new FastifyOtelInstrumentation()).type.toBeAssignableTo<InstrumentationBase>()
expect(new FastifyInstrumentation()).type.toBeAssignableTo<InstrumentationBase>()
const opts: FastifyOtelInstrumentationOpts = {
  enabled: true,
  requestHook (span, request) {
    expect(span).type.toBeAssignableTo<Span>()
    expect(request).type.toBeAssignableTo<FastifyRequest>()
  },
  lifecycleHook (span, info) {
    expect(span).type.toBeAssignableTo<Span>()
    expect(info.hookName).type.toBeAssignableTo<string>()
    expect(info.request).type.toBeAssignableTo<FastifyRequest>()
    expect(info.handler).type.toBeAssignableTo<string | undefined>()
  },
  recordExceptions: false
}
expect(opts).type.toBeAssignableTo<InstrumentationConfig>()
expect({} as FastifyOtelInstrumentationOpts).type.toBeAssignableTo<InstrumentationConfig>()

const app = Fastify()
const plugin = new FastifyOtelInstrumentation().plugin()

expect(app).type.toBeAssignableTo<FastifyInstance>()
expect(plugin).type.toBeAssignableTo<FastifyPluginCallback>()
expect(app.register(plugin)).type.toBeAssignableTo<FastifyInstance>()
expect(app.register(plugin).register(plugin)).type.toBeAssignableTo<FastifyInstance>()

app.register(new FastifyOtelInstrumentation().plugin())
app.register((nested, _opts, done) => {
  nested.register(new FastifyOtelInstrumentation().plugin())
  done()
})

app.get('/', async function (request, _reply) {
  const otel = request.opentelemetry()

  expect(otel.inject).type.toBeAssignableTo<(carrier: any, setter?: TextMapSetter) => void>()
  expect(otel.extract).type.toBeAssignableTo<(carrier: any, getter?: TextMapGetter) => Context>()
  expect(otel.tracer).type.toBeAssignableTo<Tracer>()

  if (otel.enabled) {
    expect(otel.span).type.toBeAssignableTo<Span>()
    expect(otel.context).type.toBeAssignableTo<Context>()
  } else {
    expect(otel.span).type.toBeAssignableTo<null>()
    expect(otel.context).type.toBeAssignableTo<null>()
  }
})

// Test that otel field in FastifyContextConfig is optional
app.get('/with-config', { config: { } }, async function (_request, _reply) {
  return { hello: 'world' }
})

app.get('/with-otel-true', { config: { otel: true } }, async function (_request, _reply) {
  return { hello: 'world' }
})

app.get('/with-otel-false', { config: { otel: false } }, async function (_request, _reply) {
  return { hello: 'world' }
})

app.get('/with-other-config', { config: { customField: 'value' } }, async function (_request, _reply) {
  return { hello: 'world' }
})
