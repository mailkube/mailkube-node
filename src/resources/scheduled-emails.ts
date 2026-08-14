/**
 * The `scheduled_emails` collection, reached as `client.scheduledEmails`.
 *
 * A send carrying `scheduledAt` is accepted but not delivered yet; until it is due it lives in
 * this collection, where it can be listed, inspected, rescheduled or canceled — one at a time, or a
 * whole `batchId` at once via `client.scheduledEmails.batches`.
 *
 * The request builders are module-level functions rather than methods, so each URL, body and query
 * string is defined exactly once no matter how many namespaces or client flavours use it.
 */
import { queryValue, toIso } from "../serialization.js";
import type { RequestSpec, TypedTransport } from "../transport.js";
import {
  decodeCanceledScheduledEmail,
  decodeScheduledEmail,
  decodeScheduledEmailBatchCancel,
  decodeScheduledEmailBatchUpdate,
  decodeScheduledEmailPage,
  type CanceledScheduledEmail,
  type RequestOptions,
  type ScheduledEmail,
  type ScheduledEmailBatchCancel,
  type ScheduledEmailBatchUpdate,
  type ScheduledEmailBatchUpdateParams,
  type ScheduledEmailListParams,
  type ScheduledEmailPage,
  type ScheduledEmailUpdateParams,
} from "../types/index.js";

const SCHEDULED_PATH = "scheduled-emails";
const BATCH_PATH = "scheduled-emails/batches";

/**
 * Build the path of one item, with the identifier escaped.
 *
 * Escaping is not cosmetic: an identifier carrying an encoded `?` or `/` would otherwise re-target
 * the request at a different route.
 * @param base - The collection path.
 * @param identifier - The item's id or batch label.
 * @returns The item path.
 */
function itemPath(base: string, identifier: string): string {
  return `${base}/${encodeURIComponent(identifier)}`;
}

/**
 * Build the query string for a listing.
 * @param params - The caller's filters.
 * @returns The rendered query parameters.
 */
function listQuery(params: ScheduledEmailListParams): Record<string, string> {
  const query: Record<string, string> = {};
  if (params.status !== undefined) {
    query["status"] = queryValue(params.status);
  }
  if (params.batchId !== undefined) {
    query["batch_id"] = params.batchId;
  }
  if (params.scheduledAtGte !== undefined) {
    query["scheduled_at_gte"] = queryValue(params.scheduledAtGte);
  }
  if (params.scheduledAtLte !== undefined) {
    query["scheduled_at_lte"] = queryValue(params.scheduledAtLte);
  }
  if (params.page !== undefined) {
    query["page"] = queryValue(params.page);
  }
  return query;
}

/**
 * Build the request listing scheduled emails.
 * @param params - The filters.
 * @param options - Per-call transport options.
 * @returns The request to perform.
 */
function listSpec(params: ScheduledEmailListParams, options: RequestOptions): RequestSpec {
  return {
    path: SCHEDULED_PATH,
    method: "GET",
    params: listQuery(params),
    signal: options.signal,
  };
}

/**
 * Build the request for the page after this one, or undefined when there is none.
 *
 * The API issues absolute page links, which the client only follows when they are on its own
 * origin — so a link cannot redirect a credentialed request elsewhere.
 * @param page - The page in hand.
 * @param options - Per-call transport options, carried forward across the whole walk.
 * @returns The request, or undefined on the last page.
 */
function nextPageSpec(page: ScheduledEmailPage, options: RequestOptions): RequestSpec | undefined {
  const next = page.pagination.steps.next;
  return next === undefined ? undefined : { path: next, method: "GET", signal: options.signal };
}

/**
 * Build the request retrieving one scheduled email.
 * @param emailId - The scheduled email's id.
 * @param options - Per-call transport options.
 * @returns The request to perform.
 */
function getSpec(emailId: string, options: RequestOptions): RequestSpec {
  return {
    path: itemPath(SCHEDULED_PATH, emailId),
    method: "GET",
    signal: options.signal,
  };
}

/**
 * Build the request rescheduling one scheduled email.
 * @param emailId - The scheduled email's id.
 * @param params - The new due time, and optionally a batch to move it into.
 * @param options - Per-call transport options.
 * @returns The request to perform.
 */
function updateSpec(
  emailId: string,
  params: ScheduledEmailUpdateParams,
  options: RequestOptions,
): RequestSpec {
  const body: Record<string, unknown> = { scheduled_at: toIso(params.scheduledAt) };
  if (params.batchId !== undefined) {
    body["batch_id"] = params.batchId;
  }
  return {
    path: itemPath(SCHEDULED_PATH, emailId),
    method: "PATCH",
    body,
    signal: options.signal,
  };
}

/**
 * Build the request canceling one scheduled email.
 * @param emailId - The scheduled email's id.
 * @param options - Per-call transport options.
 * @returns The request to perform.
 */
function cancelSpec(emailId: string, options: RequestOptions): RequestSpec {
  return {
    path: itemPath(SCHEDULED_PATH, emailId),
    method: "DELETE",
    signal: options.signal,
  };
}

/**
 * Build the request rescheduling a whole batch.
 * @param batchId - The batch label.
 * @param params - The new due time.
 * @param options - Per-call transport options.
 * @returns The request to perform.
 */
function batchUpdateSpec(
  batchId: string,
  params: ScheduledEmailBatchUpdateParams,
  options: RequestOptions,
): RequestSpec {
  return {
    path: itemPath(BATCH_PATH, batchId),
    method: "PATCH",
    body: { scheduled_at: toIso(params.scheduledAt) },
    signal: options.signal,
  };
}

/**
 * Build the request canceling a whole batch.
 * @param batchId - The batch label.
 * @param options - Per-call transport options.
 * @returns The request to perform.
 */
function batchCancelSpec(batchId: string, options: RequestOptions): RequestSpec {
  return {
    path: itemPath(BATCH_PATH, batchId),
    method: "DELETE",
    signal: options.signal,
  };
}

/** The `client.scheduledEmails.batches` namespace. */
export class ScheduledEmailBatchesResource {
  readonly #transport: TypedTransport;

  /**
   * Bind the resource to the transport that performs its requests.
   * @param transport - The client, or a test double satisfying the interface.
   */
  constructor(transport: TypedTransport) {
    this.#transport = transport;
  }

  /**
   * Reschedule every pending email in a batch.
   * @param batchId - The batch label the sends were grouped under.
   * @param params - The new due time.
   * @param options - Per-call transport options.
   * @returns The batch result, including how many emails were moved.
   */
  async update(
    batchId: string,
    params: ScheduledEmailBatchUpdateParams,
    options: RequestOptions = {},
  ): Promise<ScheduledEmailBatchUpdate> {
    return this.#transport.request(
      batchUpdateSpec(batchId, params, options),
      decodeScheduledEmailBatchUpdate,
    );
  }

  /**
   * Cancel every pending email in a batch.
   *
   * An unknown batch is a no-op reporting `canceledCount: 0`, not an error.
   * @param batchId - The batch label the sends were grouped under.
   * @param options - Per-call transport options.
   * @returns The batch result, including how many emails were canceled.
   */
  async cancel(batchId: string, options: RequestOptions = {}): Promise<ScheduledEmailBatchCancel> {
    return this.#transport.request(
      batchCancelSpec(batchId, options),
      decodeScheduledEmailBatchCancel,
    );
  }
}

/** The `client.scheduledEmails` namespace. */
export class ScheduledEmailsResource {
  readonly #transport: TypedTransport;

  /** The batch operations, reached as `client.scheduledEmails.batches`. */
  readonly batches: ScheduledEmailBatchesResource;

  /**
   * Bind the resource and its batch sub-namespace to a transport.
   * @param transport - The client, or a test double satisfying the interface.
   */
  constructor(transport: TypedTransport) {
    this.#transport = transport;
    this.batches = new ScheduledEmailBatchesResource(transport);
  }

  /**
   * List one page of scheduled emails.
   * @param params - The filters.
   * @param options - Per-call transport options.
   * @returns One page: `data` plus the pagination metadata. Use `iterAll` to walk every page.
   */
  async list(
    params: ScheduledEmailListParams = {},
    options: RequestOptions = {},
  ): Promise<ScheduledEmailPage> {
    return this.#transport.request(listSpec(params, options), decodeScheduledEmailPage);
  }

  /**
   * Iterate every scheduled email matching the filters, across all pages.
   *
   * Pages are fetched lazily by following the links the API returns, so abandoning the iterator
   * early costs nothing. A `signal` cancels the whole walk, including the pages not yet fetched.
   * @param params - The filters, as for `list`. A `page` sets the starting page.
   * @param options - Per-call transport options, carried across every page.
   * @yields Each scheduled email, page after page.
   */
  async *iterAll(
    params: ScheduledEmailListParams = {},
    options: RequestOptions = {},
  ): AsyncGenerator<ScheduledEmail> {
    let page = await this.list(params, options);
    for (;;) {
      yield* page.data;
      const spec = nextPageSpec(page, options);
      if (spec === undefined) {
        return;
      }
      page = await this.#transport.request(spec, decodeScheduledEmailPage);
    }
  }

  /**
   * Retrieve one scheduled email.
   * @param emailId - The id returned by the scheduled-send acknowledgement.
   * @param options - Per-call transport options.
   * @returns The scheduled email.
   */
  async get(emailId: string, options: RequestOptions = {}): Promise<ScheduledEmail> {
    return this.#transport.request(getSpec(emailId, options), decodeScheduledEmail);
  }

  /**
   * Reschedule one scheduled email.
   * @param emailId - The id returned by the scheduled-send acknowledgement.
   * @param params - The new due time, and optionally a batch to move it into.
   * @param options - Per-call transport options.
   * @returns The updated scheduled email.
   */
  async update(
    emailId: string,
    params: ScheduledEmailUpdateParams,
    options: RequestOptions = {},
  ): Promise<ScheduledEmail> {
    return this.#transport.request(updateSpec(emailId, params, options), decodeScheduledEmail);
  }

  /**
   * Cancel one scheduled email.
   * @param emailId - The id returned by the scheduled-send acknowledgement.
   * @param options - Per-call transport options.
   * @returns The cancellation acknowledgement.
   */
  async cancel(emailId: string, options: RequestOptions = {}): Promise<CanceledScheduledEmail> {
    return this.#transport.request(cancelSpec(emailId, options), decodeCanceledScheduledEmail);
  }
}
