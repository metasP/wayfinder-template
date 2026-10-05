# wayfinder-vault

Obsidian vault + local-markdown issue tracker สำหรับ `/wayfinder` — **ทุก repo รวมที่นี่ที่เดียว**

**แยกจาก knowledge base ถาวรโดยตั้งใจ** — ที่เก็บความรู้ (ADR / module doc / insight) เก็บของที่
กลับมาอ่านซ้ำได้เรื่อย ๆ ส่วนที่นี่คือ plan/ticket ที่เป็น **single-use scratch** ใช้ครั้งเดียวแล้วจบ
⇒ ห้ามปนกัน ไม่งั้น knowledge base จะเต็มไปด้วยของที่หมดอายุไปตั้งแต่วันที่ปิดใบ

## ทำไมถึงอยู่นอก repo

map เดิม (`wayfinder-vercel-ci`) หายไปแล้ว เพราะเก็บใน git worktree ที่ถูกลบ + ไม่เคย commit
vault นี้อยู่นอก repo และมี git ของตัวเอง → map ไม่ผูกชะตากับ branch/worktree ของ repo ใด ๆ
และไม่มีทางหลุดเข้าไปใน PR ของ repo งาน

## โครงสร้าง

```
wayfinder-vault/
├── Wayfinder Dashboard.md      ← ระดับใบ ทั้ง vault: หยิบอะไรได้ · ติดที่ใคร · ใครจับอยู่
├── Wayfinder Efforts.md        ← ระดับแมป ทั้ง vault: แต่ละ effort ไปถึงไหน · อันไหนถูกลืม
├── Wayfinder Effort Tickets.md ← ระดับใบ effort เดียว: effort นี้เหลืออะไร · ปิดใบไหนแล้วอะไรเดินต่อ
├── Wayfinder Config.md         ← **ของคุณ** ค่าที่จูนเอง (เส้นแบ่งเวลา · สี · ป้ายสถานะ) — อัปเดตไม่แตะ
├── Wayfinder Picks.md          ← **ของคุณ** กฎ "หยิบอันไหนต่อ" ที่เขียนเอง — อัปเดตไม่แตะ
├── README.md
├── SETUP.md                    ← อัปเดต · ตรวจสุขภาพ vault (ติดตั้งครั้งแรก = `INSTALL.md` ของ repo)
├── _tools/
│   ├── bootstrap.mjs           ← ติดตั้ง/อัปเดต vault (ดู `INSTALL.md` ของ repo ต้นฉบับ)
│   ├── doctor.mjs              ← ตรวจสุขภาพ vault + ลินต์ ticket ทุกใบ
│   └── autocommit.sh           ← PostToolUse hook: commit ให้เองทุกครั้งที่ agent แก้ ticket
│                                 · session ที่รันใน worktree จะถูก **หยดลง `main`** ให้ด้วย
│                                   (ff-only → merge ปกติ → ถอยถ้าชน) ไม่งั้น Obsidian ไม่เห็น
└── <repo>/                     ← example-repo, ชื่อ repo ที่ทำงานอยู่, ...
    └── <effort>/               ← getting-started, ...
        ├── map.md
        ├── issues/
        │   └── NN-<slug>.md
        └── assets/                 ← ถ้ามี: ผล query, script, บันทึกยาว ที่ ticket อ้างถึง
            └── NN-<slug>.<ext>        ตั้งชื่อขึ้นต้นด้วยเลข ticket ที่สร้างมัน
```

`_tools/` ขึ้นต้นด้วย `_` เพราะ Dataview query ทุกอันกรองด้วย `FROM -"_tools"`

`assets/` เป็น **ที่เก็บของแนบ ไม่ใช่ ticket** — `doctor.mjs` และหน้า `Wayfinder Efforts` /
`Wayfinder Effort Tickets` มองหาเฉพาะโฟลเดอร์ชื่อ `issues/` ไฟล์ `.md` ใน `assets/` จึงไม่ต้องมี frontmatter
อ้างจาก ticket ด้วย `../assets/…` (ticket อยู่ลึกกว่าหนึ่งชั้น) อ้างจาก `map.md` ด้วย `assets/…`

## รูปแบบ map

```markdown
---
repo: example-repo
effort: getting-started
kind: map
runs: 12                    # จำนวน chip ที่ /wayfinder-next สร้างให้ effort นี้ (ไม่มี = ยังไม่เคยสร้าง)
status: paused              # active | draft | paused | done | dropped
status_since: 2026-08-26    # เขียนใหม่ทุกครั้งที่ status เปลี่ยน — ห้ามลืม
status_note: "กลับมาเมื่อพร้อมกดปุ่ม promote บน Vercel dashboard เอง"
blocked_by: "[[example-repo/schema-cleanup/issues/12-freeze-legacy-columns]]"
superseded_by: "[[example-repo/schema-cleanup/map]]"      # เฉพาะ dropped ที่ถูกแทนที่
---

# ‹ชื่อ effort›
...
```

`runs` เป็นของ skill **`/wayfinder-next`** อย่างเดียว — มันอ่าน → +1 → เขียนกลับ **ตอนสร้าง chip**
แล้วเอาเลขนั้นขึ้นหัวชื่อ chip: `#RR-LNN-‹ชื่อย่อ›` (เช่น `#12-G09-ถ้อยคำล็อกของ gate รายจุด`
= รอบที่ 12 ของ effort นี้ · ticket 09 · type `grilling`) เพื่อให้ sidebar ของ Claude Code
อ่านออกว่าใบไหนมาก่อนหลังใน effort เดียวกัน

- map ที่ยังไม่มีฟิลด์นี้ = เริ่มที่ `runs: 1` **ไม่เดาย้อนหลัง** จากจำนวน ticket
- chip ที่สร้างแล้วไม่ได้กด = เลขข้ามไปหนึ่ง (`11 → 13`) **ปกติ** เลขนี้ไว้เทียบก่อน/หลัง ไม่ใช่ไว้นับให้ครบ

## สถานะของ map

`status` ของ map เป็นของ **load-bearing** — มันไม่ได้แค่จัดกลุ่มบนหน้า Efforts แต่ **กรอง Frontier
ระดับใบบนหน้า Dashboard ด้วย** ⇒ แปะผิด = ใบหายจากสายตา หรือใบผีลอยขึ้นมาแย่งที่งานจริง

| ค่า | แปลว่า | `status_note` ต้องตอบว่า |
| --- | --- | --- |
| `active` | เดินอยู่ — ค่าปกติ | ไม่ต้องมี |
| `draft` | ยังไม่ผ่าน grill หา Destination · **ห้ามต่อยอด** ให้ chart ใหม่ก่อน | ยังขาดอะไรถึงจะเริ่มได้ |
| `paused` | ตั้งใจพัก เพราะ priority ไปอยู่ที่อื่น | **อะไรจะทำให้กลับมา** |
| `done` | ถึง Destination แล้ว | ไม่ต้องมี (`status_since` = วันปิด) |
| `dropped` | ไม่ทำแล้ว — ยกเลิกเอง หรือถูก map อื่นแทนที่ (`superseded_by`) | ทำไมถึงทิ้ง |

**`status_note` คือ "เงื่อนไขกลับมา" ไม่ใช่ "เหตุผลที่หยุด"** — *"ไปทำ prod release ก่อน"* มองย้อนหลัง
และไร้ประโยชน์ตอนกลับมาอ่านเดือนหน้า ส่วน *"กลับมาเมื่อ `example-repo/production` รับ fix แล้ว"* เช็คได้
เห็นปุ๊บรู้เลยว่าถึงเวลาหรือยัง — และมันตอบ "ทำไมหยุด" ไปในตัวอยู่แล้ว

**`blocked_by`** ทำกับ map อย่างที่ `blockers` ทำกับ ticket — ชี้ได้ทั้ง **ใบ** (ปลดเมื่อ `resolved`)
และ **map** (ปลดเมื่อ `done`) Graph View วาดเส้นให้เอง และหน้า Efforts เด้ง map ขึ้นมาเตือนเองเมื่อ
blocker ปลด **map ที่มี `blocked_by` ค้างอยู่จะไม่ถูกนับนาฬิกา `PAUSED_STALE_DAYS`** — มันไม่ได้ดอง มันรอ

> ⚠️ **`status_since` ต้องเขียนใหม่ทุกครั้งที่ `status` เปลี่ยน — ทั้ง map และ ticket ไม่มีข้อยกเว้น**
> นี่คือนาฬิกาเดียวของทั้ง vault หลังเลิกใช้ `file.mtime` (ดูหัวข้อถัดไปว่าทำไม) · `doctor.mjs` บังคับ

### ปิด map เป็น `done` ⇒ รัน `/retro`

ตอนปิด map คือจังหวะเดียวที่เห็นทั้ง effort ครบ ไม่ว่าจะเป็นใบที่หลงทาง ไฟล์ที่หาไม่เจอ หรือ skill ที่พูดขัดกับ
vault ⇒ เก็บเป็นบทเรียนเข้า harness ไว้ก่อนจะลืม

1. แก้เป็น `status: done` + `status_since: ‹วันปิด›` ตามปกติ · ต้องไม่มีใบ `open`/`claimed`/`waiting` ค้าง
   (`doctor.mjs` จับ)
2. **บอกผู้ใช้ให้พิมพ์ `/retro` เอง** — skill นี้ตั้ง `disable-model-invocation: true` ⇒ agent เรียกผ่าน
   Skill tool ไม่ได้ · ถ้าไม่ระบุ มันจะ retro แค่ *session ปัจจุบัน* แต่ map เดินมาหลาย session ⇒ ให้ระบุ
   ขอบเขตเป็นทั้ง effort เช่น `/retro ทุก session ที่แตะ <vault>/<repo>/<effort>/`
3. ข้อเสนอแต่ละข้อที่ผู้ใช้รับ ไปลงที่ใดที่หนึ่ง **ที่เดียว** (ข้อที่ผู้ใช้ปัดไม่ต้องลงที่ไหน)

   | ข้อเสนอเป็น… | ไปที่ |
   | --- | --- |
   | **งานที่ต้องลงมือ** เช่น แก้ skill · hook · README · `CLAUDE.md` หรือเพิ่ม check | ใบใหม่ใน effort ที่เกี่ยวข้องซึ่งยัง `active`/`paused` — **ห้ามเปิดใน map ที่เพิ่งปิด** (ใบที่ขยับหลัง `status_since` ของ map `done` จะโดน doctor จับเป็น "สถานะโกหก") · ถ้าไม่มี effort ไหนรับ ⇒ chart map ใหม่ |
   | **ความรู้** ที่ไม่มีอะไรต้องทำ | knowledge base ถาวรของคุณ (ถ้ามี) ตามกติกาของที่นั้น |

4. ต่อท้าย map ด้วยหัวข้อ `## Retro` ข้อละบรรทัด `- ‹gist› → [[<repo>/<effort>/issues/NN-<slug>]]`
   หรือ `→ ‹ที่อยู่โน้ตใน knowledge base›` · ถ้าไม่มีข้อเสนอเลยให้เขียน `- (ไม่มีข้อเสนอ — ‹วันที่›)` ไว้ จะได้รู้ว่ารันแล้ว
   ไม่ได้ลืม

## รูปแบบ ticket

```markdown
---
repo: example-repo
effort: getting-started
type: grilling             # research | prototype | grilling | task
status: waiting            # open | claimed | resolved | waiting
status_since: 2026-08-26   # เขียนใหม่ทุกครั้งที่ status เปลี่ยน
status_note: "รอ example-repo/production รับ fix ก่อน"   # บังคับเมื่อ waiting
blockers:
  - "[[03-ignored-build-step]]"
---

## Question

...

## Answer

(เติมตอน resolve)
```

`blockers` เป็น **wikilink** ไม่ใช่เลข — ฟิลด์เดียวได้สองอย่าง:
Dataview deref `b.status` ข้ามไฟล์ได้ (เช็ค unblocked ใน query เดียว)
และ **Graph View วาด DAG ของ map ให้อัตโนมัติ**

### `waiting` ต่างจาก `blocked` ตรงไหน

**`blocked` ไม่ใช่ค่าสถานะ** — มันคำนวณจาก `blockers` (ใบยังเป็น `open` อยู่) แปลว่า *ติดใบอื่นที่อยู่ในมือเรา*
⇒ ปลดล็อกเองได้ด้วยการไปปิดใบนั้น

**`waiting` เป็นค่าสถานะจริง** แปลว่า *รอเหตุการณ์ที่ไม่ได้อยู่ในมือเรา* — คนกดปุ่มบน dashboard ·
prod release · พาร์ตเนอร์ตอบ ⇒ ทำอะไรไม่ได้เลยจนกว่ามันจะเกิด ทั้งสองอย่างหลุดจาก Frontier
เหมือนกัน แต่ **action ต่างกันคนละเรื่อง** จึงแยกกันคนละ view บน Dashboard

`waiting` ยังบล็อกใบอื่นได้ตามปกติ (กฎเดิมคือปลดเมื่อ blocker ทุกใบ `resolved` — `waiting` ไม่ใช่ `resolved`)
และมันไม่มีนาฬิกาเตือนของตัวเอง โดยตั้งใจ: view `⏳ รอของนอก` สั้นและเห็นทุกครั้งที่เปิด Dashboard
**ตัวรายการเองคือสัญญาณ** ถ้าวันหนึ่งมันยาวจนไม่ใช่สัญญาณอีก ค่อยเพิ่มนาฬิกาตอนนั้น

### การจองเลข `NN` ไม่ atomic — กติกาตอนสอง session ชนกัน

`NN` ใน `issues/NN-<slug>.md` คือตัวตนของใบ แต่การจองมันคือ "อ่านว่ามีเลขอะไรแล้ว → เขียนไฟล์"
ซึ่ง **ไม่มีอะไรกันสอง session ให้ทำสลับกัน** ⇒ สอง session ที่แตกใบใหม่ห่างกันไม่กี่นาทีจะได้เลขเดียวกัน

**กติกา** — สามข้อ เรียงตามลำดับที่ต้องทำ:

1. **`ls issues/` ทันทีก่อนเขียน** ไม่ใช่ตอนต้น session · เลขที่ว่างตอนเริ่มคุยอาจถูกจองไปแล้วตอนจะเขียนจริง
2. **ชนแล้วให้ฝ่ายที่ mtime ใหม่กว่าเป็นคนย้าย ฝ่ายเดียว** — เช็คด้วย `ls -lT` อย่าเดาจากบริบท
3. **ย้ายไปเลข `highest + 1` แล้วอ่านใหม่อีกครั้ง** ก่อนประกาศว่าจบ

ข้อ 2 เป็นข้อที่พลาดง่ายที่สุดและแพงที่สุด: ถ้าต่างฝ่ายต่างคิดว่าตัวเองควรหลีก **ทั้งคู่จะย้ายไปเลขถัดไป
พร้อมกันแล้วชนซ้ำ** · **เกิดขึ้นจริงมาแล้วเมื่อสอง session แตกใบพร้อมกัน** — ชน 09
แล้วทั้งคู่หนีไป 11 · ชน 11 แล้วทั้งคู่หนีไป 12 อีกรอบ · จบด้วยฝ่ายหนึ่ง**ถอยกลับ**ไปเลขที่อีกฝ่ายเพิ่งปล่อยว่าง
แทนที่จะวิ่งต่อ ซึ่งเป็นทางออกที่ทิ้งขยะน้อยที่สุด

**ทำไมถึงแพงกว่าที่ควร — agent ลบไฟล์ใน vault ไม่ได้**

vault อยู่นอก sandbox ของ agent ⇒ `rm` / `mv` ถูกปฏิเสธทั้งโฟลเดอร์ (`Operation not permitted`)
และ `obsidian` MCP (ถ้ามี) ก็ชี้ไปคนละ vault · agent **เขียนไฟล์ใหม่ได้ แต่ลบของเดิมไม่ได้**
⇒ ทุกการย้ายเลขทิ้ง **stub** ไว้ให้คนลบเสมอ

stub ต้องตั้งเป็น `status: waiting` + `status_note` ที่บอกว่าย้ายไปไหน — ไม่ใช่ `resolved`
(จะไปโป่งใน `Wayfinder Efforts` แบบโกหก) และไม่ใช่ค่าที่ `doctor.mjs` ไม่รู้จัก (จะฟ้อง error)
· `waiting` ทำให้มันโผล่ที่ view `⏳ รอของนอก` ซึ่งเป็นรายการที่ทวงตัวเองอยู่แล้ว ⇒ ไม่หายเงียบ
· ให้ stub ใบใดใบหนึ่งถือคำสั่ง `rm` รวมของทุกใบไว้ คนจะได้ลบทีเดียวจบ

## Wayfinding operations

หัวข้อนี้คือ **tracker doc** ของ `/wayfinder` (plugin `mattpocock-skills`) — skill หาหัวข้อชื่อนี้เอง
เพื่อรู้ว่า map · ticket · blocking · frontier · claim · resolve อยู่ตรงไหนจริง
⇒ **อ่านหัวข้อนี้แล้วทำได้ครบทุก operation ไม่ต้องเปิด `issue-tracker-local.md` ของ upstream**

> ⚠️ **ข้อความในตัว skill ที่ขัดกับหัวข้อนี้ ให้เชื่อหัวข้อนี้** — skill เขียนไว้สำหรับ GitHub issue
> (label · assignee · native blocking · resolution comment · close) และ local tracker แบบ `.scratch/`
> ซึ่ง vault นี้ไม่ใช้ทั้งคู่ ตารางข้างล่างแปลให้ทุกคำแล้ว

### ที่อยู่ — มีทางเดียว

- map `<vault>/<repo>/<effort>/map.md` · ticket `<vault>/<repo>/<effort>/issues/NN-<slug>.md`
  (เริ่มที่ `01`) · ของแนบ `<vault>/<repo>/<effort>/assets/` (ดู § โครงสร้าง)
- `<vault>` = โฟลเดอร์ของ README นี้ · `<repo>` = repo ที่งานตั้งเป้า **ไม่ใช่** repo ที่ session รันอยู่
- **ห้ามใช้ `.scratch/`, `docs/plan/` หรือ GitHub issue** — chip ของ `/wayfinder-next` รันใน repo งาน
  ⇒ เขียนลง vault ด้วย **absolute path** · ถ้า session รันใน worktree ของ vault เอง ให้เขียนที่ path
  ใน worktree (ไม่ใช่ checkout หลัก) แล้ว `autocommit.sh` หยดลง `main` ให้
- ไม่ต้อง commit เอง — `autocommit.sh` commit ให้ทุกครั้งที่ Write/Edit

### แปลคำของ upstream

| upstream พูดว่า | ใน vault นี้คือ |
| --- | --- |
| issue ที่ติด label `wayfinder:map` | `map.md` ที่ frontmatter มี `kind: map` |
| child issue ของ map | ไฟล์ใน `issues/` ของ effort เดียวกัน |
| label `wayfinder:<type>` · บรรทัด `Type:` | `type: research \| prototype \| grilling \| task` |
| บรรทัด `Status:` · open / closed | `status: open \| claimed \| resolved \| waiting` (ดู § `waiting` ต่างจาก `blocked` ตรงไหน) |
| assign ให้ตัวเอง (claim) | `status: claimed` |
| native blocking · บรรทัด `Blocked by: NN` | `blockers:` เป็น list ของ wikilink `"[[NN-<slug>]]"` |
| resolution comment | `## Answer` ในไฟล์ ticket |
| close | `status: resolved` |
| ชื่อ (title) ของ issue | wikilink `[[NN-<slug>]]` — ใช้รูปนี้ใน Decisions so far และตอนเล่า ไม่ใช้เลขเปล่า |
| asset ที่ link จาก issue | `assets/NN-<slug>.<ext>` อ้างจาก ticket ด้วย `../assets/…` |
| branch `research/<name>` | **ไม่มี** — ดู Research ข้างล่าง |

blocker ข้าม effort ใช้ path เต็ม `"[[<repo>/<effort>/issues/NN-<slug>]]"`

### Map และ ticket

- **map** — frontmatter ตาม § รูปแบบ map (`runs` เป็นของ `/wayfinder-next` อย่าแตะ) · body ใต้
  `# ‹ชื่อ effort›` ใช้หัวข้อของ upstream ตามลำดับ: `## Destination` · `## Notes` · `## Decisions so far` ·
  `## Not yet specified` · `## Out of scope` · (`## Retro` เฉพาะ map ที่ `done` — ดู § ปิด map เป็น `done` ⇒ รัน `/retro`)
- **Decisions so far** — ใบละบรรทัด `- [[NN-<slug>]]: ‹gist หนึ่งบรรทัด›` ต่อท้ายตามลำดับที่ปิด
- ไม่ต้องลิสต์ใบที่ยังเปิดใน map — frontmatter ของใบคือแหล่งจริง และหน้า `Wayfinder Effort Tickets` วาดให้
  · map ที่มีตาราง `## Tickets` อยู่แล้วไม่ผิด แต่แตกใบใหม่เมื่อไหร่ต้องเติมแถวด้วย
- **ticket** — frontmatter ตาม § รูปแบบ ticket · body มี `## Question` แล้วตามด้วย `## Answer` ที่ใส่
  `(เติมตอน resolve)` ไว้

### Operations

- **Frontier** — ใบใน `issues/` ที่ `status: open` และ blocker ทุกใบ `resolved` · map ต้อง `status: active`
  (map ที่ `draft`/`paused` ไม่มี frontier) · `claimed` กับ `waiting` ไม่นับ · ผู้ใช้ไม่ระบุใบ ⇒ เลขน้อยสุดได้ก่อน
- **Claim** — ก่อนทำอะไรทั้งนั้น: อ่านใบซ้ำอีกรอบ (session อื่นอาจเพิ่ง claim ไป) แล้วแก้
  `status: claimed` + `status_since: ‹วันนี้›` เซฟทันที
- **Resolve** — สามขั้นในรอบเดียว
  1. แทน `(เติมตอน resolve)` ใต้ `## Answer` ด้วยคำตอบ: สิ่งที่ตัดสิน · ข้อเท็จจริงที่ใบอื่นต้องใช้ · ลิงก์ PR · ลิงก์ asset
  2. `status: resolved` + `status_since: ‹วันนี้›`
  3. ต่อท้าย Decisions so far หนึ่งบรรทัด — **อ่าน map ใหม่ทันทีก่อนแก้ แล้วเพิ่มบรรทัดเดียว**
     session อื่นของ map เดียวกันต่อท้ายอยู่พร้อมกัน ⇒ ห้ามเขียนทับทั้งหัวข้อ
- **หลัง resolve** — แตกใบใหม่ (สร้างทุกใบก่อน แล้ว wire `blockers` รอบที่สอง · ทำตาม
  § การจองเลข `NN` ไม่ atomic) · ย้าย fog ที่ชัดแล้วออกจาก Not yet specified ·
  ใบที่เลย Destination ⇒ `status: resolved` + `## Answer` ขึ้นต้นด้วย `Out of scope:` แล้วเพิ่มบรรทัดใน
  `## Out of scope` (**ไม่ใช่** Decisions so far)
- **1 session resolve ได้ 1 ใบ** ยกเว้น research
- **Chart** — สร้าง `map.md` (`status: active` ถ้า grill Destination จบแล้ว ไม่งั้น `draft`) แล้วสร้างใบ
  `status: open` + `blockers: []` ให้ครบก่อน จึง wire `blockers` รอบที่สอง

### Research — ไม่สร้าง branch

upstream สั่งให้ subagent เก็บผลไว้ใน branch `research/<name>` — **vault นี้ไม่ทำ**
vault ไม่มีแนวคิดเรื่อง branch และ branch ทิ้งใน repo งานคือขยะที่ไม่มีใครลบ

- ยิง subagent ขนานกันได้ ใบละตัว · แต่ละตัว claim → เขียนผลลง `## Answer` ของใบตัวเอง
  (ของยาวไป `assets/`) → resolve ตามปกติ
- subagent **ไม่แตกใบใหม่และไม่แตะ `map.md`** — คืนข้อเสนอมาให้ session หลักแตกใบและต่อ
  Decisions so far หลังทุกตัวกลับมาแล้ว (ยิงขนานคือจังหวะที่เลข `NN` ชนง่ายที่สุด)
- ข้อค้นพบที่ใช้ได้นานกว่า effort นี้ ⇒ promote ไป knowledge base ถาวรของคุณ (ถ้ามี)
  แล้วลิงก์จาก `## Answer` — vault นี้เป็น scratch ปิด effort แล้วไม่มีใครกลับมาค้น

### Glossary และ ADR

`domain-modeling` ที่ `/wayfinder` เรียกให้อาจแก้ `GLOSSARY*.md` หรือ ADR ใน **repo งาน** —
ของพวกนี้**ไม่ใช่ plan doc** ต้องไปถึง `main` ของ repo นั้น

- รวมเข้า PR ของ feature branch ที่ทำอยู่ หรือเปิด docs-only PR แยก แล้วบันทึกลิงก์ PR ใน `## Answer`
- ห้ามทิ้งค้างใน worktree — worktree ถูกลบเมื่อไหร่ของก็หายไปด้วย

## Spec & ticket operations

หัวข้อนี้คือ **tracker doc** ของขั้น build หลัง `/wayfinder` — `/to-spec` · `/to-tickets` · `/implement` ·
`/implement-spec` (plugin `mattpocock-skills`) ถามหา "issue tracker ที่ provide ไว้" ⇒ **คือ vault นี้**
ใช้ที่อยู่ · frontmatter · claim/resolve · frontier ชุดเดียวกับ § Wayfinding operations ทุกข้อ หัวข้อนี้บอกแค่ส่วนที่เพิ่ม

> ⚠️ **ข้อความในตัว skill หรือใน `docs/agents/issue-tracker.md` ของ repo งานที่ขัดกับหัวข้อนี้ ให้เชื่อหัวข้อนี้** —
> `.scratch/<feature>/` · GitHub issue · label `ready-for-agent` · บรรทัด `**Status:**` / `**Blocked by:**` ·
> "output ลงแชต" ใช้ไม่ได้ทั้งหมด spec และ ticket ที่ไม่ได้อยู่ใน vault คือของที่หายไปพร้อม session

### เลือก pipeline

| งาน build | ใช้ | หมายเหตุ |
| --- | --- | --- |
| ไม่เกิน 2 PR | `/implement` ต่อจากใบใน map ฝั่ง planning เลย | ไม่ต้องมี spec หรือ map `-build` · ลิงก์ PR ลง `## Answer` ของใบนั้น |
| 3 PR ขึ้นไป | `/to-spec` → `/to-tickets` → กด chip ของ `/wayfinder-next` ทีละใบ | ใบละ session ใบละ PR |
| `/implement-spec` | **ยังทดลอง** — ใช้กับ effort ที่ทุกใบเป็น two-way door เท่านั้น | ได้ integration branch + PR ตัวเดียว ซึ่งขัดกับ 1 ใบ = 1 PR ข้างล่าง ผลทดลองจะมาแก้ตารางนี้ |

### Spec — `/to-spec`

- อยู่ที่ **`<vault>/<repo>/<effort>/assets/NN-spec.md` ของ map ฝั่ง planning** (`NN` = เลขใบที่รัน `/to-spec`)
  · ใบนั้นลิงก์ spec และ map `-build` ไว้ใน `## Answer`
- **ห้าม commit spec เข้า repo งาน** และห้ามเขียนลง `.scratch/` — spec เป็น plan doc ใช้ครั้งเดียว
- ใช้ `<spec-template>` ของ `/to-spec` ครบทุกหัวข้อ แล้วเพิ่ม **`## Locked Decisions`** (คำสั่งที่ล็อกไว้)
  ต่อจาก `## Implementation Decisions` — สิ่งที่ตัดสินแล้ว implementer ห้ามรื้อ · อ้าง ADR ด้วยชื่อ
  และอ้างคำใน glossary ได้ (ของพวกนี้อยู่ใน repo งาน ดู § Glossary และ ADR)
- **ไม่ใส่ path หรือ `file:line`** ทั้งฉบับ (กฎเดียวกับ upstream) — path เก่าเร็ว ให้ไปอยู่ใน build ticket
- ชื่อหัวข้อ · identifier · คำใน glossary เป็นภาษาอังกฤษ · เนื้อหาใช้ภาษาเดียวกับ map และ ticket ของ vault
- ไม่ต้องติด label `ready-for-agent` — vault ไม่มี triage

### Build ticket — `/to-tickets`

- อยู่ใน **map ใหม่ `<vault>/<repo>/<effort>-build/`** ไม่ใช่ใน map ฝั่ง planning
  · `map.md` ตาม § รูปแบบ map (`effort: <effort>-build` · `status: active`) · `## Destination` ลิงก์ spec
  ด้วย `../<effort>/assets/NN-spec.md` · ไม่เขียน decision ซ้ำกับ spec
- ใบ build ใช้ **frontmatter ตาม § รูปแบบ ticket** · `type: task` · ไม่ใช้ `<local-ticket-template>` ของ upstream
  (ไม่มีบรรทัด `**Status:** ready-for-agent` · `**Blocked by:**` ไปอยู่ใน `blockers:`)
- เพิ่มฟิลด์ **`door: one-way | two-way`** ในทุกใบ — คำเดียวกับ Merge Danger ของ `/pr`
  - **two-way** ถอยกลับได้ถูก ⇒ ใบที่ไม่ติด blocker กันทำขนานกันได้
  - **one-way** ถอยไม่ได้หรือถอยแพง (schema · migration · ข้อมูลที่เขียนไปแล้ว · contract ที่คนนอกใช้)
    ⇒ ทำทีละใบหลังใบก่อนหน้า merge แล้ว · wire เป็น `blockers` ให้ frontier คิดเอง: ใบ one-way ติดทุกใบที่ต้อง
    merge ก่อน และใบที่ตามหลังติดใบ one-way นั้น
- body: `## Question` แตก `<issue-template>` ของ upstream เป็นหัวข้อย่อย — ลิงก์ spec (`../../<effort>/assets/NN-spec.md#…`
  แทน `## Parent`) · What to build · Acceptance criteria เป็น checkbox · **path และ `file:line` ใส่ได้ที่นี่**
  แล้วตามด้วย `## Answer` ที่ใส่ `(เติมตอน resolve)`
- เลขใบเรียงตาม dependency (blocker มาก่อน) · สร้างทุกใบก่อนแล้ว wire `blockers` รอบที่สอง (§ Operations)
- `/to-tickets` ให้คนอนุมัติ breakdown ก่อนเขียนไฟล์ตามปกติ — **อย่าข้ามขั้น quiz**

### ทำ build ticket — 1 ใบ = 1 PR

- chip ของ `/wayfinder-next` ได้ `cwd` = repo งานเอง (`repo:` ของ map `-build`) · claim ตาม § Operations
- 1 ใบ = 1 branch = **1 PR ไปที่ base branch ของ repo** (ตามธรรมเนียมของ repo นั้น) · ไม่มี integration branch
- PR เปิดแล้วแต่ยังไม่ merge ⇒ `status: waiting` + `status_note: "รอ review/merge ‹ลิงก์ PR›"` — review ไม่ได้อยู่ในมือเรา
- **resolve เมื่อ PR merge แล้ว** ไม่ใช่ตอนเปิด PR — ใบที่ติดใบนี้ต้องได้โค้ดจาก base branch จริง
- `## Answer` บันทึก: ลิงก์ PR · ชื่อ branch · merge commit · สิ่งที่ต่างจาก spec (ถ้ามี) · fact ที่ใบถัดไปต้องรู้
- Decisions so far ของ map `-build` ใบละบรรทัดเหมือนเดิม · ครบทุกใบแล้วปิด map `-build` เป็น `done`

## สามหน้าที่ใช้อ่าน vault

สองหน้าแรก **เปิดค้างไว้** ตลอดเวลาทำงาน · หน้าที่สามเปิดเมื่อลงไปอยู่กับ effort ใด effort หนึ่ง

| โน้ต | ระดับ | ขอบเขต | ตอบคำถามว่า | เครื่องยนต์ |
| --- | --- | --- | --- | --- |
| `Wayfinder Dashboard` | **ใบ** | ทั้ง vault | ตอนนี้หยิบใบไหนได้ · ติดที่ใคร · รออะไรอยู่ | Dataview DQL ล้วน |
| `Wayfinder Efforts` | **แมป** | ทั้ง vault | แต่ละ effort เดินไปถึงไหน · อันไหนสถานะไม่ตรงจริง | `dataviewjs` + HTML |
| `Wayfinder Effort Tickets` | **ใบ** | **effort เดียว** | effort นี้เหลืออะไร · ปิดใบไหนแล้วอะไรเดินต่อ | `dataviewjs` + SVG |

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

> **เลข "ปลดกี่ใบ" ของหน้า Effort Tickets ไม่ตรงกับ "ปลดล็อกกี่ใบ" ของ Dashboard — และนั่นถูกแล้ว**
> Dashboard นับด้วย `file.inlinks` ซึ่งนับ**ทุกอย่างที่ลิงก์มาหาใบนี้** รวมตอน `map.md` เอ่ยถึงใบใน
> เนื้อความด้วย ⇒ เลขเฟ้อ · หน้า Effort Tickets นับจาก `blockers` ของใบอื่นจริง ๆ อย่างเดียว
> ⇒ **ตัวเลขต่ำกว่าและตรงกว่า** · เห็นสองเลขไม่เท่ากันเมื่อไหร่ นั่นไม่ใช่บั๊ก มันคือคำถามคนละข้อ
> (*"มีอะไรพูดถึงใบนี้บ้าง"* กับ *"ปิดใบนี้แล้วใบไหนหลุด blocker จริง ๆ"*)

หน้า `Wayfinder Efforts` **เห็นเต็มตัวแค่ 2 กลุ่ม** ที่เหลือพับเก็บ — เพราะกลุ่มถูกจัดตาม
*action ที่คนดูต้องทำ* ไม่ใช่ตามค่าสถานะ สถานะที่ไม่ต้องการอะไรเลยจึงถูกพับ ไม่ว่ามีกี่ค่าก็ตาม

| กลุ่ม | เข้าเมื่อ |
| --- | --- |
| 🔥 **กำลังเดิน** | `active` + มีใบขยับภายใน `STALE_DAYS` |
| ⚠️ **สถานะไม่ตรงพฤติกรรม** | ห้าเคสข้างล่าง — ทุกเคสมีคอลัมน์บอกว่าควรขยับสถานะไปทางไหน |
| พับเก็บ | `⏸ พักไว้` · `✏️ ยังไม่ได้ชาร์ต` · `✅ ปิดแล้ว` · `🗑 ทิ้งแล้ว` (โชว์ `status_note` ต่อท้ายทุกแถว) |

ห้าเคสของกลุ่ม ⚠️ — พูดอย่างเดียวกันหมดคือ *"ที่ประกาศไว้ ไม่ตรงกับที่เกิดขึ้นจริง ⇒ เคาะใหม่"*:

| เคส | → |
| --- | --- |
| `active` แต่ไม่มีใบไหนขยับเกิน `STALE_DAYS` (14) | `paused` |
| `paused` เกิน `PAUSED_STALE_DAYS` (30) — เฉพาะที่ **ไม่มี** `blocked_by` ค้าง | `dropped` |
| `active` แต่ใบหมดแล้ว | `done` |
| `blocked_by` ปลดแล้ว | กลับมาทำได้ |
| `blocked_by` ชี้ของที่ไม่มีใครผลักให้เดิน | โซ่ตัน |

`PAUSED_STALE_DAYS = 30` ไม่ใช่เลขกลม ๆ — มันมาจากสถิติ: comeback จริงที่ยาวที่สุดเท่าที่เคยวัดได้
คือ **25 วัน** (map หนึ่งเงียบไปเกือบเดือนแล้วกลับมาปิดจบ) เส้นจึงอยู่เหนือนั้นนิดเดียว แปลเป็นภาษาคนว่า
*"พักนานกว่าที่ map ไหนเคยพักแล้วยังกลับมาได้"* — **เป็นค่าของ vault นี้ ไม่ใช่ค่าสากล** วัดของตัวเองแล้วปรับได้

> **นาฬิกาทั้ง vault เลิกใช้ `file.mtime` แล้ว** — ใช้ `status_since` แทน
> `mtime` วัดผิดเรื่องตั้งแต่ต้น (มันตอบว่า *ไฟล์ถูกเขียนเมื่อไหร่* ไม่ใช่ *งานคืบเมื่อไหร่*)
> แก้คำผิดใบเดียวก็รีเซ็ตนาฬิกา และที่ร้ายกว่านั้น **git ไม่เก็บ mtime** ⇒ clone ไปเครื่องใหม่ที
> นาฬิกาทุกตัวรีเซ็ตเป็นศูนย์พร้อมกัน ทั้งที่ vault นี้ออกแบบมาให้ย้ายเครื่อง (ดู `SETUP.md`)
>
> นาฬิกาของ effort = `max(status_since ของทุกใบ, status_since ของ map เอง)` — การประกาศสถานะ
> รีเซ็ตนาฬิกาของสถานะนั้น ไม่งั้น map ที่เพิ่งปลดเป็น `active` จะโดนจิกทันทีด้วยประวัติเก่า
> ที่ไม่เกี่ยวกับการตัดสินใจที่เพิ่งเกิด

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
(`active`/`draft`/`paused`/`done`/`dropped`) **ไม่ซ้ำกันสักตัว** ⇒ ทุกกลุ่มเป็น query
property เดี่ยว ๆ ที่ไม่ทับกันเองโดยธรรมชาติ — ไม่ต้องใช้ `-` negation และไม่ต้องพึ่ง
ลำดับความสำคัญของ colorGroups ซึ่ง Obsidian ไม่ได้ระบุไว้ชัด สลับลำดับในไฟล์แล้วสีก็ยังเหมือนเดิม
(`[kind:map]` จึงไม่ถูกใช้ระบายสีอีกต่อไป — `doctor.mjs` บังคับว่าทุกแมปต้องมี `status` อยู่แล้ว)

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
