import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { SignatureVerificationError } from "../src/errors.js";
import { verify, verifySignature } from "../src/webhooks.js";

const SECRET = "whsec_test";
const BODY = '{"type":"email.sent","data":{"id":"abc123"}}';

/**
 * Build correctly-signed headers for the canonical body.
 * @param at - Optional timestamp override, in milliseconds.
 * @returns The signature headers.
 */
function sign(at?: number): Record<string, string> {
  const timestamp = new Date(at ?? Date.now()).toISOString();
  const digest = createHmac("sha256", SECRET).update(`wh_1.${timestamp}.${BODY}`).digest("hex");
  return {
    "X-Webhook-Id": "wh_1",
    "X-Webhook-Ts": timestamp,
    "X-Webhook-Sig": `sha256=${digest}`,
  };
}

describe("verifySignature", () => {
  it("returns the raw body for a valid signature", async () => {
    await expect(verifySignature(BODY, sign(), SECRET)).resolves.toBe(BODY);
  });

  it("verifies raw bytes, which is what a real handler holds", async () => {
    // express.raw(), an n8n/Node-RED raw body and request.arrayBuffer() all hand over bytes. The
    // same body must verify either way, and the bytes must come back untouched.
    const bytes = new TextEncoder().encode(BODY);

    await expect(verifySignature(bytes, sign(), SECRET)).resolves.toBe(bytes);
  });

  it("accepts a signature without the sha256 prefix", async () => {
    const headers = sign();
    headers["X-Webhook-Sig"] = headers["X-Webhook-Sig"]?.replace("sha256=", "") ?? "";

    await expect(verifySignature(BODY, headers, SECRET)).resolves.toBe(BODY);
  });

  it("matches headers case-insensitively", async () => {
    const headers = Object.fromEntries(
      Object.entries(sign()).map(([key, value]) => [key.toLowerCase(), value]),
    );

    await expect(verifySignature(BODY, headers, SECRET)).resolves.toBe(BODY);
  });

  it("accepts a Headers instance", async () => {
    await expect(verifySignature(BODY, new Headers(sign()), SECRET)).resolves.toBe(BODY);
  });

  it("rejects a tampered body", async () => {
    await expect(verifySignature('{"type":"email.bounced"}', sign(), SECRET)).rejects.toThrow(
      SignatureVerificationError,
    );
  });

  it("rejects a wrong secret", async () => {
    await expect(verifySignature(BODY, sign(), "whsec_other")).rejects.toThrow(
      SignatureVerificationError,
    );
  });

  it.each([
    ["not hex at all", "sha256=zzzz"],
    ["an odd-length digest", "sha256=abc"],
    ["a truncated digest", "sha256=abcd"],
  ])("rejects %s without decoding it to zero bytes", async (_case, value) => {
    const headers = sign();
    headers["X-Webhook-Sig"] = value;

    await expect(verifySignature(BODY, headers, SECRET)).rejects.toThrow(
      SignatureVerificationError,
    );
  });

  it.each(["X-Webhook-Id", "X-Webhook-Ts", "X-Webhook-Sig"])(
    "rejects a missing %s",
    async (missing) => {
      const headers = sign();
      delete headers[missing];

      await expect(verifySignature(BODY, headers, SECRET)).rejects.toThrow(/Missing required/);
    },
  );

  it("rejects a stale timestamp", async () => {
    await expect(verifySignature(BODY, sign(Date.now() - 3_600_000), SECRET)).rejects.toThrow(
      /freshness window/,
    );
  });

  it("accepts a stale timestamp when the tolerance allows it", async () => {
    const hourAgo = sign(Date.now() - 3_600_000);

    await expect(verifySignature(BODY, hourAgo, SECRET, 7_200)).resolves.toBe(BODY);
  });

  it("rejects a malformed timestamp", async () => {
    const headers = sign();
    headers["X-Webhook-Ts"] = "not-a-date";

    await expect(verifySignature(BODY, headers, SECRET)).rejects.toThrow(/Malformed/);
  });
});

describe("verify", () => {
  it("verifies and parses in one call", async () => {
    const event = await verify(BODY, sign(), SECRET);

    expect(event.type).toBe("email.sent");
  });

  it("accepts bytes, as an express.raw() or Worker handler supplies them", async () => {
    const event = await verify(new TextEncoder().encode(BODY), sign(), SECRET);

    expect(event.type).toBe("email.sent");
  });

  it("honours a custom tolerance", async () => {
    const event = await verify(BODY, sign(Date.now() - 3_600_000), SECRET, 7_200);

    expect(event.type).toBe("email.sent");
  });

  it("does not parse a body whose signature failed", async () => {
    await expect(verify(BODY, sign(), "whsec_other")).rejects.toBeInstanceOf(
      SignatureVerificationError,
    );
  });
});
