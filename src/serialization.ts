/**
 * Rendering values for the wire.
 *
 * One home for every "how does this value become JSON or a query string" decision, shared by every
 * resource's request builders. Nothing here validates: an offset-less or past instant is rejected
 * by the server, which is the authority on what a value means. These functions only make values
 * transmissible.
 */
import { encodeBase64 } from "./runtime/encoding.js";
import type { Attachment } from "./types/params.js";

/**
 * Render an instant for the wire, passing an already-formatted string through.
 * @param value - A `Date` or an ISO-8601 string.
 * @returns The ISO-8601 rendering.
 */
export function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Render one query-string parameter.
 *
 * A list becomes a comma-separated value rather than a repeated parameter. The API accepts both
 * (`?status=a&status=b` and `?status=a,b`), and a flat `Record<string, string>` keeps the
 * transport seam simple in every SDK that mirrors this design.
 * @param value - The parameter value: a scalar, a `Date`, or a list of either.
 * @returns The parameter's string form.
 */
export function queryValue(value: string | number | Date | (string | Date)[]): string {
  if (Array.isArray(value)) {
    return value.map((item) => toIso(item)).join(",");
  }
  return typeof value === "number" ? String(value) : toIso(value);
}

/**
 * Base64-encode raw attachment bytes; an already-encoded string passes through.
 * @param attachments - The attachments as supplied by the caller.
 * @returns JSON-serializable attachment objects.
 */
export function encodeAttachments(attachments: Attachment[]): Record<string, unknown>[] {
  return attachments.map((item) => ({
    filename: item.filename,
    content: typeof item.content === "string" ? item.content : encodeBase64(item.content),
    ...(item.contentType === undefined ? {} : { content_type: item.contentType }),
  }));
}
