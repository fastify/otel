import { expectAssignable } from 'tsd'
import { InstrumentationBase, InstrumentationConfig } from '@opentelemetry/instrumentation'
import { Context, Span, TextMapGetter, TextMapSetter, Tracer } from '@opentelemetry/api'
import { fastify as Fastify, FastifyInstance, FastifyPluginCallback, FastifyRequest } from 'fastify'

import FastifyInstrumentation, { FastifyOtelInstrumentation } from '.'
import { FastifyOtelInstrumentationOpts } from './types'

expectAssignable<InstrumentationBase>(new FastifyOtelInstrumentation())
expectAssignable<InstrumentationBase>(new FastifyInstrumentation())
expectAssignable<InstrumentationConfig>({
  servername: 'server',
  enabled: true,
  requestHook (span, request) {
    expectAssignable<Span>(span)
    expectAssignable<FastifyRequest>(request)
  }
} as FastifyOtelInstrumentationOpts)
expectAssignable<InstrumentationConfig>({} as FastifyOtelInstrumentationOpts)

const app = Fastify()
const plugin = new FastifyOtelInstrumentation().plugin()

expectAssignable<FastifyInstance>(app)
expectAssignable<FastifyPluginCallback>(plugin)
expectAssignable<FastifyInstance>(app.register(plugin))
expectAssignable<FastifyInstance>(app.register(plugin).register(plugin))

app.register(new FastifyOtelInstrumentation().plugin())
app.register((nested, _opts, done) => {
  nested.register(new FastifyOtelInstrumentation().plugin())
  done()
})

app.get('/', async function (request, reply) {
  const otel = request.opentelemetry()

  expectAssignable<(carrier: any, setter?: TextMapSetter) => void>(otel.inject)
  expectAssignable<(carrier: any, getter?: TextMapGetter) => Context>(otel.extract)
  expectAssignable<Tracer>(otel.tracer)

  if (otel.enabled) {
    expectAssignable<Span>(otel.span)
    expectAssignable<Context>(otel.context)
  } else {
    expectAssignable<null>(otel.span)
    expectAssignable<null>(otel.context)
  }
})
