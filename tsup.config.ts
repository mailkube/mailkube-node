import { defineConfig } from "tsup";

/**
 * Dual ESM + CommonJS build.
 *
 * ESM alone would be enough for Node servers and workers, and is not enough for the consumers this
 * SDK exists to serve: n8n community nodes and Node-RED nodes are CommonJS and `require()` their
 * dependencies. So the package ships both, and `package.json`'s `exports` map routes each caller to
 * the matching entry.
 *
 * `dts` emits **both** `index.d.ts` and `index.d.cts`. One shared declaration file would fail the
 * `attw` gate as "masquerading as ESM": under `"type": "module"`, a `.d.ts` describes an ESM
 * module, so pairing it with the `require` entry tells TypeScript the wrong thing about `index.cjs`.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  target: "es2022",
  dts: true,
  sourcemap: true,
  clean: true,
  // The package has no runtime dependencies, so there is nothing to bundle in; keeping the output
  // unbundled preserves the module boundaries and keeps `sideEffects: false` tree-shakeable.
  splitting: false,
  treeshake: true,
});
