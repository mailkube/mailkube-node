/**
 * Typed models for inbound webhook event payloads.
 *
 * Two deliberate inversions of the response-model rules, both so a released client never breaks on
 * a payload it has not seen (see `.rules/SDK_CONTRACT.md`, and the deviations recorded in
 * `.rules/SDK_DESIGN.md`):
 *
 * - **Unknown fields survive.** Decoding produces a curated, typed view; the verbatim payload stays
 *   on `raw`, so a receiver that logs or forwards events keeps fields this version predates.
 * - **An unknown event type is a valid parse result**, not an error. Anything outside the catalogue
 *   arrives as `UnknownEvent` with its `data` untyped, so a new server-side event never forces an
 *   SDK upgrade on receivers.
 *
 * **The registry is the catalogue.** `EVENT_DECODERS` is the single source of truth: the
 * `WebhookEvent` union is derived from it, so an event cannot be half-registered. In a language
 * where the union exists at runtime the contract derives the other way around; here types are
 * erased, so the runtime object has to be the authority.
 *
 * Server-controlled strings (`status`, `reason`, `disabledReason`) stay plain `string`. A closed
 * union would turn a new server-side value into a parse error on an already-released client.
 */
import type { Tag } from "./params.js";
import {
  boolOr,
  intOr,
  listOf,
  nested,
  record,
  text,
  textList,
  textOr,
  type Decoder,
} from "./decode.js";

// --- Nested context blocks (shared, so an event reuses one wherever the server reuses a serializer)

/**
 * Fields shared by every `email.*` event's `data`.
 *
 * `domain`, `subject`, `to` and `from` are always sent as keys but their values may be null: the
 * server resolves them through the sending transaction, which a per-recipient event can briefly
 * outlive. `tags` reuses the send-side `Tag`, so one public type describes a tag in both
 * directions.
 */
export interface MessageContext {
  /** The message's UUID, correlating every event about this send. */
  emailId: string;
  /** When the event was recorded. */
  createdAt: string;
  /** The sending domain, when it could still be resolved. */
  domain?: string;
  /** The message subject, when it could still be resolved. */
  subject?: string;
  /** The recipients, empty when they could not be resolved. */
  to: string[];
  /** The sender address, when it could still be resolved. */
  from?: string;
  /** The tags attached at send time. */
  tags: Tag[];
}

/** A single-recipient delivery outcome. */
export interface DeliveryContext {
  /** The recipient this outcome is about. */
  recipient: string;
  /** When it happened. */
  timestamp: string;
}

/** A delivery failure, with the receiving server's status code and reason. */
export interface FailureContext extends DeliveryContext {
  /** The SMTP status code. */
  code: number;
  /** The reason text the receiving server gave. */
  reason: string;
}

/** An open interaction. Note the nested keys are camelCase on the wire, unlike their siblings. */
export interface EngagementContext {
  /** The IP the interaction came from. */
  ipAddress: string;
  /** The user agent the interaction came from. */
  userAgent: string;
  /** When it happened. */
  timestamp: string;
}

/** A click interaction: an open plus the link that was clicked. */
export interface ClickContext extends EngagementContext {
  /** The clicked link. */
  link: string;
}

/** The recipients suppressed for a send. */
export interface SuppressionContext {
  /** The suppressed recipients. */
  recipients: string[];
  /** When they were suppressed. */
  timestamp: string;
}

/** A send accepted for later transmission. These keys are snake_case on the wire. */
export interface ScheduledContext {
  /** When the send is due. */
  scheduledAt: string;
  /** The batch label, when the send was grouped into one. */
  batchId?: string;
}

/**
 * An accepted send dropped at dispatch time, before transmission.
 *
 * Distinct from `FailureContext`, which reports what a receiving mail server said about one
 * recipient. This is message-level and carries no recipient: the send never left.
 */
export interface SendFailureContext {
  /** A stable server-side code, e.g. `suppressed_at_dispatch` or `mta_unreachable`. */
  reason: string;
  /** When the send was dropped. */
  timestamp: string;
}

/** The prior domain state in a `domain.status` change. */
export interface DomainStatusPrevious {
  /** The previous status. */
  status: string;
  /** The previous onboarding state. */
  onboardingState: string;
}

/** The prior endpoint state in a `webhook.status` change. */
export interface WebhookStatusPrevious {
  /** Whether the endpoint was active. */
  isActive: boolean;
  /** Whether the endpoint was deleted. */
  isDeleted: boolean;
  /** Why the endpoint was disabled, if it was. */
  disabledReason: string;
}

// --- Per-event data payloads ---------------------------------------------------------------

/** `data` for `email.delivered`. */
export interface DeliveredData extends MessageContext {
  /** The delivery outcome. */
  delivery: DeliveryContext;
}

/** `data` for `email.sent`. */
export interface SentData extends MessageContext {
  /** The acceptance record. */
  sent: DeliveryContext;
}

/** `data` for `email.bounced`. */
export interface BouncedData extends MessageContext {
  /** The bounce. */
  bounce: FailureContext;
}

/** `data` for `email.delivery_delayed`. */
export interface DelayedData extends MessageContext {
  /** The deferral. */
  delay: FailureContext;
}

/** `data` for `email.suppressed`. */
export interface SuppressedData extends MessageContext {
  /** What was suppressed. */
  suppression: SuppressionContext;
}

/** `data` for `email.scheduled`. */
export interface ScheduledData extends MessageContext {
  /** When the send is due. */
  scheduled: ScheduledContext;
}

/** `data` for `email.failed`. */
export interface FailedData extends MessageContext {
  /** Why the send was dropped. */
  failed: SendFailureContext;
}

/** `data` for `email.opened`. */
export interface OpenedData extends MessageContext {
  /** The open. */
  open: EngagementContext;
}

/** `data` for `email.clicked`. */
export interface ClickedData extends MessageContext {
  /** The click. */
  click: ClickContext;
}

/** `data` for `domain.status` (no message context). */
export interface DomainStatusData {
  /** The domain whose state changed. */
  domain: string;
  /** The new status. */
  status: string;
  /** The new onboarding state. */
  onboardingState: string;
  /** The state it changed from. */
  previous: DomainStatusPrevious;
}

/** `data` for `webhook.status` (no message context). */
export interface WebhookStatusData {
  /** The endpoint whose state changed. */
  endpointUrl: string;
  /** Whether the endpoint is now active. */
  isActive: boolean;
  /** Whether the endpoint is now deleted. */
  isDeleted: boolean;
  /** Why the endpoint is disabled, if it is. */
  disabledReason: string;
  /** The state it changed from. */
  previous: WebhookStatusPrevious;
}

// --- Event envelopes -------------------------------------------------------------------------

/** What every webhook event carries, whatever its type. */
export interface WebhookEventBase {
  /** When the event was emitted. */
  createdAt: string;
  /**
   * The verbatim decoded payload.
   *
   * The typed fields are a curated view; this is everything the server sent, including fields this
   * SDK version has never heard of. Log or forward this, not the model.
   */
  raw: unknown;
}

/** A message was accepted and spooled by the sending infrastructure. */
export interface EmailSentEvent extends WebhookEventBase {
  /** The event type. */
  type: "email.sent";
  /** The event payload. */
  data: SentData;
}

/** A message was accepted by the receiving mail server. */
export interface EmailDeliveredEvent extends WebhookEventBase {
  /** The event type. */
  type: "email.delivered";
  /** The event payload. */
  data: DeliveredData;
}

/** A message permanently failed to deliver. */
export interface EmailBouncedEvent extends WebhookEventBase {
  /** The event type. */
  type: "email.bounced";
  /** The event payload. */
  data: BouncedData;
}

/** A message was temporarily deferred. */
export interface EmailDeliveryDelayedEvent extends WebhookEventBase {
  /** The event type. */
  type: "email.delivery_delayed";
  /** The event payload. */
  data: DelayedData;
}

/** A message was suppressed (prior hard bounce or topic opt-out). */
export interface EmailSuppressedEvent extends WebhookEventBase {
  /** The event type. */
  type: "email.suppressed";
  /** The event payload. */
  data: SuppressedData;
}

/** A send was accepted for later transmission. */
export interface EmailScheduledEvent extends WebhookEventBase {
  /** The event type. */
  type: "email.scheduled";
  /** The event payload. */
  data: ScheduledData;
}

/** An accepted send was dropped at dispatch time and will never be transmitted. */
export interface EmailFailedEvent extends WebhookEventBase {
  /** The event type. */
  type: "email.failed";
  /** The event payload. */
  data: FailedData;
}

/** A recipient opened a message. */
export interface EmailOpenedEvent extends WebhookEventBase {
  /** The event type. */
  type: "email.opened";
  /** The event payload. */
  data: OpenedData;
}

/** A recipient clicked a tracked link. */
export interface EmailClickedEvent extends WebhookEventBase {
  /** The event type. */
  type: "email.clicked";
  /** The event payload. */
  data: ClickedData;
}

/** A sending domain's status or onboarding state changed. */
export interface DomainStatusEvent extends WebhookEventBase {
  /** The event type. */
  type: "domain.status";
  /** The event payload. */
  data: DomainStatusData;
}

/** A webhook endpoint's status changed. */
export interface WebhookStatusEvent extends WebhookEventBase {
  /** The event type. */
  type: "webhook.status";
  /** The event payload. */
  data: WebhookStatusData;
}

/**
 * An event type this SDK version does not recognize.
 *
 * The server's own type stays on `eventType`, and the undecoded payload on `data` and `raw`, so
 * receivers keep working when the platform introduces a new event type: no SDK upgrade required.
 *
 * **`type` is the literal `"unknown"`, not the server's value, and that is forced by TypeScript.**
 * A `type: string` arm is assignable from every literal, so `switch (event.type)` would narrow to
 * `EmailSentEvent | UnknownEvent` in *every* branch and `event.data` would collapse to `unknown` —
 * silently making the whole typed catalogue useless at the call site. Giving the fallback its own
 * literal keeps narrowing exact. The sibling Python SDK keeps `type` verbatim because its runtime
 * union does not have this problem; the deviation is recorded in `.rules/SDK_DESIGN.md`.
 */
export interface UnknownEvent extends WebhookEventBase {
  /** Always `"unknown"`: the discriminator that keeps every other arm narrowable. */
  type: "unknown";
  /** The event type the server actually sent. */
  eventType: string;
  /** The undecoded payload. */
  data: Record<string, unknown>;
}

// --- Decoders --------------------------------------------------------------------------------

/**
 * Decode one tag on an event.
 * @param payload - The tag object.
 * @returns The tag.
 */
const decodeTag: Decoder<Tag> = (payload) => {
  const source = record(payload);
  return { name: textOr(source, "name", ""), value: textOr(source, "value", "") };
};

/**
 * Read the fields every `email.*` payload shares.
 * @param source - The `data` object.
 * @returns The shared message context.
 */
function messageContext(source: Record<string, unknown>): MessageContext {
  return {
    emailId: textOr(source, "email_id", ""),
    createdAt: textOr(source, "created_at", ""),
    domain: text(source, "domain"),
    subject: text(source, "subject"),
    to: textList(source, "to"),
    from: text(source, "from"),
    tags: listOf(source, "tags", decodeTag),
  };
}

/**
 * Decode a single-recipient outcome.
 * @param payload - The nested block.
 * @returns The outcome.
 */
const decodeDelivery: Decoder<DeliveryContext> = (payload) => {
  const source = record(payload);
  return { recipient: textOr(source, "recipient", ""), timestamp: textOr(source, "timestamp", "") };
};

/**
 * Decode a delivery failure.
 * @param payload - The nested block.
 * @returns The failure.
 */
const decodeFailure: Decoder<FailureContext> = (payload) => {
  const source = record(payload);
  return {
    ...decodeDelivery(payload),
    code: intOr(source, "code", 0),
    reason: textOr(source, "reason", ""),
  };
};

/**
 * Decode an open interaction.
 * @param payload - The nested block.
 * @returns The interaction.
 */
const decodeEngagement: Decoder<EngagementContext> = (payload) => {
  const source = record(payload);
  return {
    // camelCase on the wire here, unlike every sibling block.
    ipAddress: textOr(source, "ipAddress", ""),
    userAgent: textOr(source, "userAgent", ""),
    timestamp: textOr(source, "timestamp", ""),
  };
};

/**
 * Decode a click interaction.
 * @param payload - The nested block.
 * @returns The interaction.
 */
const decodeClick: Decoder<ClickContext> = (payload) => ({
  ...decodeEngagement(payload),
  link: textOr(record(payload), "link", ""),
});

/**
 * Decode a suppression block.
 * @param payload - The nested block.
 * @returns The suppression.
 */
const decodeSuppression: Decoder<SuppressionContext> = (payload) => {
  const source = record(payload);
  return { recipients: textList(source, "recipients"), timestamp: textOr(source, "timestamp", "") };
};

/**
 * Decode a scheduling block.
 * @param payload - The nested block.
 * @returns The schedule.
 */
const decodeScheduled: Decoder<ScheduledContext> = (payload) => {
  const source = record(payload);
  return { scheduledAt: textOr(source, "scheduled_at", ""), batchId: text(source, "batch_id") };
};

/**
 * Decode a dispatch-time failure block.
 * @param payload - The nested block.
 * @returns The failure.
 */
const decodeSendFailure: Decoder<SendFailureContext> = (payload) => {
  const source = record(payload);
  return { reason: textOr(source, "reason", ""), timestamp: textOr(source, "timestamp", "") };
};

/**
 * Decode the prior domain state.
 * @param payload - The nested block.
 * @returns The prior state.
 */
const decodeDomainPrevious: Decoder<DomainStatusPrevious> = (payload) => {
  const source = record(payload);
  return {
    status: textOr(source, "status", ""),
    onboardingState: textOr(source, "onboarding_state", ""),
  };
};

/**
 * Decode the prior endpoint state.
 * @param payload - The nested block.
 * @returns The prior state.
 */
const decodeWebhookPrevious: Decoder<WebhookStatusPrevious> = (payload) => {
  const source = record(payload);
  return {
    isActive: boolOr(source, "is_active", false),
    isDeleted: boolOr(source, "is_deleted", false),
    disabledReason: textOr(source, "disabled_reason", ""),
  };
};

/**
 * Build a decoder for an `email.*` payload: the shared context plus one nested block.
 *
 * Every message event has exactly this shape, so the nine of them differ only in the key they
 * carry and how it decodes. Writing that difference as arguments is what keeps them one line each.
 * @param key - The wire key of the event-specific block.
 * @param decodeBlock - How to decode that block.
 * @returns A decoder for the whole `data` object.
 */
function messageData<K extends string, T>(
  key: K,
  decodeBlock: Decoder<T>,
): Decoder<MessageContext & Record<K, T>> {
  return (payload) => {
    const source = record(payload);
    return {
      ...messageContext(source),
      ...({ [key]: nested(source, key, decodeBlock) } as Record<K, T>),
    };
  };
}

/**
 * Decode a `domain.status` payload.
 * @param payload - The `data` object.
 * @returns The payload.
 */
const decodeDomainStatusData: Decoder<DomainStatusData> = (payload) => {
  const source = record(payload);
  return {
    domain: textOr(source, "domain", ""),
    status: textOr(source, "status", ""),
    onboardingState: textOr(source, "onboarding_state", ""),
    previous: nested(source, "previous", decodeDomainPrevious),
  };
};

/**
 * Decode a `webhook.status` payload.
 * @param payload - The `data` object.
 * @returns The payload.
 */
const decodeWebhookStatusData: Decoder<WebhookStatusData> = (payload) => {
  const source = record(payload);
  return {
    endpointUrl: textOr(source, "endpoint_url", ""),
    isActive: boolOr(source, "is_active", false),
    isDeleted: boolOr(source, "is_deleted", false),
    disabledReason: textOr(source, "disabled_reason", ""),
    previous: nested(source, "previous", decodeWebhookPrevious),
  };
};

/**
 * Build an event decoder: the envelope, the declared type, and the decoded payload.
 *
 * `raw` keeps the verbatim payload so nothing the server sent is lost, whatever this version knows
 * how to name.
 * @param type - The event type this decoder is registered under.
 * @param decodeData - How to decode the event's `data`.
 * @returns A decoder for the whole event.
 */
function event<T extends string, D>(
  type: T,
  decodeData: Decoder<D>,
): Decoder<WebhookEventBase & { type: T; data: D }> {
  return (payload) => {
    const source = record(payload);
    return {
      type,
      createdAt: textOr(source, "created_at", ""),
      data: decodeData(source["data"]),
      raw: payload,
    };
  };
}

/**
 * The catalogue.
 *
 * Deliberately **not** annotated: an explicit `Record<string, Decoder<...>>` would widen every
 * value, collapse the derived union to its supertype, and silently break `switch (event.type)`
 * narrowing for callers. `satisfies` gets the checking without the widening.
 */
export const EVENT_DECODERS = {
  "email.sent": event("email.sent", messageData("sent", decodeDelivery)),
  "email.delivered": event("email.delivered", messageData("delivery", decodeDelivery)),
  "email.bounced": event("email.bounced", messageData("bounce", decodeFailure)),
  "email.delivery_delayed": event("email.delivery_delayed", messageData("delay", decodeFailure)),
  "email.suppressed": event("email.suppressed", messageData("suppression", decodeSuppression)),
  "email.scheduled": event("email.scheduled", messageData("scheduled", decodeScheduled)),
  "email.failed": event("email.failed", messageData("failed", decodeSendFailure)),
  "email.opened": event("email.opened", messageData("open", decodeEngagement)),
  "email.clicked": event("email.clicked", messageData("click", decodeClick)),
  "domain.status": event("domain.status", decodeDomainStatusData),
  "webhook.status": event("webhook.status", decodeWebhookStatusData),
} satisfies Record<string, Decoder<{ type: string }>>;

/**
 * Every event this SDK version can decode, plus the fallback for those it cannot.
 *
 * Derived from `EVENT_DECODERS`, so registering an arm is the whole registration and a decoder
 * cannot exist outside the union or vice versa.
 */
export type WebhookEvent =
  ReturnType<(typeof EVENT_DECODERS)[keyof typeof EVENT_DECODERS]> | UnknownEvent;

/**
 * Decode an event whose type this version does not know.
 * @param payload - The whole event payload.
 * @returns The event, with its data left untyped.
 */
const decodeUnknownEvent: Decoder<UnknownEvent> = (payload) => {
  const source = record(payload);
  return {
    type: "unknown",
    eventType: textOr(source, "type", ""),
    createdAt: textOr(source, "created_at", ""),
    data: record(source["data"]),
    raw: payload,
  };
};

/**
 * Decode any webhook event payload.
 *
 * An unrecognized `type` degrades to `UnknownEvent` rather than throwing, so a new server-side
 * event never breaks a receiver running an older SDK.
 * @param payload - The decoded JSON of the whole event.
 * @returns The typed event, or `UnknownEvent`.
 */
export function decodeWebhookEvent(payload: unknown): WebhookEvent {
  const type = textOr(record(payload), "type", "");
  const decode = Object.hasOwn(EVENT_DECODERS, type)
    ? EVENT_DECODERS[type as keyof typeof EVENT_DECODERS]
    : decodeUnknownEvent;
  return decode(payload);
}
