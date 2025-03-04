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

Example:

```js
// ... in your OTEL setup
const FastifyOtelInstrumentation = require('@fastify/otel');

// If serverName is not provided, it will fallback to OTEL_SERVICE_NAME
// as per https://opentelemetry.io/docs/languages/sdk-configuration/general/.
const fastifyOtelInstrumentation = new FastifyOtelInstrumentation({ servername: '<yourCustomApplicationName>' }); 
fastifyOtelInstrumentation.setTracerProvider(provider)

module.exports = { fastifyOtelInstrumentation }

// ... in your Fastify definition
const { fastifyOtelInstrumentation } = require('./otel.js');
const Fastify = require('fastify');

const app = fastify();
// It is necessary to await for its register as it requires to be able
// to intercept all route definitions
await app.register(fastifyOtelInstrumentation.plugin());

// automatically all your routes will be instrumented
app.get('/', () => 'hello world')
// as well as your instance level hooks.
app.addHook('onError', () => /* do something */)

// you can also scope your instrumentation to only be enabled on a sub context
// of your application
app.register((instance, opts, done) => {
    instance.register(fastifyOtelInstrumentation.plugin());
    // If only enabled in your encapsulated context
    // the parent context won't be instrumented
    app.get('/', () => 'hello world')

}, { prefix: '/nested' })
```

### Automatic plugin registration

The plugin can be automatically registered with `registerOnInitialization` option set to `true`.
In this case, it is necessary to await fastify instance.
```js
// ... in your OTEL setup
const fastifyOtelInstrumentation = new FastifyOtelInstrumentation({ registerOnInitialization: true });

// ... in your Fastify definition
const Fastify = require('fastify');
const app = await fastify();
```

> **Notes**:
>
> - This instrumentation requires `@opentelemetry/instrumentation-http` to be able to propagate the traces all the way back to upstream
>   - The HTTP instrumentation might cover all your routes although `@fastify/otel` just covers a subset of your application

For more information about OpenTelemetry, please refer to the [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/) documentation.

### Usage with ESM Modules

Currently, this package does not natively support ESM Modules. As a temporary workaround, you can use Node.js's `createRequire` function to import the module. Below is an example of how to achieve this:

```typescript
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const FastifyOtelInstrumentation = require('@fastify/otel');

export const fastifyOtel = new FastifyOtelInstrumentation({
  servername: 'my-app',
  registerOnInitialization: true,
});
```

**Important Notes:**

- The `createRequire` function is only available in **Node.js version 12.2.0 and above**.
- Using this workaround will result in the loss of type annotation information, which could affect development experience.

## License

Licensed under [MIT](./LICENSE).
