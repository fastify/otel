'use strict'

const { NodeSDK } = require('@opentelemetry/sdk-node')
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http')
const { FastifyOtelInstrumentation } = require('@fastify/otel')

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [
    new FastifyOtelInstrumentation({ registerOnInitialization: true })
  ]
})

sdk.start()
