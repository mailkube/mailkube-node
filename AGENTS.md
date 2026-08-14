# Project Rules

`mailkube-node` is a public (Apache-2.0) mailkube SDK published to npm
as `mailkube`. Load the relevant rule file from `.rules/` based on the task.

## Rule Index

> **Index every rule (required).** Every file in `.rules/` MUST have a row in the table below. When you
> add or rename a `.rules/` file, add or update its row in the **same change** — an unindexed rule is
> invisible, because this index is what drives progressive disclosure. The `docs` CI job (`scripts/check-rule-index.sh`)
> fails the build if `.rules/` and this index drift. This convention holds for every mailkube repo.

| Rule File | Load When |
|---|---|
| `.rules/SOLID_DRY_KISS.md` | Writing or changing any code — the enforced engineering standards (SOLID, DRY, KISS, coverage, docs) and how to run each gate locally. |
| `.rules/SDK_CONTRACT.md` | Adding a resource, verb, response model, paginated listing, or webhook event: the cross-SDK decisions (config, layering, naming, errors, pagination, webhooks) every mailkube SDK implements identically. Owned by this repo — edit it here. |
| `.rules/SDK_DESIGN.md` | The same tasks, for the **TypeScript realization**: the layer-to-file map, the zero-dependency stance, the `fetch` injection seam, and the named-exports rule. |
| `.rules/RELEASE.md` | Touching `release.yml`, `.releaserc.json`, versioning, or the npm OIDC publish flow. |

## Key Conventions (always apply)

- **Dual ESM + CommonJS, TypeScript** — `"type": "module"`; source in `src/`, tests in `test/`; built
  with `tsup`. CommonJS is not optional: n8n and Node-RED nodes `require()` their dependencies.
- **`tsc` strict** on `src` + `test` (typecheck only, `tsup` emits); **prettier** for formatting;
  **eslint** (flat config) for lint.
- **Web standards only in `src/`** — no Node built-in or Node global outside `src/runtime/`, which is
  the single platform-adapter layer. The `smoke` CI matrix (Node ESM+CJS, Workers without
  `nodejs_compat`, Deno, Bun) enforces it against the packed tarball.
- **No default exports** — prefer named exports so the public surface is explicit and tree-shakeable.
- **JSDoc** on every exported symbol (`jsdoc/require-jsdoc`, publicOnly).
- **≥ 90% coverage, line + branch** — enforced by vitest `coverage.thresholds`; never lower the gate.
- **Max cyclomatic complexity 10** (eslint `complexity`) — split, don't waive.
- **Depend on interfaces/types at boundaries** (DIP); keep them small (ISP) — unused params are a smell.
- **No duplication** — the `jscpd` gate blocks at > 1% duplicated code; extract shared logic.
- **Conventional Commits** for PR titles (squash-merged); only `feat:`/`fix:`/`perf:` cut a release.
- **No secrets in the repo** — local config lives in a git-ignored `.env`; publishing is tokenless OIDC.
- **Releases commit nothing to `main`** — the git tag is the version, and the GitHub Release
  notes are the changelog; there is no `CHANGELOG.md` (see `.rules/RELEASE.md`).
