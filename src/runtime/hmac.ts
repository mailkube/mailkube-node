/**
 * HMAC-SHA256 verification on WebCrypto.
 *
 * Part of the runtime layer: the only place in `src/` allowed to name a host global. `node:crypto`
 * is deliberately absent — a static import of it makes the whole package unbundleable for
 * Cloudflare Workers, Deno and every bundler — so `crypto.subtle` does the work instead. It is
 * present on Node 20+, workerd, Deno and Bun.
 *
 * **The comparison is done here rather than by `crypto.subtle.verify`, on purpose.** `verify`
 * looks like the obvious call and is not safe for this: the W3C WebCrypto specification places no
 * timing requirement on it, and Node's implementation compared with plain `memcmp` in
 * `crypto_hmac.cc` until CVE-2026-21713 was fixed in 20.20.2 / 22.22.2 / 24.14.1 / 25.8.2 — inside
 * the range this package's `engines` floor supports. workerd, Deno and Bun document no guarantee
 * either. Delegating would therefore reintroduce the timing oracle that `.rules/SDK_CONTRACT.md`
 * ("Compare in constant time") exists to prevent, on a signature check that is the entire security
 * boundary of webhook delivery.
 */
import { encodeUtf8 } from "./encoding.js";

const ALGORITHM = { name: "HMAC", hash: "SHA-256" } as const;

/**
 * Compare two byte arrays in time independent of how far they match.
 *
 * Branchless by construction: every byte of `a` is always read and folded into the accumulator, so
 * there is no early return for an attacker to time. The length difference is folded in the same
 * way, which also makes a short or long candidate fail without a separate check.
 * @param a - The expected bytes.
 * @param b - The candidate bytes.
 * @returns True when both arrays are identical.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) {
    difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return difference === 0;
}

/**
 * Check an HMAC-SHA256 signature over a message.
 * @param secret - The signing secret, used verbatim as UTF-8 bytes.
 * @param message - The exact bytes that were signed.
 * @param signature - The candidate signature bytes.
 * @returns True when the signature is valid for this message and secret.
 */
export async function verifyHmacSha256(
  secret: string,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", encodeUtf8(secret), ALGORITHM, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign(ALGORITHM.name, key, message));
  return timingSafeEqual(expected, signature);
}
