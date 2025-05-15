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
declare class FastifyOtelInstrumentationClass<Config extends FastifyOtelInstrumentationOpts = FastifyOtelInstrumentationOpts> extends InstrumentationBase<Config> {
  servername: string
  constructor (config?: FastifyOtelInstrumentationOpts)
  init (): InstrumentationNodeModuleDefinition[]
  plugin (): FastifyPluginCallback<FastifyOtelOptions>
}

type FastifyOtelInstrumentationClassType = typeof FastifyOtelInstrumentationClass

interface FastifyOtelInstrumentationExport extends FastifyOtelInstrumentationClassType {
  FastifyOtelInstrumentation: FastifyOtelInstrumentationClassType
}

declare const exported: FastifyOtelInstrumentationExport

export = exported
