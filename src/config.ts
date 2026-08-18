/**
 * Resolved client configuration: credentials, base URL, timeout and default headers.
 *
 * The transport-agnostic half of the client. It knows nothing about `fetch`, which is what lets
 * the transport be swapped wholesale in tests.
 */
import { MailkubeError } from "./errors.js";
import type { Logger } from "./logging.js";
import { readEnv } from "./runtime/env.js";
import { version } from "./version.js";

/** The API base URL used when nothing else is configured. */
export const DEFAULT_BASE_URL = "https://api.mailkube.com/mta/v1/";

/** Options accepted when constructing a client. */
export interface ClientOptions {
  /** The API key. Falls back to the `MAILKUBE_API_KEY` environment variable. */
  apiKey?: string;
  /** The API base URL. Falls back to `MAILKUBE_BASE_URL`, then the built-in default. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /**
   * A `fetch` implementation to use instead of the global one.
   *
   * This is the dependency-inversion seam: pass a configured or instrumented fetch in
   * production, or a stub in tests. It is what lets the whole suite run without network access.
   */
  fetch?: typeof globalThis.fetch;
  /**
   * A token appended to the `User-Agent`, for software that wraps this SDK.
   *
   * A CLI, an internal service and a framework integration all send requests the server sees as
   * coming from this SDK; a suffix is what makes them distinguishable. Give it the conventional
   * `name/version` form. This SDK's own token stays leading:
   * `mailkube-node/1.2.3 my-cli/1.0.0`.
   *
   * A value containing a newline is ignored rather than sanitized: a header value that could be
   * split is not one this package will send, and silently repairing it hides the caller's bug.
   */
  userAgentSuffix?: string;
  /**
   * Where to write SDK debug output.
   *
   * Silent unless you pass one, call `enableLogging()`, or set `MAILKUBE_LOG`. Scoping it here
   * rather than process-wide is preferable: one client's logging is one client's business.
   */
  logger?: Logger;
}

/** Configuration resolved from explicit options, then the environment, then the defaults. */
export class Config {
  /** The resolved API key. */
  readonly apiKey: string;
  /** The resolved base URL, always ending in a slash. */
  readonly baseUrl: string;
  /** The per-request timeout in milliseconds. */
  readonly timeoutMs: number;
  /** The caller-supplied User-Agent token, already validated; empty when there is none. */
  readonly userAgentSuffix: string;

  /**
   * Resolve configuration, throwing when no API key can be found.
   * @param options - The caller-supplied options.
   */
  constructor(options: ClientOptions = {}) {
    const apiKey = options.apiKey ?? readEnv("MAILKUBE_API_KEY");
    if (!apiKey) {
      throw new MailkubeError(
        "No API key provided. Pass apiKey or set the MAILKUBE_API_KEY environment variable.",
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl ?? readEnv("MAILKUBE_BASE_URL") ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    const suffix = options.userAgentSuffix?.trim() ?? "";
    this.userAgentSuffix = /[\r\n]/.test(suffix) ? "" : suffix;
  }

  /**
   * The auth and non-browser User-Agent headers sent on every request.
   * @returns The default headers.
   */
  defaultHeaders(): Record<string, string> {
    const agent = `mailkube-node/${version}`;
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "User-Agent": this.userAgentSuffix ? `${agent} ${this.userAgentSuffix}` : agent,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  /**
   * Join a relative path onto the base URL, refusing any absolute URL off its origin.
   *
   * Every request carries the Authorization header, so following a link that names a foreign host
   * would hand that host the API key. Enforcing it here rather than in a resource protects every
   * future link-following feature for free.
   * @param path - A path relative to the base URL, or an absolute URL the API itself issued.
   * @returns The absolute request URL.
   */
  buildUrl(path: string): string {
    const url = new URL(path, this.baseUrl);
    if (url.origin !== new URL(this.baseUrl).origin) {
      throw new MailkubeError(
        `Refusing to follow ${url.toString()}: it is not on the configured API origin.`,
      );
    }
    return url.toString();
  }
}
