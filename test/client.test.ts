import { describe, expect, it } from "vitest";

import { Mailkube } from "../src/client.js";
import {
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
} from "../src/errors.js";
import { version } from "../src/version.js";
import { BASE_URL, makeClient } from "./helpers.js";

const MINIMAL = { from: "a@x.com", to: "b@y.com", subject: "Hi" };

describe("emails.send", () => {
  it("posts to the emails endpoint", async () => {
    const { client, stub } = makeClient();
    await client.emails.send({ ...MINIMAL, html: "<p>Hi</p>" });

    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.url).toBe(`${BASE_URL}emails`);
    expect(stub.calls[0]?.method).toBe("POST");
    expect(stub.calls[0]?.body).toEqual({
      from: "a@x.com",
      to: "b@y.com",
      subject: "Hi",
      html: "<p>Hi</p>",
    });
  });

  it("carries bearer auth and the versioned user agent", async () => {
    const { client, stub } = makeClient();
    await client.emails.send(MINIMAL);

    expect(stub.calls[0]?.headers["Authorization"]).toBe("Bearer mk_test");
    expect(stub.calls[0]?.headers["User-Agent"]).toBe(`mailkube-node/${version}`);
  });

  it("omits unset fields rather than sending null", async () => {
    const { client, stub } = makeClient();
    await client.emails.send(MINIMAL);

    expect(Object.keys(stub.calls[0]?.body ?? {})).toEqual(["from", "to", "subject"]);
  });

  it("forwards recipient lists, reply-to and headers", async () => {
    const { client, stub } = makeClient();
    await client.emails.send({
      ...MINIMAL,
      to: ["b@y.com", "c@y.com"],
      cc: "cc@y.com",
      bcc: ["bcc@y.com"],
      replyTo: "reply@y.com",
      headers: { "In-Reply-To": "<prev@x>" },
    });

    const body = stub.calls[0]?.body;
    expect(body?.["to"]).toEqual(["b@y.com", "c@y.com"]);
    expect(body?.["cc"]).toBe("cc@y.com");
    expect(body?.["bcc"]).toEqual(["bcc@y.com"]);
    expect(body?.["reply_to"]).toBe("reply@y.com");
    expect(body?.["headers"]).toEqual({ "In-Reply-To": "<prev@x>" });
  });

  it("base64-encodes raw attachment bytes and passes strings through", async () => {
    const { client, stub } = makeClient();
    await client.emails.send({
      ...MINIMAL,
      attachments: [
        {
          filename: "a.txt",
          content: new TextEncoder().encode("hello"),
          contentType: "text/plain",
        },
        { filename: "b.txt", content: "YWxyZWFkeQ==" },
      ],
    });

    expect(stub.calls[0]?.body?.["attachments"]).toEqual([
      { filename: "a.txt", content: "aGVsbG8=", content_type: "text/plain" },
      { filename: "b.txt", content: "YWxyZWFkeQ==" },
    ]);
  });

  it("sends the idempotency key as a header, not in the body", async () => {
    const { client, stub } = makeClient();
    await client.emails.send({ ...MINIMAL, idempotencyKey: "key-1" });

    expect(stub.calls[0]?.headers["Idempotency-Key"]).toBe("key-1");
    expect(stub.calls[0]?.body).not.toHaveProperty("idempotencyKey");
  });

  it("passes a signal that aborts when the caller's does, and keeps it out of the body", async () => {
    // The timeout is client-wide config; this is per-call cancellation, and a serverless handler
    // being torn down needs it. Merged, so whichever fires first wins.
    const controller = new AbortController();
    let observed: AbortSignal | null | undefined;
    const client = new Mailkube({
      apiKey: "mk_test",
      fetch: (_input, init) => {
        observed = init?.signal;
        return Promise.resolve(new Response(JSON.stringify({ id: "abc123" })));
      },
    });

    await client.emails.send({ ...MINIMAL, signal: controller.signal });
    expect(observed?.aborted).toBe(false);

    controller.abort();
    expect(observed?.aborted).toBe(true);
  });

  it("sends no signal field on the wire", async () => {
    const { client, stub } = makeClient();
    await client.emails.send({ ...MINIMAL, signal: new AbortController().signal });

    expect(stub.calls[0]?.body).not.toHaveProperty("signal");
  });

  it("renders scheduledAt as ISO-8601", async () => {
    const { client, stub } = makeClient();
    await client.emails.send({ ...MINIMAL, scheduledAt: new Date("2026-08-20T07:00:00Z") });

    expect(stub.calls[0]?.body?.["scheduled_at"]).toBe("2026-08-20T07:00:00.000Z");
  });

  it("returns the parsed email", async () => {
    const { client } = makeClient({ body: { id: "abc123", message_id: "<abc123@msg>" } });
    const email = await client.emails.send(MINIMAL);

    expect(email.id).toBe("abc123");
    expect(email.messageId).toBe("<abc123@msg>");
    expect(email.idempotentReplayed).toBe(false);
    expect(email.isScheduled).toBe(false);
  });

  it("reports a replayed response from the header", async () => {
    const { client } = makeClient({ headers: { "Idempotent-Replayed": "true" } });

    expect((await client.emails.send(MINIMAL)).idempotentReplayed).toBe(true);
  });

  it("widens the same model for a scheduled ack rather than returning a union", async () => {
    const { client } = makeClient({
      status: 202,
      body: { id: "abc123", status: "scheduled", scheduled_at: "2026-08-20T07:00:00Z" },
    });
    const email = await client.emails.send({ ...MINIMAL, scheduledAt: "2026-08-20T07:00:00Z" });

    expect(email.isScheduled).toBe(true);
    expect(email.status).toBe("scheduled");
  });
});

describe("error mapping", () => {
  it.each([
    [400, BadRequestError],
    [403, AuthenticationError],
    [404, NotFoundError],
    [409, ConflictError],
    [422, InvalidRequestError],
    [429, RateLimitError],
    [500, ServerError],
    [503, ServerError],
    [418, ApiError],
  ])("maps status %i to the matching error class", async (status, expected) => {
    const { client } = makeClient({ status, body: { name: "validation_error", message: "nope" } });

    await expect(client.emails.send(MINIMAL)).rejects.toBeInstanceOf(expected);
  });

  it("reads retry-after and the request id off the response headers", async () => {
    const { client } = makeClient({
      status: 429,
      body: { name: "rate_limit_exceeded", message: "slow down" },
      headers: { "Retry-After": "30", "X-Request-Id": "req_42" },
    });

    await expect(client.emails.send(MINIMAL)).rejects.toMatchObject({
      retryAfter: 30,
      requestId: "req_42",
      errorName: ErrorName.RateLimitExceeded,
    });
  });

  it("ignores an unparseable retry-after rather than throwing", async () => {
    const { client } = makeClient({
      status: 429,
      body: { name: "rate_limit_exceeded" },
      headers: { "Retry-After": "soon" },
    });

    await expect(client.emails.send(MINIMAL)).rejects.toMatchObject({ retryAfter: undefined });
  });

  it("reports an unknown error name verbatim", async () => {
    const { client } = makeClient({ status: 400, body: { name: "invented_next_year" } });

    await expect(client.emails.send(MINIMAL)).rejects.toMatchObject({
      errorName: "invented_next_year",
    });
  });

  it("still maps by status when the error body is undecodable", async () => {
    const { client } = makeClient({ status: 500, body: "<html>oops</html>" });

    await expect(client.emails.send(MINIMAL)).rejects.toBeInstanceOf(ServerError);
  });

  it("turns a transport failure into a ConnectionError", async () => {
    const client = new Mailkube({
      apiKey: "mk_test",
      fetch: () => Promise.reject(new Error("boom")),
    });

    await expect(client.emails.send(MINIMAL)).rejects.toBeInstanceOf(ConnectionError);
  });

  it("treats a success body without an id as an SDK error, not an API error", async () => {
    const { client } = makeClient({ body: { unexpected: true } });

    const error: unknown = await client.emails.send(MINIMAL).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailkubeError);
    expect(error).not.toBeInstanceOf(ApiError);
  });
});

describe("malformed 2xx bodies", () => {
  // A success whose body is not a JSON object must surface as an SDK error. Decoding it anyway
  // fabricates a model out of the readers' defaults and hands the caller identifiers that never
  // existed — the worst possible failure, because nothing throws until much later.
  it.each([
    ["a bare string", '"just text"'],
    ["an array", "[1, 2, 3]"],
    ["a gateway's HTML", "<html>ok?</html>"],
    ["a JSON null", "null"],
  ])("rejects a 200 whose body is %s", async (_label, body) => {
    const { client } = makeClient({ body });

    const error: unknown = await client.emails.send(MINIMAL).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailkubeError);
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it("rejects on the generic decode path too, not only on send", async () => {
    // `cancel` decodes through readers that all have defaults, so nothing downstream would have
    // complained: this is exactly the path that would have invented an empty model.
    const { client } = makeClient({ body: "[1, 2, 3]" });

    await expect(client.scheduledEmails.cancel("sch_1")).rejects.toBeInstanceOf(MailkubeError);
  });

  it("still accepts an empty body, which is a legitimate acknowledgement", async () => {
    const { client } = makeClient({ body: "" });

    await expect(client.scheduledEmails.batches.cancel("batch-1")).resolves.toMatchObject({
      canceledCount: 0,
    });
  });
});

describe("client construction", () => {
  it("applies the configured timeout to the request, not merely to the config object", async () => {
    // Guards against the timeout going dead: it is read from `Config` and must reach `fetch` as a
    // signal. If it stops doing so, the stub below never settles and this test fails.
    let observed: AbortSignal | null | undefined;
    const client = new Mailkube({
      apiKey: "mk_test",
      timeoutMs: 5,
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          observed = init?.signal;
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    });

    await expect(client.emails.send(MINIMAL)).rejects.toBeInstanceOf(ConnectionError);
    expect(observed?.aborted).toBe(true);
  });

  it("names the fix when the runtime has no fetch at all", () => {
    // Without the guard this surfaces far later as a bare TypeError from inside the transport,
    // mapped to ConnectionError as though the network had failed.
    const original = Object.getOwnPropertyDescriptor(globalThis, "fetch");
    Reflect.deleteProperty(globalThis, "fetch");
    try {
      expect(() => new Mailkube({ apiKey: "mk_test" })).toThrow(MailkubeError);
      expect(() => new Mailkube({ apiKey: "mk_test" })).toThrow(/No fetch implementation/);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, "fetch", original);
      }
    }
  });
});
