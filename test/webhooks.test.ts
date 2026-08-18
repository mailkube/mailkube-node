import { describe, expect, it } from "vitest";

import { SignatureVerificationError } from "../src/errors.js";
import { sign, verify, verifySignature } from "../src/webhooks.js";

const SECRET = "whsec_test";
const BODY = '{"type":"email.sent","data":{"id":"abc123"}}';

/**
 * Build correctly-signed headers for the canonical body.
 *
 * Deliberately uses the SDK's own `sign` rather than a hand-rolled HMAC. A reimplementation here
 * would agree with this test's reading of the spec rather than with the code under test, so the
 * two could drift and both stay green. That is exactly why `sign` is public.
 * @param at - Optional timestamp override, in milliseconds.
 * @returns The signature headers.
 */
async function headersFor(at?: number): Promise<Record<string, string>> {
  const timestamp = new Date(at ?? Date.now()).toISOString();
  return {
    "X-Webhook-Id": "wh_1",
    "X-Webhook-Ts": timestamp,
    "X-Webhook-Sig": await sign("wh_1", timestamp, BODY, SECRET),
  };
}

describe("verifySignature", () => {
  it("returns the raw body for a valid signature", async () => {
    await expect(verifySignature(BODY, await headersFor(), SECRET)).resolves.toBe(BODY);
  });

  it("verifies raw bytes, which is what a real handler holds", async () => {
    // express.raw(), an n8n/Node-RED raw body and request.arrayBuffer() all hand over bytes. The
    // same body must verify either way, and the bytes must come back untouched.
    const bytes = new TextEncoder().encode(BODY);

    await expect(verifySignature(bytes, await headersFor(), SECRET)).resolves.toBe(bytes);
  });

  it("accepts a signature without the sha256 prefix", async () => {
    const headers = await headersFor();
    headers["X-Webhook-Sig"] = headers["X-Webhook-Sig"]?.replace("sha256=", "") ?? "";

    await expect(verifySignature(BODY, headers, SECRET)).resolves.toBe(BODY);
  });

  it("matches headers case-insensitively", async () => {
    const headers = Object.fromEntries(
      Object.entries(await headersFor()).map(([key, value]) => [key.toLowerCase(), value]),
    );

    await expect(verifySignature(BODY, headers, SECRET)).resolves.toBe(BODY);
  });

  it("accepts a Headers instance", async () => {
    await expect(verifySignature(BODY, new Headers(await headersFor()), SECRET)).resolves.toBe(
      BODY,
    );
  });

  it("rejects a tampered body", async () => {
    await expect(
      verifySignature('{"type":"email.bounced"}', await headersFor(), SECRET),
    ).rejects.toThrow(SignatureVerificationError);
  });

  it("rejects a wrong secret", async () => {
    await expect(verifySignature(BODY, await headersFor(), "whsec_other")).rejects.toThrow(
      SignatureVerificationError,
    );
  });

  it.each([
    ["not hex at all", "sha256=zzzz"],
    ["an odd-length digest", "sha256=abc"],
    ["a truncated digest", "sha256=abcd"],
  ])("rejects %s without decoding it to zero bytes", async (_case, value) => {
    const headers = await headersFor();
    headers["X-Webhook-Sig"] = value;

    await expect(verifySignature(BODY, headers, SECRET)).rejects.toThrow(
      SignatureVerificationError,
    );
  });

  it.each(["X-Webhook-Id", "X-Webhook-Ts", "X-Webhook-Sig"])(
    "rejects a missing %s",
    async (missing) => {
      const headers = await headersFor();
      delete headers[missing];

      await expect(verifySignature(BODY, headers, SECRET)).rejects.toThrow(/Missing required/);
    },
  );

  it("rejects a stale timestamp", async () => {
    await expect(
      verifySignature(BODY, await headersFor(Date.now() - 3_600_000), SECRET),
    ).rejects.toThrow(/freshness window/);
  });

  it("accepts a stale timestamp when the tolerance allows it", async () => {
    const hourAgo = await headersFor(Date.now() - 3_600_000);

    await expect(verifySignature(BODY, hourAgo, SECRET, 7_200)).resolves.toBe(BODY);
  });

  it("rejects a malformed timestamp", async () => {
    const headers = await headersFor();
    headers["X-Webhook-Ts"] = "not-a-date";

    await expect(verifySignature(BODY, headers, SECRET)).rejects.toThrow(/Malformed/);
  });
});

describe("sign", () => {
  it("produces a value verifySignature accepts", async () => {
    const timestamp = new Date().toISOString();
    const signature = await sign("wh_2", timestamp, BODY, SECRET);

    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    await expect(
      verifySignature(
        BODY,
        { "X-Webhook-Id": "wh_2", "X-Webhook-Ts": timestamp, "X-Webhook-Sig": signature },
        SECRET,
      ),
    ).resolves.toBe(BODY);
  });

  it("signs bytes and text to the same value", async () => {
    // The signed input is the raw body, so a caller holding bytes must get what a caller holding
    // the equivalent text gets — otherwise a handler that verifies bytes could never be given a
    // signature produced from the string form.
    const timestamp = new Date().toISOString();

    await expect(sign("wh_3", timestamp, new TextEncoder().encode(BODY), SECRET)).resolves.toBe(
      await sign("wh_3", timestamp, BODY, SECRET),
    );
  });
});

describe("verify", () => {
  it("verifies and parses in one call", async () => {
    const event = await verify(BODY, await headersFor(), SECRET);

    expect(event.type).toBe("email.sent");
  });

  it("accepts bytes, as an express.raw() or Worker handler supplies them", async () => {
    const event = await verify(new TextEncoder().encode(BODY), await headersFor(), SECRET);

    expect(event.type).toBe("email.sent");
  });

  it("honours a custom tolerance", async () => {
    const event = await verify(BODY, await headersFor(Date.now() - 3_600_000), SECRET, 7_200);

    expect(event.type).toBe("email.sent");
  });

  it("does not parse a body whose signature failed", async () => {
    await expect(verify(BODY, await headersFor(), "whsec_other")).rejects.toBeInstanceOf(
      SignatureVerificationError,
    );
  });
});
