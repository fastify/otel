/// <reference types="node" />

import { InstrumentationBase, type InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation'
import type { FastifyPluginCallback } from 'fastify'

import type {
  FastifyOtelInstrumentationOpts,
  FastifyOtelOptions,
  FastifyOtelRequestContext
} from './types'

declare module 'fastify' {
  interface FastifyRequest {
    opentelemetry(): FastifyOtelRequestContext
  }

  interface FastifyContextConfig {
    /** Set this to `true` to disable OpenTelemetry for the route */
    otel: boolean
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare class FastifyOtelInstrumentation<Config extends FastifyOtelInstrumentationOpts = FastifyOtelInstrumentationOpts> extends InstrumentationBase<Config> {
  servername: string
  constructor (config?: FastifyOtelInstrumentationOpts)
  init (): InstrumentationNodeModuleDefinition[]
  plugin (): FastifyPluginCallback<FastifyOtelOptions>
}

declare namespace exported {
  export type { FastifyOtelInstrumentationOpts }
  export { FastifyOtelInstrumentation }
}

export = exported
