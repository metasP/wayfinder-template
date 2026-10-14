# Wayfinder Dashboard

หน้า **ระดับใบ ทั้ง vault** — หยิบอะไรได้ตอนนี้ · ติดที่ใคร · ใครจับอยู่ · เปิดค้างไว้เวลาทำงานกับ `/wayfinder`
ภาพรวม **ระดับแมป** (แต่ละ effort เดินไปถึงไหน · อันไหนสถานะไม่ตรงจริง): [[Wayfinder Efforts]]
ระดับใบของ **effort เดียว** (effort นี้เหลืออะไร · ปิดใบไหนแล้วอะไรเดินต่อ · กราฟ dependency): [[Wayfinder Effort Tickets]]
วิธี setup + โครงสร้างโฟลเดอร์: ดู [[README]]
ค่าที่คุณจูนเอง — ตัวอัปเดตไม่แตะ: [[Wayfinder Config]] (สี · เส้นแบ่งเวลา · ป้ายสถานะ map) · [[Wayfinder Picks]] (กฎ "หยิบอันไหนต่อ")

> **ทุกบล็อกในหน้านี้คำนวณจาก core ตัวเดียวกับ `wf`** (`_tools/lib/core.mjs` ผ่าน loader `_tools/views/wf-core.js`)
> ⇒ Frontier ที่นี่ = `wf frontier` · ตาราง lint ที่นี่ = `wf lint` บนโน้ตชุดเดียวกัน — หน้านี้แค่จัดตาราง ไม่มีกฎของตัวเอง
> **สี่ view หลักเห็นเฉพาะใบใน map ที่ `status: active`** — ใบจาก map ที่ `paused` / `draft` ถูกพับไว้ข้างล่าง
> ส่วนใบจาก map ที่ `dropped` ไม่แสดงเลย (นับจำนวนไว้ท้ายหน้า จะได้ไม่ใช่การซ่อนเงียบ ๆ)

---

## 🩺 Lint — ของที่ผิดใน vault

ชุดเดียวกับ `wf lint` เรียง error ก่อน warn · คอลัมน์ Fix คือคำสั่ง `wf` ที่แก้ข้อนั้น (ก๊อปไปรันได้เลย)
เห็นได้เฉพาะ frontmatter กับบล็อก `## Tickets` — เรื่อง install · git · hook ไปดูที่ `node _tools/doctor.mjs`

```dataviewjs
await dv.view("_tools/views/wf-core", {
  bodies: true,
  render: ({ core, index, unread, config, sort, today, link, text }) => {
    // map ที่อ่านเนื้อไม่ได้ = ยังไม่ได้ตรวจ drift ⇒ บอกตรง ๆ ไม่ใช่เงียบแล้วอ้างว่าตรงกับ `wf lint`
    if (unread.length) dv.paragraph(`⚠️ อ่านเนื้อ map ไม่ได้ ${unread.length} ไฟล์ — ยังไม่ได้ตรวจ \`## Tickets\` drift: ${unread.join(" · ")}`)
    const findings = core.lint(index, { today, config, sort })
    if (!findings.length) return dv.paragraph("✅ lint clean")
    const SEVERITY = { error: "🔴 error", warn: "🟡 warn" }
    const errors = findings.filter((f) => f.severity === "error").length
    dv.paragraph(`**${errors} error · ${findings.length - errors} warn**`)
    dv.table(
      ["Severity", "Note", "Rule", "Message", "Fix"],
      findings.map((f) => [
        SEVERITY[f.severity] ?? f.severity,
        link(f.ref),
        f.rule,
        text(f.message),
        f.fix ? "`" + f.fix + "`" : "—",
      ]),
    )
  },
})
```

## 🔥 Frontier — หยิบได้ตอนนี้

open + ไม่ถูก block + อยู่ใน map ที่เดินอยู่ · เรียงตาม `sort:` ใน frontmatter ของ [[Wayfinder Picks]] — ลำดับเดียวกับ `wf frontier`
(ไม่มี `sort:` = ค่าเริ่มต้น `[unblocks desc, nn asc]` · บรรทัด `SORT` ของ DQL ในหน้า Picks ไม่มีผลกับตารางนี้)
blocker ที่ลิงก์หาใบไม่เจอ = **ยัง block อยู่** (fail closed) ใบนั้นจึงไปโผล่ใน 🚧 แทน

```dataviewjs
await dv.view("_tools/views/wf-core", {
  render: ({ core, index, sort, link }) => {
    const tickets = core.frontier(index, { sort })
    if (!tickets.length) return dv.paragraph("_ไม่มีใบที่หยิบได้ตอนนี้_")
    dv.table(
      ["Ticket", "Effort", "Type", "ปลดล็อกกี่ใบ"],
      tickets.map((t) => [link(t.ref), link(t.effortKey), t.type, core.unblocks(index, t)]),
    )
  },
})
```

## 🚧 Blocked — ติดใบอื่นที่อยู่ในมือเรา

แสดง blocker ที่ยัง **ไม่** resolved เท่านั้น จะได้เห็นว่าติดที่ใคร
ต่างจาก ⏳ ข้างล่าง: อันนี้ปลดล็อกได้เองด้วยการไปปิดใบที่บล็อกอยู่

```dataviewjs
await dv.view("_tools/views/wf-core", {
  render: ({ core, index, link }) => {
    const tickets = [...index.tickets.values()].filter(
      (t) => index.maps.get(t.effortKey)?.status === "active" && core.ticketState(index, t) === "blocked",
    )
    if (!tickets.length) return dv.paragraph("_ไม่มีใบที่ติดใบอื่น_")
    const waitingOn = (ref) => (ref == null ? "❓ ลิงก์เสีย — ดู 🩺 lint" : link(ref))
    dv.table(
      ["Ticket", "Effort", "รออยู่"],
      tickets.map((t) => [link(t.ref), link(t.effortKey), core.openBlockers(index, t).map(waitingOn)]),
    )
  },
})
```

## ⏳ รอของนอก — ทำอะไรไม่ได้เลย

`status: waiting` = รอเหตุการณ์ที่ไม่ได้อยู่ในมือเรา (คนกดปุ่ม · prod release · พาร์ตเนอร์ตอบ)
**ตัวรายการนี้เองคือสัญญาณ** — เรียงรอนานสุดขึ้นก่อน ถ้ามันเริ่มยาวแปลว่ามีของค้างที่ควรไปทวง

```dataviewjs
await dv.view("_tools/views/wf-core", {
  render: ({ core, index, link, text }) => {
    const tickets = [...index.tickets.values()]
      .filter((t) => index.maps.get(t.effortKey)?.status === "active" && core.ticketState(index, t) === "waiting")
      .sort((a, b) => (a.statusSince ?? "").localeCompare(b.statusSince ?? ""))
    if (!tickets.length) return dv.paragraph("_ไม่มีใบที่รอของนอก_")
    dv.table(
      ["Ticket", "Effort", "รออะไร", "รอตั้งแต่", "นัดดูอีกที"],
      tickets.map((t) => [link(t.ref), link(t.effortKey), text(t.statusNote), t.statusSince, t.waitUntil ?? "—"]),
    )
  },
})
```

## 🖐 Claimed — มี session จับอยู่

ถ้าอันไหนค้างนาน = session ตายกลางทาง ⇒ `wf release` (🩺 ข้างบนเตือน stale claim ให้แล้ว)

```dataviewjs
await dv.view("_tools/views/wf-core", {
  render: ({ core, index, link, text }) => {
    const tickets = [...index.tickets.values()]
      .filter((t) => index.maps.get(t.effortKey)?.status === "active" && core.ticketState(index, t) === "claimed")
      .sort((a, b) => (a.statusSince ?? "").localeCompare(b.statusSince ?? ""))
    if (!tickets.length) return dv.paragraph("_ไม่มี session ไหนจับใบอยู่_")
    dv.table(
      ["Ticket", "Effort", "Type", "จับโดย", "จับตั้งแต่"],
      tickets.map((t) => [link(t.ref), link(t.effortKey), t.type, text(t.claimedBy), t.statusSince]),
    )
  },
})
```

---

## ⚠️ ค้างเติ่ง — ใบยังไม่ปิด ใน map ที่ประกาศว่าปิดแล้ว

ข้อมูลขัดกันเอง ต้องเลือกข้าง: **ถ้ายังจะทำ** → map ไม่ใช่ `done` (ใช้ `active`/`paused`)
**ถ้าไม่ทำแล้ว** → ปิดใบทิ้ง · 🩺 ข้างบนก็ฟ้องข้อนี้เหมือนกัน ปกติตารางนี้ต้องว่าง

```dataviewjs
await dv.view("_tools/views/wf-core", {
  render: ({ core, index, link }) => {
    const tickets = [...index.tickets.values()].filter(
      (t) => index.maps.get(t.effortKey)?.status === "done" && core.isPending(index, t),
    )
    if (!tickets.length) return dv.paragraph("_ว่าง — ดีแล้ว_")
    dv.table(["Ticket", "Effort", "Status"], tickets.map((t) => [link(t.ref), link(t.effortKey), t.status]))
  },
})
```

## ⏸ จาก map ที่พักไว้

ไม่ใช่ของที่หายไป — แค่ไม่ควรแย่งที่กับงานที่เดินอยู่ ปลด map กลับเป็น `active` แล้วมันขึ้น Frontier เอง

```dataviewjs
await dv.view("_tools/views/wf-core", {
  render: ({ core, index, link, text }) => {
    const tickets = [...index.tickets.values()].filter(
      (t) => index.maps.get(t.effortKey)?.status === "paused" && core.isPending(index, t),
    )
    if (!tickets.length) return dv.paragraph("_ไม่มี map ที่พักไว้ซึ่งยังมีใบค้าง_")
    dv.table(
      ["Ticket", "Effort", "เงื่อนไขกลับมา"],
      tickets.map((t) => [link(t.ref), link(t.effortKey), text(index.maps.get(t.effortKey).statusNote)]),
    )
  },
})
```

## ✏️ จาก map ที่ยังไม่ได้ชาร์ต

`draft` = ยังไม่ผ่าน grill หา Destination — **อย่าต่อยอดจากใบพวกนี้** ให้ chart map ใหม่ก่อน

```dataviewjs
await dv.view("_tools/views/wf-core", {
  render: ({ core, index, link, text }) => {
    const tickets = [...index.tickets.values()].filter(
      (t) => index.maps.get(t.effortKey)?.status === "draft" && core.isPending(index, t),
    )
    if (!tickets.length) return dv.paragraph("_ไม่มี map ร่างที่มีใบค้าง_")
    dv.table(
      ["Ticket", "Effort", "ยังขาดอะไร"],
      tickets.map((t) => [link(t.ref), link(t.effortKey), text(index.maps.get(t.effortKey).statusNote)]),
    )
  },
})
```

## 🗑 ใบใน map ที่ทิ้งแล้ว — นับไว้เฉย ๆ

ไม่แสดงรายใบ แต่ต้องรู้ว่ามีกี่ใบ ไม่งั้นการซ่อนจะกลายเป็นการโกหก

```dataviewjs
await dv.view("_tools/views/wf-core", {
  render: ({ core, index, link }) => {
    const efforts = [...index.efforts.values()]
      .filter((e) => e.map?.status === "dropped")
      .map((e) => [link(e.key), e.tickets.filter((t) => core.isPending(index, t)).length])
      .filter(([, count]) => count > 0)
    if (!efforts.length) return dv.paragraph("_ไม่มีใบค้างใน map ที่ทิ้งแล้ว_")
    dv.table(["Effort", "ใบที่ไม่แสดง"], efforts)
  },
})
```

---

## ✅ Decisions so far

```dataviewjs
await dv.view("_tools/views/wf-core", {
  render: ({ core, index, link }) => {
    const tickets = [...index.tickets.values()]
      .filter((t) => index.maps.get(t.effortKey)?.status !== "dropped" && core.ticketState(index, t) === "resolved")
      .sort((a, b) => (b.statusSince ?? "").localeCompare(a.statusSince ?? ""))
      .slice(0, 30)
    if (!tickets.length) return dv.paragraph("_ยังไม่มีใบที่ปิด_")
    dv.table(["Ticket", "Effort", "ปิดเมื่อ"], tickets.map((t) => [link(t.ref), link(t.effortKey), t.statusSince]))
  },
})
```

---

## 🎯 หยิบอันไหนต่อ — [[Wayfinder Picks]]

หน้านี้ตอบว่า *"อะไรหยิบได้"* แต่ไม่ได้ตอบว่า *"ควรหยิบอะไร"* — ซึ่งเป็นการตัดสินใจที่มีแต่คุณตอบได้
กฎการจัดลำดับจึงอยู่คนละใบ: [[Wayfinder Picks]] เป็น**โน้ตของคุณ** ตัวอัปเดตไม่แตะ — `sort:` ของมันคือลำดับของ 🔥 ข้างบน

ค่าคงที่ที่จูนได้ (เส้นแบ่งเวลา · สี · ป้ายสถานะ map) อยู่ที่ [[Wayfinder Config]] — คนละใบกันเพราะ
อันนั้นเป็น *ค่า* ส่วนอันนี้เป็น *กฎการเรียง*

> **บล็อกขึ้นข้อความ "โหลด core ไม่ได้"?** แปลว่า `_tools/lib/core.mjs` หาย · พัง · หรือรุ่นไม่ตรงกับหน้านี้
> รัน `node _tools/doctor.mjs` ใน vault — ข้อความนั้นมาจาก loader เอง ไม่ใช่กล่องแดงของ Dataview
