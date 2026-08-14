/**
 * Mailkube Node.js SDK
 *
 * The public surface. Named exports only, so the API is explicit and tree-shakeable.
 *
 * ```ts
 * import { Mailkube } from "@mailkube/mailkube-node";
 *
 * const client = new Mailkube();
 * const email = await client.emails.send({
 *   from: "Acme <hello@yourdomain.com>",
 *   to: "customer@example.com",
 *   subject: "Hello world",
 *   html: "<p>It works!</p>",
 * });
 * ```
 */
export { Mailkube } from "./client.js";
export { DEFAULT_BASE_URL, type ClientOptions } from "./config.js";
export {
  ApiError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  ConnectionError,
  ErrorName,
  InvalidRequestError,
  MailkubeError,
  NotFoundError,
  RateLimitError,
  ServerError,
  SignatureVerificationError,
  type ApiErrorFields,
  type ErrorNameValue,
} from "./errors.js";
export { disableLogging, enableLogging, redactHeaders, type Logger } from "./logging.js";
export { EmailsResource } from "./resources/emails.js";
export {
  ScheduledEmailBatchesResource,
  ScheduledEmailsResource,
} from "./resources/scheduled-emails.js";
export type { RequestSpec, SendTransport, TypedTransport } from "./transport.js";
export type {
  Attachment,
  BouncedData,
  CanceledScheduledEmail,
  ClickContext,
  ClickedData,
  Decoder,
  DelayedData,
  DeliveredData,
  DeliveryContext,
  DomainStatusData,
  DomainStatusEvent,
  DomainStatusPrevious,
  Email,
  EmailBouncedEvent,
  EmailClickedEvent,
  EmailDeliveredEvent,
  EmailDeliveryDelayedEvent,
  EmailFailedEvent,
  EmailOpenedEvent,
  EmailScheduledEvent,
  EmailSentEvent,
  EmailSuppressedEvent,
  EngagementContext,
  FailedData,
  FailureContext,
  MessageContext,
  OpenedData,
  PageSteps,
  Pagination,
  Recipients,
  RequestOptions,
  ScheduledContext,
  ScheduledData,
  ScheduledEmail,
  ScheduledEmailBatchCancel,
  ScheduledEmailBatchUpdate,
  ScheduledEmailBatchUpdateParams,
  ScheduledEmailListParams,
  ScheduledEmailPage,
  ScheduledEmailUpdateParams,
  SendEmailParams,
  SendFailureContext,
  SentData,
  SuppressedData,
  SuppressionContext,
  Tag,
  UnknownEvent,
  WebhookEvent,
  WebhookEventBase,
  WebhookStatusData,
  WebhookStatusEvent,
  WebhookStatusPrevious,
} from "./types/index.js";
export { version } from "./version.js";
export { parseEvent, verify, verifySignature } from "./webhooks.js";
