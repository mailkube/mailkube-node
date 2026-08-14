/**
 * The API client, and this package's composition root.
 */
import { Config, type ClientOptions } from "./config.js";
import { MailkubeError } from "./errors.js";
import { resolveLogger } from "./logging.js";
import { EmailsResource } from "./resources/emails.js";
import { ScheduledEmailsResource } from "./resources/scheduled-emails.js";
import { HttpTransport } from "./transport.js";

/**
 * The API client.
 *
 * Create one and reuse it:
 *
 * ```ts
 * const client = new Mailkube(); // reads MAILKUBE_API_KEY
 * const email = await client.emails.send({
 *   from: "Acme <hello@yourdomain.com>",
 *   to: "customer@example.com",
 *   subject: "Hello world",
 *   html: "<p>It works!</p>",
 * });
 * ```
 *
 * **`fetch` is injectable.** Leave it unset and the global one is used; pass your own to add
 * instrumentation, a proxy agent, or a stub in tests. This is a dependency-inversion seam first
 * and a test seam second.
 *
 * There are deliberately **no built-in retries**. A `RateLimitError` carries `retryAfter` and a
 * `ServerError` is safe to retry with backoff, so the calling application decides. Pass
 * `idempotencyKey` to make a retry safe.
 */
export class Mailkube {
  /** The `emails` namespace. */
  readonly emails: EmailsResource;

  /** The `scheduled_emails` namespace, for sends accepted but not yet delivered. */
  readonly scheduledEmails: ScheduledEmailsResource;

  /**
   * Create the client, resolving configuration and wiring the transport.
   * @param options - Credentials, base URL, timeout and the optional fetch override.
   */
  constructor(options: ClientOptions = {}) {
    const config = new Config(options);
    const transport = new HttpTransport(
      config,
      resolveFetch(options.fetch),
      resolveLogger(options.logger),
    );
    this.emails = new EmailsResource(transport);
    this.scheduledEmails = new ScheduledEmailsResource(transport);
  }
}

/**
 * Pick the fetch implementation, refusing a runtime that has none.
 *
 * Without this the absence surfaces much later as a bare `TypeError: fetch is not a function`
 * raised from inside the transport — a foreign error type, mapped to `ConnectionError` as though
 * the network had failed, naming neither the cause nor the fix.
 * @param explicit - The fetch passed to the client, if any.
 * @returns The fetch implementation to drive.
 * @throws {MailkubeError} When no fetch is available and none was injected.
 */
function resolveFetch(explicit?: typeof globalThis.fetch): typeof globalThis.fetch {
  const candidate: unknown = explicit ?? globalThis.fetch;
  if (typeof candidate !== "function") {
    throw new MailkubeError(
      "No fetch implementation is available. This SDK requires Node 20.3 or later " +
        "(`nvm install 20`), a Worker, Deno or Bun runtime — or pass your own: " +
        "new Mailkube({ fetch }).",
    );
  }
  return candidate as typeof globalThis.fetch;
}
