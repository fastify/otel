import { expect } from 'tstyche'
import { InstrumentationBase, InstrumentationConfig } from '@opentelemetry/instrumentation'
import { fastify as Fastify } from 'fastify'

import { FastifyOtelInstrumentation } from '.'
import { FastifyOtelInstrumentationOpts } from './types'

expect(new FastifyOtelInstrumentation()).type.toBeAssignableTo<InstrumentationBase>()
expect({ enabled: true } as FastifyOtelInstrumentationOpts).type.toBeAssignableTo<InstrumentationConfig>()
expect({} as FastifyOtelInstrumentationOpts).type.toBeAssignableTo<InstrumentationConfig>()

const app = Fastify()
app.register(new FastifyOtelInstrumentation().plugin())
app.register((nested, _opts, done) => {
  nested.register(new FastifyOtelInstrumentation().plugin())
  done()
})