/**
 * Byte and text encoding, on primitives every target runtime provides.
 *
 * Part of the runtime layer: the only place in `src/` allowed to name a host global. `Buffer` is
 * deliberately absent — it does not exist on Cloudflare Workers without `nodejs_compat`, nor in
 * Deno — so `btoa` and `TextEncoder` do the work instead. Both are present on Node 20+, workerd,
 * Deno and Bun.
 */

/**
 * How many bytes are turned into characters per `String.fromCharCode` call.
 *
 * Spreading a whole attachment into one call overflows the call stack somewhere in the low
 * hundreds of thousands of arguments, so the array is walked in slices. The slice size does not
 * affect the output: `btoa` still sees one complete string, so no base64 padding lands mid-stream.
 */
const CHUNK_SIZE = 0x2000;

const HEX_PATTERN = /^[0-9a-fA-F]*$/;

/**
 * Encode text as UTF-8 bytes.
 * @param text - The text to encode.
 * @returns The UTF-8 bytes.
 */
export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Decode UTF-8 bytes as text.
 * @param bytes - The bytes to decode.
 * @returns The text.
 */
export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Coerce a payload that may already be bytes into bytes, without re-serializing.
 *
 * Webhook verification runs over the **raw received bytes**, so a caller holding a `Buffer` (which
 * is a `Uint8Array`) must be able to hand it over untouched. Decoding it to text and re-encoding
 * would round-trip through UTF-8 and can change what gets signed.
 * @param payload - Raw bytes, or text to encode as UTF-8.
 * @returns The bytes.
 */
export function toBytes(payload: string | Uint8Array): Uint8Array {
  return typeof payload === "string" ? encodeUtf8(payload) : payload;
}

/**
 * Join byte arrays end to end.
 * @param parts - The arrays to join, in order.
 * @returns One array holding every part.
 */
export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

/**
 * Base64-encode bytes.
 * @param bytes - The bytes to encode.
 * @returns The base64 text.
 */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
  }
  return btoa(binary);
}

/**
 * Decode hex text into bytes, rejecting anything that is not hex.
 *
 * Malformed input returns undefined rather than a best-effort decode. `parseInt` yields `NaN` for
 * a non-hex pair and a `Uint8Array` silently stores that as `0`, which would turn a garbage
 * signature into a well-formed all-zero one.
 * @param hex - The hex text, without any prefix.
 * @returns The bytes, or undefined when the input is not valid hex.
 */
export function decodeHex(hex: string): Uint8Array | undefined {
  if (hex.length % 2 !== 0 || !HEX_PATTERN.test(hex)) {
    return undefined;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
