/**
 * Verify inbound webhooks.
 *
 * Verification is a pure HMAC check over the raw request bytes: no HTTP, no client instance, so
 * you call it directly inside your webhook handler.
 *
 * Signature scheme: the signed input is `"{id}.{timestamp}."` followed by the **raw body**,
 * HMAC-SHA256 keyed by the endpoint's signing secret, hex-encoded, and sent as
 * `X-Webhook-Sig: sha256=<hex>`. `X-Webhook-Ts` is an ISO-8601 timestamp checked for freshness;
 * `X-Webhook-Id` is stable across retries, so use it to deduplicate.
 *
 * **Verification is async**, because the underlying primitive is: `crypto.subtle` is the only
 * digest API present on Node, Cloudflare Workers, Deno and Bun alike, and it is promise-based.
 * There is no synchronous twin — one that existed would have to be Node-only, which is the
 * portability problem this package exists to avoid.
 *
 * Reach for `verify` unless you have a reason not to: it is `verifySignature` followed by
 * `parseEvent`, which is what a handler wants.
 */
import { MailkubeError, SignatureVerificationError } from "./errors.js";
import { concatBytes, decodeHex, decodeUtf8, encodeUtf8, toBytes } from "./runtime/encoding.js";
import { verifyHmacSha256 } from "./runtime/hmac.js";
import { decodeWebhookEvent, type WebhookEvent } from "./types/events.js";

const SIGNATURE_PREFIX = "sha256=";
const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Case-insensitive header lookup across a plain object or a `Headers`.
 * @param headers - The request headers.
 * @param name - The lowercase header name to find.
 * @returns The value, or undefined.
 */
function header(headers: Headers | Record<string, string>, name: string): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) {
      return value;
    }
  }
  return undefined;
}

/**
 * Throw if the ISO-8601 timestamp is outside the tolerance window.
 * @param timestamp - The `X-Webhook-Ts` value.
 * @param toleranceSeconds - The allowed clock skew.
 */
function checkFreshness(timestamp: string, toleranceSeconds: number): void {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    throw new SignatureVerificationError("Malformed X-Webhook-Ts timestamp.");
  }
  if (Math.abs(Date.now() - parsed) / 1000 > toleranceSeconds) {
    throw new SignatureVerificationError("Webhook timestamp is outside the freshness window.");
  }
}

/**
 * Verify a webhook's signature and timestamp freshness over the raw body.
 *
 * Verify against the **raw received bytes**. Never parse then re-serialize, or the signature will
 * not match. Bytes are accepted as well as text because that is what a real handler holds:
 * `express.raw()`, an n8n or Node-RED raw body, and `new Uint8Array(await request.arrayBuffer())`
 * all hand you bytes, and decoding them to text just to re-encode them here would be a round trip
 * through UTF-8 that can change what gets verified.
 * @param payload - The raw request body, as received.
 * @param headers - The request headers.
 * @param secret - The endpoint's signing secret.
 * @param toleranceSeconds - Maximum allowed clock skew, in seconds.
 * @returns The verified body, exactly as it was passed in.
 */
export async function verifySignature<T extends string | Uint8Array>(
  payload: T,
  headers: Headers | Record<string, string>,
  secret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): Promise<T> {
  const id = header(headers, "x-webhook-id");
  const timestamp = header(headers, "x-webhook-ts");
  const signature = header(headers, "x-webhook-sig");
  if (id === undefined || timestamp === undefined || signature === undefined) {
    throw new SignatureVerificationError("Missing required webhook signature headers.");
  }

  checkFreshness(timestamp, toleranceSeconds);

  const provided = decodeHex(
    signature.startsWith(SIGNATURE_PREFIX) ? signature.slice(SIGNATURE_PREFIX.length) : signature,
  );
  const message = concatBytes(encodeUtf8(`${id}.${timestamp}.`), toBytes(payload));
  // A malformed signature reports the same failure as a wrong one: the caller's next step is
  // identical, and one message means one branch to get right.
  if (provided === undefined || !(await verifyHmacSha256(secret, message, provided))) {
    throw new SignatureVerificationError("Webhook signature mismatch.");
  }

  return payload;
}

/**
 * Parse a raw webhook body into a typed event.
 *
 * An unrecognized event `type` is returned as an `UnknownEvent` rather than throwing, so new
 * server-side event types never break a receiver. Every event also carries the verbatim payload on
 * `raw`, so nothing this SDK version cannot name is lost.
 *
 * This does **not** verify the signature. Use `verify` unless you have already verified.
 * @param payload - The raw request body.
 * @returns The parsed event.
 * @throws {MailkubeError} When the body is not valid JSON.
 */
export function parseEvent(payload: string | Uint8Array): WebhookEvent {
  const source = typeof payload === "string" ? payload : decodeUtf8(payload);
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (cause) {
    throw new MailkubeError("Webhook payload is not valid JSON.", { cause });
  }
  return decodeWebhookEvent(parsed);
}

/**
 * Verify a webhook's signature and return the parsed event.
 *
 * The combinator a handler actually wants: `verifySignature` followed by `parseEvent`.
 * @param payload - The raw request body, as received.
 * @param headers - The request headers.
 * @param secret - The endpoint's signing secret.
 * @param toleranceSeconds - Maximum allowed clock skew, in seconds.
 * @returns The verified, parsed event.
 */
export async function verify(
  payload: string | Uint8Array,
  headers: Headers | Record<string, string>,
  secret: string,
  toleranceSeconds?: number,
): Promise<WebhookEvent> {
  return parseEvent(await verifySignature(payload, headers, secret, toleranceSeconds));
}
