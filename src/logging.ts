/**
 * Library logging: silent by default, opt-in only.
 *
 * A library must not configure logging for the application hosting it, so nothing here writes
 * anywhere until you ask. Turn it on with `enableLogging()`, by passing `logger` to the client, or
 * by setting `MAILKUBE_LOG` in the environment.
 *
 * Node has no standard logger, so the seam is an interface rather than a framework: implement
 * `Logger` over pino, winston, a Worker's `console`, or whatever the host already uses. That is the
 * same dependency-inversion seam as `fetch`, for the same reason.
 *
 * **The environment is read lazily, never at module scope.** A module-scope read would be a side
 * effect on import (this package declares `sideEffects: false`) and would run before a Worker has
 * an environment at all.
 */
import { readEnv } from "./runtime/env.js";

/** Header names whose values are secrets and must never be logged. */
const SENSITIVE_HEADERS = new Set(["authorization", "idempotency-key"]);

/**
 * The `MAILKUBE_LOG` values that let the SDK's records through.
 *
 * The variable holds a **level**, not a flag, matching every other mailkube SDK. This SDK only
 * emits debug-level records, so anything more selective than `debug` silences it — `MAILKUBE_LOG=warning`
 * is a working way to say "not from the SDK".
 */
const VERBOSE_LEVELS = new Set(["trace", "debug", "all"]);

/** Where the SDK writes its debug output. */
export interface Logger {
  /**
   * Record one debug event.
   * @param message - A short, stable event name.
   * @param fields - Structured context for the event.
   */
  debug(message: string, fields?: Record<string, unknown>): void;
}

/** The default: writes nothing, anywhere. */
const SILENT: Logger = {
  debug() {
    // Intentionally empty: a library is silent until the application asks otherwise.
  },
};

let configured: Logger | undefined;

/**
 * Build a logger that writes to the console.
 * @returns The logger.
 */
function consoleLogger(): Logger {
  return {
    debug(message, fields) {
      console.debug(`mailkube ${message}`, fields ?? {});
    },
  };
}

/**
 * Turn SDK logging on for the whole process.
 *
 * The SDK never calls this for you. Prefer `new Mailkube({ logger })` when you can: it scopes the
 * choice to one client instead of the module.
 * @param target - Where to write. Defaults to the console.
 */
export function enableLogging(target: Logger = consoleLogger()): void {
  configured = target;
}

/** Turn SDK logging back off, undoing `enableLogging`. */
export function disableLogging(): void {
  configured = undefined;
}

/**
 * Decide which logger a client should use.
 *
 * Explicit beats process-wide beats the environment, and the fallback is silence.
 * @param explicit - The logger passed to the client, if any.
 * @returns The logger to use.
 */
export function resolveLogger(explicit?: Logger): Logger {
  if (explicit !== undefined) {
    return explicit;
  }
  if (configured !== undefined) {
    return configured;
  }
  return VERBOSE_LEVELS.has(readEnv("MAILKUBE_LOG")?.toLowerCase() ?? "")
    ? consoleLogger()
    : SILENT;
}

/**
 * Copy headers with every secret value masked, safe to log.
 * @param headers - The headers about to be logged.
 * @returns A copy where sensitive values are `"***"`.
 */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      SENSITIVE_HEADERS.has(key.toLowerCase()) ? "***" : value,
    ]),
  );
}
