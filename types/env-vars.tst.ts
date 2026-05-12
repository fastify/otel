import { expect } from 'tstyche'
import { InstrumentationBase } from '@opentelemetry/instrumentation'
import { fastify as Fastify } from 'fastify'

import { FastifyOtelInstrumentation, FastifyOtelInstrumentationOpts } from '.'

expect(new FastifyOtelInstrumentation()).type.toBeAssignableTo<InstrumentationBase>()

expect<FastifyOtelInstrumentationOpts>().type.toBeAssignableFrom({ enabled: true })
expect<FastifyOtelInstrumentationOpts>().type.toBeAssignableFrom({})

const app = Fastify()
app.register(new FastifyOtelInstrumentation().plugin())
app.register((nested, _opts, done) => {
  nested.register(new FastifyOtelInstrumentation().plugin())
  done()
})
