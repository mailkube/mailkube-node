// Schedule several sends under one batch, then move or cancel them together.
//
//   npm run build
//   export MAILKUBE_API_KEY=mk_...
//   node examples/schedule-batch.mjs you@example.com
//
// A batch is just a label you choose. It is only valid alongside scheduledAt.

import { Mailkube } from "../dist/index.js";

const recipient = process.argv[2];
if (!recipient) {
  console.error("usage: node examples/schedule-batch.mjs <recipient@example.com>");
  process.exit(2);
}

const client = new Mailkube();
const batchId = `welcome-wave-${Date.now()}`;
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

for (const step of [1, 2, 3]) {
  const email = await client.emails.send({
    from: "Acme <hello@yourdomain.com>",
    to: recipient,
    subject: `Onboarding step ${step}`,
    html: `<p>Step ${step} of 3.</p>`,
    scheduledAt: new Date(tomorrow.getTime() + step * 60_000),
    batchId,
  });
  console.log(`scheduled ${email.id} in batch ${batchId}`);
}

// Move the whole batch. The batch is identified by the path only: passing a batch_id in the body
// as well is a validation error rather than a guess about which one you meant.
const moved = await client.scheduledEmails.batches.update(batchId, {
  scheduledAt: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
});
console.log(`rescheduled ${moved.rescheduledCount} emails to ${moved.scheduledAt}`);

const canceled = await client.scheduledEmails.batches.cancel(batchId);
console.log(`canceled ${canceled.canceledCount} emails`);
