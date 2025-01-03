/// <reference types="node" />

import { InstrumentationBase, InstrumentationConfig, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation'
import { FastifyInstance } from 'fastify'

export interface FastifyOtelOptions {}
export interface FastifyOtelInstrumentationOpts extends InstrumentationConfig {
  servername?: string
}

declare class FastifyOtelInstrumentation<Config extends FastifyOtelInstrumentationOpts = FastifyOtelInstrumentationOpts> extends InstrumentationBase<Config> {
  static FastifyInstrumentation: FastifyOtelInstrumentation
  constructor (config?: FastifyOtelInstrumentationOpts)
  init (): InstrumentationNodeModuleDefinition[]
  plugin (): (instance: FastifyInstance, opts: FastifyOtelOptions, done: (err?: Error) => void) => void
}

export default FastifyOtelInstrumentation
export { FastifyOtelInstrumentation }
