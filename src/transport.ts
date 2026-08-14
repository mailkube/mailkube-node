/**
 * The transport seam, and the one place this SDK performs I/O.
 *
 * Resources depend on the narrow interfaces declared here rather than on `fetch` or on a concrete
 * client, so they can be driven by a test double and stay ignorant of HTTP entirely.
 *
 * There is deliberately **one interface per capability** rather than one wide one. A resource that
 * only sends must not acquire a dependency on every other verb. A new capability adds an
 * interface; it never widens an existing one.
 */
import type { Config } from "./config.js";
import { ConnectionError, MailkubeError, apiErrorFor } from "./errors.js";
import { redactHeaders, type Logger } from "./logging.js";
import { decodeEmail, type Decoder, type Email } from "./types/index.js";
import { record, text } from "./types/decode.js";

/** A fully-built request, ready to send. */
export interface RequestSpec {
  /** Path relative to the base URL, or an absolute URL the API itself issued. */
  path: string;
  /** The HTTP method. */
  method?: string;
  /** The JSON request body. */
  body?: Record<string, unknown>;
  /** Query-string parameters, already rendered to strings. */
  params?: Record<string, string>;
  /** Per-request headers, merged over the client defaults. */
  headers?: Record<string, string>;
  /**
   * A caller's cancellation signal, merged with the client's timeout.
   *
   * Cancellation and the timeout are different concerns that happen to share a mechanism: the
   * timeout is client-wide configuration, this is per call. A serverless handler being torn down
   * needs the second one.
   */
  signal?: AbortSignal;
}

/** A transport capable of sending an email. */
export interface SendTransport {
  /**
   * Perform the request described by the spec and build the accepted-send result.
   * @param spec - The request to perform.
   */
  sendEmail(spec: RequestSpec): Promise<Email>;
}

/** A transport capable of performing an arbitrary request and decoding its body. */
export interface TypedTransport {
  /**
   * Perform the request described by the spec and decode the response body.
   * @param spec - The request to perform.
   * @param decode - How to turn the decoded JSON into a model.
   */
  request<T>(spec: RequestSpec, decode: Decoder<T>): Promise<T>;
}

/** Performs one HTTP round trip and turns the result into a model or a mapped error. */
export class HttpTransport implements SendTransport, TypedTransport {
  readonly #config: Config;
  readonly #fetch: typeof globalThis.fetch;
  readonly #logger: Logger;

  /**
   * Bind the transport to its configuration, the fetch implementation it drives, and its logger.
   * @param config - The resolved client configuration.
   * @param fetchImpl - The fetch implementation (injected, or the global one).
   * @param logger - Where to write debug output; silent by default.
   */
  constructor(config: Config, fetchImpl: typeof globalThis.fetch, logger: Logger) {
    this.#config = config;
    this.#fetch = fetchImpl;
    this.#logger = logger;
  }

  /** @inheritdoc */
  async sendEmail(spec: RequestSpec): Promise<Email> {
    // The odd verb out: its model draws on a response header as well as the body, so it cannot go
    // through the payload-only `Decoder` seam the other verbs share.
    const { payload, headers } = await this.#request(spec);
    return decodeEmail(payload, headers);
  }

  /** @inheritdoc */
  async request<T>(spec: RequestSpec, decode: Decoder<T>): Promise<T> {
    const { payload } = await this.#request(spec);
    return decode(payload);
  }

  /**
   * Perform the round trip, mapping any non-2xx status to the matching error.
   *
   * This is the single place a non-2xx status becomes an error, so every verb, present and
   * future, reports failures identically.
   * @param spec - The request to perform.
   * @returns The decoded 2xx body plus the response metadata.
   */
  async #request(spec: RequestSpec): Promise<{ payload: unknown; headers: Headers }> {
    const response = await this.#roundTrip(spec);
    const payload = await decode(response);
    if (!response.ok) {
      // A failure's body is best-effort by nature — a gateway can answer HTML — so an
      // undecodable one still maps to the API error the status describes.
      throw errorFor(response, payload ?? {});
    }
    if (payload === undefined) {
      // A success whose body is not a JSON object is an SDK-level failure, not an API error.
      // Decoding it anyway would fabricate a model out of defaults and hand the caller an
      // `id: ""` that never existed.
      throw new MailkubeError(
        `Expected a JSON object in the ${String(response.status)} response body.`,
      );
    }
    return { payload, headers: response.headers };
  }

  /**
   * Perform the round trip, translating a transport failure into a ConnectionError.
   * @param spec - The request to perform.
   * @returns The raw response.
   */
  async #roundTrip(spec: RequestSpec): Promise<Response> {
    // Whichever fires first wins, so a caller's signal cannot extend the client's timeout and the
    // timeout cannot outlive a canceled call.
    const timeout = AbortSignal.timeout(this.#config.timeoutMs);
    const headers = { ...this.#config.defaultHeaders(), ...spec.headers };
    const init: RequestInit = {
      method: spec.method ?? "POST",
      headers,
      signal: spec.signal === undefined ? timeout : AbortSignal.any([spec.signal, timeout]),
    };
    if (spec.body !== undefined) {
      init.body = JSON.stringify(spec.body);
    }

    const url = this.#url(spec);
    // Method, URL and redacted headers only. The body carries recipient addresses and subjects,
    // so it is never logged.
    this.#logger.debug("request", { method: init.method, url, headers: redactHeaders(headers) });

    try {
      const response = await this.#fetch(url, init);
      this.#logger.debug("response", {
        status: response.status,
        requestId: response.headers.get("x-request-id") ?? undefined,
      });
      return response;
    } catch (cause) {
      throw new ConnectionError(cause instanceof Error ? cause.message : String(cause), { cause });
    }
  }

  /**
   * Build the absolute request URL, including any query string.
   *
   * The query is appended after the origin guard in `buildUrl`, so a page link the API issued keeps
   * its own query and a foreign host is still refused.
   * @param spec - The request being performed.
   * @returns The absolute URL.
   */
  #url(spec: RequestSpec): string {
    const url = new URL(this.#config.buildUrl(spec.path));
    for (const [key, value] of Object.entries(spec.params ?? {})) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }
}

/**
 * Build the error for a non-2xx response.
 * @param response - The failed response.
 * @param payload - Its decoded body.
 * @returns The error to throw.
 */
function errorFor(response: Response, payload: unknown): Error {
  const body = record(payload);
  const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
  return apiErrorFor({
    errorName: text(body, "name") ?? "",
    message: text(body, "message") ?? "",
    statusCode: response.status,
    body: payload,
    retryAfter: Number.isNaN(retryAfter) ? undefined : retryAfter,
    requestId: response.headers.get("x-request-id") ?? undefined,
  });
}

/**
 * Decode the body to a JSON object, or report that it is not one.
 *
 * An empty body reads as an empty object: `204`-style acknowledgements are legitimate, and their
 * models are built entirely from defaults. Anything else that is not a JSON **object** — a bare
 * string, an array, a gateway's HTML error page — is `undefined`, so the caller can tell "nothing
 * to read" apart from "the wrong thing to read" instead of silently decoding both as empty.
 * @param response - The response to read.
 * @returns The decoded body, or undefined when it is not a JSON object.
 */
async function decode(response: Response): Promise<Record<string, unknown> | undefined> {
  const raw = await response.text();
  if (raw === "") {
    return {};
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
