/**
 * The error taxonomy, and the response-to-error mapping.
 *
 * Every error this SDK throws extends {@link MailkubeError}. Server-returned errors become an
 * {@link ApiError} subclass chosen by HTTP status; the machine-readable `name` from the envelope
 * is preserved as data so callers can branch finer.
 *
 * See `.rules/SDK_CONTRACT.md` for why the status (and not the error name) chooses the class: a
 * subclass per server error name grows unboundedly and ports badly.
 */

/**
 * The documented `name` values of the API error envelope.
 *
 * Constants for discoverability, **not** a closed set: {@link ApiError.errorName} stays a plain
 * string at runtime, so a name this release has never heard of is reported verbatim instead of
 * throwing. Add a member when the public error reference gains a name.
 */
export const ErrorName = {
  ApplicationError: "application_error",
  BodyContentRejected: "body_content_rejected",
  BrowserNotAllowed: "browser_not_allowed",
  ConcurrentIdempotentRequests: "concurrent_idempotent_requests",
  FromDomainNotAllowed: "from_domain_not_allowed",
  InvalidApiKey: "invalid_api_key",
  InvalidAttachment: "invalid_attachment",
  InvalidFromAddress: "invalid_from_address",
  InvalidIdempotencyKey: "invalid_idempotency_key",
  InvalidIdempotentRequest: "invalid_idempotent_request",
  InvalidRequestBody: "invalid_request_body",
  LinkReputationBlocked: "link_reputation_blocked",
  MaxMessageSizeExceeded: "max_message_size_exceeded",
  MaxRecipientsExceeded: "max_recipients_exceeded",
  MethodNotAllowed: "method_not_allowed",
  MissingRequiredField: "missing_required_field",
  MissingRequiredVariable: "missing_required_variable",
  MissingUserAgent: "missing_user_agent",
  NotAcceptable: "not_acceptable",
  QuotaExceeded: "quota_exceeded",
  RateLimitExceeded: "rate_limit_exceeded",
  UnsupportedMediaType: "unsupported_media_type",
  ValidationError: "validation_error",
} as const;

/** One of the documented error-envelope names. */
export type ErrorNameValue = (typeof ErrorName)[keyof typeof ErrorName];

/** Base class for every error this SDK throws. */
export class MailkubeError extends Error {
  /**
   * Create the error and set the constructor's name for readable stack traces.
   * @param message - The human-readable message.
   * @param options - Standard error options, e.g. `{ cause }`.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * A transport-level failure (network error, abort or timeout) with no HTTP response.
 *
 * Deliberately not an {@link ApiError}: there is no status code and no server envelope, so
 * callers branching on API semantics must not catch it by accident.
 */
export class ConnectionError extends MailkubeError {}

/** A webhook signature could not be verified (bad signature, stale, or malformed headers). */
export class SignatureVerificationError extends MailkubeError {}

/** The fields carried on every {@link ApiError}. */
export interface ApiErrorFields {
  /** The machine-readable error name from the envelope, e.g. `quota_exceeded`. */
  errorName: string;
  /** The human-readable message. */
  message: string;
  /** The HTTP status code. */
  statusCode: number;
  /** The decoded response body, when available. */
  body?: unknown;
  /** Seconds to wait before retrying, from the `Retry-After` header. */
  retryAfter?: number;
  /** The server's request id, to quote to support. */
  requestId?: string;
}

/** An error returned by the API as a `{name, message, statusCode}` envelope. */
export class ApiError extends MailkubeError {
  /** The machine-readable error name from the envelope. */
  readonly errorName: string;
  /** The HTTP status code. */
  readonly statusCode: number;
  /** The decoded response body, when available. */
  readonly body: unknown;
  /** Seconds to wait before retrying, when the server said so. */
  readonly retryAfter: number | undefined;
  /** The server's request id, when present. */
  readonly requestId: string | undefined;

  /**
   * Capture the server's error envelope alongside the transport metadata a caller needs.
   * @param fields - The envelope and response metadata.
   */
  constructor(fields: ApiErrorFields) {
    super(fields.message || fields.errorName || `HTTP ${String(fields.statusCode)}`);
    this.errorName = fields.errorName;
    this.statusCode = fields.statusCode;
    this.body = fields.body;
    this.retryAfter = fields.retryAfter;
    this.requestId = fields.requestId;
  }
}

/** HTTP 400: the request envelope was invalid, e.g. `missing_user_agent`. */
export class BadRequestError extends ApiError {}
/** HTTP 403: authentication failed or is forbidden, e.g. `invalid_api_key`. */
export class AuthenticationError extends ApiError {}
/** HTTP 404: a referenced resource was not found, e.g. `template_not_found`. */
export class NotFoundError extends ApiError {}
/** HTTP 409: an idempotency conflict, e.g. `invalid_idempotent_request`. */
export class ConflictError extends ApiError {}
/** HTTP 422: the request was rejected by a send-policy check, e.g. `validation_error`. */
export class InvalidRequestError extends ApiError {}
/** HTTP 429: the rate limit was exceeded. Inspect `retryAfter`. */
export class RateLimitError extends ApiError {}
/** HTTP 5xx: an unexpected server error. Safe to retry with backoff. */
export class ServerError extends ApiError {}

const STATUS_ERRORS = new Map<number, new (fields: ApiErrorFields) => ApiError>([
  [400, BadRequestError],
  [403, AuthenticationError],
  [404, NotFoundError],
  [409, ConflictError],
  [422, InvalidRequestError],
  [429, RateLimitError],
]);

/**
 * Build the {@link ApiError} subclass matching an error response.
 *
 * Dispatch is status-code-first: an exact match wins, any other 5xx maps to
 * {@link ServerError}, and everything else falls back to the base {@link ApiError}.
 * @param fields - The envelope and response metadata.
 * @returns The error to throw.
 */
export function apiErrorFor(fields: ApiErrorFields): ApiError {
  const exact = STATUS_ERRORS.get(fields.statusCode);
  if (exact) {
    return new exact(fields);
  }
  return fields.statusCode >= 500 ? new ServerError(fields) : new ApiError(fields);
}
