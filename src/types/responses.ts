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
  optionalNested,
  record,
  requiredText,
  text,
  textList,
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

/** The sending domain an API key belongs to. */
export interface ApiKeyDomain {
  /** The domain name, e.g. `example.com`. */
  name: string;
}

/** The organization owning an API key's domain. */
export interface ApiKeyOrganization {
  /** The organization's display name. */
  name: string;
  /** The organization's short alias. */
  alias: string;
}

/** One send quota of the plan: its limit and what the current period has used. */
export interface ApiKeyQuota {
  /** Which quota, e.g. `emails_per_day` or `emails_per_month`. A plain string, never a closed set. */
  name: string;
  /** The plan's limit for the period, in recipients. */
  limit: number;
  /** Recipients sent to so far in the period. */
  used: number;
  /** Recipients left in the period. */
  remaining: number;
  /** The UTC period the figures count: a day (`2026-10-19`) or a month (`2026-10`). */
  period: string;
}

/** The organization's plan, its status and its send quotas. */
export interface ApiKeyPlan {
  /** The plan's UUID. */
  code: string;
  /** The plan's name. */
  name: string;
  /** The subscription status, e.g. `active`. A plain string, never a closed set. */
  status: string;
  /**
   * The send quotas the plan carries. A plan without a daily limit lists the monthly quota only:
   * an absent quota is a missing limit, never a limit of zero.
   */
  quotas: ApiKeyQuota[];
}

/**
 * The API key this client authenticates with, as it describes itself.
 *
 * Plan and quota figures can be up to 30 seconds old.
 */
export interface ApiKey {
  /** The resource discriminator, always `"api_key"`. */
  object: string;
  /** The key's public identifier. */
  keyId: string;
  /** The key's name. */
  name: string;
  /** The key's description, if it has one. */
  description?: string;
  /** When the key was created. */
  createdAt: string;
  /** The key's last successful authentication, this call included. */
  lastAuthAt?: string;
  /** The networks the key may be used from, in CIDR notation. Empty means any address. */
  allowedSourceIps: string[];
  /** The sending domain the key belongs to. */
  domain: ApiKeyDomain;
  /** The organization owning the domain. */
  organization: ApiKeyOrganization;
  /** The organization's plan, or undefined when it has no subscription. */
  plan?: ApiKeyPlan;
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
 * Decode one send quota.
 * @param payload - The quota object.
 * @returns The quota.
 */
const decodeApiKeyQuota: Decoder<ApiKeyQuota> = (payload) => {
  const source = record(payload);
  return {
    name: textOr(source, "name", ""),
    limit: intOr(source, "limit", 0),
    used: intOr(source, "used", 0),
    remaining: intOr(source, "remaining", 0),
    period: textOr(source, "period", ""),
  };
};

/**
 * Decode the plan block.
 * @param payload - The plan object.
 * @returns The plan.
 */
const decodeApiKeyPlan: Decoder<ApiKeyPlan> = (payload) => {
  const source = record(payload);
  return {
    code: textOr(source, "code", ""),
    name: textOr(source, "name", ""),
    status: textOr(source, "status", ""),
    quotas: listOf(source, "quotas", decodeApiKeyQuota),
  };
};

/**
 * Decode the key's domain.
 * @param payload - The domain object.
 * @returns The domain.
 */
const decodeApiKeyDomain: Decoder<ApiKeyDomain> = (payload) => ({
  name: textOr(record(payload), "name", ""),
});

/**
 * Decode the key's organization.
 * @param payload - The organization object.
 * @returns The organization.
 */
const decodeApiKeyOrganization: Decoder<ApiKeyOrganization> = (payload) => {
  const source = record(payload);
  return { name: textOr(source, "name", ""), alias: textOr(source, "alias", "") };
};

/**
 * Decode the calling API key's description.
 *
 * `plan` is the one field the API sends as `null`, meaning the organization has no subscription,
 * so it is read with `optionalNested`: an empty plan built from defaults would look like a real one.
 * @param payload - The api_key object.
 * @returns The API key.
 */
export const decodeApiKey: Decoder<ApiKey> = (payload) => {
  const source = record(payload);
  return {
    object: textOr(source, "object", "api_key"),
    keyId: requiredText(source, "key_id"),
    name: textOr(source, "name", ""),
    description: text(source, "description"),
    createdAt: textOr(source, "created_at", ""),
    lastAuthAt: text(source, "last_auth_at"),
    allowedSourceIps: textList(source, "allowed_source_ips"),
    domain: nested(source, "domain", decodeApiKeyDomain),
    organization: nested(source, "organization", decodeApiKeyOrganization),
    plan: optionalNested(source, "plan", decodeApiKeyPlan),
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
