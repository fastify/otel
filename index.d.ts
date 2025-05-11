/// <reference types="node" />

import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation'
import { FastifyPluginCallback } from 'fastify'

import {
  FastifyOtelInstrumentationOpts,
  FastifyOtelOptions,
  FastifyOtelRequestContext
} from './types'

declare module 'fastify' {
  interface FastifyRequest {
    opentelemetry(): FastifyOtelRequestContext
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
