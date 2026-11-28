'use strict'

const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')
const { setTimeout: sleep } = require('node:timers/promises')

const root = join(__dirname, '..')
const resolver = pathToFileURL(join(root, 'fixtures', 'examples-resolve.mjs')).href

const examples = [
  { name: 'getting-started', args: ['--import', './otel.js', 'app.js'], paths: ['/'] },
  { name: 'manual-registration', args: ['app.js'], paths: ['/', '/healthcheck', '/api', '/health'] }
]

async function freePort () {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  server.close()
  await once(server, 'close')
  return port
}

// Minimal OTLP/HTTP endpoint that collects the exported spans
async function startCollector () {
  const spans = []
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString())
      for (const resource of body.resourceSpans) {
        for (const scope of resource.scopeSpans) {
          for (const span of scope.spans) {
            const attributes = new Map()
            for (const { key, value } of span.attributes) {
              attributes.set(key, value.stringValue ?? value.intValue)
            }
            spans.push({ scope: scope.scope.name, name: span.name, attributes })
          }
        }
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{}')
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { server, spans, endpoint: `http://127.0.0.1:${server.address().port}` }
}

async function waitFor (check, message, timeout = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await check()) return
    await sleep(100)
  }
  assert.fail(message)
}

describe('examples', { concurrency: true }, () => {
  for (const example of examples) {
    test(`examples/${example.name} exports the Fastify spans`, { timeout: 30000 }, async (t) => {
      const collector = await startCollector()
      const port = await freePort()
      let output = ''
      const child = spawn(process.execPath, ['--import', resolver, ...example.args], {
        cwd: join(root, 'examples', example.name),
        env: { ...process.env, PORT: String(port), OTEL_EXPORTER_OTLP_ENDPOINT: collector.endpoint },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      child.stdout.on('data', chunk => { output += chunk })
      child.stderr.on('data', chunk => { output += chunk })
      t.after(async () => {
        if (child.exitCode === null) {
          child.kill()
          await once(child, 'exit')
        }
        collector.server.close()
      })

      const url = `http://127.0.0.1:${port}`
      await waitFor(async () => {
        assert.equal(child.exitCode, null, `the example exited early:\n${output}`)
        return fetch(url).then(response => response.ok, () => false)
      }, `the example did not start:\n${output}`)

      for (const path of example.paths) {
        const response = await fetch(url + path)
        assert.equal(response.status, 200)
        await response.text()
      }

      // The batch span processor exports on a timer
      const requestsFor = path => collector.spans.filter(span => span.name === 'request' && span.attributes.get('url.path') === path)
      await waitFor(() => requestsFor(example.paths.at(-1)).length > 0,
        `no spans received from the example:\n${output}`)

      assert.ok(collector.spans.every(span => span.scope === '@fastify/otel'))
      const names = route => collector.spans.filter(span => span.attributes.get('http.route') === route).map(span => span.name)
      assert.ok(names('/').includes('request'))
      assert.ok(names('/').some(name => name.startsWith('handler - ')))

      if (example.name === 'manual-registration') {
        assert.deepEqual(names('/healthcheck'), [], 'otel: false disables every span of the route')
        assert.ok(names('/api').some(name => name.startsWith('handler - ')))
        assert.deepEqual(names('/health'), ['request'], 'instrumentHandler: false keeps only the request span')
      }
    })
  }
})
