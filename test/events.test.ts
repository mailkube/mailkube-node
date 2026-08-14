import { describe, expect, expectTypeOf, it } from "vitest";

import { MailkubeError } from "../src/errors.js";
import { EVENT_DECODERS, type WebhookEvent } from "../src/types/events.js";
import { parseEvent } from "../src/webhooks.js";

const MESSAGE = {
  email_id: "e_1",
  created_at: "2026-08-13T07:00:00Z",
  domain: "yourdomain.com",
  subject: "Hello",
  to: ["customer@example.com"],
  from: "Acme <hello@yourdomain.com>",
  tags: [{ name: "campaign", value: "launch" }],
};

/**
 * Build a whole event payload.
 * @param type - The event type.
 * @param data - The event-specific `data` block, merged over the shared message context.
 * @param withMessage - Whether this event carries the message context at all.
 * @returns The payload as the server sends it.
 */
function payload(
  type: string,
  data: Record<string, unknown>,
  withMessage = true,
): Record<string, unknown> {
  return {
    type,
    created_at: "2026-08-13T07:00:01Z",
    data: withMessage ? { ...MESSAGE, ...data } : data,
  };
}

/** One fixture per registered event type. The catalogue guard below keeps this honest. */
const FIXTURES: Record<string, Record<string, unknown>> = {
  "email.sent": payload("email.sent", {
    sent: { recipient: "customer@example.com", timestamp: "2026-08-13T07:00:01Z" },
  }),
  "email.delivered": payload("email.delivered", {
    delivery: { recipient: "customer@example.com", timestamp: "2026-08-13T07:00:02Z" },
  }),
  "email.bounced": payload("email.bounced", {
    bounce: {
      recipient: "customer@example.com",
      timestamp: "2026-08-13T07:00:03Z",
      code: 550,
      reason: "mailbox unavailable",
    },
  }),
  "email.delivery_delayed": payload("email.delivery_delayed", {
    delay: {
      recipient: "customer@example.com",
      timestamp: "2026-08-13T07:00:04Z",
      code: 451,
      reason: "greylisted",
    },
  }),
  "email.suppressed": payload("email.suppressed", {
    suppression: { recipients: ["customer@example.com"], timestamp: "2026-08-13T07:00:05Z" },
  }),
  "email.scheduled": payload("email.scheduled", {
    scheduled: { scheduled_at: "2026-08-20T07:00:00Z", batch_id: "batch-a" },
  }),
  "email.failed": payload("email.failed", {
    failed: { reason: "suppressed_at_dispatch", timestamp: "2026-08-13T07:00:06Z" },
  }),
  "email.opened": payload("email.opened", {
    open: {
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      timestamp: "2026-08-13T07:00:07Z",
    },
  }),
  "email.clicked": payload("email.clicked", {
    click: {
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      timestamp: "2026-08-13T07:00:08Z",
      link: "https://example.com/offer",
    },
  }),
  "domain.status": payload(
    "domain.status",
    {
      domain: "yourdomain.com",
      status: "verified",
      onboarding_state: "complete",
      previous: { status: "pending", onboarding_state: "dns_added" },
    },
    false,
  ),
  "webhook.status": payload(
    "webhook.status",
    {
      endpoint_url: "https://hooks.example.com/mailkube",
      is_active: false,
      is_deleted: false,
      disabled_reason: "too_many_failures",
      previous: { is_active: true, is_deleted: false, disabled_reason: "" },
    },
    false,
  ),
};

describe("the event catalogue", () => {
  it("has a fixture for every registered type, and no fixture for an unregistered one", () => {
    // The registry IS the catalogue: a decoder without a fixture is untested, and a fixture
    // without a decoder would silently parse as UnknownEvent with nothing else noticing.
    const byName = (a: string, b: string): number => a.localeCompare(b);

    expect(Object.keys(FIXTURES).sort(byName)).toEqual(Object.keys(EVENT_DECODERS).sort(byName));
  });

  it.each(Object.keys(FIXTURES))("parses %s to its own type", (type) => {
    const event = parseEvent(JSON.stringify(FIXTURES[type]));

    expect(event.type).toBe(type);
    expect(event.createdAt).toBe("2026-08-13T07:00:01Z");
  });

  it.each(Object.keys(FIXTURES))("keeps the verbatim payload of %s on raw", (type) => {
    const event = parseEvent(JSON.stringify(FIXTURES[type]));

    expect(event.raw).toEqual(FIXTURES[type]);
  });
});

describe("message context", () => {
  it("is decoded for every email event", () => {
    const event = parseEvent(JSON.stringify(FIXTURES["email.sent"]));
    if (event.type !== "email.sent") {
      throw new Error("wrong arm");
    }

    expect(event.data).toMatchObject({
      emailId: "e_1",
      createdAt: "2026-08-13T07:00:00Z",
      domain: "yourdomain.com",
      subject: "Hello",
      to: ["customer@example.com"],
      from: "Acme <hello@yourdomain.com>",
    });
    expect(event.data.tags).toEqual([{ name: "campaign", value: "launch" }]);
    expect(event.data.sent.recipient).toBe("customer@example.com");
  });

  it("tolerates the nulls the server sends when the transaction has aged out", () => {
    const event = parseEvent(
      JSON.stringify({
        type: "email.delivered",
        created_at: "2026-08-13T07:00:01Z",
        data: {
          email_id: "e_1",
          created_at: "2026-08-13T07:00:00Z",
          domain: null,
          subject: null,
          to: null,
          from: null,
          delivery: { recipient: "customer@example.com", timestamp: "2026-08-13T07:00:02Z" },
        },
      }),
    );
    if (event.type !== "email.delivered") {
      throw new Error("wrong arm");
    }

    expect(event.data.domain).toBeUndefined();
    expect(event.data.to).toEqual([]);
    expect(event.data.tags).toEqual([]);
    expect(event.data.delivery.recipient).toBe("customer@example.com");
  });
});

describe("nested blocks", () => {
  it("decodes a failure's code and reason", () => {
    const event = parseEvent(JSON.stringify(FIXTURES["email.bounced"]));
    if (event.type !== "email.bounced") {
      throw new Error("wrong arm");
    }

    expect(event.data.bounce).toEqual({
      recipient: "customer@example.com",
      timestamp: "2026-08-13T07:00:03Z",
      code: 550,
      reason: "mailbox unavailable",
    });
  });

  it("decodes engagement blocks, whose wire keys are camelCase unlike their siblings", () => {
    const event = parseEvent(JSON.stringify(FIXTURES["email.clicked"]));
    if (event.type !== "email.clicked") {
      throw new Error("wrong arm");
    }

    expect(event.data.click).toEqual({
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      timestamp: "2026-08-13T07:00:08Z",
      link: "https://example.com/offer",
    });
  });

  it("decodes a scheduling block, whose wire keys are snake_case", () => {
    const event = parseEvent(JSON.stringify(FIXTURES["email.scheduled"]));
    if (event.type !== "email.scheduled") {
      throw new Error("wrong arm");
    }

    expect(event.data.scheduled).toEqual({
      scheduledAt: "2026-08-20T07:00:00Z",
      batchId: "batch-a",
    });
  });

  it("decodes a dispatch-time failure, which carries no recipient", () => {
    const event = parseEvent(JSON.stringify(FIXTURES["email.failed"]));
    if (event.type !== "email.failed") {
      throw new Error("wrong arm");
    }

    expect(event.data.failed).toEqual({
      reason: "suppressed_at_dispatch",
      timestamp: "2026-08-13T07:00:06Z",
    });
  });

  it("decodes a suppression's recipient list", () => {
    const event = parseEvent(JSON.stringify(FIXTURES["email.suppressed"]));
    if (event.type !== "email.suppressed") {
      throw new Error("wrong arm");
    }

    expect(event.data.suppression.recipients).toEqual(["customer@example.com"]);
  });

  it("decodes a domain change and what it changed from", () => {
    const event = parseEvent(JSON.stringify(FIXTURES["domain.status"]));
    if (event.type !== "domain.status") {
      throw new Error("wrong arm");
    }

    expect(event.data).toEqual({
      domain: "yourdomain.com",
      status: "verified",
      onboardingState: "complete",
      previous: { status: "pending", onboardingState: "dns_added" },
    });
  });

  it("decodes an endpoint change and its booleans", () => {
    const event = parseEvent(JSON.stringify(FIXTURES["webhook.status"]));
    if (event.type !== "webhook.status") {
      throw new Error("wrong arm");
    }

    expect(event.data).toEqual({
      endpointUrl: "https://hooks.example.com/mailkube",
      isActive: false,
      isDeleted: false,
      disabledReason: "too_many_failures",
      previous: { isActive: true, isDeleted: false, disabledReason: "" },
    });
  });
});

describe("forward compatibility", () => {
  it("routes an unknown type to UnknownEvent instead of throwing", () => {
    const event = parseEvent(
      JSON.stringify({
        type: "email.invented_next_year",
        created_at: "2027-01-01T00:00:00Z",
        data: { whatever: true },
      }),
    );
    if (event.type !== "unknown") {
      throw new Error("wrong arm");
    }

    // The discriminator is the literal "unknown" so every other arm stays narrowable; the server's
    // own type is preserved beside it.
    expect(event.eventType).toBe("email.invented_next_year");
    expect(event.createdAt).toBe("2027-01-01T00:00:00Z");
    expect(event.data).toEqual({ whatever: true });
  });

  it("keeps fields this version predates, on raw", () => {
    const future = {
      ...FIXTURES["email.sent"],
      data: { ...MESSAGE, sent: { recipient: "c@e.com", timestamp: "t" }, future_field: 42 },
    };

    const event = parseEvent(JSON.stringify(future));

    expect((event.raw as { data: { future_field: number } }).data.future_field).toBe(42);
  });

  it("parses raw bytes as well as text", () => {
    const bytes = new TextEncoder().encode(JSON.stringify(FIXTURES["email.sent"]));

    expect(parseEvent(bytes).type).toBe("email.sent");
  });

  it("rejects a body that is not JSON", () => {
    expect(() => parseEvent("<html>nope</html>")).toThrow(MailkubeError);
  });

  it("survives a payload with no type at all", () => {
    const event = parseEvent(JSON.stringify({ data: {} }));
    if (event.type !== "unknown") {
      throw new Error("wrong arm");
    }

    expect(event.eventType).toBe("");
  });
});

describe("the derived union", () => {
  it("narrows on the type discriminator", () => {
    // A compile-time assertion as much as a runtime one: if EVENT_DECODERS were annotated, the
    // union would collapse to its supertype and this narrowing would stop working.
    const event: WebhookEvent = parseEvent(JSON.stringify(FIXTURES["email.clicked"]));

    switch (event.type) {
      case "email.clicked":
        expectTypeOf(event.data.click.link).toEqualTypeOf<string>();
        expect(event.data.click.link).toBe("https://example.com/offer");
        break;
      case "domain.status":
        expectTypeOf(event.data.previous.status).toEqualTypeOf<string>();
        break;
      default:
        throw new Error(`unexpected arm ${event.type}`);
    }
  });
});
