import { NodeSDK } from '@opentelemetry/sdk-node'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import FastifyOtelInstrumentation from '../index.js'

export const instrumentation = new FastifyOtelInstrumentation({
  registerOnInitialization: process.argv[2] === 'automatic'
})
export const exporter = new InMemorySpanExporter()
export const sdk = new NodeSDK({
  autoDetectResources: false,
  spanProcessors: [new SimpleSpanProcessor({ exporter })],
  logRecordProcessors: [],
  metricReaders: [],
  instrumentations: [new HttpInstrumentation(), instrumentation]
})
sdk.start()
