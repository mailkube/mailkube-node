// Receive and verify webhooks on Cloudflare Workers.
//
//   npx wrangler dev examples/webhook-receiver-worker.mjs
//
// No `nodejs_compat` flag: verification runs on WebCrypto, which workerd provides natively. That
// is also why it is async — there is no synchronous digest API that every runtime shares.
//
// Note the two Worker-shaped differences from the Express example: the secret arrives per request
// through `env` rather than from an ambient environment, and the raw bytes come from
// `request.arrayBuffer()`.

import { verify, SignatureVerificationError } from "@mailkube/mailkube-node";

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }

    // Raw bytes, never request.json(): parsing and re-serializing changes what gets verified.
    const body = new Uint8Array(await request.arrayBuffer());

    let event;
    try {
      event = await verify(body, request.headers, env.MAILKUBE_WEBHOOK_SECRET);
    } catch (error) {
      if (error instanceof SignatureVerificationError) {
        return new Response("bad signature", { status: 400 });
      }
      throw error;
    }

    if (event.type === "email.bounced") {
      // Acknowledge immediately and do the work after the response, so a slow downstream never
      // turns into a webhook retry.
      const emailId = event.data.emailId;
      const reason = event.data.bounce.reason;
      // Requires a queue binding in wrangler.jsonc; shown here as the shape to aim for.
      await env.BOUNCES?.send({ emailId, reason });
    }

    return new Response(null, { status: 204 });
  },
};
