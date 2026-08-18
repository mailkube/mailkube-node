// The errors you will actually hit, and how to tell them apart.
//
//   npm run build
//   export MAILKUBE_API_KEY=mk_...
//   node examples/error-handling.mjs you@example.com
//
// Every failure arrives as a MailkubeError subclass carrying `errorName` — the server's stable
// machine-readable name — alongside `statusCode` and `requestId`. Branch on `errorName`, not on
// the human-readable message, which is free to change.
//
// Nothing here sends a message: each call is designed to be refused.

import { Mailkube, MailkubeError, AuthenticationError } from "../dist/index.js";

const recipient = process.argv[2];
if (!recipient) {
  console.error("usage: node examples/error-handling.mjs <recipient@example.com>");
  process.exit(2);
}

// The verified sender this account may send from. Override per environment; the
// fallback is a placeholder and will be rejected until you set your own domain.
const sender = process.env.MAILKUBE_FROM ?? "Acme <hello@yourdomain.com>";

const client = new Mailkube();
let failures = 0;

async function expect(label, expectedName, run) {
  try {
    await run();
    console.error(`${label}: expected ${expectedName}, but the call succeeded`);
    failures += 1;
  } catch (error) {
    if (error instanceof MailkubeError) {
      const actual = error.errorName ?? error.name;
      const ok = actual === expectedName;
      console.log(`${ok ? "ok  " : "BAD "} ${label}: ${actual} (${error.statusCode})`);
      if (!ok) failures += 1;
      return;
    }
    throw error;
  }
}

// A message with no body at all: html, text and templateId are mutually required-one-of.
await expect("missing body", "validation_error", () =>
  client.emails.send({ from: sender, to: recipient, subject: "No body" }),
);

// A scheduled_at in the past. It must carry an offset and be strictly in the future.
await expect("past scheduledAt", "validation_error", () =>
  client.emails.send({
    from: sender,
    to: recipient,
    subject: "Yesterday",
    text: "...",
    scheduledAt: new Date(Date.now() - 60_000),
  }),
);

// batchId is a grouping label for scheduled sends and means nothing without scheduledAt.
await expect("batchId without scheduledAt", "validation_error", () =>
  client.emails.send({
    from: sender,
    to: recipient,
    subject: "Ungrouped",
    text: "...",
    batchId: "b1",
  }),
);

// A sent email has left the scheduled collection, so filtering for it is a contract error rather
// than an empty page — the distinction tells you your assumption was wrong.
await expect('list status "sent"', "validation_error", () =>
  client.scheduledEmails.list({ status: "sent" }),
);

// A bad key is refused identically whether it is malformed, unknown or absent, so nothing about
// the key space leaks.
await expect("bad api key", "invalid_api_key", () => {
  const anonymous = new Mailkube({
    apiKey: "mk_notarealkey_0000000000000000000000000000000000000000000000000000000000",
  });
  return anonymous.emails.send({ from: sender, to: recipient, subject: "Nope", text: "..." });
});

// Worth knowing these exist even when they do not fire here: a 429 carries the server's own
// Retry-After, and authentication failures are their own class.
console.log(
  `(RateLimitError carries .retryAfter; AuthenticationError is ${AuthenticationError.name})`,
);

if (failures > 0) {
  console.error(`${failures} case(s) did not behave as documented`);
  process.exit(1);
}
console.log("all error cases behaved as documented");
