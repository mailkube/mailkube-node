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
./scripts/check-rule-index.sh              # every .rules/*.md indexed in AGENTS.md
```

`pre-commit run --all-files` runs the format/lint/jscpd hooks in one shot.

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
