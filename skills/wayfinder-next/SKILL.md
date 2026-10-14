---
name: wayfinder-next
description: Create task chips that kick off the NEXT wayfinder session(s). Reads the active wayfinder map's tickets and spawns one chip per ticket, titled `#RR-LNN-{short title}` where RR is a run number allocated by `wf bump-runs`, L is the ticket type letter (T/G/R/P), NN is the ticket number, and the short title is generated from the ticket. Accepts one or more ticket numbers as arguments (e.g. `02` or `01, 02, 04`); with no argument it takes the map's frontier in `wf frontier` order and spawns 1-3 chips — the top ticket plus any that don't collide with it. Confirms with the user before spawning a chip for a ticket that is blocked, claimed, resolved, or missing. Use when a wayfinder session or ticket is done and you want to queue the next ticket(s) as clickable chips, or when the user says "create wayfinder chip", "next wayfinder session", "chip for next ticket", "wayfinder chip".
---

# Wayfinder Next-Session Chip

Spawn background task chips so the user can start the next wayfinder session(s) in one click. Each chip's title is `#RR-LNN-{short title}`; its prompt is a self-contained `/wayfinder` kickoff for that one ticket.

**One chip = one ticket, always.** A chip may cover several tickets only in the sense that you spawn several chips — never write a prompt that tells one session to resolve more than one ticket.

## Language

Read `language:` from the frontmatter of `__VAULT__/Wayfinder Config.md` **once, before generating anything**. It is an ISO 639-1 code (`en`, `th`, `ja`, …). No note, no key, or a blank value → **`en`**.

It sets the language of everything this skill writes for the user to click or read: the **short title**, the **chip prompt**, the **`tldr`**, and the **`AskUserQuestion` options**. It does **not** change the fixed tokens — `#RR-LNN-` prefix, `/wayfinder work through the map`, `Map:`, file paths, `## Answer`, `status:resolved`, "Decisions so far" — those stay verbatim in every language because the next session matches on them.

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
| nothing | take the map's frontier **in `wf frontier` order** and spawn **1–3 chips** — the top ticket, plus up to two that don't collide with it (see [Picking tickets](#picking-tickets)) |
| `02` | that ticket — one chip |
| `01, 02, 04` · `01 02 04` · `1,2,4` | those tickets — **one chip each**, in ascending order |

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

The prefix is exactly 8 chars, so **the short title gets ≤ 52** (`spawn_task` caps titles at 60). Fixed-width prefix is the point — the sidebar reads as columns.

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
- **No argument** → take candidates **in `wf frontier` order** and spawn **1–3 chips** (see below).
- **No argument, and the frontier has no row for this map** → read the map's `## Tickets` block (see [Validate](#validate-before-spawning--and-confirm)). If any line is not `resolved`, report what holds each one (blocked, claimed, waiting, or the map isn't `active`) and stop.
  **Every line `resolved`, and the map's `status:` is `active`** → if its `## Not yet specified` or scope still names work, the next ticket is in the fog: commission **one** with `wf new` (see [Fog ticket](#fog-ticket--wf-new)) and spawn its chip like any other — the batch is that one chip. Nothing left to name → the map is complete; say so and stop. A map that is not `active` gets no new ticket — report its status and stop.

### Fog ticket → `wf new`

Pick the **type** you are about to commission (grilling / task / research / prototype — you're writing the prompt, so you know), a one-line **title**, and the one-line **question** — written as the ticket's bold line (`**…**`), since the short title comes from it — both drawn from the map's `## Not yet specified` or scope and written in `language`. If you can't decide the type, the work isn't shaped enough for a chip — chart it first. Then let `wf` make the ticket:

```
node __VAULT__/_tools/wf.mjs new <repo/effort> --type <type> --title "<title>" --question "**<question>**" --json
→ { "ok": true, "data": { "ref": "acme-web/checkout-redesign#07", "path": "acme-web/checkout-redesign/issues/07-pick-the-payment-step.md", "type": "grilling", … } }
```

- `wf new` takes the number under the vault lock and writes the file with its `## Question` / `## Answer` skeleton, so two sessions never get the same NN. **NN** is the number after `#` in `data.ref`; the ticket file is `data.path`.
- The values go inside shell double quotes: escape any `"`, `$`, `` ` `` or `\` in them, or leave out `--question` and pipe the question on stdin. A title with a line break is refused (exit `2`).
- From here it is an ordinary ticket: `L` from `--type`, the short title from its bold line, the normal `Mode:` line. You checked its map is `active`, and it has no blockers, so it skips [validation](#validate-before-spawning--and-confirm).
- `wf new` exits non-zero → report its `error.message` and `error.details`, and spawn nothing for it. If it succeeded but `bump-runs` or the spawn fails, report the ticket it created — it waits on the frontier for the next run.
- `wf new` commits its own write. Never Write a file under `issues/` yourself — the frontmatter guard refuses it.

### No argument → frontier order, then skip collisions

Get the candidates from the same read model as the Dashboard — one call serves this section and [validation](#validate-before-spawning--and-confirm):

```
node __VAULT__/_tools/wf.mjs frontier --from <repo/effort> --json
```

`data.tickets` lists every open, unblocked ticket on an active map, already in the owner's **pick order** (the `sort:` in *Wayfinder Picks*; `--from` gives its `same_effort` key a context). Each row carries `ref` (`repo/effort#NN`), `repo`, `effort`, `nn`, `type`, `title` and `target_repo`. Keep the rows of this map's `repo`/`effort`, in the order given — **that order is the ranking**, and its top row is the top pick.

Then walk the rows from the top and add each one that **collides** with nothing already in the batch, until the batch holds 3. Two tickets collide on:

- **same files** — both would write the same file or code region, or the same `## Answer`;
- **same repo** — both change code in one repo (a ticket's repo is its `target_repo` when set, else its home `repo`).

A colliding row is skipped and the walk goes on to the next row. **1 is a fine batch.**

⇒ Spawn without asking; [step 7](#workflow) reports the walk so the user can override in one word.

## Validate before spawning — and confirm

Check **every** requested ticket against the frontier from the call above (run it now if you skipped that section): a requested ticket is **clean** when its `ref` is a row of `data.tickets`. Every other one is flagged, and the map's generated `## Tickets` block — the lines between its `<!-- wf:tickets -->` markers, which `wf` rewrites on every state change — says which flag. Each line reads `- [[NN-slug]] · <type> · <status> · <title>`, with a trailing ⛔ when the ticket is blocked:

| flag | its `## Tickets` line | why it matters |
|---|---|---|
| **blocked** | ends in ⛔ (the ticket's `blockers:` names which) | the session will hit a question it can't answer yet, and may resolve it wrongly on guesses |
| **claimed** | status `claimed` | another session already holds it — two sessions will collide on the same `## Answer` |
| **resolved** | status `resolved` | already done; a chip re-opens settled work |
| **waiting** | status `waiting` | it is parked on something outside our hands (its `status_note` says what); a session can't finish it today |
| **map ไม่ active** | status `open`, no ⛔, yet not in the frontier — the map's `status:` is not `active` | the map is paused / not yet charted / dropped **on purpose** — its tickets are off the Dashboard, and a chip drags one back into play behind that decision |
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

## Workflow

1. **Find the active map.** Wayfinder maps live in `__VAULT__/<repo>/<effort>/map.md`. Use the map from the current conversation if known; else list `__VAULT__/*/*/map.md` and pick the one meant (ask if ambiguous). Read `language` from `__VAULT__/Wayfinder Config.md` in the same pass (see [Language](#language)).
2. **Get the frontier** (see [No argument](#no-argument--frontier-order-then-skip-collisions)) — with explicit numbers too, since validation reads it — then **resolve the requested tickets** per [Picking tickets](#picking-tickets). A map in the fog gets its ticket from `wf new` here, before anything is spawned, so the chip carries the NN `wf` printed.
3. **Validate + confirm** per the section above. Drop or keep flagged tickets according to the answer.
4. **Read each surviving ticket** for its `## Question` bold line → short title; `type` → `L`.
5. **Allocate the run numbers** — one `bump-runs` call for the whole batch (see [Run number](#run-number)). Ascending ticket order gets ascending `RR`.
6. **Spawn one chip per ticket** with `mcp__ccd_session__spawn_task`:
   - `title`: `#RR-LNN-<short title>` (e.g. `#12-G09-Per-gate lock wording`)
   - `prompt`: the kickoff template below in `language` (self-contained)
   - `tldr`: one plain line in `language` — what that session does
   - `cwd`: the path of the repo the ticket changes — its `target_repo` when set, else the `<repo>` of its ref
7. **Report** every chip created, one line each (`#RR-LNN-title`), plus one line for anything skipped and why.
   When you picked with no argument, add the walk: the top pick, and each row skipped for a collision with what it collided with, so the user can swap one in with one word.

## Chip prompt template (write in `language`)

`en`:

```
/wayfinder work through the map

Map: <absolute map.md path>

Mode: Work through the map. Do ticket <NN> (<title>) — issues/<NN>-<slug>.md
Follow the wayfinder steps: claim the ticket before starting, resolve, record (## Answer + status:resolved + add 1 line to the map's "Decisions so far"); resolve at most 1 ticket per session
```

`th`:

```
/wayfinder work through the map

Map: <absolute map.md path>

โหมด: Work through the map. ทำ ticket <NN> (<title>) — issues/<NN>-<slug>.md
ทำตามขั้นตอน wayfinder: claim ticket ก่อนเริ่ม, resolve, record (## Answer + status:resolved + เติม 1 บรรทัดใน map "Decisions so far"), ห้าม resolve เกิน 1 ticket ต่อ session
```

**When you spawn more than one chip for the same map**, append this line to every prompt in the batch — concurrent sessions will both edit `map.md`:

```
en  Note: another session of this map is running at the same time — when recording, merge your line into "Decisions so far"; don't overwrite other tickets' lines
th  หมายเหตุ: มี session อื่นของ map นี้รันพร้อมกัน — ตอน record ให้ merge บรรทัดใน "Decisions so far" อย่าทับของใบอื่น
```

## Notes

- **Batching chips is fine; batching tickets into one chip is not.** Each chip's prompt still says "resolve at most 1 ticket per session".
- Prefer batching tickets that **don't block each other** — chips for a chain (05 blocked by 04) queue work that can't start, which is why the confirm step exists.
- If the map has no open ticket and nothing left in the fog, say the map is complete instead of spawning a chip.
- **Grouping happens by itself — but the agent cannot target it.** Verified against Claude Code desktop
  1.34493.1 (2026-08-25): `spawn_task` still takes only `title`/`prompt`/`tldr`/`cwd`, so there is no group
  parameter to pass. Grouping belongs to the **desktop app's preferences**, not to the session record:
  `preferences.epitaxyPrefs["dframe-group-scopes"][<account>/<workspace>]` holds `groups[] = {id, name}`
  (names are **user-authored**, not derived from any session title) and `assignments["code:<sessionId>"] =
  <groupId>`. The app writes the assignment when the user starts a chip; the user preference
  `epitaxy-spawn-task-target-v2` (observed value `"here"`) is what routes a new chip into the **spawning
  session's** group.
  ⇒ The lever you control is **which session runs `/wayfinder-next`**: run it from the session holding the
  map and the whole effort lands in one group; run it from a chip's own session and the new chips nest
  under that chip instead. The chip's session record also gets `spawnedFrom` (`{sessionId, taskId, title}`)
  pointing at the spawner, but that is a provenance link, not the grouping key.
  ⚠️ `mcp__ccd_session_mgmt__get_session` returns **neither** the group **nor** `spawnedFrom` — it serves a
  subset of the record. Do not conclude from its output that grouping does not exist; that exact mistake has
  been made. Read the prefs file if you need the truth.
  The title remains the only **label** we control — that is why it carries the run/type/ticket prefix.
