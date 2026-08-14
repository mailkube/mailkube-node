# mailkube-node

[![CI](https://github.com/mailkube/mailkube-node/actions/workflows/ci.yml/badge.svg)](https://github.com/mailkube/mailkube-node/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40mailkube%2Fmailkube-node)](https://www.npmjs.com/package/@mailkube/mailkube-node)
[![Node](https://img.shields.io/node/v/%40mailkube%2Fmailkube-node)](package.json)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Code of Conduct](https://img.shields.io/badge/Contributor%20Covenant-2.1-purple.svg)](CODE_OF_CONDUCT.md)

Mailkube Node.js SDK

## Install

```bash
npm install @mailkube/mailkube-node
```

## Usage

```ts
import { Mailkube } from "@mailkube/mailkube-node";

const client = new Mailkube(); // reads MAILKUBE_API_KEY

const email = await client.emails.send({
  from: "Acme <hello@yourdomain.com>",
  to: "customer@example.com",
  subject: "Hello world",
  html: "<p>It works!</p>",
});

console.log(email.id, email.messageId);
```

**Zero runtime dependencies, and no Node built-ins.** The package uses web standards only: global
`fetch`, `AbortSignal`, `crypto.subtle`, `btoa` and `TextEncoder`. That is what lets one build run
on servers, workers and edge runtimes alike — see [Runtimes](#runtimes).

### Configuration

| Option | Constructor | Environment | Default |
|---|---|---|---|
| API key | `apiKey` | `MAILKUBE_API_KEY` | required |
| Base URL | `baseUrl` | `MAILKUBE_BASE_URL` | `https://api.mailkube.com/mta/v1/` |
| Timeout | `timeoutMs` | | 30000 |
| `fetch` | `fetch` | | the global one |
| Logger | `logger` | `MAILKUBE_LOG` | silent |

Pass your own `fetch` to add instrumentation, a proxy agent, or a stub in tests:

```ts
const client = new Mailkube({ fetch: myInstrumentedFetch });
```

There are deliberately **no built-in retries**. A `RateLimitError` carries `retryAfter` and a
`ServerError` is safe to retry with backoff, so the calling application decides. Pass
`idempotencyKey` to make a retry safe.

### Idempotency

```ts
await client.emails.send({ ...params, idempotencyKey: "order-1234-receipt" });
```

The key travels as the `Idempotency-Key` header. Replaying it returns the original response instead
of sending twice, and `email.idempotentReplayed` tells you which happened.

### Cancellation

Every call accepts an `AbortSignal`, merged with the client timeout so whichever fires first wins.
On `send` it sits alongside the other parameters; on the scheduled-email verbs it is a second
argument, so it can never be mistaken for a filter:

```ts
const controller = new AbortController();

await client.emails.send({ ...params, signal: controller.signal });
await client.scheduledEmails.list({ status: "scheduled" }, { signal: controller.signal });
```

### Errors

Every error extends `MailkubeError`. Transport failures throw `ConnectionError`; server errors
throw an `ApiError` subclass chosen by status (`BadRequestError`, `AuthenticationError`,
`NotFoundError`, `ConflictError`, `InvalidRequestError`, `RateLimitError`, `ServerError`), each
carrying `errorName`, `message`, `statusCode`, `retryAfter` and `requestId`.

```ts
import { ErrorName, RateLimitError } from "@mailkube/mailkube-node";

try {
  await client.emails.send({ ... });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(error.errorName === ErrorName.RateLimitExceeded, error.retryAfter);
  }
}
```

`requestId` is the server's own identifier for the failed call, read from the `X-Request-Id`
response header. Log it, and quote it when you report a failure to support: it is what lets the
request be found on our side.

### Threading

Echo the `messageId` of an earlier send in `In-Reply-To` and `References` to thread replies:

```ts
await client.emails.send({
  ...params,
  headers: { "In-Reply-To": previous.messageId, References: previous.messageId },
});
```

### Tags

```ts
await client.emails.send({
  ...params,
  tags: [{ name: "campaign", value: "launch" }],
});
```

Tags are denormalized onto the sending log, so you can filter, export and dashboard by them, and
they ride along on delivery webhooks. Names and values are limited to `[A-Za-z0-9_-]`, a name to 16
characters and a value to 32, at most 20 per send. **Tag values are not encrypted: keep personal
data out of them.**

## Schedule an email

```ts
const email = await client.emails.send({
  ...params,
  scheduledAt: "2026-08-20T07:00:00Z", // ISO-8601 with an offset, or a Date
  batchId: "welcome-wave-3", // optional: manage several sends together
});

email.isScheduled; // true
email.status; // "scheduled"
```

A scheduled send is acknowledged but not delivered yet, and lives in `client.scheduledEmails` until
it is due.

## Manage scheduled emails

```ts
const pending = await client.scheduledEmails.get(email.id);

await client.scheduledEmails.update(email.id, { scheduledAt: "2026-08-21T07:00:00Z" });
await client.scheduledEmails.cancel(email.id);
```

### Listing

```ts
const page = await client.scheduledEmails.list({ status: ["scheduled", "canceled"] });
page.data; // the rows
page.pagination.totalCount;
page.hasMore;
```

Or walk every page lazily, following the links the server issues:

```ts
for await (const item of client.scheduledEmails.iterAll({ batchId: "welcome-wave-3" })) {
  console.log(item.id, item.scheduledAt, item.recipients);
}
```

Only `scheduled`, `canceled` and `failed` can be listed: a sent email has left the collection, so
`status: "sent"` is a validation error rather than an empty result.

### Batches

```ts
await client.scheduledEmails.batches.update("welcome-wave-3", {
  scheduledAt: "2026-08-22T07:00:00Z",
});
const { canceledCount } = await client.scheduledEmails.batches.cancel("welcome-wave-3");
```

An unknown batch is a no-op reporting `0`, not an error.

## Verify webhooks

`verify` is an HMAC check over the **raw** request body, followed by a typed parse. Never parse then
re-serialize, or the signature will not match. It accepts bytes as well as text, because that is
what a real handler holds.

```ts
import { verify } from "@mailkube/mailkube-node";

app.post("/webhooks/mailkube", express.raw({ type: "application/json" }), async (req, res) => {
  const event = await verify(req.body, req.headers, process.env.MAILKUBE_WEBHOOK_SECRET);

  switch (event.type) {
    case "email.bounced":
      console.log(event.data.bounce.reason, event.data.bounce.code);
      break;
    case "email.clicked":
      console.log(event.data.click.link);
      break;
    default:
      break;
  }

  res.sendStatus(204);
});
```

Verification is **async** everywhere: `crypto.subtle` is the only digest API all target runtimes
share, and it is promise-based. Use `verifySignature` if you want verification without parsing, and
`parseEvent` for the reverse.

`X-Webhook-Id` is stable across retries, so use it to deduplicate. Timestamps outside a 300 second
window are rejected; pass a fourth argument to widen it.

### Event types

| Type | `data` carries | Meaning |
|---|---|---|
| `email.sent` | `sent` | Accepted and spooled by the sending infrastructure |
| `email.delivered` | `delivery` | Accepted by the receiving mail server |
| `email.bounced` | `bounce` | Permanently failed, with code and reason |
| `email.delivery_delayed` | `delay` | Temporarily deferred |
| `email.suppressed` | `suppression` | Suppressed (prior hard bounce or topic opt-out) |
| `email.scheduled` | `scheduled` | Accepted for later transmission |
| `email.failed` | `failed` | Dropped at dispatch time; never transmitted |
| `email.opened` | `open` | Opened by a recipient |
| `email.clicked` | `click` | A tracked link was clicked |
| `domain.status` | `previous` | A sending domain's status or onboarding state changed |
| `webhook.status` | `previous` | An endpoint was disabled, re-enabled or deleted |

Two guarantees for receivers, both so an older SDK never breaks on a newer platform:

- **An unrecognized type is not an error.** It arrives with `type: "unknown"`, the server's own
  type on `eventType`, and its payload untouched on `data`. (`type` is a fixed literal so that
  `switch` narrowing keeps working on every other arm.)
- **Nothing is dropped.** `event.raw` is the verbatim payload, including fields this version has
  never heard of. Log and forward `raw`; read the typed model.

## Logging

Silent by default. Pass a logger, or turn it on process-wide:

```ts
import { enableLogging } from "@mailkube/mailkube-node";

const client = new Mailkube({ logger: { debug: (message, fields) => pino.debug(fields, message) } });

enableLogging(); // or: everything to the console
```

`MAILKUBE_LOG` holds a level, not a flag, so `MAILKUBE_LOG=debug` enables console logging and
`MAILKUBE_LOG=warning` silences the SDK (it only emits debug records). The SDK logs method, URL,
status and request id. It never logs the request body (recipients, subjects), and `Authorization`
and `Idempotency-Key` are masked wherever headers are logged.

## Runtimes

One build, no polyfills, no `nodejs_compat`. CI installs the packed tarball and runs a smoke script
on every runtime below before anything is published.

| Runtime | Notes |
|---|---|
| **Node 20.3+** | ESM and CommonJS both resolve. `require("@mailkube/mailkube-node")` works. |
| **Cloudflare Workers** | No `nodejs_compat` needed. Build the client per request from the `env` binding. |
| **AWS Lambda / GCP Cloud Functions** | Plain Node. Hoist the client to module scope so it is reused across invocations. |
| **Deno** | `import { Mailkube } from "npm:@mailkube/mailkube-node"`. |
| **Bun** | `bun add @mailkube/mailkube-node`. |
| **n8n / Node-RED** | CommonJS: `const { Mailkube } = require("@mailkube/mailkube-node");` |

Cloudflare Workers, where the key arrives per request rather than from an ambient environment:

```ts
export default {
  async fetch(request: Request, env: { MAILKUBE_API_KEY: string }) {
    const client = new Mailkube({ apiKey: env.MAILKUBE_API_KEY });
    await client.emails.send({ ... });
    return new Response("ok");
  },
};
```

AWS Lambda or Cloud Functions, where the environment is ordinary and the container is reused:

```ts
const client = new Mailkube(); // module scope: built once, reused across invocations

export const handler = async (event) => {
  await client.emails.send({ ... });
};
```

## Examples

Runnable scripts live in [`examples/`](examples/). They import the built output, so
`npm run build` first.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and the quality gates every change
must pass. Before adding a resource, verb, paginated listing or webhook event, read
[`.rules/SDK_CONTRACT.md`](.rules/SDK_CONTRACT.md) (the decisions every mailkube SDK shares) and
[`.rules/SDK_DESIGN.md`](.rules/SDK_DESIGN.md) (how they are realized in TypeScript). Security
issues: see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE) © 2026 Mailtactic, Corp.
