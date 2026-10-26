# wayfinder-vault

Obsidian vault + local-markdown issue tracker สำหรับ `/wayfinder` — **ทุก repo รวมที่นี่ที่เดียว**

**แยกจาก knowledge base ถาวรโดยตั้งใจ** — ที่เก็บความรู้ (ADR / module doc / insight) เก็บของที่
กลับมาอ่านซ้ำได้เรื่อย ๆ ส่วนที่นี่คือ plan/ticket ที่เป็น **single-use scratch** ใช้ครั้งเดียวแล้วจบ
⇒ ห้ามปนกัน ไม่งั้น knowledge base จะเต็มไปด้วยของที่หมดอายุไปตั้งแต่วันที่ปิดใบ

## ทำไมถึงอยู่นอก repo

map ที่เก็บใน git worktree ของ repo งานหายไปพร้อม worktree เมื่อไม่เคยถูก commit
vault นี้อยู่นอก repo และมี git ของตัวเอง → map ไม่ผูกชะตากับ branch/worktree ของ repo ใด ๆ
และไม่มีทางหลุดเข้าไปใน PR ของ repo งาน

## โครงสร้าง

```
wayfinder-vault/
├── Wayfinder Dashboard.md      ← ระดับใบ ทั้ง vault: หยิบอะไรได้ · ติดที่ใคร · ใครจับอยู่
├── Wayfinder Efforts.md        ← ระดับแมป ทั้ง vault: แต่ละ effort ไปถึงไหน · อันไหนถูกลืม
├── Wayfinder Effort Tickets.md ← ระดับใบ effort เดียว: effort นี้เหลืออะไร · ปิดใบไหนแล้วอะไรเดินต่อ
├── Wayfinder Config.md         ← **ของคุณ** ค่าที่จูนเอง (เส้นแบ่งเวลา · สี · ป้ายสถานะ) — อัปเดตไม่แตะ
├── Wayfinder Picks.md          ← **ของคุณ** กฎ "หยิบอันไหนต่อ" = `sort:` ใน frontmatter — อัปเดตไม่แตะ
├── README.md
├── SETUP.md                    ← อัปเดต · ตรวจสุขภาพ vault (ติดตั้งครั้งแรก = `INSTALL.md` ของ repo)
├── _tools/
│   ├── wf.mjs                  ← CLI ตัวเดียวที่เปลี่ยนสถานะของ map/ticket (ดู § Wayfinding operations)
│   ├── bootstrap.mjs           ← ติดตั้ง/อัปเดต vault (ดู `INSTALL.md` ของ repo ต้นฉบับ)
│   ├── doctor.mjs              ← ตรวจสุขภาพ vault + ลินต์ ticket ทุกใบ
│   ├── lib/core.mjs            ← read model ตัวเดียวที่ `wf` กับทุกหน้าใช้ร่วมกัน (frontier · lint · …)
│   ├── views/wf-core.js        ← loader กลางของ Dataview: หน้าไหนจะใช้ core ต้องโหลดผ่านตัวนี้
│   ├── views/<หน้า>.js         ← โค้ดของแต่ละหน้า (dashboard · efforts · effort-tickets · picks) — บล็อกในโน้ต
│   │                             เป็นแค่บรรทัดเดียวที่เรียก view นี้ (sandbox เขียน `_tools/` ไม่ได้ แต่เขียนโน้ตได้)
│   ├── frontmatter-guard.mjs   ← PreToolUse hook: ปฏิเสธ Write/Edit ที่แตะ frontmatter ของ map/ticket
│   │                             แล้วบอก verb ของ `wf` ที่ต้องใช้แทน
│   └── autocommit.sh           ← PostToolUse hook: commit เนื้อความที่ agent เขียนด้วย Write/Edit
│                                 (ของที่ `wf` เขียน `wf` commit เอง)
└── <repo>/                     ← example-repo, ชื่อ repo ที่ทำงานอยู่, ...
    └── <effort>/               ← getting-started, ...
        ├── map.md
        ├── issues/
        │   └── NN-<slug>.md
        └── assets/                 ← ถ้ามี: ผล query, script, บันทึกยาว ที่ ticket อ้างถึง
            └── NN-<slug>.<ext>        ตั้งชื่อขึ้นต้นด้วยเลข ticket ที่สร้างมัน
```

`_tools/` ขึ้นต้นด้วย `_` เพราะ Dataview query ทุกอันกรองด้วย `FROM -"_tools"` และทั้ง `wf` กับ loader
ข้ามโฟลเดอร์ `_…` ที่รากของ vault ตอนอ่านโน้ต

`assets/` เป็น **ที่เก็บของแนบ ไม่ใช่ ticket** — `wf` และหน้า `Wayfinder Efforts` /
`Wayfinder Effort Tickets` มองหาเฉพาะโฟลเดอร์ชื่อ `issues/` ไฟล์ `.md` ใน `assets/` จึงไม่ต้องมี frontmatter
อ้างจาก ticket ด้วย `../assets/…` (ticket อยู่ลึกกว่าหนึ่งชั้น) อ้างจาก `map.md` ด้วย `assets/…`

## รูปแบบ map

`wf chart` สร้างไฟล์นี้ และ verb ในตาราง § Wayfinding operations เป็นคนเขียน frontmatter (ยกเว้นฟิลด์ที่ไม่มี verb
ในตารางข้างล่าง) — ตัวอย่างข้างล่างคือหน้าตาของ map ที่เดินมาสักพักแล้วถูกพักไว้ระหว่างรอใบของอีก effort

```markdown
---
kind: map
title: Getting started
status: paused              # draft | active | paused | done | dropped
status_since: 2026-08-26    # ประทับโดย verb ที่เปลี่ยน status
created: 2026-08-01
runs: 12                    # จำนวน chip ที่ /wayfinder-next สร้างให้ effort นี้ (ไม่มี = ยังไม่เคยสร้าง)
status_note: "กลับมาเมื่อพร้อมกดปุ่ม promote บน Vercel dashboard เอง"
blocked_by: "[[example-repo/schema-cleanup/issues/12-freeze-legacy-columns]]"
---

# Getting started
...
```

| ฟิลด์ | เขียนโดย |
| --- | --- |
| `kind` · `title` · `created` | `wf chart` ครั้งเดียวตอนสร้าง |
| `status` · `status_since` · `status_note` | `wf map-status` |
| `superseded_by` | `--superseded-by` ของ `wf map-status` (เฉพาะ `paused`/`dropped` ที่มี map อื่นมาแทน) |
| `runs` | `wf bump-runs` |
| `blocked_by` | ไม่มี verb — เจ้าของ vault ใส่/ลบเองใน Obsidian (guard ปฏิเสธ agent) · lint บอกว่าปลดแล้ว ⇒ agent บอกเจ้าของ ไม่แก้เอง |
| `repos` · `base_branch` | ไม่บังคับ · ใส่ไว้อธิบายเฉย ๆ |

ไม่มีฟิลด์ `repo` / `effort` — ตัวตนของ map คือ path ของมัน (ดู § แนวคิด) · vault รุ่นเก่าที่ยังมีสองฟิลด์นี้
ให้ดู diff จาก `wf migrate` แล้วรัน `wf migrate --yes`

`runs` เป็นของ **`wf bump-runs`** อย่างเดียว — skill `/wayfinder-next` เรียกมัน **ตอนสร้าง chip** เพื่อจองเลขใต้ lock
แล้วเอาเลขนั้นขึ้นหัวชื่อ chip: `#RR-LNN-‹ชื่อย่อ›` (เช่น `#12-G09-ถ้อยคำล็อกของ gate รายจุด`
= รอบที่ 12 ของ effort นี้ · ticket 09 · type `grilling`) เพื่อให้ sidebar ของ Claude Code
อ่านออกว่าใบไหนมาก่อนหลังใน effort เดียวกัน

- map ที่ยังไม่มีฟิลด์นี้ = รอบแรกได้เลข 1 **ไม่เดาย้อนหลัง** จากจำนวน ticket
- chip ที่สร้างแล้วไม่ได้กด = เลขข้ามไปหนึ่ง (`11 → 13`) **ปกติ** เลขนี้ไว้เทียบก่อน/หลัง ไม่ใช่ไว้นับให้ครบ

## สถานะของ map

`status` ของ map เป็นของ **load-bearing** — มันไม่ได้แค่จัดกลุ่มบนหน้า Efforts แต่ **กรอง Frontier
ระดับใบด้วย** ⇒ แปะผิด = ใบหายจากสายตา หรือใบผีลอยขึ้นมาแย่งที่งานจริง · ย้ายด้วย `wf map-status` เท่านั้น

| ค่า | แปลว่า | `--note` ต้องตอบว่า |
| --- | --- | --- |
| `active` | เดินอยู่ — ค่าปกติ · `wf map-status` ไม่ยอมถ้า `## Destination` ยังว่าง | ไม่ต้องมี |
| `draft` | ยังไม่ผ่าน grill หา Destination · **ห้ามต่อยอด** · `wf chart` เริ่มที่ค่านี้ | — |
| `paused` | ตั้งใจพัก เพราะ priority ไปอยู่ที่อื่น | **อะไรจะทำให้กลับมา** (บังคับ) |
| `done` | ถึง Destination แล้ว · `wf map-status` ไม่ยอมถ้ายังมีใบ `open`/`claimed`/`waiting` | ไม่ต้องมี |
| `dropped` | ไม่ทำแล้ว — ยกเลิกเอง หรือถูก map อื่นแทนที่ (`--superseded-by`) | ทำไมถึงทิ้ง (บังคับ) |

**`status_note` คือ "เงื่อนไขกลับมา" ไม่ใช่ "เหตุผลที่หยุด"** — เงื่อนไขที่เช็คได้ (*"กลับมาเมื่อ
`example-repo/production` รับ fix แล้ว"*) บอกได้ทันทีว่าถึงเวลาหรือยัง และตอบ "ทำไมหยุด" ไปในตัว

**`blocked_by`** ทำกับ map อย่างที่ `blockers` ทำกับ ticket — ชี้ได้ทั้ง **ใบ** (ปลดเมื่อ `resolved`)
และ **map** (ปลดเมื่อ `done`) · map ที่มี `blocked_by` ค้างอยู่จะไม่ถูกนับนาฬิกา `paused_stale_days`
เพราะมันไม่ได้ดอง มันรอ

`status_since` คือ **นาฬิกาเดียวของทั้ง vault** — verb ประทับให้ทุกครั้งที่ `status` เปลี่ยน ทั้ง map และ ticket
(ทำไมไม่ใช้ `file.mtime` — ดู § สามหน้าที่ใช้อ่าน vault)

### ปิด map เป็น `done` ⇒ รัน `/retro`

ตอนปิด map คือจังหวะเดียวที่เห็นทั้ง effort ครบ ⇒ เก็บบทเรียนเข้า harness ไว้ก่อนจะลืม

1. `wf map-status <repo/effort> done` — ไม่ยอมถ้ายังมีใบค้าง · สำเร็จแล้วพิมพ์เตือนให้รัน `/retro` · map ที่มี
   `## Build board` ต้องรอให้การ์ดทุกใบในนั้นปิดก่อน (`wf` มองไม่เห็นการ์ด — เช็คเอง)
2. **บอกผู้ใช้ให้พิมพ์ `/retro` เอง** — skill นี้ตั้ง `disable-model-invocation: true` ⇒ agent เรียกผ่าน
   Skill tool ไม่ได้ · ถ้าไม่ระบุ มันจะ retro แค่ *session ปัจจุบัน* แต่ map เดินมาหลาย session ⇒ ให้ระบุ
   ขอบเขตเป็นทั้ง effort เช่น `/retro ทุก session ที่แตะ <vault>/<repo>/<effort>/`
3. ข้อเสนอแต่ละข้อที่ผู้ใช้รับ ไปลงที่ใดที่หนึ่ง **ที่เดียว** (ข้อที่ผู้ใช้ปัดไม่ต้องลงที่ไหน)

   | ข้อเสนอเป็น… | ไปที่ |
   | --- | --- |
   | **งานที่ต้องลงมือ** เช่น แก้ skill · hook · README · `CLAUDE.md` หรือเพิ่ม check | ใบใหม่ (`wf new`) ใน effort ที่เกี่ยวข้องซึ่งยัง `active`/`paused` — **ห้ามเปิดใน map ที่เพิ่งปิด** (ใบที่ขยับหลัง `status_since` ของ map `done` โดน lint จับเป็น "สถานะโกหก") · ถ้าไม่มี effort ไหนรับ ⇒ `wf chart` map ใหม่ |
   | **ความรู้** ที่ไม่มีอะไรต้องทำ | knowledge base ถาวรของคุณ (ถ้ามี) ตามกติกาของที่นั้น |

4. ต่อท้าย map ด้วยหัวข้อ `## Retro` ข้อละบรรทัด `- ‹gist› → [[<repo>/<effort>/issues/NN-<slug>]]`
   หรือ `→ ‹ที่อยู่โน้ตใน knowledge base›` · ถ้าไม่มีข้อเสนอเลยให้เขียน `- (ไม่มีข้อเสนอ — ‹วันที่›)` ไว้ จะได้รู้ว่ารันแล้ว
   ไม่ได้ลืม

## รูปแบบ ticket

`wf new` สร้างไฟล์นี้พร้อมเลข `NN` และโครง `## Question` / `## Answer` — ตัวอย่างข้างล่างคือใบที่ถูกพักรอของนอก

```markdown
---
type: task                  # research | prototype | grilling | task
status: waiting             # open | claimed | waiting | resolved
status_since: 2026-08-26    # ประทับโดย verb ที่เปลี่ยน status
title: Ignored build step
blockers:
  - "[[01-pick-a-host]]"
status_note: "รอ example-repo/production รับ fix ก่อน"   # มีเมื่อ waiting เท่านั้น
wait_until: 2026-09-15      # ไม่บังคับ — เลยวันแล้ว lint เตือน
target_repo: example-lib    # ไม่บังคับ — ใบที่ไปแก้ repo อื่น
---

## Question

...

## Answer

(เติมตอน resolve)
```

| ฟิลด์ | เขียนโดย |
| --- | --- |
| `type` · `title` · `target_repo` | `wf new` ครั้งเดียวตอนสร้าง (`--type` · `--title` · `--target-repo`) |
| `status` · `status_since` | ทุก verb ที่เปลี่ยนสถานะ |
| `blockers` | `--blocker` ของ `wf new` · `wf block` |
| `claimed_by` | `wf claim` · ล้างโดย `wf release` / `wf resolve` |
| `status_note` · `wait_until` | `wf wait` · ล้างเมื่อใบออกจาก `waiting` |

`blockers` เป็น **wikilink** ไม่ใช่เลข — ฟิลด์เดียวได้สองอย่าง: Dataview deref `b.status` ข้ามไฟล์ได้
(เช็ค unblocked ใน query เดียว) และ **Graph View วาด DAG ของ map ให้อัตโนมัติ** · ในตอน effort เดียวกัน
`wf block` เขียน `[[NN-<slug>]]` ข้าม effort เขียน path เต็ม `[[<repo>/<effort>/issues/NN-<slug>]]`

## Wayfinding operations

หัวข้อนี้คือ **tracker doc** ของ `/wayfinder` (plugin `mattpocock-skills`) — skill หาหัวข้อชื่อนี้เอง
เพื่อรู้ว่า map · ticket · blocking · frontier · claim · resolve อยู่ตรงไหนจริง
⇒ **อ่านหัวข้อนี้แล้วทำได้ครบทุก operation ไม่ต้องเปิด `issue-tracker-local.md` ของ upstream**

> ⚠️ **ข้อความในตัว skill ที่ขัดกับหัวข้อนี้ ให้เชื่อหัวข้อนี้** — skill เขียนไว้สำหรับ GitHub issue
> (label · assignee · native blocking · resolution comment · close) และ local tracker แบบ `.scratch/`
> ซึ่ง vault นี้ไม่ใช้ทั้งคู่ — § แปลคำของ upstream แปลให้ทุกคำแล้ว

### เรียก `wf`

```bash
node <vault>/_tools/wf.mjs <verb> [args] [--json]
```

- **frontmatter ของ map/ticket เปลี่ยนผ่าน `wf` ทางเดียว** (ฟิลด์ที่ไม่มี verb เช่น `blocked_by` ของ map เป็นของเจ้าของ vault) — verb ถือ lock · เช็ค invariant · commit ให้ในตัว
  ซึ่งการแก้มือข้ามทั้งสามอย่าง · `frontmatter-guard.mjs` ปฏิเสธ Write/Edit ที่แตะ frontmatter หรือสร้างไฟล์
  map/ticket แล้วบอก verb ที่ต้องใช้ · **เนื้อความ** (Destination · Notes · Answer · Not yet specified · Retro …)
  ยังเขียนด้วย Write/Edit ตามปกติ แล้ว `autocommit.sh` commit ให้
- เรียกด้วย **absolute path** เสมอ (`<vault>` = โฟลเดอร์ของ README นี้ — ย่อหน้า wayfinder ใน `~/.claude/CLAUDE.md`
  จดไว้ให้) · `wf` เขียนและ commit ลง main checkout ของ vault เสมอ ไม่ว่าจะเรียกจาก repo หรือ worktree ไหน
  — ใบที่เนื้อความใน worktree ต่างจาก main ⇒ `wf` เตือนพร้อมบอก path ของ main (ไม่ปฏิเสธ)
- อ้างใบด้วย `repo/effort#NN` · path ใน vault · หรือ wikilink ก็ได้ — `wf` พิมพ์กลับเป็น `repo/effort#NN` เสมอ
- exit `0` สำเร็จ · `1` ผิด invariant (ข้อความบอกกฎ + คำสั่งที่แก้) · `2` ใช้ผิดหรือสภาพแวดล้อมไม่พร้อม
  (vault schema เก่า ⇒ `wf migrate` แล้ว `wf migrate --yes` · เขียนไม่ได้เพราะ `EPERM` ⇒ vault อยู่นอก path ที่ sandbox ให้เขียน)
- verb ที่เขียนทำตามลำดับเดียวกันหมด: lock → อ่านโน้ตใหม่ → เช็ค invariant → เขียนแบบ atomic → สร้าง
  `## Tickets` ใหม่ → commit เฉพาะไฟล์ที่แตะ (`wf(<verb>): <ref>`) → ปล่อย lock → lint effort ที่แตะ
  (lint แค่เตือน ไม่ทำให้ verb ที่สำเร็จแล้วล้ม)
- CLI ตอบเป็นภาษาอังกฤษเสมอ · ข้อความที่ `wf` เขียนลงโน้ตเป็นภาษาตาม `language:` ใน [[Wayfinder Config]]

### Verbs

หนึ่ง verb ต่อหนึ่ง transition — ไม่มี verb กลางแบบ set key=value ⇒ ทุกการเปลี่ยนสถานะผ่านด่าน invariant ของมันเสมอ

| Verb | Transition | รับประกันอะไร |
| --- | --- | --- |
| `wf chart <repo/effort> --title "…"` | map: — → `draft` | สร้าง `map.md` พร้อมโครงหัวข้อ · ไม่ยอมถ้ามี map อยู่แล้ว |
| `wf map-status <repo/effort> active` | map: อื่น ๆ → `active` | `## Destination` ต้องมีเนื้อจริง ไม่ใช่ข้อความ placeholder ของ `chart` |
| `wf map-status <repo/effort> paused --note "…"` | map: อื่น ๆ → `paused` | `--note` บังคับ · `--superseded-by <repo/effort>` ได้ |
| `wf map-status <repo/effort> dropped --note "…"` | map: อื่น ๆ → `dropped` | `--note` บังคับ · `--superseded-by <repo/effort>` ได้ |
| `wf map-status <repo/effort> done` | map: อื่น ๆ → `done` | ไม่มีใบ `open`/`claimed`/`waiting` ค้าง · เตือนให้รัน `/retro` |
| `wf new <repo/effort> --type T --title "…"` | ticket: — → `open` | map ต้องไม่ `done`/`dropped` (`draft`/`active`/`paused` รับใบใหม่ได้) · `NN` = เลขสูงสุด + 1 จองใต้ lock ด้วย exclusive create ⇒ สอง session ไม่มีทางได้เลขเดียวกัน · เขียนโครง Question/Answer (`--question "…"` หรือ stdin) · `--blocker ref` ต้องชี้ใบที่มีจริง · `--target-repo R` ได้ |
| `wf claim <ref>` | `open` → `claimed` | อ่านใบใหม่ใต้ lock ⇒ สอง session claim ใบเดียวกันไม่ได้ · ใบต้องไม่ติด blocker และ map ต้อง `active` · ประทับ `claimed_by` (`--by name` · ไม่งั้นชื่อ branch ของ worktree ที่เรียก · ไม่งั้น session id) |
| `wf release <ref>` | `claimed`/`waiting` → `open` | ล้าง `claimed_by` · `status_note` · `wait_until` |
| `wf wait <ref> --note "…"` | `open`/`claimed` → `waiting` | ต้องบอกว่ารออะไร · `--until YYYY-MM-DD` ⇒ lint เตือนเมื่อเลยวัน · `claimed_by` คงอยู่ — คนเดิมยังถือใบ |
| `wf resolve <ref> --gist "…"` | `claimed`/`waiting` → `resolved` | `## Answer` ต้องไม่ว่างและไม่ใช่ placeholder · ต่อท้าย `## Decisions so far` หนึ่งบรรทัด `- [[NN-slug]]: ‹gist›` โดยอ่าน map ใหม่ใต้ lock ⇒ session ที่ resolve พร้อมกันไม่เขียนทับกัน · `--answer-file <file>` เขียน `## Answer` ของใบใน main checkout จากไฟล์ก่อน ในคอมมิตเดียวกัน (ไฟล์ที่มี `## Answer` ⇒ เอาแค่ section นั้น) |
| `wf resolve <ref> --out-of-scope --gist "…"` | `open`/`claimed` → `resolved` | ใบที่เลย Destination · ต่อท้าย `## Out of scope` แทน `## Decisions so far` |
| `wf block <ref> <blocker-ref>` | — | เพิ่ม (หรือ `--remove`) blocker หนึ่งเส้น · ไม่ยอมถ้าเกิดวง |
| `wf bump-runs <repo/effort>` | — | จองเลขรอบถัดไป (`--count k` ⇒ `k` เลข) ใต้ lock แล้วพิมพ์ช่วงนั้น |
| `wf frontier` | — (อ่านอย่างเดียว) | ใบที่หยิบได้ เรียงตาม [[Wayfinder Picks]] · `--repo R` (repo ต้นทางหรือ `target_repo`) · `--from repo/effort` |
| `wf lint` | — (อ่านอย่างเดียว) | findings ทั้ง vault หรือเฉพาะ effort ที่ระบุ · `--fix` สร้าง block ที่ derive ได้ใหม่ ไม่เปลี่ยนสถานะ |
| `wf migrate` | vault schema 1 → 2 | ค่าเริ่มต้นแค่พิมพ์ diff · `--yes` เขียนทั้งหมดเป็น commit เดียว |

### แนวคิด

- **ตัวตนมาจาก path** — map `<vault>/<repo>/<effort>/map.md` · ticket `<vault>/<repo>/<effort>/issues/NN-<slug>.md`
  (เริ่มที่ `01`) · ของแนบ `<vault>/<repo>/<effort>/assets/` · `<repo>` = repo ที่งานตั้งเป้า **ไม่ใช่** repo ที่
  session รันอยู่ · ไม่มีฟิลด์ `repo`/`effort` ใน frontmatter เพราะสำเนาที่สองของตัวตนคือของที่ขัดกับ path ได้
- **ที่อยู่มีทางเดียว** — map และใบ **ห้ามใช้ `.scratch/`, `docs/plan/` หรือ GitHub issue** (การ์ดขั้น build เป็นอีกเรื่อง
  — ดู § Spec & ticket operations) เพราะ chip ของ `/wayfinder-next` รันใน repo งาน แล้วของที่อยู่ใน worktree
  หายไปพร้อม worktree
- **Frontier** — ใบ `open` ที่ blocker ทุกใบ `resolved` บน map `active` (map `draft`/`paused` ไม่มี frontier)
  · `claimed` กับ `waiting` ไม่นับ · ถามด้วย `wf frontier` ไม่นับเอง
- **blocked ≠ waiting** — ทั้งคู่หลุดจาก Frontier แต่ action ต่างกัน จึงแยกคนละ view บน Dashboard
  - `blocked` **ไม่ใช่ค่าสถานะ** — คำนวณจาก `blockers` ของใบที่ยังเป็น `open` แปลว่าติดใบอื่น *ที่อยู่ในมือเรา*
    ⇒ ปลดเองได้ด้วยการปิดใบนั้น · blocker ที่หาไม่เจอก็นับว่าติด (lint ฟ้อง)
  - `waiting` **เป็นค่าสถานะจริง** (`wf wait`) — รอเหตุการณ์ *นอกมือเรา*: คนกดปุ่มบน dashboard · prod release ·
    พาร์ตเนอร์ตอบ
  - `waiting` ยังบล็อกใบอื่นได้ เพราะใบปลดเมื่อ blocker ทุกใบ `resolved` เท่านั้น
  - `waiting` ไม่มีนาฬิกาเตือนของตัวเองโดยตั้งใจ — view `⏳ รอของนอก` ที่เห็นทุกครั้งที่เปิด Dashboard คือสัญญาณ
    (อยากได้วันทวง ⇒ `--until`)
- **Read model ตัวเดียว** — `_tools/lib/core.mjs` เป็นตัวคำนวณ frontier · lint · เลข "ปลดล็อกกี่ใบ" ให้ทั้ง `wf`,
  `doctor.mjs` และทุกหน้าใน Obsidian ⇒ ทุกที่เห็นเลขเดียวกัน · อ่านจากโน้ตตรง ๆ ทุกครั้ง ไม่มีไฟล์ index ให้
  เก่าค้าง · `## Tickets` ใน map เป็น block ที่ `wf` สร้างระหว่าง `<!-- wf:tickets -->` กับ `<!-- /wf:tickets -->`
  (ใบละบรรทัด `- [[NN-slug]] · type · status · title` + ⛔ เมื่อติด blocker) — แก้มือจะถูกเขียนทับ · ไม่ตรงกับ
  frontmatter ⇒ `wf lint --fix`
- **กฎการหยิบเป็นข้อมูล** — `sort:` ใน frontmatter ของ [[Wayfinder Picks]] (ค่าเริ่มต้น `[unblocks desc, nn asc]`)
  · key ที่ใช้ได้: `unblocks` (จำนวนใบ `open` ที่ `blockers` มีใบนี้ — ลิงก์ในเนื้อความไม่นับ) · `afk_first` (research
  ก่อน) · `same_effort` (ใบของ effort ใน `--from` ก่อน) · `nn` · `wf frontier` เรียงตามนี้ ⇒ agent ไม่จัดลำดับเอง
  ตัดสินแค่ว่าใบไหนชนกัน (ไฟล์เดียวกัน · repo เดียวกัน) ไล่จากบนลงล่าง

### แปลคำของ upstream

| upstream พูดว่า | ใน vault นี้คือ |
| --- | --- |
| issue ที่ติด label `wayfinder:map` | `map.md` — สร้างด้วย `wf chart` |
| child issue ของ map | ไฟล์ใน `issues/` ของ effort เดียวกัน — สร้างด้วย `wf new` |
| label `wayfinder:<type>` · บรรทัด `Type:` | `--type` ของ `wf new` (research · prototype · grilling · task) |
| บรรทัด `Status:` · open / closed | ค่าที่ verb ในตาราง § Verbs เปลี่ยนให้ (ดู § แนวคิด เรื่อง blocked ≠ waiting) |
| assign ให้ตัวเอง (claim) | `wf claim <ref>` |
| unassign | `wf release <ref>` |
| native blocking · บรรทัด `Blocked by: NN` | `wf block <ref> <blocker-ref>` หรือ `--blocker` ของ `wf new` |
| resolution comment | `## Answer` ในไฟล์ ticket — เขียนด้วย Write/Edit ก่อน `wf resolve` |
| close | `wf resolve <ref> --gist "…"` |
| ชื่อ (title) ของ issue | wikilink `[[NN-<slug>]]` — ใช้รูปนี้ใน Decisions so far และตอนเล่า ไม่ใช้เลขเปล่า |
| asset ที่ link จาก issue | `assets/NN-<slug>.<ext>` อ้างจาก ticket ด้วย `../assets/…` |
| branch `research/<name>` | **ไม่มี** — ดู § Research — ไม่สร้าง branch |

### เนื้อความของ map และ ticket

- **map** — หัวข้อใต้ `# ‹title›` ตามลำดับที่ `wf chart` วางไว้: `## Destination` · `## Notes` · `## Tickets` (generated) ·
  `## Decisions so far` · (`## Build board` เฉพาะ effort ที่แตกการ์ดด้วย `/to-tickets` — ดู § Spec & ticket operations) ·
  `## Not yet specified` · `## Out of scope` · (`## Retro` เฉพาะ map ที่ `done` — ดู § ปิด map เป็น `done` ⇒ รัน `/retro`)
- **Decisions so far** และ **Out of scope** — `wf resolve` ต่อท้ายให้ ใบละบรรทัด ตามลำดับที่ปิด · ไม่เขียนเอง
- **ticket** — `## Question` มาจาก `wf new` · `## Answer` เขียนเองด้วย Write/Edit แทน placeholder ก่อน resolve
- **ภาษา** — เนื้อความที่เขียนลง map/ticket ให้เป็นภาษาตาม `language:` ใน [[Wayfinder Config]] (ไม่มี = `en`)
  เพราะ plugin `/wayfinder` ไม่ได้อ่านโน้ตนั้นเอง · หัวข้อ · คีย์ frontmatter · wikilink คงตามรูปข้างบนทุกภาษา

### ลำดับงาน

- **Chart** — `wf chart <repo/effort> --title "…"` (ได้ `draft`) → grill จนได้ Destination แล้วเขียนลง
  `## Destination` → `wf map-status <repo/effort> active` → แตกใบด้วย `wf new` (ใบที่ blocker ยังไม่มีไฟล์
  ⇒ สร้างทุกใบก่อน แล้วค่อยต่อเส้นด้วย `wf block`)
- **Claim** — `wf claim <ref>` ก่อนทำอะไรทั้งนั้น — มันอ่านใบใหม่ใต้ lock เอง ใบที่ session อื่นเพิ่งจับจะถูกปฏิเสธ
- **Resolve** — เขียนคำตอบใต้ `## Answer` (สิ่งที่ตัดสิน · ข้อเท็จจริงที่ใบอื่นต้องใช้ · ลิงก์ PR · ลิงก์ asset)
  แล้ว `wf resolve <ref> --gist "…"`
  · **session ที่ทำงานใน worktree**: เขียน Answer ลงใบใน worktree (หรือไฟล์ไหนก็ได้) → `wf resolve <ref> --gist "…" --answer-file <ไฟล์นั้น>`
- **หลัง resolve** — แตกใบใหม่ด้วย `wf new` · ย้าย fog ที่ชัดแล้วออกจาก Not yet specified · ใบที่เลย
  Destination ⇒ `wf resolve <ref> --out-of-scope --gist "…"` (ไม่เข้า Decisions so far)
- **รอของนอก** — `wf wait <ref> --note "…"` · เลิกรอหรือปล่อยมือ ⇒ `wf release <ref>`
- **1 session resolve ได้ 1 ใบ** ยกเว้น research

### Research — ไม่สร้าง branch

upstream สั่งให้ subagent เก็บผลไว้ใน branch `research/<name>` — **vault นี้ไม่ทำ**
vault ไม่มีแนวคิดเรื่อง branch และ branch ทิ้งใน repo งานคือขยะที่ไม่มีใครลบ

- ยิง subagent ขนานกันได้ ใบละตัว · แต่ละตัว `wf claim` → เขียนผลลง `## Answer` ของใบตัวเอง
  (ของยาวไป `assets/`) → `wf resolve` ตามปกติ
- subagent **ไม่แตกใบใหม่และไม่แตะ `map.md`** — คืนข้อเสนอมาให้ session หลักแตกใบด้วย `wf new`
  หลังทุกตัวกลับมาแล้ว เพราะ session หลักเห็นข้อเสนอครบทุกตัวจึงรวมใบที่ซ้ำกันได้
- ข้อค้นพบที่ใช้ได้นานกว่า effort นี้ ⇒ promote ไป knowledge base ถาวรของคุณ (ถ้ามี)
  แล้วลิงก์จาก `## Answer` — vault นี้เป็น scratch ปิด effort แล้วไม่มีใครกลับมาค้น

### Glossary และ ADR

`domain-modeling` ที่ `/wayfinder` เรียกให้อาจแก้ `GLOSSARY*.md` หรือ ADR ใน **repo งาน** —
ของพวกนี้**ไม่ใช่ plan doc** ต้องไปถึง `main` ของ repo นั้น

- รวมเข้า PR ของ feature branch ที่ทำอยู่ หรือเปิด docs-only PR แยก แล้วบันทึกลิงก์ PR ใน `## Answer`
- ห้ามทิ้งค้างใน worktree — worktree ถูกลบเมื่อไหร่ของก็หายไปด้วย

## Spec & ticket operations

หัวข้อนี้บอกว่าขั้น build หลัง `/wayfinder` — `/to-spec` · `/to-tickets` · `/implement` · `/implement-spec`
(plugin `mattpocock-skills`) — **แตะ vault ตรงไหนบ้าง** · vault **ไม่ใช่** tracker ของขั้นนี้: spec กับ build ticket
ไปอยู่ที่ที่ repo งานกำหนด แล้ว map เก็บแค่ตัวชี้ไปหามัน

> ⚠️ **กลับด้านจากรุ่นก่อน** — รุ่นก่อนให้ spec อยู่ใน `assets/NN-spec.md` และ build ticket อยู่ใน map `-build`
> ของ vault · ตอนนี้ไม่ใช่แล้ว: งานที่รันจริงบน tracker ของ repo (board · agent orchestrator · คนในทีม) มองไม่เห็น vault
> และ spec ที่ต้องให้เจ้าของ product review ต้องอยู่ที่ที่เขา review ได้ · map `-build` ที่เปิดไว้ก่อนกติกานี้
> ทำต่อจนจบแบบเดิมได้ ไม่ต้องย้าย

### ใครเป็นเจ้าของอะไร

| ของ | อยู่ที่ | กติกาของใคร |
| --- | --- | --- |
| map · grilling · research · prototype | vault | README นี้ |
| spec | ที่ที่ repo งาน (หรือ knowledge base ของ product) กำหนด — เช่น PR เพิ่มไฟล์ spec ให้เจ้าของ product review | `AGENTS.md` / `docs/agents/issue-tracker.md` ของ repo นั้น |
| build ticket (การ์ด) | tracker ของ repo งาน (GitHub issue · board ฯลฯ) ตาม format · สถานะ · label ของ repo นั้น | `docs/agents/issue-tracker.md` ของ repo นั้น |
| ลำดับการ์ดข้าม repo | `## Build board` ของ map | README นี้ (ข้างล่าง) |

- **repo งานไม่ได้บอกที่ไว้** ⇒ หยุดแล้วถามผู้ใช้ หรือให้รัน `/setup-matt-pocock-skills` ใน repo นั้นก่อน —
  **ห้ามถอยกลับมาเขียนลง vault · `.scratch/` · หรือ output ลงแชต** spec และการ์ดที่ไม่ได้อยู่ใน tracker จริงคือของที่หายไปพร้อม session
- กติกาเฉพาะของทีม (format หัวการ์ด · หัวข้อบังคับ · path ของ spec · board ไหน) อยู่ใน repo ของทีม **ไม่ใช่ที่นี่**
  ⇒ vault ตัวเดียวใช้กับหลาย repo ที่ format ต่างกันได้

### เลือก pipeline

| งาน build | ใช้ | หมายเหตุ |
| --- | --- | --- |
| ไม่เกิน 2 PR | `/implement` ต่อจากใบใน map เลย | ไม่ต้องมี spec หรือการ์ด · ใบใน vault เป็นเจ้าของ PR — ดู § `/implement` — ใครเป็นเจ้าของ PR |
| 3 PR ขึ้นไป | `/to-spec` → `/to-tickets` → ทำการ์ดบน tracker ของ repo | หยิบการ์ดตามวิธีของ repo นั้น (board · orchestrator · assign ตัวเอง) — **ไม่ใช่** chip ของ `/wayfinder-next` |
| `/implement-spec` | **ยังทดลอง** — ใช้กับ effort ที่การ์ดทุกใบเป็น two-way door เท่านั้น | ได้ integration branch + PR ตัวเดียว ซึ่งขัดกับ 1 การ์ด = 1 PR ผลทดลองจะมาแก้ตารางนี้ |

### Spec — `/to-spec`

- ใบใน map ที่รัน `/to-spec` เป็นเจ้าของ spec: เขียน spec ไปที่ที่ repo งานกำหนด แล้วลิงก์ (ไฟล์ · PR) ไว้ใน `## Answer`
- spec ที่ต้องรอคน review (เปิดเป็น PR) ⇒ `wf wait <ref> --note "รอ review spec ‹ลิงก์ PR›"`
  · **`wf resolve` เมื่อ PR merge แล้ว** — `/to-tickets` ต้องอ่าน spec ฉบับที่ผ่าน review ไม่ใช่ฉบับร่าง
- คำถาม product ที่โผล่ระหว่างเขียน spec ให้เจ้าของ product ตอบในที่ของเขา (comment บน PR · แก้เอกสาร product)
  **ไม่ตัดสินแทนใน vault**
- repo ไม่มี template ของ spec เอง ⇒ ใช้ `<spec-template>` ของ `/to-spec` ครบทุกหัวข้อ แล้วเพิ่ม **`## Locked Decisions`**
  ต่อจาก `## Implementation Decisions` — สิ่งที่ตัดสินแล้ว implementer ห้ามรื้อ · อ้าง ADR ด้วยชื่อ และอ้างคำใน glossary ได้
- **ไม่ใส่ path หรือ `file:line`** ทั้งฉบับ (กฎเดียวกับ upstream) — path เก่าเร็ว ให้ไปอยู่ในการ์ด

### Build ticket — `/to-tickets`

- อ่าน spec ที่ merge แล้ว → **quiz breakdown ให้คนอนุมัติก่อนตามปกติ อย่าข้าม** → สร้างการ์ดบน tracker ของ repo งาน
  ตาม format ของ repo นั้น · **ไม่สร้าง map `-build` และไม่มีไฟล์ใบ build ใน vault**
- 1 การ์ด = 1 PR · งานหลาย repo ⇒ การ์ดแยก repo ละใบ
- **door** — ระบุในการ์ดทุกใบว่า one-way หรือ two-way (คำเดียวกับ Merge Danger ของ `/pr`) ในช่องที่ format ของ repo มี
  (เช่น ช่องความเสี่ยง)
  - **two-way** ถอยกลับได้ถูก ⇒ การ์ดที่ไม่ติดกันทำขนานกันได้
  - **one-way** ถอยไม่ได้หรือถอยแพง (schema · migration · ข้อมูลที่เขียนไปแล้ว · contract ที่คนนอกใช้)
    ⇒ ต้องติด blocker ครบทุกใบที่ต้อง merge ก่อน และการ์ดที่ตามหลังติดใบ one-way นั้น
- **blocker ใน repo เดียวกัน** ใช้ช่อง blocker ของ tracker / format ของ repo
- **blocker ข้าม repo** — tracker ส่วนใหญ่อ้าง blocker ข้าม repo ไม่ได้ (หรืออ้างได้แต่เครื่องมือที่หยิบการ์ดอ่านไม่ออก)
  ⇒ บันทึกใน `## Build board` ของ map แทน · การ์ดที่ต้องรอ repo อื่น **ไม่ปล่อยเข้าคิวที่หยิบได้ทันที**
  (ค้างในสถานะรอตามคำของ tracker นั้น) · คนปล่อยเองเมื่อ blocker merge แล้ว
- effort มี **issue ระดับฟีเจอร์** (ลิงก์ไว้ใน `## Build board`) และ tracker มี sub-issue ⇒ ผูกการ์ดทุกใบเป็น sub-issue ของมัน
- ใบใน map ที่รัน `/to-tickets` เขียน `## Build board` แล้ว `wf wait <ref> --note "รอการ์ดใน ## Build board ปิดครบ"`
  — ใบนี้กันหน้า Efforts ไม่ให้เตือน "ใบหมดแล้ว → done" ระหว่างที่การ์ดยังเดิน (map ที่ใบค้างทุกใบเป็น `waiting`
  ไม่ถูกนับนาฬิกา `stale_days`) · **`wf resolve` เมื่อการ์ดทุกใบปิด** แล้วปิด map ตาม § ปิด map เป็น `done` ⇒ รัน `/retro`
- **ไม่มีเครื่องไหนเห็นว่าการ์ดปิดครบ** (`wf` กับหน้า Efforts อ่าน tracker ไม่ได้) ⇒ ตัวทวงคือใบ `waiting` นี้ใน view
  `⏳ รอของนอก` ของ Dashboard · เห็นมันเมื่อไหร่ให้เปิด `## Build board` ไล่ลิงก์ ปิดครบแล้ว ⇒ resolve

### `## Build board` ใน map

ตัวชี้จาก map ไปหาการ์ด — **ไม่ก๊อปสถานะของการ์ดลงมา** (one copy, one place: สถานะจริงอยู่ใน tracker)

```markdown
## Build board

- Feature: ‹ลิงก์ issue ระดับฟีเจอร์› (ถ้ามี)
- **‹repo-a›**: [#7](‹url›) ‹ชื่อการ์ด› · [#8](‹url›) ‹ชื่อการ์ด›
- **‹repo-b›**: [#12](‹url›) ‹ชื่อการ์ด›
- ลำดับข้าม repo: `‹repo-b›#12 ⟵ ‹repo-a›#7` — ‹ทำไมต้องรอ›
```

- เขียนตอน `/to-tickets` · ใครเปิดการ์ดเพิ่มให้ effort นี้ในภายหลังเติมบรรทัดเอง
- บรรทัด "ลำดับข้าม repo" คือ**ที่เดียว**ที่ลำดับนี้อยู่ ⇒ ก่อนปล่อยการ์ดที่รอ repo อื่นเข้าคิว ดูที่นี่
- map ถึง Destination ด้าน build เมื่อการ์ดทุกใบใน Build board ปิด

### `/implement` — ใครเป็นเจ้าของ PR

- **ทำจากใบใน map** (ไม่เกิน 2 PR) — ใบใน vault เป็นเจ้าของ: PR เปิดแล้วแต่ยังไม่ merge ⇒
  `wf wait <ref> --note "รอ review/merge ‹ลิงก์ PR›"` · **`wf resolve` เมื่อ PR merge แล้ว** ไม่ใช่ตอนเปิด PR ·
  `## Answer` บันทึก ลิงก์ PR · ชื่อ branch · merge commit · fact ที่ใบถัดไปต้องรู้
- **ทำจากการ์ด** — การ์ดเป็นเจ้าของ: เปิด PR ที่ปิดการ์ดเมื่อ merge (ตามธรรมเนียมของ repo) · **ไม่แตะ vault เลย**
  (ไม่มีใบให้ resolve) · fact ที่การ์ดถัดไปต้องรู้ไปอยู่ในการ์ดหรือ PR · ถ้ารู้ว่าการ์ดที่ปิดเป็นใบสุดท้ายใน Build board
  ให้บอกผู้ใช้ว่าใบ `waiting` ของ `/to-tickets` และ map พร้อมปิดแล้ว (ไม่รู้ก็ไม่เป็นไร — view `⏳ รอของนอก` ทวงอยู่)
- 1 การ์ด (หรือ 1 ใบ) = 1 branch = **1 PR ไปที่ base branch ของ repo** (ตามธรรมเนียมของ repo นั้น) · ไม่มี integration branch

## สามหน้าที่ใช้อ่าน vault

สองหน้าแรก **เปิดค้างไว้** ตลอดเวลาทำงาน · หน้าที่สามเปิดเมื่อลงไปอยู่กับ effort ใด effort หนึ่ง

| โน้ต | ระดับ | ขอบเขต | ตอบคำถามว่า | เครื่องยนต์ |
| --- | --- | --- | --- | --- |
| `Wayfinder Dashboard` | **ใบ** | ทั้ง vault | ตอนนี้หยิบใบไหนได้ · ติดที่ใคร · รออะไรอยู่ · vault ผิดตรงไหน (🩺 lint) | บรรทัดเรียก → `_tools/views/dashboard.js` → loader → core |
| `Wayfinder Efforts` | **แมป** | ทั้ง vault | แต่ละ effort เดินไปถึงไหน · อันไหนสถานะไม่ตรงจริง | บรรทัดเรียก → `_tools/views/efforts.js` (HTML) |
| `Wayfinder Effort Tickets` | **ใบ** | **effort เดียว** | effort นี้เหลืออะไร · ปิดใบไหนแล้วอะไรเดินต่อ | บรรทัดเรียก → `_tools/views/effort-tickets.js` (SVG) |

**สามหน้าไม่ได้ซ้ำกัน — แกน "ระดับ × ขอบเขต" คือสิ่งที่แยกมันออกจากกัน** Dashboard กับ Effort Tickets
อยู่ระดับใบเหมือนกันแต่คนละขอบเขต: Dashboard ตอบ *"ทั้ง vault วันนี้หยิบอะไรได้"* (เรียงตามวันที่ ใบจาก
ทุก effort ปนกัน) ส่วน Effort Tickets ตอบสิ่งที่อีกสองหน้าตอบไม่ได้เลย — ***"effort นี้เหลืออะไร และ
ปิดใบไหนแล้วอะไรเดินต่อ"*** คือเห็นใบทั้ง effort พร้อมกัน แยกตาม action เดียวกับ Dashboard (🔥 หยิบได้ ·
🚧 ติดใบอื่น · ⏳ รอของนอก · 🖐 มีคนจับ · ✅ ปิดแล้ว) **บวกกราฟ dependency** ที่ลูกศรชี้
`blocker → ใบที่มันปลด` ⇒ กวาดตาทีเดียวรู้ว่าปิดใบไหนแล้วสายไหนเดินต่อ

หน้านี้ต้องเลือก effort ก่อนถึงจะมีอะไรให้ดู — พิมพ์ค้น `<repo>/<effort>` ในช่องบนสุด หรือ
**คลิกตัวเลขใบ (`44/47`) บนหน้า `Wayfinder Efforts`** แล้วมันจะเด้งมาพร้อมเลือก effort ให้แล้ว
(คลิก *ชื่อ* effort ยังไป `map.md` เหมือนเดิม — ชื่อ = "effort นี้จะไปไหน" · ตัวเลข = "effort นี้มีใบอะไร")
· effort ที่เลือกล่าสุดถูกจำไว้ใน `localStorage` เปิดครั้งหน้าได้ตัวเดิมโดยไม่ต้องพิมพ์

> **เลข "ปลดล็อกกี่ใบ" / "ปลดกี่ใบ" มาจาก core (`unblocks`) ทุกหน้า** — Dashboard · Effort Tickets · Picks
> นับจาก `blockers` ของใบอื่นจริง ๆ อย่างเดียว (ลิงก์ในเนื้อความไม่นับ) ⇒ เลขเดียวกันทุกที่ และเป็นตัวที่ `sort:` ใช้เรียง

หน้า `Wayfinder Efforts` **เห็นเต็มตัวแค่ 2 กลุ่ม** ที่เหลือพับเก็บ — เพราะกลุ่มถูกจัดตาม
*action ที่คนดูต้องทำ* ไม่ใช่ตามค่าสถานะ สถานะที่ไม่ต้องการอะไรเลยจึงถูกพับ ไม่ว่ามีกี่ค่าก็ตาม

| กลุ่ม | เข้าเมื่อ |
| --- | --- |
| 🔥 **กำลังเดิน** | `active` + มีใบขยับภายใน `stale_days` |
| ⚠️ **สถานะไม่ตรงพฤติกรรม** | ห้าเคสข้างล่าง — ทุกเคสมีคอลัมน์บอกว่าควรขยับสถานะไปทางไหน |
| พับเก็บ | `⏸ พักไว้` · `✏️ ยังไม่ได้ชาร์ต` · `✅ ปิดแล้ว` · `🗑 ทิ้งแล้ว` (โชว์ `status_note` ต่อท้ายทุกแถว) |

ห้าเคสของกลุ่ม ⚠️ — พูดอย่างเดียวกันหมดคือ *"ที่ประกาศไว้ ไม่ตรงกับที่เกิดขึ้นจริง ⇒ เคาะใหม่ด้วย `wf map-status`"*:

| เคส | → |
| --- | --- |
| `active` แต่ไม่มีใบไหนขยับเกิน `stale_days` (14) | `paused` |
| `paused` เกิน `paused_stale_days` (30) — เฉพาะที่ **ไม่มี** `blocked_by` ค้าง | `dropped` |
| `active` แต่ใบหมดแล้ว | `done` |
| `blocked_by` ปลดแล้ว | กลับมาทำได้ |
| `blocked_by` ชี้ของที่ไม่มีใครผลักให้เดิน | โซ่ตัน |

`paused_stale_days: 30` อยู่เหนือ comeback จริงที่ยาวที่สุดเท่าที่วัดได้ (25 วัน) นิดเดียว — *"พักนานกว่าที่ map
ไหนเคยพักแล้วยังกลับมาได้"* · เป็นค่าของ vault นี้ ไม่ใช่ค่าสากล วัดของตัวเองแล้วปรับใน [[Wayfinder Config]]

> **นาฬิกาทั้ง vault คือ `status_since` ไม่ใช่ `file.mtime`** — `mtime` ตอบว่า *ไฟล์ถูกเขียนเมื่อไหร่* ไม่ใช่
> *งานคืบเมื่อไหร่* (แก้คำผิดก็รีเซ็ต) และ git ไม่เก็บมัน ⇒ clone ไปเครื่องใหม่ทีนาฬิกาทุกตัวเป็นศูนย์ (ดู `SETUP.md`)
>
> นาฬิกาของ effort = `max(status_since ของทุกใบ, status_since ของ map เอง)` — การประกาศสถานะรีเซ็ตนาฬิกา
> ของสถานะนั้น ไม่งั้น map ที่เพิ่งกลับมา `active` จะโดนจิกทันทีด้วยประวัติเก่า

หน้า Efforts และ Effort Tickets ต้องการ **`enableDataviewJs`** ⇒ `.gitignore` ยกเว้น
`.obsidian/plugins/dataview/data.json` ไว้ให้ค่าตั้งนี้เดินทางไปกับ repo (`doctor.mjs` ตรวจให้)

## Graph View

ตั้งไว้ให้แล้วใน `.obsidian/graph.json` (track ใน git) — เปิด Graph View ได้เลย

| สี | group | ความหมาย |
|---|---|---|
| 🟢 เขียว | `[status:resolved]` | ตัดสินใจแล้ว |
| 🟡 เหลือง | `[status:claimed]` | มี session จับอยู่ |
| 🟣 ม่วง | `[status:waiting]` | ใบที่รอของนอก |
| ⚪ เทา | `[status:open]` | ยังไม่แตะ |
| 🔵 ฟ้า | `[status:active]` | แมปที่เดินอยู่ |
| 🟩 เขียวเข้ม | `[status:done]` | แมปที่ปิดแล้ว |
| 🩶 เทาอมฟ้า | `[status:paused]` | แมปที่พักไว้ |
| 🩵 ฟ้าน้ำทะเล | `[status:draft]` | แมปที่ยังไม่ได้ชาร์ต |
| 🔴 แดง | `[status:dropped]` | แมปที่ทิ้งแล้ว |
| ▫️ จาง | `path:_tools` | ไม่ใช่เนื้องาน |

ค่าของ `status` ฝั่งใบ (`open`/`claimed`/`resolved`/`waiting`) กับฝั่งแมป
(`active`/`draft`/`paused`/`done`/`dropped`) **ไม่ซ้ำกันสักตัว** ⇒ ทุกกลุ่มเป็น query property เดี่ยว ๆ
ที่ไม่ทับกันเอง — ไม่ต้องพึ่งลำดับความสำคัญของ colorGroups ซึ่ง Obsidian ไม่ได้ระบุไว้ชัด

`showArrow` เปิดไว้ด้วย — ลูกศรชี้จาก ticket ที่ถูก block ไปหา blocker ทำให้อ่านทิศทาง
ของ dependency ออกจากภาพเดียว จะเห็นแนวเขียวไล่ไปหาปลายทาง = เส้นทางที่เดินมาแล้ว
ส่วนเทาคือ fog ที่เหลือ · `blocked_by` ของ map เพิ่มเส้น **แมป → แมป/ใบ** เข้าไปในภาพเดียวกัน
ทำให้เห็นว่า effort ไหนรอ effort ไหนอยู่ โดยไม่ต้องเปิด map ทีละอัน

> ⚠️ syntax ของ Obsidian search: property ต้องใส่วงเล็บ **`[status:resolved]`**
> ถ้าเขียน `status:resolved` เฉย ๆ มันจะกลายเป็นค้นหาข้อความธรรมดา ไม่ใช่ property

## Git

vault นี้ init git ไว้แล้ว (local อย่างเดียว ยังไม่มี remote)
`.obsidian/workspace.json` ถูก ignore ไว้ เพราะมันเปลี่ยนทุกครั้งที่ขยับ pane
ส่วน `community-plugins.json`, `graph.json` และ `plugins/dataview/` (รวม `data.json`)
**track ไว้** เพื่อให้ clone แล้วใช้ได้เลย — ไม่ต้องโหลดปลั๊กอินใหม่ ไม่ต้องตั้งสี Graph View ใหม่
