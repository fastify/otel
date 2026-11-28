import { context, propagation, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace'
import { FastifyOtelInstrumentation } from '@fastify/otel'

// This is what NodeSDK does for you
const provider = new TracerProvider({
  spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })]
})
trace.setGlobalTracerProvider(provider)
propagation.setGlobalPropagator(new W3CTraceContextPropagator())
context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())

export const fastifyOtelInstrumentation = new FastifyOtelInstrumentation()
// Optional here, because the provider is also registered globally
fastifyOtelInstrumentation.setTracerProvider(provider)
