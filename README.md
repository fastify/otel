# @fastify/otel

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

Example:

```js
// ... in your OTEL setup
const FastifyInstrumentation = require('@fastify/otel');

const fastifyInstrumentation = new FastifyInstrumentation();
fastifyInstrumentation.setTraceProvider(provider)

module.exports = { fastifyInstrumentation }

// ... in your Fastify definition
const { fastifyInstrumentation } = require('./otel.js');
const Fastify = require('fastify');

const app = fastify();
// It is necessary to await for its register as it requires to be able
// to intercept all route definitions
await app.register(fastifyInstrumentation.plugin());

// automatically all your routes will be instrumented
app.get('/', () => 'hello world')
// as well as your instance level hooks.
app.addHook('onError', () => /* do something */)

// you can also scope your instrumentation to only be enabled on a sub context
// of your application
app.register((instance, opts, done) => {
    instance.register(fastifyInstrumentation.plugin());
    // If only enabled in your encapsulated context
    // the parent context won't be instrumented
    app.get('/', () => 'hello world')

}, { prefix: '/nested' })
```

> **Notes**:
>
> - This instrumentation requires `@opentelemetry/http-instrumentation` to be able to propagate the traces all the way back to upstream
>   - The HTTP instrumentation might cover all your routes although `@fastify/otel` just covers a subset of your application

For more information about OpenTelemetry, please refer to the [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/) documentation.

## License

Licensed under [MIT](./LICENSE).
