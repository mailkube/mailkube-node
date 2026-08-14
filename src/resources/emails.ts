/**
 * The `emails` resource, reached as `client.emails`.
 *
 * This is the worked example every new resource copies. Note what it does *not* do: it holds no
 * configuration, performs no I/O, and never imports `fetch`. It depends only on the narrowest
 * transport interface its verbs need.
 */
import { encodeAttachments, toIso } from "../serialization.js";
import type { RequestSpec, SendTransport } from "../transport.js";
import type { Email, SendEmailParams } from "../types/index.js";

/**
 * Build the send request from the caller's parameters.
 *
 * Assembling the body as an object literal and then dropping undefined values keeps this well
 * under the complexity limit as fields are added, and is why an unset field is absent from the
 * wire rather than sent as null.
 * @param params - The send parameters.
 * @returns The request to perform.
 */
function sendSpec(params: SendEmailParams): RequestSpec {
  const body: Record<string, unknown> = {
    from: params.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    cc: params.cc,
    bcc: params.bcc,
    reply_to: params.replyTo,
    headers: params.headers,
    attachments: params.attachments && encodeAttachments(params.attachments),
    tags: params.tags,
    template_id: params.templateId,
    template_version: params.templateVersion,
    variables: params.variables,
    topic: params.topic,
    scheduled_at: params.scheduledAt && toIso(params.scheduledAt),
    batch_id: params.batchId,
  };
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) {
      delete body[key];
    }
  }

  // `idempotencyKey` and `signal` are named out of the body above and attached here instead: one
  // travels as a header, the other never leaves the process. Neither is message content.
  return {
    path: "emails",
    body,
    signal: params.signal,
    ...(params.idempotencyKey === undefined
      ? {}
      : { headers: { "Idempotency-Key": params.idempotencyKey } }),
  };
}

/** The `client.emails` namespace. */
export class EmailsResource {
  readonly #transport: SendTransport;

  /**
   * Bind the resource to the transport that performs its requests.
   * @param transport - The client, or a test double satisfying the interface.
   */
  constructor(transport: SendTransport) {
    this.#transport = transport;
  }

  /**
   * Send an email.
   *
   * Supply `html` and/or `text` for a raw send, or `templateId` for a saved template.
   * `idempotencyKey` travels as the `Idempotency-Key` header rather than in the body. Passing
   * `scheduledAt` schedules the send instead of delivering it now; the result then reports
   * `isScheduled`, and the send is managed through `client.scheduledEmails` until it is due.
   * @param params - The send parameters.
   * @returns The accepted-send result.
   */
  async send(params: SendEmailParams): Promise<Email> {
    return this.#transport.sendEmail(sendSpec(params));
  }
}
