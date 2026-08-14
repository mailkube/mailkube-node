# Release & Publishing

Load this when touching `release.yml`, `.releaserc.json`, versioning, or npm publishing.

## The contract

1. **Conventional Commits drive the version.** On push to `main`, `semantic-release` reads the commit
   history since the last tag: `fix:` → patch, `feat:` → minor, `feat!:`/`BREAKING CHANGE:` → major.
   `perf:` also releases. Anything else (`chore`, `docs`, `ci`, `refactor`, `test`) does **not** release.
2. **It creates the tag `vX.Y.Z` and the GitHub Release, and commits nothing.** No `chore(release):`
   commit, no `CHANGELOG.md`, no version bump landed in the tree. See "Why nothing is committed back
   to `main`".
3. **The tag IS the version.** `@semantic-release/npm` writes the resolved version into
   `package.json` **in the release runner**, immediately before it packs and publishes, so the
   published tarball carries the right number. The build bakes that number into the bundle, which is
   what the `User-Agent` reports.
   The `version` field committed to this repo is a permanent `0.0.0` placeholder. A checkout
   therefore reports `0.0.0` and an install from the registry reports the real version: **that is
   intended.** Do not "fix" it by hardcoding a number, and do not add a second constant — a
   hand-maintained literal is how the pilot SDK spent 1.0.0 through 1.2.0 reporting itself as
   `0.1.0`.
4. **Publishing is OIDC-only.** The `release` job publishes to npm with **provenance** using GitHub's
   OIDC token via npm **trusted publishing** — **no `NPM_TOKEN` is stored anywhere** (`id-token: write`
   + `NPM_CONFIG_PROVENANCE=true`).

## The version is baked in at pack time, and the ordering is load-bearing

`src/version.ts` does **not** read `package.json` at runtime. It re-exports `src/version.generated.ts`,
which `scripts/generate-version.mjs` writes from `package.json`. The runtime read it replaced
(`createRequire(import.meta.url)("../package.json")`) cannot be emitted into CommonJS and defeats
every bundler, so it made the package unusable for CJS consumers, Workers and anything bundled.

That makes **when** the build runs part of the contract:

- `build` = `generate-version && tsup`, so the two can never drift.
- `prepack` = `npm run build`, and npm runs `prepack` **after** `@semantic-release/npm` has written
  the resolved version. The published artifact therefore carries the released version.
- `prepare` also regenerates the file, so a fresh clone can typecheck before it has ever built. It
  is not sufficient on its own: npm runs `prepack` *before* `prepare`, so a build wired only to
  `prepare` would pack the previous value.
- The `Build` step in `release.yml` is a pre-flight check, not the artifact. Do not "optimise" it by
  removing `prepack`, and do not move the build after it in a way that skips `prepack`: both put a
  `0.0.0` bundle on the registry, which is exactly the failure the version rules exist to prevent.

The `version-bake` CI job proves this: it packs at a synthetic version and asserts the installed
package reports that same version. Asserting "not `0.0.0`" would be wrong — `0.0.0` is the mandated
placeholder in the tree, so CI legitimately packs it.

## Why nothing is committed back to `main`

`main` is covered by a ruleset requiring a pull request and the gated checks. A `chore(release):`
commit pushed straight to `main` by the workflow violates it, and the obvious fix does not exist:
**`github-actions[bot]` cannot be added to a ruleset bypass list.** Bypass is available to admins,
the maintain/write role, teams, GitHub Apps and Dependabot, and the built-in Actions identity is none
of those. Making the commit work would mean introducing a separate identity — a GitHub App or a
deploy key — purely to write a version number that the tag already carries.

So `.releaserc.json` loads neither `@semantic-release/git` nor `@semantic-release/changelog`. It
keeps `@semantic-release/npm`, which is a different thing: that plugin writes `package.json` in the
runner's working copy and publishes from it, and never touches git. **The generated release notes
are the changelog**; there is no `CHANGELOG.md` in this repo.

## Required setup (one-time, per repo)

- The GitHub repository must be **public**, and so must the npm package. npm refuses to generate
  provenance otherwise.
- GitHub **environment** `release` must exist (Settings → Environments) with protection rules.
- The runner needs **npm >= 11.5.1 on Node >= 22.14.0** for trusted publishing, which is why
  `release.yml` pins Node 24 *and* installs npm explicitly. The npm bundled with a Node release lags
  behind that floor, so setting `node-version` alone leaves the publish failing with `ENONPMTOKEN`
  on a correctly configured OIDC setup. Cloud-hosted runners only; self-hosted is not supported.
- **Bootstrap publish, once.** npm can only attach a Trusted Publisher to a package that exists, so
  the first version goes out by hand: in a scratch checkout, `npm install`, then
  `npm version --no-git-tag-version <v>`, then `npm publish --access public`. The `npm install` is
  required because `prepack` builds. **Never commit that version bump.** Then push an annotated
  `v<version>` tag on `main`, or semantic-release will see no prior release and jump straight to
  `1.0.0` on the next `feat:`.
- Configure the npm **Trusted Publisher** for `@mailkube/mailkube-node`
  (npmjs.com → package → Settings → Trusted Publishing) pointing at this GitHub org/repo and
  `release.yml`.
- Fallback: if trusted publishing is not yet available, add an `NPM_TOKEN` secret and pass it to the
  `release` job as `NODE_AUTH_TOKEN`. Remove it **only after one OIDC release has actually
  succeeded** — deleting it first leaves no way to publish at all.

## Do not put `provenance` in `publishConfig`

`release.yml` sets `NPM_CONFIG_PROVENANCE: "true"` for the release job, which is the right scope.
Putting `"provenance": true` in `publishConfig` applies it to **every** publish, including the manual
bootstrap one, and `libnpmpublish` then hard-fails with `EUSAGE — Automatic provenance generation
not supported for provider` because a laptop is not GitHub Actions or GitLab CI.

## Do not

- Do not bump `version` in `package.json` by hand, and do not add a `CHANGELOG.md`,
  `@semantic-release/git` or `@semantic-release/changelog`. All three reintroduce the commit to
  `main` that this setup exists to avoid.
- Do not commit a long-lived `NPM_TOKEN` when trusted publishing is available — that defeats OIDC.
- Do not gate `release.yml` on anything weaker than the full `ci.yml` (`test` + `dry` + `docs`).
