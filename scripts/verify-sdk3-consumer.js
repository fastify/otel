'use strict'

const { execFileSync } = require('node:child_process')
const { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')

const sourceRoot = resolve(__dirname, '..')
// An optional checkout path allows this same reproduction to test the baseline.
const root = process.argv[2] ? resolve(process.argv[2]) : sourceRoot
// npm run supplies its JS entry point, avoiding npm.cmd/shell handling on Windows.
const npmCli = process.env.npm_execpath
if (!npmCli) {
  throw new Error('Run this verifier with npm run test:consumer')
}
const directory = mkdtempSync(join(tmpdir(), 'fastify-otel-sdk3-consumer-'))

try {
  const packed = JSON.parse(execFileSync(process.execPath, [
    npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', directory
  ], { cwd: root, encoding: 'utf8', timeout: 60000 }))
  writeFileSync(join(directory, 'package.json'), JSON.stringify({
    name: 'fastify-otel-sdk3-consumer',
    private: true,
    type: 'module',
    dependencies: {
      '@fastify/otel': `file:${packed[0].filename}`,
      '@opentelemetry/api': '1.10.0',
      '@opentelemetry/instrumentation-http': '0.300.0',
      '@opentelemetry/sdk-node': '0.300.0',
      '@opentelemetry/sdk-trace': '3.0.0',
      fastify: '^5.1.0'
    }
  }, null, 2))
  // This is the red/green reproduction: the previous package's core 2 peer
  // cannot be satisfied by API 1.10. No overrides or legacy resolution allowed.
  execFileSync(process.execPath, [
    npmCli, 'install', '--strict-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund'
  ], { cwd: directory, stdio: 'inherit', timeout: 120000 })

  for (const name of ['sdk-bootstrap.mjs', 'sdk-request.mjs']) {
    copyFileSync(join(sourceRoot, 'fixtures', name), join(directory, name))
  }
  // The same ESM fixture now exercises the packed package, not the checkout.
  const bootstrap = join(directory, 'sdk-bootstrap.mjs')
  writeFileSync(bootstrap, readFileSync(bootstrap, 'utf8').replace("'../index.js'", "'@fastify/otel'"))
  copyFileSync(join(sourceRoot, 'test', 'sdk-esm.test.js'), join(directory, 'sdk-esm.test.cjs'))
  const testFile = join(directory, 'sdk-esm.test.cjs')

  execFileSync(process.execPath, ['--test', testFile], {
    cwd: directory,
    env: { ...process.env, FASTIFY_VERSION: 'fastify', FASTIFY_OTEL_FIXTURES: directory },
    stdio: 'inherit',
    timeout: 30000
  })
} finally {
  rmSync(directory, { recursive: true, force: true })
}
