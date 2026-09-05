---
name: wayfinder-next
description: Create task chips that kick off the NEXT wayfinder session(s). Reads the active wayfinder map's tickets and spawns one chip per ticket, titled `#RR-LNN-{short title}` where RR is this effort's run counter (from the map's `runs:` frontmatter), L is the ticket type letter (T/G/R/P), NN is the ticket number, and the short title is generated from the ticket. Accepts one or more ticket numbers as arguments (e.g. `02` or `01, 02, 04`); with no argument it ranks the frontier by urgency and spawns 1-3 chips — the most urgent ticket plus any that can safely run beside it. Confirms with the user before spawning a chip for a ticket that is blocked, claimed, resolved, or missing. Use when a wayfinder session or ticket is done and you want to queue the next ticket(s) as clickable chips, or when the user says "create wayfinder chip", "next wayfinder session", "chip for next ticket", "wayfinder chip".
---

# Wayfinder Next-Session Chip

Spawn background task chips so the user can start the next wayfinder session(s) in one click. Each chip's title is `#RR-LNN-{short title}`; its prompt is a self-contained `/wayfinder` kickoff for that one ticket.

**One chip = one ticket, always.** A chip may cover several tickets only in the sense that you spawn several chips — never write a prompt that tells one session to resolve more than one ticket.

## Arguments

| what the user typed | what to do |
|---|---|
| nothing | rank the frontier **by urgency** and spawn **1–3 chips** — the top pick, plus up to two that can run beside it (see [Picking tickets](#picking-tickets)) |
| `02` | that ticket — one chip |
| `01, 02, 04` · `01 02 04` · `1,2,4` | those tickets — **one chip each**, in ascending order |

Accept comma- and/or space-separated numbers, with or without zero-padding. Anything that isn't a number (a slug, a phrase) → treat it as naming the ticket and resolve it against `issues/` yourself; ask if it's ambiguous.

## Chip title format

```
#RR-LNN-<short title>          e.g.  #12-G09-ถ้อยคำล็อกของ gate รายจุด
                                     #13-T17-ตัวหารเล็ก = เห็นเลข แต่ไม่ตัดสิน
```

| part | meaning |
|---|---|
| `RR` | **run number** — how many chips this effort has spawned. Zero-pad to 2 (`01`…`99`, then just grows) |
| `L` | **ticket type letter** — `T`ask · `G`rilling · `R`esearch · `P`rototype (from the ticket's `type:` frontmatter) |
| `NN` | **ticket number** from `issues/NN-<slug>.md`, zero-padded to 2 |
| short title | Thai, generated (see below) |

The prefix is exactly 8 chars, so **the short title gets ≤ 52** (`spawn_task` caps titles at 60). Fixed-width prefix is the point — the sidebar reads as columns.

### Short title

Tickets have **no H1** — generate the short title from the bold line under `## Question`. Strip the scaffolding ("ทำกฎ … ให้เป็นโค้ดจริง", "ตัดสินใจว่า…", "แก้…") and keep the kernel. Thai. Never use the file's English slug.

## Run number (`runs:` in the map)

Source of truth is the **map's own frontmatter**:

```yaml
---
repo: acme-web
effort: checkout-redesign
kind: map
runs: 12
---
```

- **Read → allocate → write back to `map.md`, once, before spawning.**
- **One chip**: `RR` = `runs + 1`; write back `runs: runs + 1`.
- **k chips**: allocate a block — the chips get `runs+1 … runs+k` **in ascending ticket order**; write back `runs: runs + k` in a **single edit**. Every chip keeps a distinct `RR`, so the sidebar still orders them.
- **No `runs:` field yet** (every map predating this convention) → the block starts at **1**. Do NOT back-fill a guess from ticket count or decisions — the counter means "runs since we started counting", not a historical total.
- **Gaps are fine.** A chip that never gets clicked, or a spawn that fails after the block was reserved, burns its number (`11 → 13`). The number exists to order runs within one effort, not to tally them.
- The `runs:` write lands in the vault, so the `autocommit.sh` PostToolUse hook commits it — nothing extra to do.

## Picking tickets

**NN always comes from an `issues/NN-<slug>.md` file** — never mint a number that already has one, and never renumber.

- **Explicit numbers given** → those are the tickets. Validate them (next section); don't silently substitute others.
- **No argument** → rank the frontier **by urgency, not by number**, and spawn **1–3 chips** (see below).
- **Every existing ticket is `resolved`** → the next ticket is still in the fog: **reserve** NN = highest existing NN + 1, pick **L = the type you are about to commission** (grilling / task / research / prototype — you're writing the prompt, so you know), and draw the title from the map's `## Not yet specified` or scope. The chip prompt then tells the session to create exactly that file with exactly that type. If you can't decide the type, the work isn't shaped enough for a chip — chart it first.
  **At most one fog-reserved chip per batch** — two would reserve the same NN.

### No argument → rank by urgency, then fill with parallel-safe work

The **frontier** is every ticket that is `status: open`, **not claimed**, and has **every blocker `resolved`**.
Lowest-number-first is a tie-break, not the rule — a map's cheapest ticket and its most urgent one are
routinely different, and a chip spent on the wrong one costs a whole session.

**Rank the frontier by these signals, in order.** All of them are readable from the vault — never rank on a
hunch, and never on your own opinion of what is interesting:

| # | signal | how you read it |
|---|---|---|
| 1 | **a resolved ticket named it urgent** | its `## Answer` (or the map's Decisions-so-far line) says so in words — *"ดัน [[13-…]] ขึ้นเป็นของด่วน"*, *"blocker ของรอบ 2"*. The map already made this call; honour it |
| 2 | **it repairs an invalidated premise** | a recent resolution says another ticket's axis is wrong. Re-basing beats walking further down a road that just moved |
| 3 | **it unblocks the most tickets** | count open tickets listing it in `blockers:`. Two unblocked beats zero |
| 4 | **its evidence expires** | the ticket says a window closes (log retention, a running incident, a vendor ticket). Ordering is forced by the clock, not by us |
| 5 | tie-break | lowest number |

**Then fill the batch.** After the top pick, add up to **two more** frontier tickets that can genuinely run
beside it. A second ticket qualifies only when **both** hold:

- **neither blocks the other**, directly or transitively (walk the `blockers:` graph, don't eyeball it), and
- **they don't write the same answer** — not the same `## Answer`, not the same file or code region.

Two tickets where one may *reshape the other's scope* still qualify — that is normal on a live map — but then
**say it in both prompts**: which one decides, which one implements, and that neither should guess the other's
answer. Prefer 2 over 3 unless the third is plainly independent; **1 is a fine batch** when nothing else is
parallel-safe.

⇒ Report the ranking, not just the result: **one line saying why the top pick won**, so the user can override
in one word. Do NOT ask first — spawn, then show your reasoning.

## Validate before spawning — and confirm

Before spawning anything, read the frontmatter of **every** requested ticket plus the frontmatter of each of its `blockers:` targets. Flag these:

| flag | how you detect it | why it matters |
|---|---|---|
| **blocked** | any `blockers:` wikilink whose target is not `status: resolved` | the session will hit a question it can't answer yet, and may resolve it wrongly on guesses |
| **claimed** | `status: claimed` | another session already holds it — two sessions will collide on the same `## Answer` |
| **resolved** | `status: resolved` | already done; a chip re-opens settled work |
| **waiting** | `status: waiting` | it is parked on something outside our hands (see its `status_note`); a session can't finish it today |
| **map ไม่ active** | the effort's `map.md` has a `status:` other than `active` | the map is paused / not yet charted / dropped **on purpose** — its tickets are off the Dashboard, and a chip drags one back into play behind that decision |
| **no file** | no `issues/NN-*.md` and NN ≠ highest + 1 | the number is a gap, not a reservation |
| **double reservation** | ≥ 2 requested numbers have no file | they'd both claim the same NN |

**If every requested ticket is clean → spawn immediately, no question asked.**

**If any is flagged** → print a compact table (ticket · flag · the specific reason, e.g. *"blocked by 05 (status: open)"*), then ask **once** with `AskUserQuestion` — never one question per ticket:

- when at least one ticket is clean: **ข้ามใบที่มีปัญหา สร้างเฉพาะใบที่พร้อม** (recommended) · **สร้างทั้งหมดอยู่ดี** · **ยกเลิก**
- when every ticket is flagged: **สร้างทั้งหมดอยู่ดี** · **เปลี่ยนไปใช้ใบ frontier แทน** (name the ticket you'd pick) · **ยกเลิก**

Respect the answer literally. "สร้างทั้งหมดอยู่ดี" is a real choice — the user may want a chip queued for a ticket whose blocker is finishing in another session right now. When you spawn a flagged ticket anyway, say so in that chip's prompt (e.g. `⚠️ ใบนี้ถูก block ด้วย 05 ที่ยังไม่ปิด — ถ้ายังไม่ปิดตอนเริ่ม ให้หยุดแล้วรายงาน อย่าเดาคำตอบของ 05`).

## Workflow

1. **Find the active map.** Wayfinder maps live in `__VAULT__/<repo>/<effort>/map.md`. Use the map from the current conversation if known; else list `__VAULT__/*/*/map.md` and pick the one meant (ask if ambiguous).
2. **Resolve the requested tickets** per [Picking tickets](#picking-tickets). Read the map's own `status:` first (a map that is not `active` flags every ticket under it), then `ls` the map's `issues/` and read the `status:`/`type:`/`blockers:` frontmatter of the candidates **and of their blockers**.
   With **no argument**, read the frontmatter of **every** ticket (that is the whole blocker graph in one pass), plus the `## Answer` of the most recently resolved ones and the map's Decisions-so-far — signals 1 and 2 live there and nowhere else.
3. **Validate + confirm** per the section above. Drop or keep flagged tickets according to the answer.
4. **Read each surviving ticket** for its `## Question` bold line → short title; `type:` → `L`.
5. **Allocate the `runs:` block** in `map.md` frontmatter (add it as `runs: k` if absent) in one edit. Ascending ticket order gets ascending `RR`.
6. **Spawn one chip per ticket** with `mcp__ccd_session__spawn_task`:
   - `title`: `#RR-LNN-<short title>` (e.g. `#12-G09-ถ้อยคำล็อกของ gate รายจุด`)
   - `prompt`: the Thai kickoff template below (self-contained)
   - `tldr`: one plain line — what that session does
   - `cwd`: the target repo path (from the map's `repo:` field)
7. **Report** every chip created, one line each (`#RR-LNN-title`), plus one line for anything skipped and why.
   When you picked with no argument, add **one line for why the top pick won** (which signal fired) and, if the frontier had strong runners-up, name them so the user can swap in one word.

## Chip prompt template (write in Thai)

```
/wayfinder work through the map

Map: <absolute map.md path>

โหมด: Work through the map. ทำ ticket <NN> (<title>) — issues/<NN>-<slug>.md
ทำตามขั้นตอน wayfinder: claim ticket ก่อนเริ่ม, resolve, record (## Answer + status:resolved + เติม 1 บรรทัดใน map "Decisions so far"), ห้าม resolve เกิน 1 ticket ต่อ session
```

When the ticket is still in the fog (reserved number), say so explicitly instead of the second line's file path:

```
โหมด: Work through the map. ticket <NN> ยังไม่มีไฟล์ — แตกเป็น issues/<NN>-<slug>.md ด้วย type: <type> ก่อน แล้วค่อย claim
```

**When you spawn more than one chip for the same map**, append this line to every prompt in the batch — concurrent sessions will both edit `map.md`:

```
หมายเหตุ: มี session อื่นของ map นี้รันพร้อมกัน — ตอน record ให้ merge บรรทัดใน "Decisions so far" อย่าทับของใบอื่น
```

## Notes

- **Batching chips is fine; batching tickets into one chip is not.** Each chip's prompt still says "ห้าม resolve เกิน 1 ticket ต่อ session".
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
