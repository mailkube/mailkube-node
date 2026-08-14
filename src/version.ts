/**
 * The package version, baked in at build time.
 *
 * There is deliberately **no literal** here. `@semantic-release/npm` writes the released version
 * into `package.json` in the release runner, `npm run build` (invoked by `prepack`, which runs
 * afterwards) regenerates `version.generated.ts` from it, and this module re-exports that. The
 * runtime version therefore equals the released version by construction rather than by discipline.
 *
 * The `version` committed to this repo is a permanent `0.0.0` placeholder and is never updated:
 * the release commits nothing back to `main` (see `.rules/RELEASE.md`). So a checkout reports
 * `0.0.0` and an install from the registry reports the real version, which is the intended
 * behaviour, not a bug to fix by hardcoding a number.
 *
 * A second, hand-maintained constant is precisely how a package ends up reporting a version it is
 * not: a literal alongside the manifest lets the two drift, and every request's `User-Agent` then
 * reports a version that was never released. Do not reintroduce one.
 *
 * The generated module is git-ignored, and `prepare` regenerates it on `npm install`, so a fresh
 * clone can typecheck before it has ever built.
 */
import { generatedVersion } from "./version.generated.js";

/** The package's semantic version, as published. */
export const version: string = generatedVersion;
