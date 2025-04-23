// types.d.ts
import { InstrumentationConfig } from '@opentelemetry/instrumentation'
import { Context, Span, TextMapGetter, TextMapSetter, Tracer } from '@opentelemetry/api'
import { HTTPMethods } from 'fastify'

export interface FastifyOtelOptions {}
export interface FastifyOtelInstrumentationOpts extends InstrumentationConfig {
  servername?: string
  registerOnInitialization?: boolean
  ignorePaths?: string | ((routeOpts: { url: string, method: HTTPMethods }) => boolean);
}

export type FastifyOtelRequestContext = {
  span: Span,
  tracer: Tracer,
  context: Context,
  inject: (carrier: {}, setter?: TextMapSetter) => void;
  extract: (carrier: {}, getter?: TextMapGetter) => Context
}
