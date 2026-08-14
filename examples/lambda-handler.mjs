// Send from AWS Lambda (or GCP Cloud Functions: same shape, different handler signature).
//
// Deploy with MAILKUBE_API_KEY set in the function's environment. These runtimes are plain Node,
// so no bundler configuration, polyfill or compatibility flag is needed.
//
// The client is built at MODULE SCOPE on purpose: the execution environment is reused between
// invocations, so this happens once per cold start rather than once per request.

import { Mailkube, RateLimitError } from "../dist/index.js";

const client = new Mailkube();

/**
 * @param {{ to: string, subject: string, html: string, requestId?: string }} event
 */
export const handler = async (event) => {
  try {
    const email = await client.emails.send({
      from: "Acme <hello@yourdomain.com>",
      to: event.to,
      subject: event.subject,
      html: event.html,
      // Lambda retries on failure, so make the retry safe rather than duplicating the message.
      idempotencyKey: event.requestId,
    });

    return { statusCode: 202, body: JSON.stringify({ id: email.id }) };
  } catch (error) {
    if (error instanceof RateLimitError) {
      // Surface the server's own backoff instead of retrying inside the function, where you would
      // be paying for the wait.
      return {
        statusCode: 429,
        headers: { "retry-after": String(error.retryAfter ?? 60) },
        body: JSON.stringify({ error: error.errorName }),
      };
    }
    throw error;
  }
};
