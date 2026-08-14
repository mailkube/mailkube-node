/**
 * Environment access, for runtimes that may not have one.
 *
 * Part of the runtime layer: the only place in `src/` allowed to name a host global. Everything
 * else depends on these functions, which is what lets the package run unmodified on Node,
 * Cloudflare Workers, Deno and Bun.
 */

/**
 * Read an environment variable, returning undefined wherever that is not possible.
 *
 * Both guards are load-bearing and neither subsumes the other. The optional chain covers runtimes
 * with no `process` at all (Cloudflare Workers without `nodejs_compat`, where a bare
 * `process.env` is a `ReferenceError`). The try/catch covers Deno, which **does** define
 * `globalThis.process` — so the chain does not short-circuit — and then throws
 * `NotCapable: Requires env access` unless the script was run with `--allow-env`.
 *
 * A missing key and an unreadable environment are the same answer here on purpose: the caller's
 * next step is identical either way, and on Workers the key arrives through the per-request `env`
 * binding rather than through any ambient environment.
 * @param name - The variable name.
 * @returns The value, or undefined when unset, absent or unreadable.
 */
export function readEnv(name: string): string | undefined {
  try {
    return globalThis.process?.env?.[name];
  } catch {
    return undefined;
  }
}
