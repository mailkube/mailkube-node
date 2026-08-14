// Receive and verify webhooks in Express.
//
//   npm run build
//   npm install express            # not a dependency of this SDK
//   export MAILKUBE_WEBHOOK_SECRET=whsec_...
//   node examples/webhook-receiver-express.mjs
//
// THE ONE THING TO GET RIGHT: verify against the RAW body. `express.json()` parses and discards
// the bytes, and re-serializing them will not reproduce the signature. `express.raw()` hands you a
// Buffer, which `verify` takes directly.

import express from "express";

import { verify, SignatureVerificationError } from "../dist/index.js";

const secret = process.env.MAILKUBE_WEBHOOK_SECRET;
if (!secret) {
  console.error("set MAILKUBE_WEBHOOK_SECRET");
  process.exit(2);
}

const app = express();

app.post(
  "/webhooks/mailkube",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    let event;
    try {
      event = await verify(request.body, request.headers, secret);
    } catch (error) {
      if (error instanceof SignatureVerificationError) {
        console.warn(`rejected: ${error.message}`);
        return response.sendStatus(400);
      }
      throw error;
    }

    // X-Webhook-Id is stable across retries: deduplicate on it before doing any real work.
    console.log(`event ${event.type} (webhook id ${request.headers["x-webhook-id"]})`);

    switch (event.type) {
      case "email.delivered":
        console.log(`  delivered to ${event.data.delivery.recipient}`);
        break;
      case "email.bounced":
        console.log(`  bounced ${event.data.bounce.code}: ${event.data.bounce.reason}`);
        break;
      case "email.clicked":
        console.log(`  clicked ${event.data.click.link}`);
        break;
      case "unknown":
        // A type this SDK version predates. Nothing is lost: the server's own type is on
        // eventType and the whole payload is on raw.
        console.log(`  unrecognized type ${event.eventType}`, event.raw);
        break;
      default:
        break;
    }

    // Acknowledge fast; do the work off the request.
    response.sendStatus(204);
  },
);

app.listen(3000, () => {
  console.log("listening on http://localhost:3000/webhooks/mailkube");
});
