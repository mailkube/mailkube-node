# Contributing to mailkube-node

Thanks for helping improve **mailkube-node**, a [mailkube](https://mailkube.com) SDK.
Contributions of all kinds are welcome: bug reports, fixes, docs, and features.

By contributing you agree that your contributions are licensed under the project's
[Apache License 2.0](LICENSE) (inbound = outbound). **No CLA and no sign-off are required.**
Please also read our [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

Requires Node.js 20+.

```bash
git clone https://github.com/mailkube/mailkube-node
cd mailkube-node

npm install
pre-commit install                            # prettier + eslint + jscpd hooks
pre-commit install --hook-type commit-msg     # Conventional Commits hook
```

## Quality gates

Every change must pass the same checks CI runs (see [.rules/SOLID_DRY_KISS.md](.rules/SOLID_DRY_KISS.md)):

```bash
npm run lint            # eslint: complexity (KISS) + jsdoc (docs) + type-checked SOLID smells
npm run format:check    # prettier formatting
npm run typecheck       # tsc --noEmit, strict
npm test                # vitest + 90% line+branch coverage gate
npx --yes jscpd@4 --config .jscpd.json .   # duplication (DRY) gate, blocks at > 1%
npx --yes jscpd@4 --config .jscpd.examples.json examples/  # the same gate over examples/
for f in examples/*.mjs; do node --check "$f" || exit 1; done  # every example parses
./scripts/check-rule-index.sh              # every .rules/*.md indexed in AGENTS.md
```

`pre-commit run --all-files` runs the format/lint/jscpd hooks in one shot.

**`examples/` is in scope for ESLint.** It is runnable documentation, which is the reason, not an
exception to it: customers copy those files, and every defect the SDK certification run surfaced
lived there because no gate looked at it. Two carve-outs remain, each for a reason:

- **Duplication** is measured by a *separate* pass, `.jscpd.examples.json`, at `minTokens: 100`
  instead of 50. Every example repeats the same opening — import, read `MAILKUBE_FROM`, construct
  the client — and hoisting that into a shared helper would make each file unreadable on its own,
  which is the one thing an example must be. 100 clears that scaffolding (measured: the cliff is
  at 90) and still fails on a copy-pasted example.
- **Coverage** excludes them, because nothing in CI executes them: they need live credentials.

## Commit & PR conventions

This project follows **[Conventional Commits](https://www.conventionalcommits.org/)**. A CI check
enforces the **PR title** (PRs are **squash-merged** using it), and it drives releases: only
`feat:`, `fix:`, and `perf:` cut a new version. See [.rules/RELEASE.md](.rules/RELEASE.md).

Suggested scopes: `client`, `models`, `ci`, `deps`, `docs`.

```
feat(client): add retry with exponential backoff
fix(models): correct optional field serialization
docs: document the pagination helper
```

## Reporting bugs / requesting features

Open an issue using the templates. For **security vulnerabilities**, do not open a public
issue — follow [SECURITY.md](SECURITY.md) instead.
