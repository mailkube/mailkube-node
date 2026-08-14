// The Worker under test: it does nothing but run the shared runtime checks and report.
//
// This is the strictest target in the matrix. workerd here runs WITHOUT `nodejs_compat` (see
// wrangler.jsonc), so there is no `process`, no `Buffer`, no `node:` module and no `createRequire`.
// Anything the SDK reaches for that is not a web standard fails right here, at import time or on
// the first call — which is the whole point of running it.
//
// The expected version arrives on the request rather than as a binding: the driver is the only
// side that can read `node_modules` to learn what was actually installed, and a header keeps
// `wrangler.jsonc` the single source of truth for the compatibility flags that matter here.

import { runChecks } from "../checks.mjs";

import * as sdk from "mailkube";

export default {
  /**
   * Run the checks and report the outcome as plain text.
   * @param {Request} request - Carries the expected version in `x-expected-version`.
   * @returns {Promise<Response>} 200 with a summary, or 500 with the failure.
   */
  async fetch(request) {
    try {
      const expected = request.headers.get("x-expected-version");
      return new Response(await runChecks(sdk, expected), { status: 200 });
    } catch (error) {
      return new Response(`${error?.name ?? "Error"}: ${error?.message ?? error}`, { status: 500 });
    }
  },
};
