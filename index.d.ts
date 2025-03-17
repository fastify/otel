/// <reference types="node" />

import { InstrumentationBase, InstrumentationConfig, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation'

interface FastifyReply {
  send: () => FastifyReply;
  statusCode: number;
}

interface FastifyRequest {
  method?: string;
  // since fastify@4.10.0
  routeOptions?: {
    url?: string;
  };
  routerPath?: string;
}

type HandlerOriginal =
  | ((request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => Promise<void>)
  | ((request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => void)

type FastifyError = any

type HookHandlerDoneFunction = <TError extends Error = FastifyError>(err?: TError) => void

type FastifyPlugin = (
  instance: FastifyInstance,
  opts: any,
  done: HookHandlerDoneFunction,
) => unknown | Promise<unknown>

interface FastifyOtelOptions {}
interface FastifyOtelInstrumentationOpts extends InstrumentationConfig {
  servername?: string
  registerOnInitialization?: boolean
}

interface FastifyInstance {
  version: string;
  register: (plugin: any) => FastifyInstance;
  after: (listener?: (err: Error) => void) => FastifyInstance;
  addHook(hook: string, handler: HandlerOriginal): FastifyInstance;
  addHook(
    hook: 'onError',
    handler: (request: FastifyRequest, reply: FastifyReply, error: Error) => void,
  ): FastifyInstance;
  addHook(hook: 'onRequest', handler: (request: FastifyRequest, reply: FastifyReply) => void): FastifyInstance;
}

declare class FastifyOtelInstrumentation<Config extends FastifyOtelInstrumentationOpts = FastifyOtelInstrumentationOpts> extends InstrumentationBase<Config> {
  static FastifyInstrumentation: typeof FastifyOtelInstrumentation
  constructor (config?: FastifyOtelInstrumentationOpts)
  init (): InstrumentationNodeModuleDefinition[]
  plugin (): FastifyPlugin
}

// Declare the CommonJS export object
declare namespace FastifyOtelInstrumentation {
  export {
    FastifyOtelInstrumentation,
    FastifyOtelInstrumentationOpts,
    FastifyOtelOptions,
    FastifyPlugin,
    FastifyInstance
  }
}

export = FastifyOtelInstrumentation
