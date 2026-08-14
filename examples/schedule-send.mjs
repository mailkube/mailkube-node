// Schedule a send for later, then inspect it.
//
//   npm run build
//   export MAILKUBE_API_KEY=mk_...
//   node examples/schedule-send.mjs you@example.com
//
// A scheduled send is acknowledged but not delivered yet. The same Email model comes back either
// way — `isScheduled` discriminates — which is the contract's "widen, never union" rule at work.

import { Mailkube } from "../dist/index.js";

const recipient = process.argv[2];
if (!recipient) {
  console.error("usage: node examples/schedule-send.mjs <recipient@example.com>");
  process.exit(2);
}

const client = new Mailkube();

const inAnHour = new Date(Date.now() + 60 * 60 * 1000);

const email = await client.emails.send({
  from: "Acme <hello@yourdomain.com>",
  to: recipient,
  subject: "Scheduled hello",
  html: "<p>Sent later, on purpose.</p>",
  // A Date or an ISO-8601 string WITH an offset. Must be in the future and within your plan's
  // scheduling horizon; the server enforces both.
  scheduledAt: inAnHour,
});

console.log(`scheduled ${email.id} for ${email.scheduledAt} (isScheduled=${email.isScheduled})`);

const pending = await client.scheduledEmails.get(email.id);
console.log(`status ${pending.status}, recipients ${pending.recipients}`);
