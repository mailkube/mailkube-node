/**
 * The wire contract, inbound and outbound.
 *
 * `params.ts` is what callers send, `responses.ts` is what the server returns plus the decoder for
 * each model, and `decode.ts` holds the primitives those decoders are built from. This module only
 * re-exports; it defines nothing.
 */
export type { Decoder } from "./decode.js";
export { decodeWebhookEvent } from "./events.js";
export type {
  BouncedData,
  ClickContext,
  ClickedData,
  DelayedData,
  DeliveredData,
  DeliveryContext,
  DomainStatusData,
  DomainStatusEvent,
  DomainStatusPrevious,
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
  ScheduledContext,
  ScheduledData,
  SendFailureContext,
  SentData,
  SuppressedData,
  SuppressionContext,
  UnknownEvent,
  WebhookEvent,
  WebhookEventBase,
  WebhookStatusData,
  WebhookStatusEvent,
  WebhookStatusPrevious,
} from "./events.js";
export type {
  Attachment,
  Recipients,
  RequestOptions,
  ScheduledEmailBatchUpdateParams,
  ScheduledEmailListParams,
  ScheduledEmailUpdateParams,
  SendEmailParams,
  Tag,
} from "./params.js";
export {
  decodeCanceledScheduledEmail,
  decodeEmail,
  decodeScheduledEmail,
  decodeScheduledEmailBatchCancel,
  decodeScheduledEmailBatchUpdate,
  decodeScheduledEmailPage,
} from "./responses.js";
export type {
  CanceledScheduledEmail,
  Email,
  PageSteps,
  Pagination,
  ScheduledEmail,
  ScheduledEmailBatchCancel,
  ScheduledEmailBatchUpdate,
  ScheduledEmailPage,
} from "./responses.js";
