// Tag a send so it can be filtered, exported and dashboarded later.
//
//   npm run build
//   export MAILKUBE_API_KEY=mk_...
//   node examples/send-with-tags.mjs you@example.com
//
// Tags ride along on delivery webhooks too, so the same labels correlate a send with what
// happened to it. Values are NOT encrypted: keep personal data out of them.

import { Mailkube } from "../dist/index.js";

const recipient = process.argv[2];
if (!recipient) {
  console.error("usage: node examples/send-with-tags.mjs <recipient@example.com>");
  process.exit(2);
}

const client = new Mailkube();

const email = await client.emails.send({
  from: "Acme <hello@yourdomain.com>",
  to: recipient,
  subject: "Welcome aboard",
  html: "<p>Glad you are here.</p>",
  // [A-Za-z0-9_-] only; name <= 16 chars, value <= 32, at most 20 tags per send.
  tags: [
    { name: "campaign", value: "onboarding" },
    { name: "variant", value: "b" },
    { name: "no_value_needed", value: "" },
  ],
});

console.log(`accepted ${email.id}, tagged campaign=onboarding variant=b`);
