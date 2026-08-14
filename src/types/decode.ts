/**
 * Reading server payloads into models.
 *
 * Models are camelCase and the wire is snake_case, so every response needs an explicit mapping.
 * This module holds the primitives those mappings are built from; each model then owns one small
 * `Decoder` beside its interface.
 *
 * **A generic snake-to-camel converter is deliberately rejected.** It would invent fields no model
 * declares, mangle wire keys like `from` and `object`, and silently produce a shape the types claim
 * is impossible. Explicit decoders cost a few lines each and make the wire contract readable.
 *
 * **Every reader has a default.** The API omits a field rather than sending null — pagination
 * steps at the ends of the range, `total_count` on some responses — so a reader that threw on
 * absence would fail on a legitimate last page, which is exactly where a listing terminates.
 */
import { MailkubeError } from "../errors.js";

/** A pure function from a decoded JSON payload to a model. */
export type Decoder<T> = (payload: unknown) => T;

/**
 * Coerce an unknown payload to a readable object.
 *
 * Anything that is not an object reads as empty, so a malformed body yields a model built entirely
 * from defaults rather than a crash halfway through decoding.
 * @param payload - The decoded JSON.
 * @returns The payload as a record, or an empty one.
 */
export function record(payload: unknown): Record<string, unknown> {
  return typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}

/**
 * Read a field as text.
 * @param source - The payload being read.
 * @param key - The wire field name.
 * @returns The value as text, or undefined when absent, null or not a scalar.
 */
export function text(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

/**
 * Read a field as text, falling back when it is absent.
 * @param source - The payload being read.
 * @param key - The wire field name.
 * @param fallback - The value to use when the field is absent.
 * @returns The value, or the fallback.
 */
export function textOr(source: Record<string, unknown>, key: string, fallback: string): string {
  return text(source, key) ?? fallback;
}

/**
 * Read a field that the response is meaningless without.
 * @param source - The payload being read.
 * @param key - The wire field name.
 * @returns The value.
 * @throws {MailkubeError} When the field is absent: a 2xx body of the wrong shape is an SDK-level
 *   failure, not an API error, so it must not masquerade as one.
 */
export function requiredText(source: Record<string, unknown>, key: string): string {
  const value = text(source, key);
  if (value === undefined) {
    throw new MailkubeError(`Expected a '${key}' in the response body.`);
  }
  return value;
}

/**
 * Read a field as a whole number.
 * @param source - The payload being read.
 * @param key - The wire field name.
 * @param fallback - The value to use when the field is absent or not numeric.
 * @returns The value, or the fallback.
 */
export function intOr(source: Record<string, unknown>, key: string, fallback: number): number {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Read a field as a boolean.
 * @param source - The payload being read.
 * @param key - The wire field name.
 * @param fallback - The value to use when the field is absent or not a boolean.
 * @returns The value, or the fallback.
 */
export function boolOr(source: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = source[key];
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Read a field as a list of strings.
 * @param source - The payload being read.
 * @param key - The wire field name.
 * @returns The strings; empty when the field is absent, null or not an array.
 */
export function textList(source: Record<string, unknown>, key: string): string[] {
  const value = source[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * Read a field as a list, decoding each item.
 * @param source - The payload being read.
 * @param key - The wire field name.
 * @param decode - The decoder for one item.
 * @returns The decoded items; empty when the field is absent or not an array.
 */
export function listOf<T>(source: Record<string, unknown>, key: string, decode: Decoder<T>): T[] {
  const value = source[key];
  return Array.isArray(value) ? value.map((item: unknown) => decode(item)) : [];
}

/**
 * Read a nested object, decoding it.
 *
 * An absent nested object decodes as if it were empty, so its own defaults apply.
 * @param source - The payload being read.
 * @param key - The wire field name.
 * @param decode - The decoder for the nested object.
 * @returns The decoded object.
 */
export function nested<T>(source: Record<string, unknown>, key: string, decode: Decoder<T>): T {
  return decode(source[key]);
}
