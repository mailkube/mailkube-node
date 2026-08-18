// Send against a mailing-list topic.
//
//   npm run build
//   export MAILKUBE_API_KEY=mk_...
//   node examples/send-with-topic.mjs you@example.com newsletter
//
// A topic is a subscription group your recipients can opt out of individually, and `topic` is the
// slug you configured for it (16 characters max). Sending under one means the unsubscribe link
// removes the recipient from that topic rather than from everything you send.
//
// The slug must already exist and be enabled on the sending domain's apex. An unknown or disabled
// slug is rejected outright, BEFORE the message is charged or queued — so a typo costs you
// nothing but it does not silently fall back to sending untopiced either. The second half of this
// example shows that rejection on purpose.

import { Mailkube, MailkubeError } from "../dist/index.js";

const [recipient, topic = "newsletter"] = process.argv.slice(2);
if (!recipient) {
  console.error("usage: node examples/send-with-topic.mjs <recipient@example.com> [topic-slug]");
  process.exit(2);
}

// The verified sender this account may send from. Override per environment; the
// fallback is a placeholder and will be rejected until you set your own domain.
const sender = process.env.MAILKUBE_FROM ?? "Acme <hello@yourdomain.com>";

const client = new Mailkube();

try {
  const email = await client.emails.send({
    from: sender,
    to: recipient,
    subject: `Sent under the "${topic}" topic`,
    html: "<p>Unsubscribing from this removes you from this topic only.</p>",
    text: "Unsubscribing from this removes you from this topic only.",
    topic,
  });
  console.log(`accepted ${email.id} under topic ${topic}`);
} catch (error) {
  if (error instanceof MailkubeError) {
    console.error(`${error.errorName ?? error.name}: ${error.message}`);
    process.exit(1);
  }
  throw error;
}

// The negative case: a slug that was never configured.
try {
  await client.emails.send({
    from: sender,
    to: recipient,
    subject: "This one never leaves the building",
    text: "You should not be reading this.",
    topic: "no-such-topic",
  });
  console.error("expected an unknown topic to be rejected, but it was accepted");
  process.exit(1);
} catch (error) {
  if (error instanceof MailkubeError && error.errorName === "topic_not_found") {
    console.log(`unknown topic correctly rejected: ${error.errorName}`);
  } else {
    throw error;
  }
}
