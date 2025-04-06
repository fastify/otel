// types.d.ts
import { InstrumentationConfig } from '@opentelemetry/instrumentation'
import { Context, Span, TextMapGetter, TextMapSetter, Tracer } from '@opentelemetry/api'

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
