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
- Matt Pocock's **`mattpocock-skills`** Claude Code plugin — it is where `/wayfinder` comes
  from; this repo does not ship that skill. Install it inside Claude Code:

  ```
  /plugin marketplace add mattpocock/skills
  /plugin install mattpocock-skills@mattpocock
  ```

  The installer reports whether it can find the plugin (a warning, never a failure — it does
  not install it for you). That is user scope, so under rule 3 **the agent asks before
  installing it**. The skills are Matt Pocock's work —
  [github.com/mattpocock/skills](https://github.com/mattpocock/skills), MIT.

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
| `skills` | the `/wayfinder-next` skill (`/wayfinder` comes from the plugin above) | outside the vault (see question 5) |
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
> The paragraph is a pointer, not a copy of the format: it sends `/wayfinder` to the vault
> README's **§ Wayfinding operations**, and the build skills after it (`/to-spec`,
> `/to-tickets`, `/implement`, `/implement-spec`) to **§ Spec & ticket operations**. Those
> sections own the layout and the frontmatter and win where a skill's own text disagrees.
> Only maps live in the vault: specs and build tickets go where the work repo's own tracker
> config says, and the map keeps a `## Build board` pointing at them.
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
5. If Claude Code runs Bash in its sandbox: add the vault path to the sandbox's writable paths,
   or `wf` cannot write there, and deny the paths inside it that hold code — see step 3 of
   [Upgrading from 0.4.x](#upgrading-from-04x).

---

## Update

```bash
npx https://github.com/metasP/wayfinder-template --plan
```

```bash
npx https://github.com/metasP/wayfinder-template --yes
```

The same command as install, because the mode is not something you type. Or run it from a
clone you keep:

```bash
cd ~/Documents/Git/wayfinder-template && git pull
```

```bash
node template/_tools/bootstrap.mjs --vault ~/Documents/Git/wayfinder-vault --plan
```

```bash
node template/_tools/bootstrap.mjs --vault ~/Documents/Git/wayfinder-vault --yes
```

**An update applies only with `--yes`.** It changes more than the vault: it migrates your notes
(`wf migrate`) and rewrites parts of `~/.claude/` (below), so you read the plan first. Run
without `--plan` or `--yes`, an update prints the plan, writes nothing, and exits 2.

> **Coming from 0.4.x?** 0.5.0 is a breaking release: follow
> [Upgrading from 0.4.x](#upgrading-from-04x) below, in order.

**Update asks nothing.** The five answers from install are recorded in the vault's manifest
(`.wayfinder-template.json` — which pieces, where the skills went, which vault path was
rendered in) and are reused as they are. An update that asked again would be an update that
could be answered differently by mistake.

Which command you use does not matter — the mode is decided by whether the vault already has a
manifest, not by which copy of the script you ran.

### Upgrading from 0.4.x

0.5.0 changes the vault itself: notes move to vault schema 2, agents change tracker state with
`wf` instead of editing frontmatter, and the Dataview pages load one shared core. Every 0.4.x
vault needs `wf migrate` once; the update runs it for you. Four steps, in this order:

1. **Run the new installer, not the vault's own copy.** `<vault>/_tools/bootstrap.mjs` is the
   0.4 installer: it knows nothing of `wf migrate` or the new hooks. Use the `npx` command or a
   freshly pulled clone's `template/_tools/bootstrap.mjs`, as above. From 0.5 on,
   `node <vault>/_tools/bootstrap.mjs --from <repo> --yes` is fine again. A vault that predates
   this repo has no manifest at all — the `npx` command installs instead, questions and all; see
   [Installing onto a vault you already have](#installing-onto-a-vault-you-already-have).

2. **Plan, read the `wf migrate` diff, then apply.** Start from a clean vault (`git status`
   shows nothing), because the update's commit takes everything in the working tree. A vault
   somewhere other than `~/Documents/Git/wayfinder-vault` needs `--vault <path>` on both commands.

   ```bash
   npx https://github.com/metasP/wayfinder-template --plan
   ```

   The plan's `wf migrate → vault schema 2` part shows every note it would rewrite, line by line,
   and the `~/.claude/settings.json` and `~/.claude/CLAUDE.md` diffs follow it. When they read
   right:

   ```bash
   npx https://github.com/metasP/wayfinder-template --yes
   ```

   That lands two commits in the vault: `chore(vault): update wayfinder template …`, then
   `wf(migrate): vault schema 2`. To back out, revert both, newest first — see
   [Undoing an update you do not like](#undoing-an-update-you-do-not-like).

3. **Let Claude Code's sandbox write to the vault.** `wf` writes notes and commits in the vault,
   which sits outside your project folders, so a sandboxed Bash command is refused there and
   `wf` says the vault is probably outside the sandbox's writable paths. Add the vault to those
   paths yourself in `~/.claude/settings.json`; agents can't, and the installer doesn't. Grant
   the vault, and deny the parts that code outside the sandbox runs:

   ```json
   {
     "sandbox": {
       "filesystem": {
         "allowWrite": ["~/Documents/Git/wayfinder-vault"],
         "denyWrite": [
           "~/Documents/Git/wayfinder-vault/_tools",
           "~/Documents/Git/wayfinder-vault/.git/hooks",
           "~/Documents/Git/wayfinder-vault/.git/config",
           "~/Documents/Git/wayfinder-vault/.git/modules",
           "~/Documents/Git/wayfinder-vault/.obsidian",
           "~/Documents/Git/wayfinder-vault/.claude",
           "~/Documents/Git/wayfinder-vault/.mcp.json"
         ]
       }
     }
   }
   ```

   **Keep the `denyWrite` list.** The hooks run `_tools/` scripts outside the sandbox, and the
   autocommit hook runs git there, which reads `.git/hooks`, `.git/config` and `.git/modules`;
   Obsidian runs the plugin code in `.obsidian/`; a Claude Code session started in the vault
   loads settings, hooks and MCP servers from `.claude/` and `.mcp.json`. Writable, any of
   them lets a sandboxed command run code outside the sandbox. `denyWrite` wins over
   `allowWrite`, and `wf` writes none of them. Claude Code protects `.git/hooks` and
   `.git/config` on its own only in the session's working directory, and the vault usually
   isn't one.

   One way out stays open: the pages run Dataview JS, so Obsidian runs any `dataviewjs` block in
   a note when you open that note, and notes are what `wf` writes. Treat a block you didn't put
   there as you would an unknown script, and look at what agents changed (`git log -p` in the
   vault) before opening a page they touched.

   Merge the JSON into the `sandbox` key you already have, if any; a vault elsewhere uses its own
   path in every entry. With the sandbox off, skip this step. Then restart Claude Code, so the
   new hooks and this setting load.

4. **Run `doctor`.**

   ```bash
   node ~/Documents/Git/wayfinder-vault/_tools/doctor.mjs
   ```

   The update ran it once already; run it again after step 3. Every check should pass,
   `wf lint` included. Then open the vault in Obsidian and walk the list `doctor` prints last —
   the checks no script can make: every page renders, and the pages and
   `node _tools/wf.mjs frontier` agree on the frontier.

### What an update changes outside the template files

- **`wf migrate`** takes your notes to the current vault schema. The plan prints its whole
  diff; `--yes` runs it after the update's own commit, as a commit of its own
  (`wf(migrate): vault schema 2`). A second run plans nothing.
- **`~/.claude/settings.json`** (the `hook` piece): the frontmatter guard on PreToolUse
  `Write|Edit`, the autocommit on PostToolUse `Write|Edit` only, and one permission allow rule,
  `Bash(node <vault>/_tools/wf.mjs:*)`, so agents can run `wf` by absolute path without a prompt.
  Older autocommit entries for this vault — the `Bash` matcher, `|| true`, duplicates, the path
  spelled as `~/…` or `$HOME/…` — are removed; an entry on a matcher spelled `Edit|Write` or
  `^(Edit|Write)$` counts as `Write|Edit` and stays where it is. Every other key, `env.PATH`
  included, is left as it is. The file is read again right before it is written, so an edit Claude
  Code made meanwhile is kept. The file as it was before bootstrap first changed it is kept as
  `settings.json.bak`.
- **`~/.claude/CLAUDE.md`** (the `memory` piece): the block that tells agents to change tracker
  state with `node <vault>/_tools/wf.mjs <verb>` and to write prose with Write/Edit. It sits
  between `<!-- wayfinder-template:begin … -->` and `<!-- wayfinder-template:end -->` and is
  replaced there on every run; the block older versions wrote (same heading, no markers) is
  found and replaced in place, never duplicated. The file as it was before bootstrap first changed
  it is kept as `CLAUDE.md.bak`.

The plan shows the diff of both `~/.claude` files line by line: they are outside the vault, so
git cannot give them back.

### Plan an update before you run it

`--plan` is the same run with every writer switched off:

```bash
npx https://github.com/metasP/wayfinder-template --plan
```

It reports what the update **would** do, computed by the same code that would do it — which
files it would write, which of those are new and which overwrite something, which ones you
have edited locally, **which files it would delete**, what it would leave alone, and whether a
commit would land in your vault — plus the `wf migrate` diff and the `~/.claude` diffs
above. Then it re-reads everything it can reach, confirms nothing moved, and prints the count
it checked. When everything is already up to date, its summary ends with
`ทั้งหมด: ไม่มีอะไรต้องเปลี่ยน` (nothing to change).

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

One such file: versions up to 0.2.x copied a `/wayfinder` skill into your skills directory
(`<skills-dir>/wayfinder/SKILL.md`); it now comes from the plugin instead. The update deletes
that old copy — and the folder, if it ends up empty — **only if the file is still byte for
byte what the installer placed**. If you edited it, or put something else there, it is left in
place, the installer says so, and stops tracking it. A personal skill named `wayfinder` can
take precedence over the plugin's `/wayfinder`, so delete it yourself if it is not the one you
want.

> **Caveat for that one update.** The vault's *own* older `_tools/bootstrap.mjs --from <repo>`
> is the previous installer, which deletes the old copy without that check and may leave an
> empty `wayfinder/` folder behind — one more reason to update as
> [Upgrading from 0.4.x](#upgrading-from-04x) says, with the `npx` one-liner or the repo's own
> `template/_tools/bootstrap.mjs`.

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

Then `git revert <the "chore(vault): update wayfinder template …" commit>`. An update that
migrated the vault made a second commit right after it, `wf(migrate): vault schema 2`: revert
that one first. For a single file, `git log -p -- "<file>"` shows what it looked like before.

Files written **outside** the vault get a copy next to themselves the first time they are
modified, if they already existed: `~/.claude/settings.json.bak`, `~/.claude/CLAUDE.md.bak`,
and Obsidian's `obsidian.json.bak`. A `.bak` already there — from an earlier run, or one you made
yourself — is never overwritten, so it is the oldest copy, not the latest. (Nothing existed,
nothing to back up — no `.bak`.)

---

## Running it again

The installer is safe to run repeatedly — that is a property you should be able to rely on
before you are willing to run it at all.

- A second run on an installed vault **is an update**, which applies only with `--yes` —
  without it, or with `--plan`, it is a dry run. Files that already match are skipped,
  nothing is written, and no empty commit is made.
- The hooks and the `wf` allow rule are wired once. A repeat run finds them and changes
  nothing; old autocommit entries it removed do not come back.
- The `~/.claude/CLAUDE.md` block is written once and replaced in place on later runs. A
  block an older version wrote (no markers) is found by its heading and replaced, not
  duplicated.
- `wf migrate` plans nothing on a vault it already migrated.
- Your `Wayfinder Config.md`, `Wayfinder Picks.md`, and efforts are untouched every time.

And `--plan` holds on an installed vault, not just a fresh one — that is the run where
looking first is worth anything.

---

## After it is installed

Health checks, troubleshooting, and how to keep an installed vault happy live in that vault's
own `SETUP.md`, placed at the vault root by the installer. This page is only about getting
the vault onto a machine and keeping it in step with this repo.
