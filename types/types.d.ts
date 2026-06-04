// types.d.ts
import type { InstrumentationConfig } from '@opentelemetry/instrumentation'
import type { Context, Span, TextMapGetter, TextMapSetter, Tracer } from '@opentelemetry/api'
import type { HTTPMethods } from 'fastify'

export type FastifyOtelHookName =
  | 'onRequest'
  | 'preParsing'
  | 'preValidation'
  | 'preHandler'
  | 'preSerialization'
  | 'onSend'
  | 'onResponse'
  | 'onError'

export interface FastifyOtelRouteConfig {
  instrumentHooks?: boolean | FastifyOtelHookName[]
}

export interface FastifyOtelOptions {}
export interface FastifyOtelInstrumentationOpts extends InstrumentationConfig {
  registerOnInitialization?: boolean
  ignorePaths?: string | ((routeOpts: { url: string, method: HTTPMethods }) => boolean);
  requestHook?: (span: import('@opentelemetry/api').Span, request: import('fastify').FastifyRequest) => void
  lifecycleHook?: (span: import('@opentelemetry/api').Span, info: FastifyOtelLifecycleHookInfo) => void
  recordExceptions?: boolean
  instrumentHooks?: boolean | FastifyOtelHookName[]
}

export interface FastifyOtelLifecycleHookInfo {
  hookName: string
  request: import('fastify').FastifyRequest
  handler?: string
}

interface FastifyOtelRequestInfo {
  tracer: Tracer,
  inject: (carrier: {}, setter?: TextMapSetter) => void;
  extract: (carrier: {}, getter?: TextMapGetter) => Context
}

export interface FastifyEnabledOtelRequestContext extends FastifyOtelRequestInfo {
  enabled: true,
  span: Span,
  context: Context,
}

export interface FastifyDisabledOtelRequestContext extends FastifyOtelRequestInfo {
  enabled: false,
  span: null,
  context: null,
}

export type FastifyOtelRequestContext = FastifyEnabledOtelRequestContext | FastifyDisabledOtelRequestContext
