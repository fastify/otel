# Manual registration

```sh
npm install
npm start
```

`otel.js` creates the tracer provider without the Node SDK and passes it to `@fastify/otel` with `setTracerProvider`. `app.js` imports it and registers the plugin with `app.register(fastifyOtelInstrumentation.plugin())` before defining the routes, then shows the per-route `config.otel` options.

The exporter uses the OTLP HTTP defaults (`http://localhost:4318/v1/traces`). Set `OTEL_EXPORTER_OTLP_ENDPOINT` or replace the exporter for your backend.
