import Fastify from 'fastify'
import { fastifyOtelInstrumentation } from './otel.js'

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

await app.listen({ port: Number(process.env.PORT ?? 3000) })
