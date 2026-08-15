// List, inspect, reschedule and cancel pending sends.
//
//   npm run build
//   export MAILKUBE_API_KEY=mk_...
//   node examples/manage-scheduled-emails.mjs you@example.com
//
// The example schedules its own email under a unique batch id and then works only inside that
// batch. That is deliberate: an unfiltered `list`/`iterAll` walks every pending send on the
// account, which on a real account means paging through thousands of rows and then mutating
// whichever one happened to come back first. Scoping to a batch you just created keeps the
// example bounded, repeatable, and safe to run against a live key.
//
// `iterAll` follows the links the server issues rather than incrementing a page counter, and
// fetches lazily — abandoning the loop early costs nothing.

import { Mailkube, NotFoundError } from "../dist/index.js";

const recipient = process.argv[2];
if (!recipient) {
  console.error("usage: node examples/manage-scheduled-emails.mjs <recipient@example.com>");
  process.exit(2);
}

// The verified sender this account may send from. Override per environment; the
// fallback is a placeholder and will be rejected until you set your own domain.
const sender = process.env.MAILKUBE_FROM ?? "Acme <hello@yourdomain.com>";

const client = new Mailkube();

// Reads are rate-limited (60/minute by default), so a script that walks pages should pace itself
// rather than rely on catching the 429.
const pace = () => new Promise((resolve) => setTimeout(resolve, 600));

const batchId = `example-manage-${Date.now()}`;

const created = await client.emails.send({
  from: sender,
  to: recipient,
  subject: "Scheduled for management",
  html: "<p>This one exists to be listed, moved and canceled.</p>",
  scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
  batchId,
});
console.log(`scheduled ${created.id} in batch ${batchId}`);
await pace();

// One page, with the metadata.
const page = await client.scheduledEmails.list({ status: "scheduled", batchId });
console.log(`page ${page.pagination.currentPage} of ${page.pagination.totalCount} total`);
await pace();

// Every page, lazily. Only scheduled/canceled/failed can be listed: a sent email has left the
// collection, so status "sent" is a validation error, not an empty result.
let first;
for await (const item of client.scheduledEmails.iterAll({ status: ["scheduled", "canceled"], batchId })) {
  first ??= item;
  console.log(`${item.id}  ${item.status.padEnd(9)}  ${item.scheduledAt}  ${item.recipients}`);
}

if (!first) {
  console.log("nothing scheduled in this batch");
  process.exit(1);
}
await pace();

try {
  const fetched = await client.scheduledEmails.get(first.id);
  console.log(`fetched ${fetched.id}, currently ${fetched.status} for ${fetched.scheduledAt}`);
  await pace();

  const moved = await client.scheduledEmails.update(first.id, {
    scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  });
  console.log(`moved ${moved.id} to ${moved.scheduledAt}`);
  await pace();

  const canceled = await client.scheduledEmails.cancel(first.id);
  console.log(`${canceled.id} is now ${canceled.status}`);
} catch (error) {
  if (error instanceof NotFoundError) {
    console.error("it was sent or canceled while we were looking at it");
    process.exit(1);
  }
  throw error;
}
