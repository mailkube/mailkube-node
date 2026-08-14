# Engineering Standards: SOLID · DRY · KISS · Coverage · Docs

These are **enforced by CI** — a PR that violates them cannot merge. This file tells you the exact
thresholds and how to satisfy each gate locally *before* pushing.

## The gates

| Gate | Rule | Enforced by |
|---|---|---|
| **Coverage** | ≥ 90% **line and branch** | vitest v8 `coverage.thresholds` (the `test` CI job) |
| **DRY** | ≤ 1% duplicated code | `jscpd` (the `dry` CI job) |
| **KISS** | cyclomatic ≤ 10 + cognitive complexity | eslint `complexity` + `sonarjs` (the `test` CI job) |
| **Documentation** | every exported symbol has JSDoc | eslint `jsdoc/require-jsdoc` (publicOnly) |
| **SOLID** | see below — approximated by lint + review | `@typescript-eslint` type-checked + `sonarjs` + PR checklist |
| **Strict typing** | no `tsc --strict` errors | `tsc --noEmit` (the `test` CI job) |
| **Formatting** | prettier-clean | `prettier --check .` (the `test` CI job) |

Coverage is **line and branch** at 90% — full parity with the python template (vitest's v8 provider
measures both natively).

## Run the gates locally

```bash
npm run lint            # eslint: complexity (KISS), jsdoc (docs), type-checked SOLID smells
npm run format:check    # prettier formatting
npm run typecheck       # tsc --noEmit, strict
npm test                # vitest + 90% line+branch coverage gate
npx --yes jscpd@4 --config .jscpd.json .   # duplication (DRY) gate
./scripts/check-rule-index.sh              # every .rules/*.md indexed in AGENTS.md
```

`pre-commit run --all-files` runs the prettier + eslint + jscpd + commitlint hooks in one shot.

## SOLID, concretely (paradigm-neutral guidance)

SOLID is not a single lint rule; keep these in mind and confirm them in the PR checklist:

- **S**ingle responsibility — a function/class does one thing; if you need "and" to describe it, split it.
- **O**pen/closed — extend via new functions/classes/strategies, not by editing stable call sites.
- **L**iskov — subtypes honor their base's contract (types, thrown errors, invariants).
- **I**nterface segregation — small, focused `interface`s/`type`s; unused parameters are a smell.
- **D**ependency inversion — depend on an `interface`/`type` at I/O and network boundaries, and inject it.

## Requesting a waiver

If a threshold is genuinely wrong for a specific line, add a **scoped, commented** ignore
(e.g. `// eslint-disable-next-line complexity -- parser dispatch, intentionally flat`) and call it out
in the PR. Blanket relaxations (lowering the coverage thresholds, disabling a rule globally) require
maintainer sign-off.
