# @fastify/otel

[![CI](https://github.com/fastify/otel/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/fastify/otel/actions/workflows/ci.yml)
[![NPM version](https://img.shields.io/npm/v/@fastify/otel.svg?style=flat)](https://www.npmjs.com/package/@fastify/otel)
[![neostandard javascript style](https://img.shields.io/badge/code_style-neostandard-brightgreen?style=flat)](https://github.com/neostandard/neostandard)

OpenTelemetry tracing instrumentation for Fastify.

## Install

```sh
npm i @fastify/otel
```

Requires Node.js >=22.15.0, OpenTelemetry API 1.10.x and SDK 3.x.
Use SDK-generation 0.300.x packages for experimental OpenTelemetry packages,
including `sdk-node` and `instrumentation-http`.

Supports Fastify `>=4.0.0`.

## What it does

`@fastify/otel` creates trace spans for the Fastify request lifecycle. For each request it creates:

- A `request` span that covers the whole Fastify lifecycle of the request
- A child span for the route handler; use `instrumentHandler` globally or per-route to disable it
- A child span for every hook defined at instance or route level; use `instrumentHooks` globally or per-route to control them
  - `onRequest`
  - `preParsing`
  - `preValidation`
  - `preHandler`
  - `preSerialization`
  - `onSend`
  - `onResponse`
  - `onError`
- A child span for a custom 404 Not Found handler set with `setNotFoundHandler`, and for its `preValidation` and `preHandler` hooks

Hooks added before the plugin is registered are not instrumented.

It is a Fastify plugin: it wraps the handlers and the hooks of the instance where it is registered and
does not patch any module at load time. It does not export anything by itself and it does not record
metrics. You still need an OpenTelemetry SDK that provides the tracer provider, the span processor and
the exporter (see [Setup](#setup)).

### Spans, metrics and other instrumentations

| You want | You need |
| --- | --- |
| Fastify spans (request, handler, hooks) | `@fastify/otel` and a tracer provider with an exporter |
| An HTTP server span around the Fastify spans | `@opentelemetry/instrumentation-http` next to `@fastify/otel` |
| Metrics | Not provided by `@fastify/otel`. Use an instrumentation that records metrics and configure a metric reader in your SDK |

`@opentelemetry/instrumentation-http` is optional:

- Without it, the `request` span has kind `SERVER`. If there is no active span, the incoming trace
  context (for example the `traceparent` header) is extracted from the request headers with the global
  propagator.
- With it, the HTTP instrumentation creates the `SERVER` span and the `request` span becomes an
  `INTERNAL` child of it. `@fastify/otel` also sets the matched route on the HTTP span.
- The HTTP instrumentation covers every request of the server, while `@fastify/otel` covers only the
  Fastify instances (or encapsulated contexts) where it is registered.

### Span names and attributes

All spans are created with the instrumentation scope `@fastify/otel`.

The `request` span has these attributes:

| Attribute | Value |
| --- | --- |
| `fastify.root` | `@fastify/otel` |
| `http.request.method` | The request method |
| `url.path` | The request URL |
| `http.route` | The matched route pattern, for example `/users/:id` |
| `http.response.status_code` | The reply status code |

Handler and hook spans are named `<hook> - <function name>`, for example `preHandler - checkAuth` or
`handler - getUser`. When the function is anonymous, the name of the plugin that defines it is used
instead. They have these attributes:

| Attribute | Value |
| --- | --- |
| `hook.name` | The plugin name and the hook, for example `my-plugin - route -> preHandler` or `my-plugin - route-handler` |
| `hook.callback.name` | The function name, or `anonymous` |
| `fastify.type` | `request-handler` for the route handler, `route-hook` for hooks defined on the route, `hook` for instance hooks and Not Found handlers |
| `http.route` | The route pattern (route handler and route hooks only) |

A handler or hook span that throws or rejects has status `ERROR`. The `request` span has status `ERROR`
only for 5xx responses (see [`recordExceptions`](#fastifyotelinstrumentationoptionsrecordexceptions-boolean)).

## Setup

There are two ways to attach the instrumentation to a Fastify instance. **Choose one of them, not both.**

| | Automatic | Manual |
| --- | --- | --- |
| How | `registerOnInitialization: true` | `app.register(instrumentation.plugin())` |
| Scope | Every Fastify instance of the process | Only the instance or encapsulated context where you register it |
| Changes in the app code | None | One `register` call, before routes and other plugins |

> If you set `registerOnInitialization: true` and also call `app.register(instrumentation.plugin())` on
> the same instance, Fastify throws `FST_ERR_DEC_ALREADY_PRESENT`
> (`The decorator ... has already been added!`). Remove one of the two. The same happens when the
> plugin is registered both on an instance and on one of its encapsulated contexts.

In both modes `app.hasPlugin('@fastify/otel')` returns `true`.

In both cases the OpenTelemetry setup lives in its own file and must run before the application code.

### Automatic registration with the Node SDK

This is the recommended setup. `NodeSDK` creates the tracer provider, registers it globally together
with the context manager and the propagators, and hands the provider to every instrumentation in the
`instrumentations` array. You do not have to call `setTracerProvider` yourself.

`otel.js`

```js
'use strict'

const { NodeSDK } = require('@opentelemetry/sdk-node')
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http')
const { FastifyOtelInstrumentation } = require('@fastify/otel')

// The service name comes from the OpenTelemetry resource: set OTEL_SERVICE_NAME
// or pass a `resource` to NodeSDK, as per
// https://opentelemetry.io/docs/languages/sdk-configuration/general/
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [
    new FastifyOtelInstrumentation({ registerOnInitialization: true })
  ]
})

sdk.start()
```

To also get the HTTP server span, add `new HttpInstrumentation()` from
`@opentelemetry/instrumentation-http` to the `instrumentations` array.

`app.js`

```js
'use strict'

const Fastify = require('fastify')

// No `register` call for the instrumentation: every Fastify instance
// created after `sdk.start()` is instrumented.
const app = Fastify()

app.get('/', () => 'hello world')

app.listen({ port: 3000 })
```

Start the application loading `otel.js` first:

```sh
OTEL_SERVICE_NAME=my-server node --import ./otel.js app.js
# or, for CommonJS only
OTEL_SERVICE_NAME=my-server node --require ./otel.js app.js
```

This setup is available as a runnable project in
[`examples/getting-started`](./examples/getting-started):

```sh
cd examples/getting-started
npm install
npm start
```

### Manual registration

Register the plugin yourself when you want to instrument only some Fastify instances or encapsulated
contexts, or when you do not use `NodeSDK`.

`setTracerProvider(provider)` is the standard OpenTelemetry instrumentation method that tells the
instrumentation which tracer provider creates its spans. The provider is the object of your
OpenTelemetry SDK that owns the span processors and the exporters.

- If a global tracer provider is registered (`NodeSDK` does it, as well as
  `trace.setGlobalTracerProvider(provider)`), the instrumentation uses it and `setTracerProvider` is
  optional.
- If there is no global provider, or you want this instrumentation to use a different one, pass it with
  `setTracerProvider`.
- If there is no provider at all, no span is created.

`otel.js`

```js
'use strict'

const { context, propagation, trace } = require('@opentelemetry/api')
const { AsyncLocalStorageContextManager } = require('@opentelemetry/context-async-hooks')
const { W3CTraceContextPropagator } = require('@opentelemetry/core')
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http')
const { BatchSpanProcessor, TracerProvider } = require('@opentelemetry/sdk-trace')
const { FastifyOtelInstrumentation } = require('@fastify/otel')

// This is what NodeSDK does for you
const provider = new TracerProvider({
  spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })]
})
trace.setGlobalTracerProvider(provider)
propagation.setGlobalPropagator(new W3CTraceContextPropagator())
context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())

const fastifyOtelInstrumentation = new FastifyOtelInstrumentation()
fastifyOtelInstrumentation.setTracerProvider(provider)

module.exports = { fastifyOtelInstrumentation }
```

`app.js`

```js
'use strict'

const { fastifyOtelInstrumentation } = require('./otel.js')
const Fastify = require('fastify')

async function start () {
  const app = Fastify()

  // Await the registration before defining routes and other plugins:
  // the plugin has to intercept all route definitions
  await app.register(fastifyOtelInstrumentation.plugin())

  // all your routes are instrumented
  app.get('/', () => 'hello world')
  // as well as your instance level hooks
  app.addHook('onError', async () => { /* do something */ })
  // Skip telemetry for a specific route
  app.get('/healthcheck', { config: { otel: false } }, () => 'Up!')
  // Keep request and handler spans but skip lifecycle hook spans on a route
  app.get('/api', { config: { otel: { instrumentHooks: false } } }, () => 'ok')
  // Keep the request span but skip the handler child span on a route
  app.get('/health', { config: { otel: { instrumentHandler: false } } }, () => 'ok')

  await app.listen({ port: 3000 })
}

start()
```

The instrumentation can also be scoped to an encapsulated context. In that case do not register it on
the parent instance, which is not instrumented:

```js
app.register(async function nested (instance) {
  await instance.register(fastifyOtelInstrumentation.plugin())

  // Only the routes of this context are instrumented
  instance.get('/', () => 'hello world')
}, { prefix: '/nested' })
```

### Handlers with a different signature

If the main request handler is not of the form `(request, reply)` (for example, `@fastify/websocket`
handlers take the form `(socket, request)`), the plugin attempts to find the Fastify request object
in any of the handler's arguments. If no request object can be found, instrumentation is skipped and
a debug level message is logged.

### Enabling, disabling and debugging

`FastifyOtelInstrumentation` extends the OpenTelemetry `InstrumentationBase` class, so it has the standard
`enable()`, `disable()` and `setTracerProvider()` methods. It is enabled by default. While it is
disabled no span is created, even if the plugin is registered.

Skipped routes, ignored paths and handlers called without a Fastify request are reported at debug level
through the OpenTelemetry diagnostic logger, under the `@fastify/otel` namespace. With `NodeSDK` you can
see them by setting `OTEL_LOG_LEVEL=debug`.

### TypeScript

The package exports the class both as default and as named export, together with its types:

```ts
import {
  FastifyOtelInstrumentation,
  type FastifyOtelInstrumentationOpts,
  type FastifyOtelRequestContext,
  type FastifyOtelRouteConfig,
  type FastifyOtelLifecycleHookInfo,
  type FastifyOtelHookName
} from '@fastify/otel'
```

Importing it also types `request.opentelemetry()` and the `otel` property of the route `config`.

For more information about OpenTelemetry, please refer to the [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/) documentation.

## APIs

### `FastifyOtelRequestContext`

The `FastifyOtelRequestContext` is a wrapper around the OpenTelemetry `Context` and `Tracer` APIs. It also provides a way to manage the context of a request and its associated spans as well as some utilities to extract and inject further traces from and to the trace carrier.

#### `FastifyOtelRequestContext#enabled: boolean`
Whether OpenTelemetry is enabled for the instrumentation and route configuration.

#### `FastifyOtelRequestContext#instrumented: boolean`
Whether the current request has an OpenTelemetry span and context. This can be `false`
when instrumentation is enabled, but the request is intentionally skipped by options such
as `ignorePaths`. Use it as a runtime signal before using request span APIs.

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
// `app` is a Fastify instance with the plugin registered, see Setup
app.get('/', (req, reply) => {
  const otel = req.opentelemetry();

  if (!otel.instrumented || otel.span == null || otel.context == null) {
    return 'hello world';
  }

  const { context, tracer, span, inject, extract } = otel;

  // Add an attribute to the request span
  span.setAttribute('app.tenant', 'acme');

  // Create a new span as a child of the request span.
  // The parent is taken from the context passed as third argument
  const newSpan = tracer.startSpan('my-new-span', {}, context);
  // Do some work
  newSpan.end();

  // Extract the trace context sent by the caller from the request headers
  const callerContext = extract(req.headers);
  // and use it as parent instead, for example for a span linked to the caller
  const callerSpan = tracer.startSpan('caller-child-span', {}, callerContext);
  callerSpan.end();

  // Inject the trace context of the request span into the response headers
  const carrier = {};
  inject(carrier);

  reply.headers(carrier);

  return 'hello world';
});
```

## Interfaces

### `FastifyOtelInstrumentationOptions`

The options for the `FastifyOtelInstrumentation` class.



#### `FastifyOtelInstrumentationOptions#registerOnInitialization: boolean`

Whether to register the plugin on initialization. If set to `true`, the plugin will be registered automatically when the Fastify instance is created.

This is useful for applications that want to ensure that all routes are instrumented without having to manually register the plugin.

Do not call `app.register(instrumentation.plugin())` when this option is `true`: the plugin would be registered twice and Fastify throws `FST_ERR_DEC_ALREADY_PRESENT`. See [Setup](#setup).

#### `FastifyOtelInstrumentationOptions#ignorePaths: string | function`

String or function to ignore paths from being instrumented.

If a string is provided, it will be used as a glob match pattern.

If a function is provided, it will be called with an object that has the `url` and `method` properties and should return true if the path should be ignored.

When the option is not set, the value of the `OTEL_FASTIFY_IGNORE_PATHS` environment variable is used as glob pattern:

```sh
OTEL_FASTIFY_IGNORE_PATHS='/health/*' node --import ./otel.js app.js
```

Any other value, including an empty string, throws a `TypeError`.

#### `FastifyOtelInstrumentationOptions#requestHook: function`
A **synchronous** callback that runs immediately after the root request span is created.
* **span** – the newly-created `Span`
* **request** – the current `FastifyRequest`

Use it to add custom attributes, events, or rename the span.
If the function throws, the error is caught and logged so the request flow is never interrupted.


#### Examples

```ts
import { FastifyOtelInstrumentation } from '@fastify/otel';

const fastifyOtelInstrumentation = new FastifyOtelInstrumentation({
  registerOnInitialization: true,
  ignorePaths: (opts) => {
    // Ignore all paths that start with /ignore
    return opts.url.startsWith('/ignore');
  },
});

// Service name should be set via environment variable:
// export OTEL_SERVICE_NAME=my-server
// or via NodeSDK resource configuration
```

```js
const otel = new FastifyOtelInstrumentation({
  requestHook: (span, request) => {
    // attach user info
    span.setAttribute('user.id', request.headers['x-user-id'] ?? 'anonymous')

    // optional: give the span a cleaner name
    span.updateName(`${request.method} ${request.routeOptions.url}`)
  }
})
```

#### `FastifyOtelInstrumentationOptions#instrumentHooks: boolean | string[]`

Control which Fastify lifecycle hooks receive child spans. Defaults to instrumenting all hooks listed in Usage.

* `true` (default) – instrument all lifecycle hooks (`onRequest`, `preParsing`, `preValidation`, `preHandler`, `preSerialization`, `onSend`, `onResponse`, `onError`)
* `false` – no lifecycle hook child spans (the root `request` span and route `handler` span are still created)
* `string[]` – allowlist of hook names to instrument (for example `['preHandler']`)

Per-route override via `config.otel`:

* `otel: false` – disable all OpenTelemetry spans for the route (unchanged)
* `otel: { instrumentHooks: false }` – request and handler spans only
* `otel: { instrumentHooks: true }` – all lifecycle hooks on the route (overrides a global `false`)
* `otel: { instrumentHooks: ['preHandler'] }` – allowlist for the route (overrides global settings)

Precedence: `otel: false`, then route `otel.instrumentHooks` when set, otherwise the global `instrumentHooks` option.

The global option throws a `TypeError` when it is not a boolean or a non-empty array of known hook names. The per-route option never throws: unknown hook names are ignored, and an invalid value is treated as `false`.

```js
const otel = new FastifyOtelInstrumentation({ instrumentHooks: false })
app.get('/debug', { config: { otel: { instrumentHooks: ['onRequest'] } } }, handler)
```

#### `FastifyOtelInstrumentationOptions#instrumentHandler: boolean`

Control whether the Fastify route handler receives a child span. Defaults to `true`.

Set `instrumentHandler: false` globally to keep request spans without route handler child spans. A non-boolean value throws a `TypeError`. A route can override the global setting with `config.otel.instrumentHandler`. Setting `otel: false` still disables all OpenTelemetry spans for the route.

```js
const otel = new FastifyOtelInstrumentation({ instrumentHandler: false })
app.get('/debug', { config: { otel: { instrumentHandler: true } } }, handler)
```

#### `FastifyOtelInstrumentationOptions#lifecycleHook: function`

A **synchronous** callback that runs whenever a span is created for an instrumented Fastify lifecycle hook (route hooks, instance hooks, not-found handlers, and route handlers). It is not invoked when `instrumentHooks` skips a hook or `instrumentHandler` skips a route handler.
* **span** – the hook span that was just created
* **info.hookName** – Fastify lifecycle stage (e.g., `onRequest`, `preHandler`, `handler`)
* **info.handler** – the resolved handler or plugin name when available
* **info.request** – the current `FastifyRequest`

Use it to rename hook spans or annotate them with framework-specific metadata (for example, tRPC procedure names) without registering additional Fastify hooks.

```js
const otel = new FastifyOtelInstrumentation({
  lifecycleHook: (span, info) => {
    if (info.hookName === 'handler' && info.request.headers['x-trpc-op'] != null) {
      span.updateName(`tRPC handler - ${info.request.headers['x-trpc-op']}`)
    }

    span.setAttribute('hook.handler.name', info.handler ?? 'anonymous')
  }
})
```

#### `FastifyOtelInstrumentationOptions#recordExceptions: boolean`

Control whether the instrumentation automatically calls `span.recordException` when a handler or hook throws.
Defaults to `true`, recording every exception. A non-boolean value throws a `TypeError`. Set it to `false` if you prefer to record only the
exceptions that you consider actionable (for example to avoid noisy `4xx` entries in Datadog Error Tracking).

When enabled, an exception thrown by an instrumented handler or hook is recorded once on the span where it
was thrown (for example the handler or hook span). The same propagated exception is not recorded again on
the request span. The completed HTTP server span stays unset for a 4xx response and is set to `ERROR` for a
5xx response, keeping the error message when one was captured. Errors that never pass through a wrapped
handler or hook — such as `reply.send(err)` or `done(err)` — are recorded on the request span when that
response is a 5xx. The duplicate-exception tracking is scoped per request.

## License

Licensed under [MIT](./LICENSE).
