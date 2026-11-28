import { registerHooks } from 'node:module'

// The examples import the published package name. When they run from this
// repository, resolve it to the checkout and honor the Fastify version under test.
const self = new URL('../index.js', import.meta.url).href

registerHooks({
  resolve (specifier, context, nextResolve) {
    if (specifier === '@fastify/otel') {
      return { url: self, format: 'commonjs', shortCircuit: true }
    }
    if (specifier === 'fastify' && process.env.FASTIFY_VERSION) {
      return nextResolve(process.env.FASTIFY_VERSION, context)
    }
    return nextResolve(specifier, context)
  }
})
