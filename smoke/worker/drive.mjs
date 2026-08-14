// Drives the Cloudflare Workers smoke target from Node.
//
//   node smoke/worker/drive.mjs
//
// Run from a temp directory that has the packed tarball and `wrangler` installed. workerd is
// started by wrangler's `createTestHarness` (its predecessor `unstable_dev` is deprecated), the
// Worker is fetched once, and its report becomes this process's exit status.
//
// The Worker itself asserts; this file only starts it, tells it which version to expect, and
// relays the verdict. Keeping the assertions inside the Worker is what makes them run under
// workerd rather than under Node.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { createTestHarness } from "wrangler";

const require = createRequire(import.meta.url);
const installed = JSON.parse(
  readFileSync(require.resolve("mailkube/package.json"), "utf8"),
).version;

const harness = createTestHarness({
  root: import.meta.dirname,
  workers: [{ configPath: "./wrangler.jsonc" }],
});

try {
  await harness.listen();
  // The installed version is the one thing the Worker cannot discover for itself: it has no
  // filesystem to read node_modules from.
  const response = await harness.fetch("http://smoke.local/", {
    headers: { "x-expected-version": installed },
  });
  const report = await response.text();
  if (response.status !== 200) {
    throw new Error(`worker reported: ${report}`);
  }
  console.log(`workerd (no nodejs_compat): ${report}`);
} finally {
  await harness.close();
}
