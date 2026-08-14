import { afterEach, describe, expect, it, vi } from "vitest";

import { Mailkube } from "../src/client.js";
import { disableLogging, enableLogging, redactHeaders, type Logger } from "../src/logging.js";
import { stubFetch } from "./helpers.js";

const MINIMAL = { from: "a@x.com", to: "b@y.com", subject: "Hi" };

/**
 * Build a logger that records what it was told.
 * @returns The logger and its entries.
 */
function recordingLogger(): { logger: Logger; entries: { message: string; fields?: unknown }[] } {
  const entries: { message: string; fields?: unknown }[] = [];
  return {
    logger: {
      debug(message, fields) {
        entries.push({ message, fields });
      },
    },
    entries,
  };
}

afterEach(() => {
  disableLogging();
  delete process.env["MAILKUBE_LOG"];
  vi.restoreAllMocks();
});

describe("logging", () => {
  it("is silent until asked", async () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const stub = stubFetch();
    await new Mailkube({ apiKey: "mk_test", fetch: stub.fetch }).emails.send(MINIMAL);

    expect(spy).not.toHaveBeenCalled();
  });

  it("writes the request and the response when a logger is injected", async () => {
    const { logger, entries } = recordingLogger();
    const stub = stubFetch({ headers: { "X-Request-Id": "req_42" } });

    await new Mailkube({ apiKey: "mk_test", fetch: stub.fetch, logger }).emails.send(MINIMAL);

    expect(entries.map((entry) => entry.message)).toEqual(["request", "response"]);
    expect(entries[0]?.fields).toMatchObject({
      method: "POST",
      url: "https://api.mailkube.com/mta/v1/emails",
    });
    expect(entries[1]?.fields).toMatchObject({ status: 200, requestId: "req_42" });
  });

  it("never logs the body, which carries recipients and subjects", async () => {
    const { logger, entries } = recordingLogger();
    const stub = stubFetch();

    await new Mailkube({ apiKey: "mk_test", fetch: stub.fetch, logger }).emails.send({
      ...MINIMAL,
      html: "<p>secret</p>",
    });

    expect(JSON.stringify(entries)).not.toContain("secret");
    expect(JSON.stringify(entries)).not.toContain("b@y.com");
  });

  it("masks the credential and the idempotency key", async () => {
    const { logger, entries } = recordingLogger();
    const stub = stubFetch();

    await new Mailkube({ apiKey: "mk_secret", fetch: stub.fetch, logger }).emails.send({
      ...MINIMAL,
      idempotencyKey: "key-1",
    });

    const headers = (entries[0]?.fields as { headers: Record<string, string> }).headers;
    expect(headers["Authorization"]).toBe("***");
    expect(headers["Idempotency-Key"]).toBe("***");
    expect(headers["User-Agent"]).toMatch(/^mailkube-node\//);
    expect(JSON.stringify(entries)).not.toContain("mk_secret");
  });

  it("can be turned on process-wide, and off again", async () => {
    const { logger, entries } = recordingLogger();
    enableLogging(logger);
    const stub = stubFetch();

    await new Mailkube({ apiKey: "mk_test", fetch: stub.fetch }).emails.send(MINIMAL);
    expect(entries).toHaveLength(2);

    disableLogging();
    await new Mailkube({ apiKey: "mk_test", fetch: stub.fetch }).emails.send(MINIMAL);
    expect(entries).toHaveLength(2);
  });

  it("treats MAILKUBE_LOG as a level, so a selective one silences the SDK", async () => {
    // Consistent with every other mailkube SDK: the variable holds a level, not a flag. This SDK
    // only emits debug records, so MAILKUBE_LOG=warning is a working way to say "not from the SDK".
    const spy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    process.env["MAILKUBE_LOG"] = "warning";
    const stub = stubFetch();

    await new Mailkube({ apiKey: "mk_test", fetch: stub.fetch }).emails.send(MINIMAL);

    expect(spy).not.toHaveBeenCalled();
  });

  it("honours MAILKUBE_LOG, read lazily rather than at import", async () => {
    // Lazy matters: a module-scope read is an import side effect, and on a Worker it would run
    // before there is an environment to read at all.
    const spy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    process.env["MAILKUBE_LOG"] = "debug";
    const stub = stubFetch();

    await new Mailkube({ apiKey: "mk_test", fetch: stub.fetch }).emails.send(MINIMAL);

    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0]?.[0]).toBe("mailkube request");
  });

  it("prefers an injected logger over the process-wide one", async () => {
    const wide = recordingLogger();
    const injected = recordingLogger();
    enableLogging(wide.logger);
    const stub = stubFetch();

    await new Mailkube({
      apiKey: "mk_test",
      fetch: stub.fetch,
      logger: injected.logger,
    }).emails.send(MINIMAL);

    expect(injected.entries).toHaveLength(2);
    expect(wide.entries).toHaveLength(0);
  });
});

describe("redactHeaders", () => {
  it("masks secrets case-insensitively and leaves everything else alone", () => {
    expect(
      redactHeaders({
        authorization: "Bearer x",
        "IDEMPOTENCY-KEY": "k",
        Accept: "application/json",
      }),
    ).toEqual({ authorization: "***", "IDEMPOTENCY-KEY": "***", Accept: "application/json" });
  });
});
