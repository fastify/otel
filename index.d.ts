/// <reference types="node" />

import { Context, Span, TextMapGetter, TextMapSetter, Tracer } from '@opentelemetry/api'
import { InstrumentationBase, InstrumentationConfig, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation'
import { FastifyPluginCallback } from 'fastify'

export interface FastifyOtelOptions {}
export interface FastifyOtelInstrumentationOpts extends InstrumentationConfig {
  servername?: string
  registerOnInitialization?: boolean
}
export type FastifyOtelRequestContext = {
  span: Span,
  tracer: Tracer,
  context: Context,
  inject: (carrier: {}, setter?: TextMapSetter) => void;
  extract: (carrier: {}, getter?: TextMapGetter) => Context
}

declare module 'fastify' {
  interface FastifyRequest {
    opentelemetry(): FastifyOtelRequestContext
  }
}

declare class FastifyOtelInstrumentation<Config extends FastifyOtelInstrumentationOpts = FastifyOtelInstrumentationOpts> extends InstrumentationBase<Config> {
  static FastifyInstrumentation: FastifyOtelInstrumentation
  constructor (config?: FastifyOtelInstrumentationOpts)
  init (): InstrumentationNodeModuleDefinition[]
  plugin (): FastifyPluginCallback<FastifyOtelOptions>
}

export default FastifyOtelInstrumentation
export { FastifyOtelInstrumentation }
