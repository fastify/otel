# SDK 3 consumer reproduction

Local contribution notes; no upstream PR has been opened.

## What fails

The unmodified `main` package requires `@opentelemetry/core@^2.0.0`. Core 2.12.0 peers on
API `<1.10.0`, while SDK 3 requires API 1.10. A clean consumer installation with
`--strict-peer-deps` fails with `ERESOLVE`.

**A Fastify-specific native-ESM runtime defect was not reproduced.** A diagnostic non-strict
installation of the original package emitted the expected HTTP/Fastify spans under native ESM,
for automatic and plugin registration. Separate core packages do not necessarily lose RPC
metadata: the context-key API uses `Symbol.for`.

## Red / green with the same command

Run from this checkout using Node >=22.15.0 and npm:

```sh
# Pack and install the modified checkout into a fresh consumer, then run ESM tests.
npm run test:consumer

# Pack the original main into a fresh consumer using the same verifier: expected ERESOLVE.
baseline=$(mktemp -d)
git archive main | tar -x -C "$baseline"
npm run test:consumer -- "$baseline"
```

The verifier uses registry packages plus the packed local Fastify instrumentation. It does not
link the checkout or bypass peer validation. Temporary consumer directories are cleaned up.
Network access is needed for installation; the HTTP test itself uses localhost, no cloud
credentials or telemetry endpoints.

## Runtime regression

```sh
FASTIFY_VERSION=fastify node --test test/sdk-esm.test.js
FASTIFY_VERSION=fastifyv4 node --test test/sdk-esm.test.js
```

The fixture starts a real Fastify HTTP server in a fresh native-ESM Node subprocess via
`--import`. A request carrying known `traceparent` values must produce:

- Exactly one HTTP SERVER span named `GET /users/:id`.
- Fastify request and handler spans, not an empty collection that passes vacuously.
- An INTERNAL Fastify request span parented by the HTTP span, and a handler parented by the request.
- The propagated trace ID and remote parent span ID.

Both automatic initialization and explicit plugin registration are covered. Fastify uses
plugin/diagnostics-channel registration, so no Fastify ESM loader hook is required. Other
application instrumentations may still need the OTel loader.

## Draft fix and verification

- Runtime `index.js` unchanged.
- Dependencies aligned to core/SDK 3, instrumentation 0.300 and API 1.10.
- Old provider/processor/context-manager test APIs migrated; unused contrib and Jaeger
  dependencies removed. Directly used SDK test dependencies are now explicit.
- Node minimum raised to >=22.15; Node 20 removed from CI. This deliberately targets a new
  SDK generation, not transparent SDK 2/3 co-support. Maintainers must approve release policy.
- Added a CI job for strict packed-consumer verification.

Verified locally:

| Check | Result |
| --- | --- |
| Original packed consumer strict install | FAIL: expected core-2 / API-1.10 ERESOLVE |
| Modified packed consumer strict install + both ESM tests | PASS on Node 22.15.0 and 26.7.0 |
| Fastify 4 and 5 test suites | 79 tests pass per version on Node 22.15.0, 24.0.0 and 26.7.0 |
| `npm test` | PASS, including 24 TypeScript assertions and 100% runtime coverage |
| `npm run lint` / `git diff --check` | PASS |
| `npm ls` OTel dependency tree | PASS: API 1.10/core 3 dependencies aligned |

Windows invocation avoids `.cmd` shell execution by using npm's JS CLI entry point. Windows
runtime/CI has not been exercised locally. No SDK-2 support is claimed for this draft.
