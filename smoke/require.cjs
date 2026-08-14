// CommonJS entry for the runtime smoke matrix.
//
//   node smoke/require.cjs
//
// This is the entry that matters for n8n community nodes and Node-RED nodes: both are CommonJS and
// `require()` their dependencies, so an ESM-only package is unusable to them. It resolves through
// the `require` condition of the exports map and must yield the same public surface as the ESM
// entry.
//
// The shared checks are ESM, so they arrive through a dynamic `import()` — which is exactly how a
// CJS consumer would reach any ESM helper, and proves the two module systems interoperate here.

const sdk = require("mailkube");
const manifest = require("mailkube/package.json");

import("./checks.mjs")
  .then(({ runChecks }) => runChecks(sdk, manifest.version))
  .then((summary) => {
    console.log(`require(): ${summary}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
