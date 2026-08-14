/**
 * The inbound wire contract: response models, and the decoder for each.
 *
 * Conventions every mailkube SDK follows:
 *
 * - **A model mirrors the wire and nothing else.** Transport metadata (headers, request ids)
 *   belongs on the error, where a caller needs it. `Email.idempotentReplayed` predates that rule
 *   and is a grandfathered exception, not a template.
 * - **Unknown fields are ignored**, so a server-side field addition can never break an already
 *   released client.
 * - **Timestamps stay verbatim strings**, exactly as the server sent them. The SDK does not
 *   reinterpret server data; call `new Date(value)` if you want an object.
 */
import type { Tag } from "./params.js";
import {
  intOr,
  listOf,
  nested,
  record,
  requiredText,
  text,
  textOr,
  type Decoder,
} from "./decode.js";

/**
 * The result of a successful send.
 *
 * A **scheduled** send is acknowledged with `202` and a richer body; `status`, `scheduledAt` and
 * `batchId` are populated only then, and `isScheduled` is the discriminator. An immediate send
 * leaves all three undefined.
 *
 * This is the worked example of the contract's **widen, never union** rule: one call can return
 * two shapes, and adding optional fields plus a boolean keeps every existing caller's type valid,
 * where returning a union would not.
 */
export interface Email {
  /** The accepted message's UUID. */
  id: string;
  /** The RFC Message-ID assigned to the message, when the deployment returns one. */
  messageId?: string;
  /** True when this response replays an earlier request with the same `Idempotency-Key`. */
  idempotentReplayed: boolean;
  /** True when the send was accepted for later delivery rather than sent now. */
  isScheduled: boolean;
  /** The scheduled email's status, on a scheduled ack only. */
  status?: string;
  /** When the send is due, on a scheduled ack only. */
  scheduledAt?: string;
  /** The batch label the send was grouped under, on a scheduled ack only. */
  batchId?: string;
}

/** A scheduled email that has not been delivered yet. */
export interface ScheduledEmail {
  /** The scheduled email's UUID: the same id the send acknowledgement returned. */
  id: string;
  /** The RFC Message-ID the message will carry. */
  messageId?: string;
  /** The resource discriminator, always `"scheduled_email"`. */
  object: string;
  /** One of `scheduled`, `canceled`, `sent` or `failed`. */
  status: string;
  /** When the send is due. */
  scheduledAt?: string;
  /** When the send was accepted. */
  createdAt?: string;
  /** The batch label this send was grouped under, if any. */
  batchId?: string;
  /** The message subject. */
  subject?: string;
  /**
   * A **summary** of the recipients, not a list: the first recipient plus an overflow count, e.g.
   * `"a@b.com +2"`. The full list stays server-side with the frozen payload.
   */
  recipients?: string;
  /** The mailing-list topic slug the send is attributed to, if any. */
  topic?: string;
  /** The message tags attached at send time. */
  tags: Tag[];
}

/**
 * Links to the adjacent pages of a listing.
 *
 * The server **omits** a step at either end of the range rather than sending null, so an absent
 * link and an undefined value mean the same thing: there is no such page.
 */
export interface PageSteps {
  /** Absolute URL of the following page, or undefined on the last page. */
  next?: string;
  /** Absolute URL of the preceding page, or undefined on the first page. */
  previous?: string;
}

/** Page-number pagination metadata for a listing. */
export interface Pagination {
  /** Links to the adjacent pages. */
  steps: PageSteps;
  /** Total number of matching records across every page. */
  totalCount: number;
  /** The 1-based number of the page in hand. */
  currentPage: number;
}

/** One page of scheduled emails. */
export interface ScheduledEmailPage {
  /** Page metadata, including the adjacent-page links. */
  pagination: Pagination;
  /** The scheduled emails on this page. */
  data: ScheduledEmail[];
  /** True when the server offered a link to a following page. */
  hasMore: boolean;
}

/** The acknowledgement of a single scheduled-email cancellation. */
export interface CanceledScheduledEmail {
  /** The canceled scheduled email's UUID. */
  id: string;
  /** The resource discriminator, always `"scheduled_email"`. */
  object: string;
  /** The resulting status, always `"canceled"`. */
  status: string;
}

/** The result of canceling a whole batch. */
export interface ScheduledEmailBatchCancel {
  /** The resource discriminator, always `"scheduled_email.batch"`. */
  object: string;
  /** The batch that was targeted. */
  batchId: string;
  /**
   * How many pending emails the cancellation affected. An unknown batch is a no-op reporting `0`,
   * not an error.
   */
  canceledCount: number;
}

/** The result of rescheduling a whole batch. */
export interface ScheduledEmailBatchUpdate {
  /** The resource discriminator, always `"scheduled_email.batch"`. */
  object: string;
  /** The batch that was targeted. */
  batchId: string;
  /** How many pending emails were moved. An unknown batch is a no-op reporting `0`. */
  rescheduledCount: number;
  /** The new due time applied to every moved email. */
  scheduledAt?: string;
}

/**
 * Decode one tag.
 * @param payload - The tag object.
 * @returns The tag.
 */
const decodeTag: Decoder<Tag> = (payload) => {
  const source = record(payload);
  return { name: textOr(source, "name", ""), value: textOr(source, "value", "") };
};

/**
 * Decode one scheduled email.
 * @param payload - The scheduled-email object.
 * @returns The scheduled email.
 */
export const decodeScheduledEmail: Decoder<ScheduledEmail> = (payload) => {
  const source = record(payload);
  return {
    id: requiredText(source, "id"),
    messageId: text(source, "message_id"),
    object: textOr(source, "object", "scheduled_email"),
    status: textOr(source, "status", ""),
    scheduledAt: text(source, "scheduled_at"),
    createdAt: text(source, "created_at"),
    batchId: text(source, "batch_id"),
    subject: text(source, "subject"),
    recipients: text(source, "recipients"),
    topic: text(source, "topic"),
    tags: listOf(source, "tags", decodeTag),
  };
};

/**
 * Decode the adjacent-page links.
 * @param payload - The steps object.
 * @returns The links.
 */
const decodePageSteps: Decoder<PageSteps> = (payload) => {
  const source = record(payload);
  return { next: text(source, "next"), previous: text(source, "previous") };
};

/**
 * Decode the pagination block.
 * @param payload - The pagination object.
 * @returns The metadata.
 */
const decodePagination: Decoder<Pagination> = (payload) => {
  const source = record(payload);
  return {
    steps: nested(source, "steps", decodePageSteps),
    totalCount: intOr(source, "total_count", 0),
    currentPage: intOr(source, "current_page", 1),
  };
};

/**
 * Decode one page of scheduled emails.
 * @param payload - The page object.
 * @returns The page.
 */
export const decodeScheduledEmailPage: Decoder<ScheduledEmailPage> = (payload) => {
  const source = record(payload);
  const pagination = nested(source, "pagination", decodePagination);
  return {
    pagination,
    data: listOf(source, "data", decodeScheduledEmail),
    hasMore: pagination.steps.next !== undefined,
  };
};

/**
 * Decode a single-cancellation acknowledgement.
 * @param payload - The response body.
 * @returns The acknowledgement.
 */
export const decodeCanceledScheduledEmail: Decoder<CanceledScheduledEmail> = (payload) => {
  const source = record(payload);
  return {
    id: requiredText(source, "id"),
    object: textOr(source, "object", "scheduled_email"),
    status: textOr(source, "status", "canceled"),
  };
};

/**
 * Decode a batch cancellation result.
 * @param payload - The response body.
 * @returns The result.
 */
export const decodeScheduledEmailBatchCancel: Decoder<ScheduledEmailBatchCancel> = (payload) => {
  const source = record(payload);
  return {
    object: textOr(source, "object", "scheduled_email.batch"),
    batchId: textOr(source, "batch_id", ""),
    canceledCount: intOr(source, "canceled_count", 0),
  };
};

/**
 * Decode a batch reschedule result.
 * @param payload - The response body.
 * @returns The result.
 */
export const decodeScheduledEmailBatchUpdate: Decoder<ScheduledEmailBatchUpdate> = (payload) => {
  const source = record(payload);
  return {
    object: textOr(source, "object", "scheduled_email.batch"),
    batchId: textOr(source, "batch_id", ""),
    rescheduledCount: intOr(source, "rescheduled_count", 0),
    scheduledAt: text(source, "scheduled_at"),
  };
};

/**
 * Decode a send acknowledgement, given the response headers it also draws on.
 *
 * The odd one out: `idempotentReplayed` comes from a header rather than the body, which is why
 * this decoder takes one and the others do not.
 * @param payload - The response body.
 * @param headers - The response headers.
 * @returns The accepted-send result.
 */
export function decodeEmail(payload: unknown, headers: Headers): Email {
  const source = record(payload);
  const scheduledAt = text(source, "scheduled_at");
  return {
    id: requiredText(source, "id"),
    messageId: text(source, "message_id"),
    idempotentReplayed: headers.get("idempotent-replayed")?.toLowerCase() === "true",
    isScheduled: scheduledAt !== undefined,
    status: text(source, "status"),
    scheduledAt,
    batchId: text(source, "batch_id"),
  };
}
