import { expectAssignable } from 'tsd'
import { InstrumentationBase, InstrumentationConfig } from '@opentelemetry/instrumentation'
import { Context, Span, TextMapGetter, TextMapSetter, Tracer } from '@opentelemetry/api'
import { fastify as Fastify, FastifyInstance, FastifyPluginCallback } from 'fastify'

import { FastifyOtelInstrumentation } from '..'
import { FastifyOtelInstrumentationOpts } from '../types'

expectAssignable<InstrumentationBase>(new FastifyOtelInstrumentation())
expectAssignable<InstrumentationConfig>({ servername: 'server', enabled: true } as FastifyOtelInstrumentationOpts)
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
  expectAssignable<Span>(otel.span)
  expectAssignable<Context>(otel.context)
  expectAssignable<Tracer>(otel.tracer)
  expectAssignable<(carrier: any, setter?: TextMapSetter) => void>(otel.inject)
  expectAssignable<(carrier: any, getter?: TextMapGetter) => Context>(otel.extract)
})
