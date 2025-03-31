import { expectAssignable } from 'tsd'
import { InstrumentationBase, InstrumentationConfig } from '@opentelemetry/instrumentation'
import { fastify as Fastify } from 'fastify'

import { FastifyOtelInstrumentation, FastifyOtelInstrumentationOpts, FastifyInstance, FastifyPlugin } from '..'

expectAssignable<InstrumentationBase>(new FastifyOtelInstrumentation())
expectAssignable<InstrumentationConfig>({ servername: 'server', enabled: true } as FastifyOtelInstrumentationOpts)
expectAssignable<InstrumentationConfig>({} as FastifyOtelInstrumentationOpts)

const app = Fastify()
const plugin = new FastifyOtelInstrumentation().plugin()

expectAssignable<FastifyInstance>(app)
expectAssignable<FastifyPlugin>(plugin)
expectAssignable<FastifyInstance>(app.register(plugin))
expectAssignable<FastifyInstance>(app.register(plugin).register(plugin))

app.register(new FastifyOtelInstrumentation().plugin())
app.register((nested, _opts, done) => {
  nested.register(new FastifyOtelInstrumentation().plugin())
  done()
})
