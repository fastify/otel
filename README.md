# @fastify/otel

[![CI](https://github.com/fastify/otel/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/fastify/otel/actions/workflows/ci.yml)
[![NPM version](https://img.shields.io/npm/v/@fastify/otel.svg?style=flat)](https://www.npmjs.com/package/@fastify/otel)
[![neostandard javascript style](https://img.shields.io/badge/code_style-neostandard-brightgreen?style=flat)](https://github.com/neostandard/neostandard)

OpenTelemetry auto-instrumentation library.

## Install

```sh
npm i @fastify/otel
```

## Usage

`@fastify/otel` works as a metric creator as well as application performance monitor for your Fastify application.

It must be configured before defining routes and other plugins in order to cover the most of your Fastify server.

- It automatically wraps the main request handler
- Instruments all route hooks (defined at instance and route definition level)
  - `onRequest`
  - `preParsing`
  - `preValidation`
  - `preHandler`
  - `preSerialization`
  - `onSend`
  - `onResponse`
  - `onError`
- Instruments automatically custom 404 Not Found handler
- TODO: Clarify server shutdown/cleanup around otel metrics/traces

## Example

```js
// otel.js
// Sets up metrics, tracing, HTTP & Node runtime instrumentation, and host metrics.
// Uses ConsoleSpanExporter for local debugging of spans.
const { NodeSDK } = require('@opentelemetry/sdk-node')
const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-node')
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base')
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus')
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http')
const { FastifyOtelInstrumentation } = require('@fastify/otel')
const { metrics, trace } = require('@opentelemetry/api')
const { resourceFromAttributes } = require('@opentelemetry/resources')
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions')

// Set up your preferred processors and exporters
const traceExporter = new ConsoleSpanExporter()
const spanProcessor = new SimpleSpanProcessor(traceExporter)
const prometheusExporter = new PrometheusExporter({ port: 9091 })

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    // This can also be set by OTEL_SERVICE_NAME
    // Instruments inherit from the SDK resource attributes
    [SemanticResourceAttributes.SERVICE_NAME]: 'my-service-name',
  }),
  spanProcessor,
  metricReader: prometheusExporter,
  instrumentations: [
    // HttpInstrumentation is required for FastifyOtelInstrumentation to work
    new HttpInstrumentation(),
    new FastifyOtelInstrumentation({
      // Automatically register the @fastify/otel fastify plugin for all routes
      registerOnInitialization: true,
    })
  ],
})

sdk.start()
module.exports = { sdk }

process.on('SIGTERM', () => {
  // @fastify/otel doesn't set up graceful shutdown of span processing
  sdk.shutdown()
    .then(
      () => console.log('SDK shut down successfully'),
      (err) => console.log(new Error('Error shutting down SDK', { cause: err }))
    )
})
```

Otel recommends using the loader/require flag for loading your otel setup file.
For ESM ("type"="module"), you must also pass a `--experimental-loader` flag.

[Fastify-cli](https://github.com/fastify/fastify-cli):

- `NODE_OPTIONS='--import otel.js --experimental-loader=@opentelemetry/instrumentation/hook.mjs' fastify start` for esm
- `fastify start --require otel.js` for cjs

Node.js:

- `node --experimental-loader=@opentelemetry/instrumentation/hook.mjs --import ./otel.js ./app.js` for esm
- `node --require ./otel.js ./app.js` for cjs

See [opentelemetry-js/doc/esm-support.md](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/esm-support.md) for more information around loading otel inside of ESM.

```js
// app.js
import Fastify from 'fastify';

// Because we used a loader flag and registerOnInitialization=true
// All routes will automatically be insturmented
const app = await Fastify();

app.get('/', async () => 'hello world');

app.get(
  '/healthcheck',
  { config: { otel: false } },       // skip tracing/metrics for this route
  async () => 'Up!'
);

// example of encapsulated context with its own instrumentation
app.register(async (instance) => {
  // will inherit global FastifyOtelInstrumentation because we registered with
  // registerOnInitialization
  instance.get('/', async () => 'nested hello world');
}, { prefix: '/nested' });

await app.listen({ port: 3000 });
````

### Manual plugin registration

You can also export your fastifyOtelInstrumentation to register the plugin on specific routes instead of all routes.
In this case, you would want to set `registerOnInitialization=false`.

```js
// otel.js
const fastifyOtelInstrumentation = new FastifyOtelInstrumentation({
  // Set this to false to not automatically install the fastify plugin on all routes
  registerOnInitialization: false,
})

const sdk = new NodeSDK({
  // ...
  instrumentations: [
    // ...
    fastifyOtelInstrumentation
  ],
})

sdk.start()
module.exports = { sdk, fastifyOtelInstrumentation }
```

```js
import Fastify from 'fastify';
import { fastifyOtelInstrumentation } from './otel.js';

const app = await Fastify();
// It is necessary to await for its register as it requires to be able
// to intercept all route definitions
await app.register(fastifyOtelInstrumentation.plugin());

app.get('/', async () => 'hello world');

// you can also scope your instrumentation to only be enabled on a sub context
// of your application
app.register((instance, opts, done) => {
    instance.register(fastifyOtelInstrumentation.plugin());
    // If only enabled in your encapsulated context
    // the parent context won't be instrumented
    app.get('/', () => 'hello world')

    done()
}, { prefix: '/nested' })
````

> **Notes**:
>
> - This instrumentation requires `@opentelemetry/instrumentation-http` to be able to propagate the traces all the way back to upstream
>   - The HTTP instrumentation might cover all your routes although `@fastify/otel` just covers a subset of your application

For more information about OpenTelemetry, please refer to the [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/) documentation.

## APIs

### `FastifyOtelRequestContext`

The `FastifyOtelRequestContext` is a wrapper around the OpenTelemetry `Context` and `Tracer` APIs. It also provides a way to manage the context of a request and its associated spans as well as some utilities to extract and inject further traces from and to the trace carrier.

#### `FastifyOtelRequestContext#context: Context`
The OpenTelemetry context object.

#### `FastifyOtelRequestContext#tracer: Tracer`
The OpenTelemetry tracer object.

#### `FastifyOtelRequestContext#span: Span`
The OpenTelemetry span object.
The span is created for each request and is automatically ended when the request is completed.

#### `FastifyOtelRequestContext#inject: function`
The OpenTelemetry inject function. It is used to inject the current context into a carrier object.

The carrier object can be any object that can hold key-value pairs, such as an HTTP request or response headers.

#### `FastifyOtelRequestContext#extract: function`
The OpenTelemetry extract function. It is used to extract a parent context from a carrier object.

The carrier object can be any object that can hold key-value pairs, such as an HTTP request or response headers.

The extracted context can be used as a parent span for a new span.

```js
const { fastifyOtelInstrumentation } = require('./otel.js');
const Fastify = require('fastify');

const app = fastify();
await app.register(fastifyOtelInstrumentation.plugin());

app.get('/', (req, reply) => {
  const { context, tracer, span, inject, extract } = req.opentelemetry();

  // Extract a parent span from the request headers
  const parentCxt = extract(req.headers);

  // Create a new span
  const newSpan = tracer.startSpan('my-new-span', {
    parent: parentCxt,
  });
  // Do some work
  newSpan.end();

  // Inject the new span into the response headers
  const carrier = {};
  inject(carrier);

  reply.headers(carrier);

  return 'hello world';
});
```

## Interfaces

### `FastifyOtelInstrumentationOptions`

The options for the `FastifyOtelInstrumentation` class.

#### `FastifyOtelInstrumentationOptions#serverName: string`

The name of the server. If not provided, it will fallback to `OTEL_SERVICE_NAME` as per [OpenTelemetry SDK Configuration](https://opentelemetry.io/docs/languages/sdk-configuration/general/).

#### `FastifyOtelInstrumentationOptions#registerOnInitialization: boolean`

Whether to register the plugin on initialization. If set to `true`, the plugin will be registered automatically when the Fastify instance is created.

This is useful for applications that want to ensure that all routes are instrumented without having to manually register the plugin.

#### `FastifyOtelInstrumentationOptions#ignorePaths: string | function`

String or function to ignore paths from being instrumented.

If a string is provided, it will be used as a glob match pattern.

If a function is provided, it will be called with the request options and should return true if the path should be ignored.

#### `FastifyOtelInstrumentationOptions#requestHook: function`
A **synchronous** callback that runs immediately after the root request span is created.
* **span** – the newly-created `Span`
* **info.request** – the current `FastifyRequest`

Use it to add custom attributes, events, or rename the span.  
If the function throws, the error is caught and logged so the request flow is never interrupted.


#### Examples

```ts
import { FastifyOtelInstrumentation } from '@fastify/otel';

const fastifyOtelInstrumentation = new FastifyOtelInstrumentation({
  serverName: 'my-server',
  registerOnInitialization: true,
  ignorePaths: (opts) => {
    // Ignore all paths that start with /ignore
    return opts.url.startsWith('/ignore');
  },
});
```

```js
const otel = new FastifyOtelInstrumentation({
  servername: 'my-app',
  requestHook: (span, request) => {
    // attach user info
    span.setAttribute('user.id', request.headers['x-user-id'] ?? 'anonymous')

    // optional: give the span a cleaner name
    span.updateName(`${request.method} ${request.routerPath}`)
  }
})
```

## License

Licensed under [MIT](./LICENSE).
