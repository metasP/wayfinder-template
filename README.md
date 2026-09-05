# wayfinder-template

**English** · [ภาษาไทย](README.th.md)

An installer for **wayfinder** — a way of planning work that is far too big for one agent
session — together with the Obsidian vault that holds those plans.

## What wayfinder is

Some work arrives as a loose idea wrapped in fog: you can name the destination, but not the
route to it. The `/wayfinder` skill charts that route as **one map** plus a set of
**tickets**, each ticket a single question sized to fit one agent session. You resolve them
one at a time, and the map's *Decisions so far* grows until nothing is left to decide and
someone can go and build the thing.

The map is an **index, not a store**: every decision lives in exactly one ticket, and the map
only gists it and links. Sessions come and go — the map is what survives them.

Two skills ship here. `/wayfinder` charts a map and works its tickets; `/wayfinder-next`
takes the tickets that are takeable *right now* and turns them into one-click chips that
start the next session.

The format itself — frontmatter, statuses, blockers, and the three dashboards that read them
— is documented once, in [`template/README.md`](template/README.md), which installs into your
vault as its own README. **That is the only copy of it** (written in Thai), and this page
deliberately does not repeat any of it.

## What this repo is — and what it is not

This repo is an **installer and template**. It is **not** a vault, and your plans do not live
here.

- **Your vault is yours.** The installer writes it to a folder you pick. It is its own local
  git repository with its own history, and nothing in it is ever pushed back here.
- **This repo is the source.** `template/` is the vault exactly as it should exist on disk.
  So don't edit `template/`-owned files inside your own vault — the next update replaces
  `template/` wholesale and your change disappears without a word. Send a pull request here
  instead; this repo is the original, not something generated from anyone's vault.
- **Your work is never touched.** Your efforts — the `<repo>/<effort>/` folders holding your
  maps and tickets — belong to you. The updater has no path that reaches them.

## Why the maps live outside the repo they are about

Because a plan kept inside the repo it plans has two ways to die, and both have happened:

1. **It dies with the branch.** A map written into a work repo's `docs/plan/` exists in one
   worktree. Delete that worktree — an ordinary cleanup — and the map goes with it,
   uncommitted and unrecoverable. A whole map was lost exactly this way. That loss is why
   the vault exists.
2. **It could not have been committed anyway.** A plan is single-use scratch: it drives one
   piece of work and is rarely read again. Committing it drags it into a pull request and
   parks it in that repo's history forever.

One vault, outside every work repo, carrying its own git, closes both holes at once: a map
outlives the branch it was written on, and no work repo ever has to carry it.

## Install

```bash
git clone <repo-url> ~/Documents/Git/wayfinder-template
cd ~/Documents/Git/wayfinder-template
```

Then open an agent in that folder and tell it: *"install wayfinder from this repo."* It
inspects your machine, reports what it found, and **asks before touching anything outside the
vault** — where the vault should go, where the skills should go, and what else it may write.

The full walkthrough, including every question it asks and how to answer, is in
**[`INSTALL.md`](INSTALL.md)**.

> **One of those questions matters more than the rest.** The installer adds a wayfinder
> paragraph to `~/.claude/CLAUDE.md`. **That paragraph is the only thing that tells
> `/wayfinder` where your vault is.** Decline it and the skill falls back to whatever
> issue-tracker convention the repo you happen to have open describes — your maps land
> somewhere else entirely, and nothing warns you that they did.

## Update

```bash
cd ~/Documents/Git/wayfinder-template
git pull
```

Then tell the agent: *"update wayfinder."* It asks nothing — your answers from install time
are on record.

- `template/` is replaced **as a single unit**, all or nothing. The vault's notes cross-check
  each other's constants, so a half-applied update is a broken vault.
- **Your efforts are not touched.**
- **Your tuning survives.** `Wayfinder Config.md` (staleness thresholds, graph colours,
  status labels) and `Wayfinder Picks.md` (your own rules for what to pick up next) are
  written once, at install, and never again.

The updater works from a manifest recorded at install time, so it only ever overwrites — or
removes — files it put there itself. Anything else you keep in the vault is invisible to it.

## Requirements

- **macOS**
- **[Obsidian](https://obsidian.md)** — reads the vault; the three dashboards are Obsidian notes
- **[Claude Code](https://claude.com/claude-code)** — runs the wayfinder skills

Dataview ships inside the vault (see [License](#license)), so there is nothing to install from
Obsidian's plugin browser and no restart to sit through.

## What's in here

| Path | What it is |
|---|---|
| [`template/`](template) | The vault as it should exist on disk. Replaced wholesale on every update. |
| [`template/README.md`](template/README.md) | The map/ticket format reference (Thai). Becomes your vault's own README. |
| [`template/SETUP.md`](template/SETUP.md) | Updating and health-checking a vault you already have. |
| [`template/_tools/`](template/_tools) | `bootstrap.mjs` (install/update), `doctor.mjs` (health check + lint of every ticket), `autocommit.sh` (commits the vault whenever an agent edits a ticket). |
| [`template/example-repo/`](template/example-repo) | A worked example effort, seeded **on install only**, so the dashboards have something real to show on day one. Delete it when you're done — no update brings it back. |
| [`skills/`](skills) | The `/wayfinder` and `/wayfinder-next` skills (English), placed wherever you tell the installer to put them. |
| [`INSTALL.md`](INSTALL.md) | Installing and updating, in full. |
| [`THIRD-PARTY.md`](THIRD-PARTY.md) | The one vendored component and its license. |
| [`LICENSE`](LICENSE) | MIT. |

## License

MIT — see [`LICENSE`](LICENSE).

This repo vendors one third-party component: **Dataview 0.5.68** by Michael Brenan
(`blacksmithgu`), MIT-licensed, shipped inside `template/.obsidian/` so that a fresh vault is
complete on disk *before* Obsidian first opens it. Details and the full license text are in
[`THIRD-PARTY.md`](THIRD-PARTY.md).
