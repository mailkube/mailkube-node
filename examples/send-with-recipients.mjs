// Every recipient field and custom headers on one message.
//
//   npm run build
//   export MAILKUBE_API_KEY=mk_...
//   node examples/send-with-recipients.mjs you@example.com
//
// `to`, `cc`, `bcc` and `replyTo` each take a single address or an array. The account limit is 50
// recipients per message, counted across to + cc + bcc.
//
// Custom headers are for your own metadata. The API caps them at 20 per message, header names
// match [A-Za-z0-9-] up to 64 characters, and no value may contain CR or LF — the SDK forwards
// them and the server rejects the message if they break those rules.

import { Mailkube, MailkubeError } from "../dist/index.js";

const recipient = process.argv[2];
if (!recipient) {
  console.error("usage: node examples/send-with-recipients.mjs <recipient@example.com>");
  process.exit(2);
}

// The verified sender this account may send from. Override per environment; the
// fallback is a placeholder and will be rejected until you set your own domain.
const sender = process.env.MAILKUBE_FROM ?? "Acme <hello@yourdomain.com>";

const client = new Mailkube();

try {
  const email = await client.emails.send({
    from: sender,
    to: [recipient],
    cc: recipient,
    bcc: [recipient],
    // Replies go somewhere other than the sending address.
    replyTo: "support@yourdomain.com",
    subject: "Every recipient field at once",
    html: "<p>to, cc, bcc and reply-to on a single message.</p>",
    text: "to, cc, bcc and reply-to on a single message.",
    headers: {
      // Your own correlation id, echoed nowhere but carried on the wire.
      "X-Campaign-Id": "recipients-demo",
      "X-Customer-Tier": "gold",
    },
  });
  console.log(`accepted ${email.id} (message-id ${email.messageId ?? "none"})`);
} catch (error) {
  if (error instanceof MailkubeError) {
    console.error(`${error.errorName ?? error.name}: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
