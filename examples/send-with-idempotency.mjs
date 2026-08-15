// Retry a send safely with an idempotency key.
//
//   npm run build
//   export MAILKUBE_API_KEY=mk_...
//   node examples/send-with-idempotency.mjs you@example.com
//
// There are no built-in retries in this SDK, so retrying is your call — and a naive retry after a
// timeout can send the same message twice, because a request that never returned may still have
// succeeded. An idempotency key makes the retry safe: the server remembers the first response for
// that key (24 hours by default) and replays it byte for byte instead of sending again.
//
// The key is fingerprinted against the request body. Reusing a key with a DIFFERENT body is an
// error rather than a silent replay, which is what stops a recycled key from swallowing a real
// second message.

import { Mailkube, MailkubeError } from "../dist/index.js";

const recipient = process.argv[2];
if (!recipient) {
  console.error("usage: node examples/send-with-idempotency.mjs <recipient@example.com>");
  process.exit(2);
}

// The verified sender this account may send from. Override per environment; the
// fallback is a placeholder and will be rejected until you set your own domain.
const sender = process.env.MAILKUBE_FROM ?? "Acme <hello@yourdomain.com>";

const client = new Mailkube();

// In real code this is a stable id for the thing you are sending about — an order id, a job id —
// not a random value, otherwise a retry generates a new key and sends twice.
const idempotencyKey = `order-${Date.now()}`;

const params = {
  from: sender,
  to: recipient,
  subject: "Sent at most once",
  html: "<p>Retrying this send cannot duplicate it.</p>",
  text: "Retrying this send cannot duplicate it.",
  idempotencyKey,
};

const first = await client.emails.send(params);
console.log(`first  call: ${first.id}`);

// Pretend the first response never reached us and we retried.
const replay = await client.emails.send(params);
console.log(`replayed  : ${replay.id}`);

if (first.id !== replay.id) {
  console.error(`expected the same id back, got ${first.id} then ${replay.id} — that is a second send`);
  process.exit(1);
}
console.log("same id returned: the retry was replayed, not resent");

// Same key, different body: refused rather than replayed.
try {
  await client.emails.send({ ...params, subject: "A different message entirely" });
  console.error("expected a reused key with a changed body to be rejected");
  process.exit(1);
} catch (error) {
  if (error instanceof MailkubeError) {
    console.log(`key reuse with a changed body correctly rejected: ${error.errorName ?? error.name}`);
  } else {
    throw error;
  }
}
