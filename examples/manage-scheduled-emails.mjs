// List, reschedule and cancel pending sends.
//
//   npm run build
//   export MAILKUBE_API_KEY=mk_...
//   node examples/manage-scheduled-emails.mjs
//
// `iterAll` follows the links the server issues rather than incrementing a page counter, and
// fetches lazily — abandoning the loop early costs nothing.

import { Mailkube, NotFoundError } from "../dist/index.js";

const client = new Mailkube();

// One page, with the metadata.
const page = await client.scheduledEmails.list({ status: "scheduled" });
console.log(`page ${page.pagination.currentPage} of ${page.pagination.totalCount} total`);

// Every page, lazily. Only scheduled/canceled/failed can be listed: a sent email has left the
// collection, so status "sent" is a validation error, not an empty result.
let first;
for await (const item of client.scheduledEmails.iterAll({ status: ["scheduled", "canceled"] })) {
  first ??= item;
  console.log(`${item.id}  ${item.status.padEnd(9)}  ${item.scheduledAt}  ${item.recipients}`);
}

if (!first) {
  console.log("nothing scheduled; run examples/schedule-send.mjs first");
  process.exit(0);
}

try {
  const moved = await client.scheduledEmails.update(first.id, {
    scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  });
  console.log(`moved ${moved.id} to ${moved.scheduledAt}`);

  const canceled = await client.scheduledEmails.cancel(first.id);
  console.log(`${canceled.id} is now ${canceled.status}`);
} catch (error) {
  if (error instanceof NotFoundError) {
    console.error("it was sent or canceled while we were looking at it");
    process.exit(1);
  }
  throw error;
}
