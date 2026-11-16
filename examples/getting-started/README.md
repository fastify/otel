# Getting started

```sh
npm install
npm start
```

`otel.js` starts the Node SDK and registers `@fastify/otel` on every Fastify instance. `app.js` is a normal Fastify app, so it does not call `register` for the instrumentation.

The exporter uses the OTLP HTTP defaults (`http://localhost:4318/v1/traces`). Set `OTEL_EXPORTER_OTLP_ENDPOINT` or replace the exporter for your backend.
