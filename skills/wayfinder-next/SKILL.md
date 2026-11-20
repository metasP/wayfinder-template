---
name: wayfinder-next
description: Start the NEXT wayfinder session(s) — one `start_session` per ticket, each in its own worktree named `<effort>-<NN>`. Reads the active wayfinder map's tickets and starts one session ("chip") per ticket, titled `#RR-LNN-{short title}` where RR is a run number allocated by `wf bump-runs`, L is the ticket type letter (T/G/R/P), NN is the ticket number, and the short title is generated from the ticket. Accepts one or more ticket numbers as arguments (e.g. `02` or `01, 02, 04`); with no argument it takes up to 3 tickets from round 1 of `wf frontier` (tickets whose `touches:` don't overlap each other or a claimed ticket), in its order. Confirms with the user before spawning a chip for a ticket that is blocked, claimed, resolved, or missing. Use when a wayfinder session or ticket is done and you want to queue the next ticket(s) as clickable chips, or when the user says "create wayfinder chip", "next wayfinder session", "chip for next ticket", "wayfinder chip".
---

# Wayfinder Next-Session Chip

Start the next wayfinder session(s) with `start_session` — each a "chip" in the sidebar, in its own worktree on a branch named after the ticket. Each chip's title is `#RR-LNN-{short title}`; its prompt is a self-contained `/wayfinder` kickoff for that one ticket. The session that runs this skill only starts them — the ticket is claimed and worked in the new session.

**One chip = one ticket, always.** A chip may cover several tickets only in the sense that you spawn several chips — never write a prompt that tells one session to resolve more than one ticket.

## Language

Read `language:` from the frontmatter of `__VAULT__/Wayfinder Config.md` **once, before generating anything**. It is an ISO 639-1 code (`en`, `th`, `ja`, …). No note, no key, or a blank value → **`en`**.

It sets the language of everything this skill writes for the user to click or read: the **short title**, the **chip prompt**, the **`background`**, and the **`AskUserQuestion` options**. It does **not** change the fixed tokens — `#RR-LNN-` prefix, `/wayfinder work through the map`, `Map:`, file paths, `## Answer`, `status:resolved`, "Decisions so far" — those stay verbatim in every language because the next session matches on them.

The templates below are given in `en` and `th`. For any other language, translate the `en` version, keeping the fixed tokens as they are.

## `wf` — the ticket store

Ticket state and run numbers come from `wf`, the vault's ticket-store CLI — the same read model the Dashboard renders. Run it by absolute path, always with `--json`:

```
node __VAULT__/_tools/wf.mjs <verb> … --json
```

It prints `{ ok, data, error }`. Exit `1` is a refused invariant (`error.details` carries `fix: <command>`); exit `2` is a usage or environment error — `EPERM`/`EACCES` means the vault is outside the sandbox's writable paths. On either, report `error.message` and `error.details` to the user and stop: the chips wait until `wf` answers.

## Arguments

| what the user typed | what to do |
|---|---|
| nothing | take **round 1** of the map's frontier, in `wf frontier` order, and spawn **1–3 chips** (see [Picking tickets](#picking-tickets)) |
| `02` | that ticket — one chip |
| `01, 02, 04` · `01 02 04` · `1,2,4` | those tickets — **one chip each**, in ascending order |
| `after <NN>` | run by **ticket NN's own session** right after its `wf resolve` — offer the next chips in its wrap_up, or close the map; starts nothing on its own (see [After a ticket resolves](#after-a-ticket-resolves-after-nn)) |

Accept comma- and/or space-separated numbers, with or without zero-padding. Anything that isn't a number (a slug, a phrase) → treat it as naming the ticket and resolve it against `issues/` yourself; ask if it's ambiguous.

## Chip title format

```
#RR-LNN-<short title>          e.g.  en  #12-G09-Per-gate lock wording
                                         #13-T17-Small divisor: show the number, don't judge
                                     th  #12-G09-ถ้อยคำล็อกของ gate รายจุด
                                         #13-T17-ตัวหารเล็ก = เห็นเลข แต่ไม่ตัดสิน
```

| part | meaning |
|---|---|
| `RR` | **run number** from `wf bump-runs` (see [Run number](#run-number)). Zero-pad to 2 (`01`…`99`, then just grows) |
| `L` | **ticket type letter** — `T`ask · `G`rilling · `R`esearch · `P`rototype (from the ticket's `type:` frontmatter) |
| `NN` | **ticket number** from `issues/NN-<slug>.md`, zero-padded to 2 |
| short title | generated in `language` (see below) |

The prefix is exactly 8 chars, so **the short title gets ≤ 52** (`start_session` caps titles at 60). Fixed-width prefix is the point — the sidebar reads as columns.

### Short title

Tickets have **no H1** — generate the short title from the bold line under `## Question`. Strip the scaffolding ("Turn rule … into code", "Decide whether…", "Fix…" · "ทำกฎ … ให้เป็นโค้ดจริง", "ตัดสินใจว่า…", "แก้…") and keep the kernel. Write it in `language` — translate the bold line if the ticket is written in another language. Never use the file's slug.

## Run number

`RR` comes from `wf bump-runs`, which allocates numbers from the map's `runs` counter under the vault lock, so two sessions never hand out the same one. `runs` belongs to `bump-runs`. Call it **once per batch, after validation, right before spawning**, with `k` = the number of chips:

```
node __VAULT__/_tools/wf.mjs bump-runs <repo/effort> --count <k> --json
→ { "ok": true, "data": { "ref": "acme-web/checkout-redesign", "from": 12, "to": 13, "runs": 13 } }
```

- The chips take `from … to` **in ascending ticket order**, zero-padded — every chip keeps a distinct `RR`, so the sidebar orders them.
- A map that has never counted starts at `from: 1`; the counter means "runs since we started counting", not a historical total.
- **Gaps are fine.** A chip that never gets clicked, or a spawn that fails after allocation, burns its number (`11 → 13`). The number orders runs within one effort; it doesn't tally them.
- `bump-runs` commits its own write.

## Picking tickets

**NN always comes from `wf`** — a ticket it lists, or the one `wf new` just created. Never pick a number yourself, and never renumber.

- **Explicit numbers given** → those are the tickets. Validate them (next section); don't silently substitute others.
- **No argument** → take the frontier's **round 1** rows **in `wf frontier` order** and spawn **1–3 chips** (see below).
- **No argument, and the frontier has no row for this map** → read the map's `## Tickets` block (see [Validate](#validate-before-spawning--and-confirm)). If any line is not `resolved`, report what holds each one (blocked, claimed, waiting, or the map isn't `active`) and stop.
  **Every line `resolved`, and the map's `status:` is `active`** → if its `## Not yet specified` or scope still names work, the next ticket is in the fog: commission **one** with `wf new` (see [Fog ticket](#fog-ticket--wf-new)) and spawn its chip like any other — the batch is that one chip. Nothing left to name → the map is complete: [close it and leave a `/retro` card](#complete-map--close-it-and-leave-a-retro-card), then stop. A map that is not `active` gets no new ticket — report its status and stop.

### Fog ticket → `wf new`

Pick the **type** you are about to commission (grilling / task / research / prototype — you're writing the prompt, so you know), a one-line **title**, and the one-line **question** — written as the ticket's bold line (`**…**`), since the short title comes from it — both drawn from the map's `## Not yet specified` or scope and written in `language`. If you can't decide the type, the work isn't shaped enough for a chip — chart it first. When you know which files a task or prototype will write, add one `--touches <glob>` per path, so the frontier can run it beside other tickets. Then let `wf` make the ticket:

```
node __VAULT__/_tools/wf.mjs new <repo/effort> --type <type> --title "<title>" --question "**<question>**" --json
→ { "ok": true, "data": { "ref": "acme-web/checkout-redesign#07", "path": "acme-web/checkout-redesign/issues/07-pick-the-payment-step.md", "type": "grilling", … } }
```

- `wf new` takes the number under the vault lock and writes the file with its `## Question` / `## Answer` skeleton, so two sessions never get the same NN. **NN** is the number after `#` in `data.ref`; the ticket file is `data.path`.
- The values go inside shell double quotes: escape any `"`, `$`, `` ` `` or `\` in them, or leave out `--question` and pipe the question on stdin. A title with a line break is refused (exit `2`).
- From here it is an ordinary ticket: `L` from `--type`, the short title from its bold line, the normal `Mode:` line. You checked its map is `active`, and it has no blockers, so it skips [validation](#validate-before-spawning--and-confirm).
- `wf new` exits non-zero → report its `error.message` and `error.details`, and spawn nothing for it. If it succeeded but `bump-runs` or the spawn fails, report the ticket it created — it waits on the frontier for the next run.
- `wf new` commits its own write. Never Write a file under `issues/` yourself — the frontmatter guard refuses it.

### Complete map → close it, and leave a `/retro` card

**Close a complete map.** Run `wf map-status … done`, then start the retro as a side session with `"own_initiative"` — the user clicks the card, and never has to type `/retro` (the skill is `disable-model-invocation: true`, so you can't run it here):

```
node __VAULT__/_tools/wf.mjs map-status <repo/effort> done --json
→ { "ok": true, "data": { "ref": "acme-web/checkout-redesign", "status": "done", "retro_prompt": "/retro every session that touched /…/vault/acme-web/checkout-redesign/", … } }
```

- `wf` refuses when the map is not really done — a pending ticket, a lint error, or a resolved ticket whose branch never reached main. Report its `error.message` and `error.fix` and stop; never add `--force` on your own.
- On success, call `mcp__ccd_session__start_session` once: `initiation` `"own_initiative"`, `context` `"fresh"`, `use_worktree` `false` (the retro reads transcripts and writes the vault through `wf`), `title` `Retro: <repo>/<effort>`, `prompt` **exactly** `data.retro_prompt` — the `/retro` command must be the first thing in the prompt. Never `"user_asked"`: a retro reads every session of the effort, so the user decides when it runs.
- Report the closed map and the card. Start no ticket chip.

### No argument → round 1 of the frontier

Get the candidates from the same read model as the Dashboard — one call serves this section and [validation](#validate-before-spawning--and-confirm):

```
node __VAULT__/_tools/wf.mjs frontier --effort <repo/effort> --json
```

Always pass `--effort` with this map: without it (or with `--from` alone, which only sorts) the call returns every active map's tickets — kilobytes of rows you then throw away. `data.tickets` lists this map's open, unblocked tickets, already in the owner's **pick order** (the `sort:` in *Wayfinder Picks*). Each row carries `ref` (`repo/effort#NN`), `repo`, `effort`, `nn`, `type`, `title`, `target_repo` and `serial`. Keep them in the order given — **that order is the ranking**, and its top row is the top pick.

`wf` has already dealt the rows into **rounds** — don't judge collisions yourself. Each row carries `round`, `touches` and `collides_with`:

- **`round: 1`** — can start now: its `touches:` overlap no other round-1 row and no ticket that is `claimed` right now.
- **`round` 2, 3, …** — waits for a round before it; `collides_with` names the claimed tickets and the higher-ranked rows it overlaps.

Two tickets collide when they share a repo (`target_repo` when set, else the home `repo`) and their `touches:` overlap — a directory covers everything under it. A ticket with no `touches:` is a guess `wf` won't make: a `task` or `prototype` takes its whole repo, a `research` or `grilling` ticket writes only its `## Answer` and collides with nothing. A serial map's rows are one per round.

**The batch is the first 3 rows with `round: 1`**, in the order given. **1 is a fine batch.** No round-1 row while the frontier has rows ⇒ every row waits on a claimed ticket: spawn nothing, and report which claimed ticket holds each (its `collides_with`).

**A row held back only because a ticket has no `touches:`** (a task or prototype taking its whole repo) is often a false collision. Don't spawn it anyway — say in the report which ticket lacks `touches:` and that `node __VAULT__/_tools/wf.mjs touches <ref> <glob>…` (the paths it writes) lets the next frontier pair them.

⇒ Spawn without asking; [step 7](#workflow) reports the walk so the user can override in one word.

### After a ticket resolves (`after <NN>`)

Every chip prompt ends its merge line with this step, so the user never types `/wayfinder-next` or "close the map" between tickets. It runs in **ticket NN's own session**, in the turn that merged and ran `wf resolve` — the user's go-ahead covers it, so don't ask before running it. It reads; it starts no ticket session by itself.

1. **Get the frontier** for this map (the call in [No argument](#no-argument--round-1-of-the-frontier)) and read the map's `## Tickets` block for `claimed` lines — tickets other sessions are working right now.
2. **Frontier has round-1 rows** → the batch is the first 3 of them, as in No argument (`wf` already put rows that overlap a **claimed** ticket in a later round, and a serial map's rows after its claimed one). Don't call `start_session` and don't `bump-runs`: put the batch in this turn's `wrap_up` — `ask` "Start the next ticket(s)?" / "เริ่มใบถัดไปเลยไหม?", `actions[0]` a reply naming them (`Start 08, 09` / `เริ่ม 08, 09`), `actions[1]` `Not now` / `ยังก่อน`, and the recap names each one in a clause. When the user clicks, run this skill with those numbers — the normal path, `"user_asked"` (the click is their request), validated again, so a ticket another session took meanwhile is flagged rather than doubled.
3. **No row, but lines are still `claimed` / `waiting` / blocked** → nothing to offer: say in one clause of the recap which tickets hold the map. The session that resolves the last of them closes it.
4. **No row, every line `resolved`, scope or `## Not yet specified` still names work** → offer the fog ticket the same way (`Open ticket: <title>` / `เปิดใบ: <title>`); run `wf new` only after the click, so nothing is created on a "not now".
5. **Map complete** → do [Complete map](#complete-map--close-it-and-leave-a-retro-card) now, without asking: `wf map-status … done`, then the `/retro` card. When `wf` refuses (another ticket's branch not yet on main, a lint error), put its `error.fix` in the recap and stop — the session that clears it closes the map.

## Validate before spawning — and confirm

Check **every** requested ticket against the frontier from the call above (run it now if you skipped that section): a requested ticket is **clean** when its `ref` is a row of `data.tickets`. Every other one is flagged, and the map's generated `## Tickets` block — the lines between its `<!-- wf:tickets -->` markers, which `wf` rewrites on every state change — says which flag. Each line reads `- [[NN-slug]] · <type> · <status> · <title>`, with a trailing ⛔ when the ticket is blocked:

| flag | its `## Tickets` line | why it matters |
|---|---|---|
| **blocked** | ends in ⛔ (the ticket's `blockers:` names which) | the session will hit a question it can't answer yet, and may resolve it wrongly on guesses |
| **claimed** | status `claimed` | another session already holds it — two sessions will collide on the same `## Answer` |
| **resolved** | status `resolved` | already done; a chip re-opens settled work |
| **waiting** | status `waiting` | it is parked on something outside our hands (its `status_note` says what); a session can't finish it today |
| **map ไม่ active** | status `open`, no ⛔, yet not in the frontier — the map's `status:` is not `active` | the map is paused / not yet charted / dropped **on purpose** — its tickets are off the Dashboard, and a chip drags one back into play behind that decision |
| **PR ไม่ merge** | any status — the ticket's text or the map's `Notes` section names a pull request (`#NN`, `/pull/NN`) the ticket builds on, and `gh pr view NN --json state` says `OPEN` | the session builds on code main doesn't have: it copies the PR's files into the vault or the installed skills by hand, and the next `bootstrap --yes` from main overwrites them (merge-route-fixes#03). A PR whose `state` is `MERGED` or `CLOSED`, or a `gh` that can't answer, is no flag — say which in the report |
| **no file** | no line for NN | there is no ticket NN — a new ticket comes from [`wf new`](#fog-ticket--wf-new), never from a number typed ahead. Always dropped, never offered under "Spawn all anyway": the session would have no file to open |

When a line contradicts the frontier, the block has drifted: `wf lint --fix <repo/effort>` regenerates it.

**If every requested ticket is clean → spawn immediately, no question asked.**

**If any is flagged** → print a compact table (ticket · flag · the specific reason, e.g. *"blocked by 05 (status: open)"*), then ask **once** with `AskUserQuestion` — never one question per ticket:

| when | `en` | `th` |
|---|---|---|
| at least one ticket is clean | **Skip flagged, spawn the ready ones** (recommended) · **Spawn all anyway** · **Cancel** | **ข้ามใบที่มีปัญหา สร้างเฉพาะใบที่พร้อม** (recommended) · **สร้างทั้งหมดอยู่ดี** · **ยกเลิก** |
| every ticket is flagged | **Spawn all anyway** · **Use a frontier ticket instead** (name the ticket you'd pick) · **Cancel** | **สร้างทั้งหมดอยู่ดี** · **เปลี่ยนไปใช้ใบ frontier แทน** (name the ticket you'd pick) · **ยกเลิก** |

Respect the answer literally. "Spawn all anyway" is a real choice — the user may want a chip queued for a ticket whose blocker is finishing in another session right now. When you spawn a flagged ticket anyway, say so in that chip's prompt, in `language`:

- `en`: `⚠️ This ticket is blocked by 05, which is not resolved — if it is still open when you start, stop and report; don't guess 05's answer`
- `th`: `⚠️ ใบนี้ถูก block ด้วย 05 ที่ยังไม่ปิด — ถ้ายังไม่ปิดตอนเริ่ม ให้หยุดแล้วรายงาน อย่าเดาคำตอบของ 05`

and for a ticket that builds on an unmerged PR, name it — `merge #NN first` — so neither the chip nor the user finds out at the next `bootstrap --yes`:

- `en`: `⚠️ This ticket builds on PR #73, which is not merged — merge #73 first (or stop and report); never copy its files into the vault or the installed skills by hand`
- `th`: `⚠️ ใบนี้ต่อยอดบน PR #73 ที่ยังไม่ merge — merge #73 ก่อน (หรือหยุดแล้วรายงาน) · ห้ามก็อบไฟล์ของ PR ลง vault หรือสกิลที่ติดตั้งเอง`

When the map's `Notes` section doesn't say it yet, add the line `- ใบ <NN> ต่อยอดบน PR #<N> — merge #<N> ก่อน` there (Write/Edit, below the frontmatter), so the next run of this skill sees it too.

## Workflow

1. **Find the active map.** Wayfinder maps live in `__VAULT__/<repo>/<effort>/map.md`. Use the map from the current conversation if known; else list `__VAULT__/*/*/map.md` and pick the one meant (ask if ambiguous). Read `language` from `__VAULT__/Wayfinder Config.md` in the same pass (see [Language](#language)), and keep the map's `## Decisions so far` lines — every chip prompt carries them.
2. **Get the frontier** (see [No argument](#no-argument--round-1-of-the-frontier)) — with explicit numbers too, since validation reads it — then **resolve the requested tickets** per [Picking tickets](#picking-tickets). A map in the fog gets its ticket from `wf new` here, before anything is spawned, so the chip carries the NN `wf` printed.
3. **Validate + confirm** per the section above. Drop or keep flagged tickets according to the answer.
4. **Read each surviving ticket** — its `## Question` section goes into the chip prompt verbatim, its bold line → short title; `type` → `L`.
5. **Allocate the run numbers** — one `bump-runs` call for the whole batch (see [Run number](#run-number)). Ascending ticket order gets ascending `RR`.
6. **Start one session per ticket** with `mcp__ccd_session__start_session` (load it with `ToolSearch` `select:mcp__ccd_session__start_session` when it is only listed as deferred):
   - `initiation`: **`"user_asked"`** — the user ran `/wayfinder-next`, which is the request for these sessions. **Never `"offer"`**: an offer shows a **Do it here** button, and one click turns *this* session into the ticket's session (see [This session never works the ticket](#this-session-never-works-the-ticket)).
   - `context`: `"fresh"` · `use_worktree`: `true`
   - `title`: `#RR-LNN-<short title>` (e.g. `#12-G09-Per-gate lock wording`)
   - `branch_name`: **`<effort>-<NN>`** — the effort slug and the zero-padded ticket number, e.g. `checkout-redesign-07`. The app adds its prefix and a suffix (`claude/checkout-redesign-07-1a2b3c`). Never let the app pick the branch name (it invents one that traces back to nothing). `branch_name` names the branch only, not the folder: `start_session` takes no folder name, and the app picks one itself — a random one, or an old worktree folder it recycles from another ticket or effort. A folder that does not name the ticket — even a recycled one — is fine: the chip checks its branch and works where it landed, and the ticket stays traceable through the branch and the claim's `Branch:` / `Session:` trailers. Never have the chip move itself (`EnterWorktree` is what trips the worktree guard).
   - `name`: `<initials>-<NN>` — the first letter of each word of the effort slug, then the ticket number (`checkout-redesign` #07 → `cr-07`), at most 24 chars
   - `prompt`: the kickoff template below in `language` (self-contained)
   - `background`: one or two lines in `language`, at least 80 characters — what that session does, the map's Destination in one clause, and that it claims the ticket itself
   - `cwd`: the path of the repo the ticket changes — its `target_repo` when set, else the `<repo>` of its ref. Leave it out when that is the project this session runs in.

   When the app refuses `"user_asked"` because this turn was not started by the user (another session's message, an automated event), call again with `"own_initiative"` — it leaves a card the user starts, with no **Do it here** button. `own_initiative` takes no `cwd`: for a ticket whose repo is not this project, start nothing and tell the user to run `/wayfinder-next <NN>` from their own message.
7. **Check where each session landed.** After the last `start_session`, call `mcp__ccd_session_mgmt__list_sessions` `{"linked": true}` once (load it with `ToolSearch` when deferred) and read each started session's branch. The branch should contain `<effort>-<NN>`; when it does not — the app ignored `branch_name` — **warn** in the report: the ticket, the session link, its folder and branch, and that a retro will find it by its claim commit instead (`wf claim` records the full session id, the folder and the branch as `Session:` / `Cwd:` / `Branch:` trailers). Do not stop or restart the session for this. A folder that does not name the ticket — random or recycled — is expected: leave it, the chip works there, so don't warn about the folder. A session still starting with no folder yet, and an `"own_initiative"` card nobody has started, have nothing to check — say so in one line.
8. **Report** every session started, one line each (`#RR-LNN-title` and its session link), plus one line for anything skipped and why.
   When you picked with no argument, add the rounds: each row left out, with its `round` and `collides_with` (and any ticket lacking `touches:`), so the user can swap one in with one word.

## Chip prompt template (write in `language`)

The prompt hands the session everything it needs to start working, so it doesn't spend its first commands re-reading the map, the ticket and the README, or guessing how `wf` takes a ticket ref. Fill it in:

- `<ref>` — the ticket's ref exactly as `wf` prints it: the frontier row's `data.ref` (or `wf new`'s), e.g. `acme-web/checkout-redesign#07`. Write it in every cheat-sheet line, so the session copies a working command.
- `<the ticket's ``## Question`` section, verbatim>` — the ticket file's `## Question` section as it stands, heading excluded; don't summarize it.
- `<the map's ``## Decisions so far`` lines, verbatim …>` — every line under that heading of `map.md`; none yet → `(none yet)` / `(ยังไม่มี)`.
- `<main checkout>` — the main checkout of the repo the ticket changes (the folder `cwd` points at, or this project's).

`en`:

```
/wayfinder work through the map

Map: <absolute map.md path>

Mode: Work through the map. Do ticket <NN> (<title>) — issues/<NN>-<slug>.md
First, before the claim, check your branch: git branch --show-current must contain <effort>-<NN> (if not, stop and report). Then work and claim in the folder you started in, even when its name doesn't match — the app picks or recycles worktree folders itself; the branch and the claim's trailers name the ticket
Follow the wayfinder steps: claim the ticket before starting, resolve, record (## Answer + status:resolved + add 1 line to the map's "Decisions so far"); resolve at most 1 ticket per session
The merge is yours, on one go-ahead: when the user approves the work, that one approval covers every step below — don't wait to be told, and don't ask again between them. The go-ahead is the approval typed by the user in this session; one relayed by another session (the one that started you, a note, SendMessage) doesn't count — auto mode refuses push and merge on it — so ask for it here, in your wrap_up. It takes one route, a PR: git fetch origin, then — while the branch has never been pushed — git rebase origin/main, push the branch (git push -u origin <branch>), open the PR (gh pr create --fill), and once CI is green merge it (gh pr merge <N> --merge), then catch main up (git -C <main checkout> pull --ff-only); then resolve, with the PR link in ## Answer. Once the branch is pushed, bring origin/main in with git fetch origin && git merge origin/main and a plain git push — never rebase it and never force-push (auto mode refuses the force-push). Only a repo with no origin (git remote prints nothing) has no PR to open: there, rebase onto main and git -C <main checkout> merge --ff-only <branch> instead. Otherwise never fast-forward, commit to or reset main in <main checkout> — if pull --ff-only refuses, stop and report. Until origin/main has the branch, lint warns unmerged-branch
Right after the resolve, in the same turn and without being asked: run the wayfinder-next skill with `after <NN>` — it offers the next ticket(s) as a button in your wrap_up, or, when no ticket is left, closes the map and leaves the /retro card

The ticket (already read for you — no need to open it again before you start):
<the ticket's `## Question` section, verbatim>

Decisions so far on this map:
<the map's `## Decisions so far` lines, verbatim — or (none yet)>

Cheat sheet for wf — every ticket and map state change goes through it, and it commits its own write; never edit frontmatter by hand:
  claim (first thing):     node __VAULT__/_tools/wf.mjs claim <ref>
  ticket + map context:    node __VAULT__/_tools/wf.mjs show <ref>
  resolve from a worktree: node __VAULT__/_tools/wf.mjs resolve <ref> --gist "<one line>" --answer-file <answer-file>
  parked on outside work:  node __VAULT__/_tools/wf.mjs wait <ref> --note "<what you wait for>"
  hand it back:            node __VAULT__/_tools/wf.mjs release <ref>
  files it writes:         node __VAULT__/_tools/wf.mjs touches <ref> <glob>…   (right after the claim when the ticket has no touches: — keeps parallel tickets off your files)
  lint this map:           node __VAULT__/_tools/wf.mjs lint <repo>/<effort>
  close the map (only when no ticket is left): node __VAULT__/_tools/wf.mjs map-status <repo>/<effort> done
<answer-file> is any file whose ## Answer section holds your answer — the ticket in your worktree will do; the verb copies it into the vault.
A `wf: warning: lint …` line after a verb is yours to handle: run its (fix: …) or say why not.
The shell is zsh: separate outputs with `echo ---`, never `echo =====` (zsh reads =word as a command lookup)
```

`th`:

```
/wayfinder work through the map

Map: <absolute map.md path>

โหมด: Work through the map. ทำ ticket <NN> (<title>) — issues/<NN>-<slug>.md
ก่อน claim ให้ตรวจ branch ก่อน: git branch --show-current ต้องมี <effort>-<NN> (ถ้าไม่มี หยุดแล้วรายงาน) · แล้วทำงานและ claim ใน folder ที่ได้มาเลย แม้ชื่อไม่ตรง — app เลือกหรือรีไซเคิล folder worktree เอง ชื่อ ticket อยู่ใน branch และ trailer ของ claim แล้ว
ทำตามขั้นตอน wayfinder: claim ticket ก่อนเริ่ม, resolve, record (## Answer + status:resolved + เติม 1 บรรทัดใน map "Decisions so far"), ห้าม resolve เกิน 1 ticket ต่อ session
การ merge เป็นหน้าที่ของ session นี้ และใช้ go-ahead ครั้งเดียว: พอผู้ใช้ผ่านงาน คำเดียวนั้นครอบทุกขั้นข้างล่าง — ไม่ต้องรอให้สั่ง และไม่ต้องถามซ้ำระหว่างขั้น · go-ahead คือคำที่ผู้ใช้พิมพ์เองในหน้านี้ คำที่ session อื่นส่งต่อมา (session ที่เปิดเรา · note · SendMessage) ไม่นับ — auto mode ปฏิเสธ push และ merge บนคำนั้น — ให้ขอในหน้านี้ผ่าน wrap_up ของเรา · merge ทางเดียวคือ PR: git fetch origin แล้ว — ตอน branch ยังไม่เคย push — git rebase origin/main · push branch (git push -u origin <branch>) · เปิด PR (gh pr create --fill) · พอ CI เขียวก็ merge (gh pr merge <N> --merge) แล้วตาม main ให้ทัน (git -C <main checkout> pull --ff-only) · branch ที่ push แล้ว ให้ดึง origin/main เข้ามาด้วย git fetch origin && git merge origin/main แล้ว git push ธรรมดา — ห้าม rebase และห้าม force-push (auto mode ปฏิเสธ force-push) · จากนั้น resolve โดยใส่ลิงก์ PR ใน ## Answer · เฉพาะ repo ที่ไม่มี origin (git remote ว่าง) ซึ่งเปิด PR ไม่ได้: rebase บน main แล้ว git -C <main checkout> merge --ff-only <branch> แทน · นอกนั้นห้าม fast-forward / commit / reset main ใน <main checkout> — ถ้า pull --ff-only ไม่ผ่าน ให้หยุดแล้วรายงาน · ก่อน origin/main จะมี branch นี้ lint จะเตือน unmerged-branch
resolve แล้วให้ทำต่อในรอบเดียวกันเอง ไม่ต้องรอสั่ง: เรียก skill wayfinder-next ด้วย `after <NN>` — มันเสนอใบถัดไปเป็นปุ่มใน wrap_up ของเรา หรือถ้าไม่เหลือใบแล้ว ก็ปิด map และเปิดการ์ด /retro ให้

เนื้อใบ (อ่านให้แล้ว — ไม่ต้องเปิดซ้ำก่อนเริ่ม):
<the ticket's `## Question` section, verbatim>

Decisions so far ของ map นี้:
<the map's `## Decisions so far` lines, verbatim — หรือ (ยังไม่มี)>

cheat sheet ของ wf — สถานะของใบและ map เปลี่ยนผ่านมันทางเดียว (มัน commit ให้เอง) ห้ามแก้ frontmatter มือ:
  claim (ทำก่อนอย่างอื่น):  node __VAULT__/_tools/wf.mjs claim <ref>
  ดูใบ + บริบทของ map:     node __VAULT__/_tools/wf.mjs show <ref>
  resolve จาก worktree:    node __VAULT__/_tools/wf.mjs resolve <ref> --gist "<หนึ่งบรรทัด>" --answer-file <ไฟล์-answer>
  รอของนอกมือ:              node __VAULT__/_tools/wf.mjs wait <ref> --note "<รออะไร>"
  ปล่อยใบคืน:               node __VAULT__/_tools/wf.mjs release <ref>
  ไฟล์ที่ใบนี้เขียน:          node __VAULT__/_tools/wf.mjs touches <ref> <glob>…   (ทำหลัง claim ถ้าใบยังไม่มี touches: — กันใบที่ปั่นขนานไม่ให้มาแตะไฟล์เดียวกัน)
  lint map นี้:             node __VAULT__/_tools/wf.mjs lint <repo>/<effort>
  ปิด map (เมื่อไม่เหลือใบแล้วเท่านั้น): node __VAULT__/_tools/wf.mjs map-status <repo>/<effort> done
<ไฟล์-answer> คือไฟล์ไหนก็ได้ที่ ## Answer มีคำตอบ — ใบใน worktree ของเราก็ได้ · verb คัดลอกลง vault ให้
บรรทัด `wf: warning: lint …` หลัง verb เป็นงานของเรา: รันคำสั่งใน (fix: …) หรือบอกว่าทำไมยังไม่รัน
shell คือ zsh: คั่น output ด้วย `echo ---` ห้าม `echo =====` (zsh อ่าน =word เป็นการหาคำสั่ง)
```

**When you spawn more than one chip for the same map**, append this line to every prompt in the batch — concurrent sessions will both edit `map.md`:

```
en  Note: another session of this map is running at the same time — when recording, merge your line into "Decisions so far"; don't overwrite other tickets' lines
th  หมายเหตุ: มี session อื่นของ map นี้รันพร้อมกัน — ตอน record ให้ merge บรรทัดใน "Decisions so far" อย่าทับของใบอื่น
```

## This session never works the ticket

The session that runs `/wayfinder-next` **only starts sessions**. It never runs `wf claim` on a ticket it
starts a session for, never opens a worktree or edits files for it, and never answers its `## Question` —
the claim happens **in the new session**, as the first step of its prompt. A planning session that has been
compacted is the wrong place to build in, and a claim made here has to be released and re-made there
(and burns a second run number).

- Started with `"user_asked"`, the session is already running — there is nothing to click here.
- If a **Do it here** / **New session** card appears anyway (an `"offer"` was sent by mistake), answer
  **New session**; never carry the ticket on in this session.
- If `start_session` fails, report the error and the ticket — do not fall back to doing the ticket here.

## Notes

- **Batching sessions is fine; batching tickets into one session is not.** Each prompt still says "resolve at most 1 ticket per session".
- Prefer batching tickets that **don't block each other** — sessions for a chain (05 blocked by 04) start work that can't finish, which is why the confirm step exists.
- If the map has no open ticket and nothing left in the fog, it is complete: close it and leave the `/retro` card ([Complete map](#complete-map--close-it-and-leave-a-retro-card)) instead of starting a ticket session.
- **The session that started the chips reports changes only.** Each ticket session offers its own next chips and closes the map itself ([After a ticket resolves](#after-a-ticket-resolves-after-nn)), so when a chip's note wakes you: report only what changed since your last report — a ticket resolved, blocked, waiting, a card left, the map closed — in a line each. A note that changes nothing gets no report; never write "still waiting for N" twice. Don't offer or start next chips from a note either: the ticket session already did, and two offers double the sessions.
- **Approval happens in the chip.** When a chip's note says its work waits for the user's approval, tell the user to approve it in that chip, with its link (`approve 02 in [#RR-L02-…](#local_<id>)`) — never relay "approved" to it by `SendMessage`: auto mode refuses the chip's push and merge on an approval that came from another session, so the user ends up typing it in the chip anyway.
- **Grouping comes from who starts the session.** A session from `start_session` is linked to the session
  that started it and nests under the top session in the sidebar (`mcp__ccd_session_mgmt__list_sessions`
  `{"linked": true}` lists the family). ⇒ Run `/wayfinder-next` from the session holding the map and the
  whole effort lands in one family; run it from a ticket's own session and the new sessions nest under that
  one instead. The labels we control are the **title** (`#RR-LNN-…`) and the **branch** (`<effort>-<NN>`) —
  that is why both carry the ticket.
