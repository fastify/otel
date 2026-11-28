import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { FastifyOtelInstrumentation } from '@fastify/otel'

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [
    new FastifyOtelInstrumentation({ registerOnInitialization: true })
  ]
})

sdk.start()
