/// <reference types="node" />

import { InstrumentationBase, type InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation'
import type { FastifyPluginCallback } from 'fastify'

import type {
  FastifyOtelHookName,
  FastifyOtelInstrumentationOpts,
  FastifyOtelLifecycleHookInfo,
  FastifyOtelOptions,
  FastifyOtelRequestContext,
  FastifyOtelRouteConfig
} from './types'

declare module 'fastify' {
  interface FastifyRequest {
    opentelemetry(): FastifyOtelRequestContext
  }

  interface FastifyContextConfig {
    /** Set to `false` to disable OpenTelemetry for the route, or use an object to control hook spans */
    otel?: boolean | FastifyOtelRouteConfig
  }
}

declare class FastifyOtelInstrumentation<Config extends FastifyOtelInstrumentationOpts = FastifyOtelInstrumentationOpts> extends InstrumentationBase<Config> {
  constructor (config?: FastifyOtelInstrumentationOpts)
  init (): InstrumentationNodeModuleDefinition[]
  plugin (): FastifyPluginCallback<FastifyOtelOptions>
}

declare namespace exported {
  export type {
    FastifyOtelHookName,
    FastifyOtelInstrumentationOpts,
    FastifyOtelLifecycleHookInfo,
    FastifyOtelRouteConfig
  }
  export { FastifyOtelInstrumentation }
  export { FastifyOtelInstrumentation as default }
}

export = exported
