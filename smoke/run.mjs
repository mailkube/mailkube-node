// ESM entry for the runtime smoke matrix: one file, run by Node, Deno and Bun.
//
//   node smoke/run.mjs
//   deno run --deny-env --allow-read --allow-net smoke/run.mjs
//   bun smoke/run.mjs
//
// Run it from a temp directory that has the packed tarball installed (`npm install ./mailkube-*.tgz`,
// or `bun add ./mailkube-*.tgz`), so `"@mailkube/mailkube-node"` is a BARE SPECIFIER resolved through the exports
// map. Never `npm:@mailkube/mailkube-node`: in Deno that is a registry fetch, which would 404 before the first
// publish and then silently test the published package forever after; Bun has no such specifier.
//
// `--deny-env` on Deno is load-bearing, not caution: Deno defines `globalThis.process`, so an
// unguarded `process.env` read does not fall through to undefined, it throws NotCapable.

import { runChecks } from "./checks.mjs";

import * as sdk from "@mailkube/mailkube-node";
import manifest from "@mailkube/mailkube-node/package.json" with { type: "json" };

console.log(await runChecks(sdk, manifest.version));
