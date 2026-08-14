/**
 * The outbound wire contract: request parameters.
 *
 * Nothing here is validated at runtime. The server is the source of truth for validation, and its
 * error names are richer than anything the SDK would reproduce.
 */

/** A single address, or a list of addresses. */
export type Recipients = string | string[];

/**
 * Per-call options that are transport concerns rather than message content.
 *
 * Kept separate from the parameter objects on purpose: list filters are looped over to build the
 * query string, and a signal in that loop would be serialized as `?signal=[object AbortSignal]`.
 */
export interface RequestOptions {
  /**
   * Cancel the request. Merged with the client's timeout, whichever fires first.
   *
   * The timeout is client-wide configuration; this is per call. A serverless handler being torn
   * down, or a user navigating away, needs the second one. On `iterAll` it cancels the whole walk,
   * including the page requests still to come.
   */
  signal?: AbortSignal;
}

/** A file attached to an email. */
export interface Attachment {
  /** Name of the attached file. */
  filename: string;
  /** File content: raw bytes (base64-encoded by the SDK) or an already base64-encoded string. */
  content: string | Uint8Array;
  /** Optional MIME type; inferred from the filename when omitted. */
  contentType?: string;
}

/**
 * A free-form name/value tag attached to an outgoing email.
 *
 * Tags are forwarded to the server, which denormalizes them onto the sending log so you can
 * filter, export and dashboard sends by tag, and so they ride along on delivery webhooks. Tag
 * values are not encrypted, so do not put personal data in them.
 */
export interface Tag {
  /** Tag name. */
  name: string;
  /** Tag value (may be blank). */
  value: string;
}

/**
 * Parameters for `client.emails.send`.
 *
 * A send carries **either** raw content (`html` and/or `text`) **or** a saved template
 * (`templateId`). `idempotencyKey` travels as the `Idempotency-Key` header, not in the body.
 */
export interface SendEmailParams {
  /** Sender address, optionally with a display name. */
  from: string;
  /** Recipient address or list of addresses. */
  to: Recipients;
  /** Subject line. */
  subject: string;
  /** HTML body (raw-content send). */
  html?: string;
  /** Plain-text body (raw-content send). */
  text?: string;
  /** Carbon-copy recipient(s). */
  cc?: Recipients;
  /** Blind carbon-copy recipient(s). */
  bcc?: Recipients;
  /** Reply-To address(es). */
  replyTo?: Recipients;
  /** Custom message headers, e.g. `In-Reply-To` for threading. */
  headers?: Record<string, string>;
  /** File attachments. */
  attachments?: Attachment[];
  /** Free-form name/value tags forwarded to the server. */
  tags?: Tag[];
  /** UUID of a saved template to render instead of raw content. */
  templateId?: string;
  /** Template version number, or `"latest"`. */
  templateVersion?: string;
  /** Values for the template's placeholders. */
  variables?: Record<string, string>;
  /** Mailing-list topic slug this send is attributed to. */
  topic?: string;
  /** Idempotency key; sent as the `Idempotency-Key` header. */
  idempotencyKey?: string;
  /**
   * Cancel the request. Merged with the client's timeout, whichever fires first.
   *
   * Like `idempotencyKey`, this is transport rather than message content: it never reaches the
   * request body.
   */
  signal?: AbortSignal;
  /** When to deliver instead of sending now: ISO-8601 with an offset, or a `Date`. */
  scheduledAt?: string | Date;
  /** A label grouping several scheduled sends. Only valid alongside `scheduledAt`. */
  batchId?: string;
}

/**
 * Filters for `client.scheduledEmails.list`.
 *
 * Every filter is optional; an omitted filter is simply not applied. The listing is scoped
 * server-side to a rolling window around now, so a bound outside that window in the direction that
 * can never match is rejected rather than silently ignored.
 */
export interface ScheduledEmailListParams {
  /**
   * One status, or several.
   *
   * Only `"scheduled"`, `"canceled"` and `"failed"` can be listed: a sent email has left the
   * collection, so `"sent"` is a validation error rather than an empty result.
   */
  status?: string | string[];
  /** Only emails grouped under this batch label. */
  batchId?: string;
  /** Only emails due at or after this instant: ISO-8601 with an offset, or a `Date`. */
  scheduledAtGte?: string | Date;
  /** Only emails due at or before this instant. */
  scheduledAtLte?: string | Date;
  /** The 1-based page number to fetch. */
  page?: number;
}

/** Parameters for rescheduling one scheduled email. */
export interface ScheduledEmailUpdateParams {
  /**
   * The new due time. Same rule as on a send: ISO-8601 with an offset (or a `Date`), in the
   * future, within the plan's scheduling horizon.
   */
  scheduledAt: string | Date;
  /** Optionally move the email into (or out of) a batch at the same time. */
  batchId?: string;
}

/**
 * Parameters for rescheduling a whole batch.
 *
 * There is deliberately no `batchId` here: the batch is identified by the path, and the server
 * rejects a second one in the body rather than let it decide which batch actually moves.
 */
export interface ScheduledEmailBatchUpdateParams {
  /** The new due time applied to every pending email in the batch. */
  scheduledAt: string | Date;
}
