# Wayfinder Dashboard

หน้า **ระดับใบ ทั้ง vault** — หยิบอะไรได้ตอนนี้ · ติดที่ใคร · ใครจับอยู่ · เปิดค้างไว้เวลาทำงานกับ `/wayfinder`
ภาพรวม **ระดับแมป** (แต่ละ effort เดินไปถึงไหน · อันไหนสถานะไม่ตรงจริง): [[Wayfinder Efforts]]
ระดับใบของ **effort เดียว** (effort นี้เหลืออะไร · ปิดใบไหนแล้วอะไรเดินต่อ · กราฟ dependency): [[Wayfinder Effort Tickets]]
วิธี setup + โครงสร้างโฟลเดอร์: ดู [[README]]
ค่าที่คุณจูนเอง — ตัวอัปเดตไม่แตะ: [[Wayfinder Config]] (สี · เส้นแบ่งเวลา · ป้ายสถานะ map) · [[Wayfinder Picks]] (กฎ "หยิบอันไหนต่อ")

> **สี่ view บนสุดเห็นเฉพาะใบใน map ที่ `status: active`** — ใบจาก map ที่ `paused` / `draft` ถูกพับไว้ข้างล่าง
> ส่วนใบจาก map ที่ `dropped` ไม่แสดงเลย (นับจำนวนไว้ท้ายหน้า จะได้ไม่ใช่การซ่อนเงียบ ๆ)
> ทุก query อ้างสถานะ map ด้วย `link(repo + "/" + effort + "/map")` — ประกอบ path จาก frontmatter ที่ใบมีอยู่แล้ว

---

## 🔥 Frontier — หยิบได้ตอนนี้

open + ไม่ถูก block + ยังไม่มีใคร claim + อยู่ใน map ที่เดินอยู่
(`all()` บน list ว่าง = true → ticket ที่ไม่มี blocker เลย ติดอยู่ในนี้ด้วย)

```dataview
TABLE WITHOUT ID
  file.link AS "Ticket",
  repo AS "Repo",
  effort AS "Effort",
  type AS "Type"
FROM "" AND -"_tools"
WHERE status = "open"
  AND link(repo + "/" + effort + "/map").status = "active"
  AND all(map(blockers, (b) => b.status = "resolved"))
SORT repo ASC, effort ASC, file.name ASC
```

## 🚧 Blocked — ติดใบอื่นที่อยู่ในมือเรา

แสดง blocker ที่ยัง **ไม่** resolved เท่านั้น จะได้เห็นว่าติดที่ใคร
ต่างจาก ⏳ ข้างล่าง: อันนี้ปลดล็อกได้เองด้วยการไปปิดใบที่บล็อกอยู่

```dataview
TABLE WITHOUT ID
  file.link AS "Ticket",
  effort AS "Effort",
  filter(blockers, (b) => b.status != "resolved") AS "รออยู่"
FROM "" AND -"_tools"
WHERE status = "open"
  AND link(repo + "/" + effort + "/map").status = "active"
  AND any(map(blockers, (b) => b.status != "resolved"))
SORT repo ASC, effort ASC, file.name ASC
```

## ⏳ รอของนอก — ทำอะไรไม่ได้เลย

`status: waiting` = รอเหตุการณ์ที่ไม่ได้อยู่ในมือเรา (คนกดปุ่ม · prod release · พาร์ตเนอร์ตอบ)
**ตัวรายการนี้เองคือสัญญาณ** — เรียงรอนานสุดขึ้นก่อน ถ้ามันเริ่มยาวแปลว่ามีของค้างที่ควรไปทวง

```dataview
TABLE WITHOUT ID
  file.link AS "Ticket",
  effort AS "Effort",
  status_note AS "รออะไร",
  status_since AS "รอตั้งแต่"
FROM "" AND -"_tools"
WHERE status = "waiting"
  AND link(repo + "/" + effort + "/map").status = "active"
SORT status_since ASC
```

## 🖐 Claimed — มี session จับอยู่

ถ้าอันไหนค้างนาน = session ตายกลางทาง ให้ปลด `status` กลับเป็น `open`

```dataview
TABLE WITHOUT ID
  file.link AS "Ticket",
  effort AS "Effort",
  type AS "Type",
  status_since AS "จับตั้งแต่"
FROM "" AND -"_tools"
WHERE status = "claimed"
  AND link(repo + "/" + effort + "/map").status = "active"
SORT status_since ASC
```

---

## ⚠️ ค้างเติ่ง — ใบยังไม่ปิด ใน map ที่ประกาศว่าปิดแล้ว

ข้อมูลขัดกันเอง ต้องเลือกข้าง: **ถ้ายังจะทำ** → map ไม่ใช่ `done` (ใช้ `active`/`paused`)
**ถ้าไม่ทำแล้ว** → ปิดใบทิ้ง · `doctor.mjs` ก็ฟ้องข้อนี้เหมือนกัน ปกติตารางนี้ต้องว่าง

```dataview
TABLE WITHOUT ID
  file.link AS "Ticket",
  effort AS "Effort",
  status AS "Status"
FROM "" AND -"_tools"
WHERE contains(list("open", "claimed", "waiting"), status)
  AND link(repo + "/" + effort + "/map").status = "done"
SORT repo ASC, effort ASC, file.name ASC
```

## ⏸ จาก map ที่พักไว้

ไม่ใช่ของที่หายไป — แค่ไม่ควรแย่งที่กับงานที่เดินอยู่ ปลด map กลับเป็น `active` แล้วมันขึ้น Frontier เอง

```dataview
TABLE WITHOUT ID
  file.link AS "Ticket",
  effort AS "Effort",
  link(repo + "/" + effort + "/map").status_note AS "เงื่อนไขกลับมา"
FROM "" AND -"_tools"
WHERE contains(list("open", "claimed", "waiting"), status)
  AND link(repo + "/" + effort + "/map").status = "paused"
SORT repo ASC, effort ASC, file.name ASC
```

## ✏️ จาก map ที่ยังไม่ได้ชาร์ต

`draft` = ยังไม่ผ่าน grill หา Destination — **อย่าต่อยอดจากใบพวกนี้** ให้ chart map ใหม่ก่อน

```dataview
TABLE WITHOUT ID
  file.link AS "Ticket",
  effort AS "Effort",
  link(repo + "/" + effort + "/map").status_note AS "ยังขาดอะไร"
FROM "" AND -"_tools"
WHERE contains(list("open", "claimed", "waiting"), status)
  AND link(repo + "/" + effort + "/map").status = "draft"
SORT repo ASC, effort ASC, file.name ASC
```

## 🗑 ใบใน map ที่ทิ้งแล้ว — นับไว้เฉย ๆ

ไม่แสดงรายใบ แต่ต้องรู้ว่ามีกี่ใบ ไม่งั้นการซ่อนจะกลายเป็นการโกหก

```dataview
TABLE WITHOUT ID
  effort AS "Effort",
  length(rows) AS "ใบที่ไม่แสดง"
FROM "" AND -"_tools"
WHERE contains(list("open", "claimed", "waiting"), status)
  AND link(repo + "/" + effort + "/map").status = "dropped"
GROUP BY effort
```

---

## ✅ Decisions so far

```dataview
TABLE WITHOUT ID
  file.link AS "Ticket",
  repo AS "Repo",
  effort AS "Effort",
  status_since AS "ปิดเมื่อ"
FROM "" AND -"_tools"
WHERE status = "resolved"
  AND link(repo + "/" + effort + "/map").status != "dropped"
SORT status_since DESC
LIMIT 30
```

---

## 🎯 หยิบอันไหนต่อ — [[Wayfinder Picks]]

หน้านี้ตอบว่า *"อะไรหยิบได้"* แต่ไม่ได้ตอบว่า *"ควรหยิบอะไร"* — ซึ่งเป็นการตัดสินใจที่มีแต่คุณตอบได้
กฎการจัดลำดับจึงอยู่คนละใบ: [[Wayfinder Picks]] เป็น**โน้ตของคุณ** ตัวอัปเดตไม่แตะ เขียนทับได้ตามใจ

ค่าคงที่ที่จูนได้ (เส้นแบ่งเวลา · สี · ป้ายสถานะ map) อยู่ที่ [[Wayfinder Config]] — คนละใบกันเพราะ
อันนั้นเป็น *ค่า* ส่วนอันนี้เป็น *query*
