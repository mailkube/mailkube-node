# SDK Design: the TypeScript realization of the cross-SDK contract

Load this alongside [`SDK_CONTRACT.md`](SDK_CONTRACT.md) when adding a **resource, verb,
response model, paginated listing, or webhook event**.

`SDK_CONTRACT.md` is the language-neutral constitution: configuration, layering, naming,
response-model rules, pagination, the error model, and the webhook contract, all of which every
mailkube SDK implements identically. Every mailkube SDK carries an identical copy of it, maintained
centrally so that changes land in all of them together.

**This file covers only what is specific to TypeScript.** A deliberate deviation from the
contract belongs here rather than in the contract, so the contract keeps describing the API
rather than this SDK.

## The layers, in files

| Layer | Files | May know about |
|---|---|---|
| **Runtime** | `src/runtime/*.ts` | host globals, and nothing else |
| **Client / IO** | `src/transport.ts` | `fetch` |
| **Core** | `src/config.ts`, `src/errors.ts`, `src/logging.ts`, `src/serialization.ts`, `src/version.ts` | nothing I/O-specific |
| **Resources** | `src/resources/*.ts` | a transport interface plus its own request shaping |
| **Types** | `src/types/*.ts` | nothing |

`src/client.ts` is the composition root: it resolves config, wires the transport and exposes
the resources. `src/index.ts` is the public surface and contains no logic.

Only `transport.ts` touches `fetch`. A resource that imports it is a bug.

**`src/runtime/` is the platform-adapter layer, and the rule about it is absolute:** no file
outside it may name a Node built-in, a Node global, or any host API that is not universal. It
holds three modules — `env.ts` (environment reads), `encoding.ts` (base64, hex, UTF-8, byte
joining) and `hmac.ts` (HMAC-SHA256 verification). The `smoke` CI matrix enforces the rule against
the packed tarball on Node (ESM and CJS), Cloudflare Workers without `nodejs_compat`, Deno and Bun.

`src/types/` is split the way `mailkube-python`'s package is, so the two read side by side:
`params.ts` (what callers send), `responses.ts` (what the server returns, each with its decoder),
`events.ts` (webhook payloads and the catalogue) and `decode.ts` (the primitives decoders share).

## Zero runtime dependencies

The package has **no `dependencies`**, only `devDependencies`. It uses the platform: global `fetch`,
`AbortSignal.timeout`, `AbortSignal.any`, `crypto.subtle`, `btoa` and `TextEncoder`. Node 20.3+,
workerd, Deno and Bun all provide them. Adding a runtime dependency to this package needs a real
justification, because every consumer inherits it.

**Web standards, not Node built-ins.** `node:crypto` and `Buffer` are deliberately absent: a static
`node:` import makes the package unbundleable for Workers and Deno, and `Buffer` is simply not
defined there. Every host global the SDK touches is reached through `src/runtime/`, which is the only
directory allowed to name one.

## One client, and it is async

This is the contract's async-only case, and it is forced rather than chosen: there is no
synchronous HTTP in Node. Every verb returns a `Promise`, and there is no sync twin to keep in
step, so the "divergence lives in one method" rule has nothing to constrain here.

The consequence worth stating: **a verb never accepts a callback and never returns anything but a
promise.** Cancellation and timeouts travel as an `AbortSignal`, which is also how the 30 second
default is applied.

## Deviations from the contract, and why each one is forced

Four, all recorded here as the contract requires. None is a preference.

1. **Webhook verification is async.** The contract says verification "uses only the language's
   standard library and needs no client instance". It does, but the only digest API present on Node,
   workerd, Deno and Bun alike is `crypto.subtle`, which is promise-based. A synchronous twin would
   have to be `node:crypto`, i.e. Node-only, which is the portability problem this package exists to
   solve. `verifySignature`, `parseEvent`'s companion `verify`, and everything downstream are async.

2. **The constant-time comparison is written here rather than delegated.** The contract says
   "compare in constant time", and `crypto.subtle.verify` is the obvious way to get it. It is not:
   the W3C specification places no timing requirement on `verify`, and Node compared with plain
   `memcmp` in `crypto_hmac.cc` until CVE-2026-21713 was fixed in 20.20.2 / 22.22.2 / 24.14.1 —
   versions inside this package's supported range. `runtime/hmac.ts` therefore signs and compares
   with a branchless accumulator of its own. Do not "simplify" it back to `subtle.verify`.

3. **Unknown webhook fields survive on `raw`, not on the model.** The contract requires that
   unknown fields be preserved rather than dropped. A decoder that merged unrecognized keys into a
   typed model would produce values the types say are impossible, so the verbatim payload is kept
   whole on `event.raw` instead, and the typed fields are a curated view over it. Log or forward
   `raw`; read the model.

4. **`UnknownEvent.type` is the literal `"unknown"`, not the server's value**, which the sibling
   Python SDK keeps verbatim. TypeScript forces it: an arm typed `type: string` is assignable from
   every literal, so `switch (event.type)` would narrow to `TheKnownEvent | UnknownEvent` in *every*
   branch and `event.data` would collapse to `unknown` — silently making the typed catalogue useless
   at the call site. The server's own type is preserved on `eventType` (and in `raw`).

One more difference is a realization rather than a deviation: **the registry is the catalogue.** The
contract says the event union is, and derives the known-type set from it. Types are erased at
runtime here, so `EVENT_DECODERS` is the source of truth and the `WebhookEvent` union is derived
from *it*. The invariant the contract is protecting — that an event cannot be half-registered —
holds in both directions, and `test/events.test.ts` asserts fixtures and registry keys match.

## TypeScript idioms that realize the contract

- **Named exports only.** No default export, so the public surface is explicit and
  tree-shakeable. `index.ts` re-exports; it never defines.
- **`fetch` is the injection seam.** `new Mailkube({ fetch })` takes any compatible
  implementation, which is how the suite runs without network access.
- **Private fields use `#`**, not `private`, so they are genuinely inaccessible at runtime.
- **Errors extend a single `MailkubeError` base** and set `this.name = new.target.name`, so
  stack traces read correctly through the subclass chain.
- **`ErrorName` is a `const` object plus a derived union type**, not a TS `enum`. Enums emit
  runtime code and behave badly across module boundaries; the envelope's name stays a plain
  `string` on `ApiError.errorName` so an unrecognized value is reported verbatim.
- **The request body is assembled as an object literal, then undefined keys are deleted.**
  That keeps `sendSpec` well under the eslint complexity limit of 10 as fields are added, and
  is why an unset field is absent from the wire rather than sent as null.
- **`verbatimModuleSyntax` is on**, so type-only imports must use `import type`, and relative
  imports carry the `.js` extension that Node ESM requires at runtime.
- **Response decoding is explicit, one small `Decoder` per model.** Models are camelCase and the
  wire is snake_case, so a mapping is unavoidable; a generic snake-to-camel converter is rejected
  because it invents fields no model declares and mangles keys like `from` and `object`. Build
  decoders from the readers in `types/decode.ts`, and **use the defaulting readers**: the API omits
  fields rather than sending null, so a required reader throws on a legitimate last page.
- **`EVENT_DECODERS` is `satisfies`-checked, never annotated.** An explicit
  `Record<string, Decoder<...>>` widens every value and collapses the derived union, which silently
  breaks `switch (event.type)` narrowing for every caller.
- **Per-call cancellation is a second argument, not a parameter field.** List filters are looped
  over to build the query string, so a signal living among them would be serialized as
  `?signal=[object AbortSignal]`. `send` is the exception: its params are a body-shaped bag and
  `signal` is named out of it explicitly, exactly like `idempotencyKey`.

## Where the shared rules are enforced

| Contract rule | Enforced in |
|---|---|
| Key/base-URL resolution, default headers | `Config` constructor, `Config.defaultHeaders()` |
| Origin guard and URL joining | `Config.buildUrl()` |
| One place maps non-2xx to an error | `HttpTransport.#request()` calling `errorFor()` |
| Status-to-class table | `STATUS_ERRORS` in `errors.ts` |
| Idempotency key lifted to a header | `sendSpec()` in `resources/emails.ts` |
| Timeout, merged with a caller's signal | `AbortSignal.timeout` + `AbortSignal.any` in `HttpTransport.#roundTrip()` |
| Version from package metadata | `version.ts` + `scripts/generate-version.mjs`, asserted by the `version-bake` CI job |
| `fetch` injection | `ClientOptions.fetch` |
| Webhook signature verification | `webhooks.ts` (no client instance needed) |
| Escaped path segments | `itemPath()` in `resources/scheduled-emails.ts` |
| Follow the server's `next` link, never a page counter | `nextPageSpec()`, walked by `iterAll()` |
| Off-origin links refused | `Config.buildUrl()`, reached by every request including page links |
| Logging silent by default, secrets redacted | `logging.ts`, applied in `HttpTransport.#roundTrip()` |
| Concurrency safety, proven not asserted | `test/concurrency.test.ts` |

## Tests

The DI seam is the test seam: `test/helpers.ts` builds a client over a stub `fetch` that
records requests and returns canned responses, so the suite makes zero network calls and
still exercises the real request building, error mapping and parsing.

Coverage gates **lines, branches, functions and statements at 90%**, configured natively in
`vitest.config.ts` rather than in CI, so `npm test` alone enforces it.

**`test/concurrency.test.ts` is the contract's concurrency proof, and it brings its own stub on
purpose.** `helpers.ts`'s `stubFetch` answers every request with the same canned body, so it could
not tell one call's response from another's. The local stub holds all thirty-two requests until
every one has arrived, then settles them newest-first in a single synchronous pass. Both halves
matter: filling the barrier proves the calls really overlap, and settling them in one turn queues
every continuation in the same microtask drain so they contend. Do not replace it with
`setTimeout` delays. That was the first draft, and it passed against a deliberately broken client:
Node drains microtasks between timer callbacks, so each call ran to completion before the next was
answered.

## The runtime smoke matrix

`test/` proves the SDK is correct. `smoke/` proves it *runs*, and they catch different things: a
`Buffer` call or an unguarded `process.env` read passes the whole vitest suite and fails on the
first Worker or Deno consumer to install the package.

So the smoke scripts run against the **packed tarball** installed into a scratch project, importing
the bare specifier `"@mailkube/mailkube-node"`, on Node 20/22/24 (ESM *and* CommonJS), Cloudflare Workers without
`nodejs_compat`, Deno under `--deny-env`, and Bun. Rules worth keeping:

- **Never `npm:@mailkube/mailkube-node`.** In Deno that is a registry fetch: the job would 404 before the first
  publish and then test the *published* package rather than the build in hand. Bun has no such
  specifier at all.
- **`--deny-env` on Deno is load-bearing.** Deno defines `globalThis.process`, so an unguarded read
  does not fall through to undefined, it throws `NotCapable`. Without the flag the gate false-greens.
- **Construct the client with no `baseUrl`** in the checks. A stub base URL short-circuits both `??`
  operands and never reaches the environment read at all.
- **Do not add `nodejs_compat`** to `smoke/worker/wrangler.jsonc` to make a failure go away. Its
  absence is the entire value of that job.

Both gates have been shown to fail on purpose: reintroducing `Buffer` in `encodeBase64` fails the
Workers job with `ReferenceError: Buffer is not defined` while Node stays green, and dropping the
try/catch in `readEnv` fails the Deno job while Node stays green.

## What this SDK still leaves for you

Every resource the public API exposes (`emails`, `scheduled-emails` and its batches) is wrapped, and
the webhook catalogue covers all eleven event types. When the API grows, follow the checklists in
`SDK_CONTRACT.md` — and note that adding a webhook event here is one entry in `EVENT_DECODERS` plus
one fixture in `test/events.test.ts`, which the catalogue guard requires.
