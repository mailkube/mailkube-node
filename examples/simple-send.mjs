// Runnable documentation: the smallest useful program this package supports.
//
//   npm run build
//   export MAILKUBE_API_KEY=mk_...
//   node examples/simple-send.mjs you@example.com
//
// Plain ESM JavaScript against the BUILT output, not TypeScript against `src/`, and both halves
// of that are deliberate: `tsconfig.json` includes only `src`, `test` and the vitest config, so a
// `.ts` file here would be outside the TS program and eslint's type-aware rules would fail on it
// rather than lint it. Importing `../dist/` also means this example exercises exactly what a
// consumer installs. Examples are excluded from coverage and the duplication gate: they exist to
// be read and run, not shipped.

import { Mailkube, RateLimitError, MailkubeError } from "../dist/index.js";

const recipient = process.argv[2];
if (!recipient) {
  console.error("usage: node examples/simple-send.mjs <recipient@example.com>");
  process.exit(2);
}

const client = new Mailkube(); // reads MAILKUBE_API_KEY

try {
  const email = await client.emails.send({
    from: "Acme <hello@yourdomain.com>",
    to: recipient,
    subject: "Hello from mailkube-node",
    html: "<p>It works!</p>",
    text: "It works!",
    // Set an idempotency key on anything you might retry: the API replays the original
    // response instead of sending twice.
    idempotencyKey: `example-${Date.now()}`,
  });
  console.log(`accepted ${email.id} (message-id ${email.messageId ?? "none"})`);
} catch (error) {
  // There are no built-in retries on purpose, so the caller decides. A rate-limit error carries
  // the server's own Retry-After.
  if (error instanceof RateLimitError) {
    console.error(`rate limited; retry after ${error.retryAfter}s`);
    process.exit(1);
  }
  if (error instanceof MailkubeError) {
    console.error(`${error.name}: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
