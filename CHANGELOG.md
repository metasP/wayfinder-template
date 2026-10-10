# Changelog

Each version is the `version` in [`package.json`](package.json); an `npx` install records it in
the vault manifest as `template_version`. Every release is a git tag `vX.Y.Z` (there was never a
0.2.3).

Releases after 0.4.0 are cut by [release-please](https://github.com/googleapis/release-please):
it reads the conventional-commit messages merged to `main`, keeps a release PR open that bumps
`package.json` and adds the next section here, and merging that PR tags the release and drafts its
GitHub release notes. `feat` bumps the minor version, `fix` the patch, and while the version is
below 1.0.0 a breaking change (`feat!`) bumps the minor too.

## [0.5.0](https://github.com/metasP/wayfinder-template/compare/v0.4.0...v0.5.0) (2026-10-10)


### Features

* move specs and build tickets out of the vault into the work repo's tracker ([4e121d9](https://github.com/metasP/wayfinder-template/commit/4e121d9ae56677885c5bc869f1f4ce3589181ea7))
* move specs and build tickets out of the vault into the work repo's tracker ([a23ca69](https://github.com/metasP/wayfinder-template/commit/a23ca69dcc915bdb492ebc2bbb9f271676599d11))


### Bug Fixes

* declare STALE_MEMORY_HEADING before report() uses it ([84ddaac](https://github.com/metasP/wayfinder-template/commit/84ddaac96892a5f21008aa82f05562005aed6c44))
* declare STALE_MEMORY_HEADING before report() uses it ([1084877](https://github.com/metasP/wayfinder-template/commit/10848771f7af17803249f4ab60e7042d86abe39c))
* **hook:** autocommit Bash path reads the session cwd from the payload ([8d7e499](https://github.com/metasP/wayfinder-template/commit/8d7e4997bed3a3ac08bb25a02b78f3a1fb76a260))
* **hook:** autocommit Bash path reads the session cwd from the payload ([f42c27b](https://github.com/metasP/wayfinder-template/commit/f42c27b4eb1ddcddeb3bddd25eee47dc10d1107b))
* keep all-waiting maps off the stale clock and close review gaps ([d1d5b98](https://github.com/metasP/wayfinder-template/commit/d1d5b9814baab5d5b93785c97fda4d8c1df3442c))

## 0.4.0 — 2026-10-05

**Changed (CLI):** `bootstrap.mjs` and `doctor.mjs` now reject what they do not understand,
before reading the manifest or touching any file.

- `--help` / `-h` print usage and exit 0. They used to fall through to a real run — on an
  installed vault, a full update plus a commit to `main`.
- An unknown flag (`--pln`), a stray word, a value on a boolean (`--yes=1`), or a value flag
  with no value (`--parts`) exits 2. Boolean flags no longer swallow the next word.
- A value that starts with `-` must be written `--flag=value`.
- `doctor.mjs` takes no arguments and now says so instead of silently checking the vault next
  to itself.

**Added**

- `language:` in `Wayfinder Config.md` (ISO 639-1, default `en`): the language `/wayfinder-next`
  and `/wayfinder` write chips, maps and tickets in.
- The vault README carries § Wayfinding operations and § Spec & ticket operations — the sections
  `/wayfinder` and the build skills read — and `doctor.mjs` checks both headings are still there.
- The `~/.claude/CLAUDE.md` paragraph is now a pointer to those README sections instead of a
  copy of the format. A paragraph from v0.3.0 or earlier is left alone with a warning: delete it
  and re-run with `--wire-memory`.

## 0.3.0 — 2026-10-05

**Breaking:** `/wayfinder` is no longer bundled. It comes from Matt Pocock's
`mattpocock-skills` plugin, now a prerequisite (see [`INSTALL.md`](INSTALL.md)).

- The installer reports whether the plugin is installed.
- An update deletes the old bundled `<skills-dir>/wayfinder/SKILL.md` only while it is still
  byte for byte what the installer placed; an edited copy is left in place with a warning.

## 0.2.5 — 2026-09-06

- The remembered effort no longer crosses between vaults.

## 0.2.4 — 2026-09-06

- Every ticket must carry a `blockers` key, even an empty one, and `doctor.mjs` insists. The
  example ticket has one.
- The README shows the dashboards.

## 0.2.2 — 2026-09-06

- The `npx` one-liner is documented for updating too, not just installing.

## 0.2.1 — 2026-09-05

- The bundled `/wayfinder` skill is credited to Matt Pocock (MIT) in `THIRD-PARTY.md` and inside
  the skill file itself. No installer behaviour changed.

## 0.2.0 — 2026-09-05

- Install with one command: `npx https://github.com/metasP/wayfinder-template`. Not published
  to npm.
- `template/.gitignore` ships as `template/_gitignore` and is renamed on placement, because npm
  drops that filename from tarballs.

## 0.1.0 — 2026-09-05

- First public release: install onto a new or existing vault, update from the vault's own copy,
  `doctor.mjs` health check.
