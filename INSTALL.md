# Install & update

This page is written to be **followed literally by an agent**, and to be readable by the
person sitting next to it. It covers a first install, an update, and what to do when
something does not look right immediately afterwards.

It never quotes the contents of any file it installs. The files themselves are in
`template/` and `skills/` in this repo — that is the only copy, on purpose.

Thai: [`INSTALL.th.md`](INSTALL.th.md) · Repo overview: [`README.md`](README.md)

---

## Rules for the agent doing the install

1. **Read this page to the end before running anything.** The five questions in step 3 are
   not optional and the installer will not answer them for you.
2. **macOS only.** If `uname -s` is not `Darwin`, stop and say so. **Do not guess paths for
   another OS.**
3. **Everything written outside the vault is user scope — ask before each piece.** If the
   person declines one, skip that piece and carry on with the rest. **Do not abort the whole
   process, and do not push back a second time.**
4. **Never edit the skills.** They are copied from `skills/` byte for byte. Do not shorten,
   reword, or translate them.
5. **Never overwrite anything silently.** Say what you replaced, before you replace it.
6. **Follow steps 1 → 5 in order.** If a step fails, stop and report what actually happened.
   **Do not continue and then summarise it as a success.**

## What you need

- macOS, and **Node 18 or newer** (`node -v`)
- `git`
- Obsidian — optional at install time. The installer can register the vault for you only if
  Obsidian has been opened at least once on this machine; see step 5.

---

## Install

### Step 1 — Inspect. Write nothing yet.

```bash
npx https://github.com/metasP/wayfinder-template --plan
```

Or clone it first, if you would rather read the thing before running it:

```bash
git clone https://github.com/metasP/wayfinder-template ~/Documents/Git/wayfinder-template
```

```bash
cd ~/Documents/Git/wayfinder-template && node template/_tools/bootstrap.mjs --plan
```

`--plan` is steps 1–3 with **no writes at all**: it inspects, prints the report, prints the
five questions, and exits 0. It creates nothing — not even the vault directory.

`--plan` never writes, whichever mode the run is in. On a vault that already has a manifest
it turns into a dry run of the **update** instead — see [Plan an update before you run
it](#plan-an-update-before-you-run-it). Every run under `--plan` ends by re-reading everything
the installer can reach and proving that not one byte moved; if something did, it says so and
exits non-zero, because a dry run that quietly writes is worse than no dry run at all.

### Step 2 — Report before touching anything.

Show the person the `--plan` output as it is. It tells them, for their machine:

- which template repo was found, and its commit
- which vault path is the target, and whether this will be an **install** or an **update**
- whether the vault already exists, and whether it is a git repo
- whether Obsidian is installed, and whether it is **currently running**
- whether the commit hook is already wired
- whether `~/.claude/CLAUDE.md` already has the wayfinder paragraph

Do not propose a plan of action yet. This step is only "here is what is on your machine".

### Step 3 — Ask the five questions. One at a time. Wait for each answer.

**1. Where should the vault live?** → `--vault <path>`
Default `~/Documents/Git/wayfinder-vault`. Any path works; it does not have to be inside
`~/Documents/Git`. This is a local-only git repo — no remote, by design.

**2. Which pieces should be installed?** → `--parts a,b,c` (several allowed; default is all)

| Piece | What it does | Where it writes |
|---|---|---|
| `skills` | the `/wayfinder` and `/wayfinder-next` skills | outside the vault (see question 5) |
| `vault` | the vault contents, `_tools/`, and `git init` | inside the vault |
| `hook` | the auto-commit hook | `~/.claude/settings.json` |
| `obsidian` | `.obsidian/` settings, the Dataview plugin, and registering the vault | inside the vault, plus Obsidian's own config |
| `memory` | the wayfinder paragraph in `~/.claude/CLAUDE.md` | `~/.claude/CLAUDE.md` |

> ⚠️ **Say this out loud when you ask about `memory`, then respect the answer and drop it.**
>
> That paragraph in `~/.claude/CLAUDE.md` is the **only** thing that tells `/wayfinder` where
> the vault is. Without it, calling `/wayfinder` in any repo makes the skill fall back to
> that repo's own issue-tracker convention (`docs/agents/issue-tracker.md` and the like) —
> so the map gets written into the repo instead of the vault, and dies with the branch or
> worktree it was written in. Declining is a legitimate choice; the cost is that the vault
> path has to be spelled out by hand every single time.
>
> The installer prints this same consequence again if the piece is skipped. It does not ask
> twice, and neither should you.

**3. What should happen when a file is already there?** → `--on-conflict skip|backup`
Default `skip` (leave the existing file alone). The alternative is `backup` — copy it to
`<file>.bak`, then write. This answer applies to **install** only; see [Update](#update) for
what happens to an installed vault.

**4. May the installer run `brew install --cask obsidian`?** → `--allow-brew yes|no`
**There is no default — this one has to be answered.** It only matters if `obsidian` was
chosen in question 2 and the app is not installed yet. If the answer is missing in that
situation, the installer stops rather than guessing.
Dataview is not a question: it ships with this repo and is placed from here.

**5. Where should the skills go?** → `--skills-dir <path>`
Default `~/.claude/skills`. If `<dir>/<skill-name>` is already a **symlink**, the installer
follows it and writes to the real destination, leaving the existing layout intact.

> **Why the installer refuses to guess these:** in install mode, if standard input is not a
> terminal — which is the case when an agent is driving — and no `--parts` or `--yes` was
> given, the installer prints the questions and **exits 2**. That is the intended behaviour,
> not a bug: it is the mechanism that stops an agent from installing across someone's machine
> without asking. `--vault` on its own does not count as an answer; it answers question 1 and
> nothing else.

### Step 4 — Act on the answers, and only on those.

Pass the answers as flags. Example, for someone who accepted every default and answered
"no" to brew:

```bash
node template/_tools/bootstrap.mjs --vault ~/Documents/Git/wayfinder-vault --parts all --on-conflict skip --skills-dir ~/.claude/skills --allow-brew no
```

If they declined a piece, name only the pieces they accepted — for example
`--parts skills,vault,hook` leaves `~/.claude/CLAUDE.md` and Obsidian untouched.

`--yes` is shorthand for "they answered, and chose every default". Use it only when that is
actually what happened.

The run prints, as it goes: how many files were written versus skipped, where each skill was
placed (including any symlink it followed), whether the hook was added or was already there,
and what it recorded in the manifest. It makes a commit in the vault at the end, so the
working tree is left clean.

### Step 5 — Verify, then summarise honestly.

```bash
node ~/Documents/Git/wayfinder-vault/_tools/doctor.mjs
```

**Exit 0 means every check passed.** Lines marked `⚠️` are warnings, not failures — a fresh
vault with no maps in it yet reports a couple of those, and that is correct. The installer
runs `doctor.mjs` itself at the end, so its output is already on screen; run it again after
finishing the manual steps below.

Two results are worth expecting rather than being surprised by:

- **The "Obsidian knows about this vault" check is red on a machine where Obsidian has never
  been opened.** The installer can only register a vault by editing Obsidian's own config
  file, and that file does not exist until the app has run once. Either fix works: open
  Obsidian and use *Open folder as vault*, or open Obsidian once and re-run the installer.
- **The hook needs Claude Code to reload its configuration** before it starts firing. See the
  manual steps.

Then report: what was installed, what was declined, what `doctor.mjs` said, and which manual
steps are still outstanding.

### Installing onto a vault you already have

If the target is already a wayfinder vault — one that predates this repo — the install is a
**migration**, and question 3 covers less than its wording suggests:

- `_tools/` and the skills are written **whatever you answered**. They are the program, not
  documents: a vault left running an older `bootstrap.mjs` quietly stops converging on every
  later update, and nothing tells you. The run names each file it replaced; vault files are
  recoverable from git, and `--on-conflict backup` keeps a `.bak` of the skills, which live
  outside it.
- The documents — `README.md`, `SETUP.md`, the three Wayfinder notes — do follow your answer,
  so the default `skip` leaves them exactly as they are. They converge on the **first
  update**, which is the same command everyone else runs.
- `example-repo/` is not placed at all when the vault already holds real efforts, and it
  never enters the manifest, so no later update brings it back.

A migration is therefore two commands rather than one: install, then update.

---

## Manual steps the script cannot do for you

1. Open Obsidian → **Open folder as vault** → choose the vault path.
2. Settings → **Community plugins** → *Turn on community plugins*. Dataview itself, its
   settings, and the Graph View colours all shipped with this repo — nothing to download.
3. Open the notes **Wayfinder Dashboard** and **Wayfinder Efforts** and leave them open;
   that is the working surface.
4. If the hook was just wired: open `/hooks` in Claude Code once, or restart it, so the new
   configuration is loaded.

---

## Update

> **A vault that predates this repo cannot start here.** It has no manifest, and its own
> `_tools/bootstrap.mjs` does not know `--from` — the second command below exits with an
> unknown-flag error before it writes anything. Run
> [Installing onto a vault you already have](#installing-onto-a-vault-you-already-have)
> once first: that run replaces `_tools/` whatever you answered, and every update from then
> on is the command below.

```bash
cd ~/Documents/Git/wayfinder-template && git pull
```

```bash
node ~/Documents/Git/wayfinder-vault/_tools/bootstrap.mjs --from ~/Documents/Git/wayfinder-template
```

**Update asks nothing.** The five answers from install are recorded in the vault's manifest
(`.wayfinder-template.json` — which pieces, where the skills went, which vault path was
rendered in) and are reused as they are. An update that asked again would be an update that
could be answered differently by mistake.

Running it from the repo side instead (`node template/_tools/bootstrap.mjs --vault <vault>`)
does the same thing — the mode is decided by whether the vault already has a manifest, not by
which copy of the script you ran.

### Plan an update before you run it

Add `--plan` to either command above and you get the same run with every writer switched off:

```bash
node ~/Documents/Git/wayfinder-vault/_tools/bootstrap.mjs --from ~/Documents/Git/wayfinder-template --plan
```

It reports what the update **would** do, computed by the same code that would do it — which
files it would write, which of those are new and which overwrite something, which ones you
have edited locally, **which files it would delete**, what it would leave alone, and whether a
commit would land in your vault. Then it re-reads everything it can reach and confirms nothing
moved, and prints the count it checked.

Two answers here are worth the run on their own:

- **which files it would delete.** Deletion is the one step you cannot eyeball afterwards.
- **whether it would commit.** The closing commit runs `git add -A` across the whole working
  tree, not just the files the installer touched. If your vault was already dirty, that work
  gets swept into the installer's commit even when the update itself changes nothing — the
  plan says so in as many words.

### What gets replaced

The whole of `template/` — the three Wayfinder notes, `README.md`, `SETUP.md`, `_tools/`,
and the Dataview plugin code — is replaced as **one unit**. Not file by file, and not
optionally: those notes reference each other's constants and `doctor.mjs` checks that they
agree, so a half-applied update produces a vault that fails its own health check with nobody
having done anything wrong.

Files this repo has **stopped shipping** are deleted from the vault too. That deletion is
driven strictly by the previous manifest — a file that was never in the manifest can never
enter that code path.

### What is never touched

| | |
|---|---|
| `<repo>/<effort>/` — every map, ticket, and asset | your actual work |
| `Wayfinder Config.md` | your tuning: staleness thresholds, colours, status labels |
| `Wayfinder Picks.md` | your own "what do I pick up next" rules |
| `example-repo/` | placed on install only; once deleted it stays deleted |
| your settings inside `.obsidian/` | the Dataview **plugin code** updates; your **settings** do not — overwriting them would silently switch off other plugins you enabled and lose Graph View colours you tuned |
| anything you added yourself, anywhere | the updater walks the manifest, it does not sweep for strangers |

So: tune values in `Wayfinder Config.md`, never inside the three notes' code blocks. Edits
made in the three notes are gone at the next update, and that is deliberate.

If you did edit a managed file, the update names it on screen and tells you it was replaced.

### Undoing an update you do not like

The vault is a git repo and the installer commits at the end of every run, so the previous
state is in history:

```bash
cd ~/Documents/Git/wayfinder-vault && git log --oneline
```

Then `git revert <the "chore(vault): update wayfinder template …" commit>`. For a single
file, `git log -p -- "<file>"` shows what it looked like before.

Files written **outside** the vault get a copy next to themselves the first time they are
modified, if they already existed: `~/.claude/settings.json.bak`, `~/.claude/CLAUDE.md.bak`,
and Obsidian's `obsidian.json.bak`. (Nothing existed, nothing to back up — no `.bak`.)

---

## Running it again

The installer is safe to run repeatedly — that is a property you should be able to rely on
before you are willing to run it at all.

- A second run on an installed vault **is an update** — the only flag that changes that is
  `--plan`, which makes it a dry run. Files that already match are skipped, nothing is
  written, and no empty commit is made.
- The hook is added once. A repeat run finds both of its entries and skips them.
- The `~/.claude/CLAUDE.md` paragraph is added once. A repeat run finds it and skips it.
- Your `Wayfinder Config.md`, `Wayfinder Picks.md`, and efforts are untouched every time.

And `--plan` holds on an installed vault, not just a fresh one — that is the run where
looking first is worth anything.

---

## After it is installed

Health checks, troubleshooting, and how to keep an installed vault happy live in that vault's
own `SETUP.md`, placed at the vault root by the installer. This page is only about getting
the vault onto a machine and keeping it in step with this repo.
