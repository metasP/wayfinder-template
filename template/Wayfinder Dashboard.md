# Wayfinder Dashboard

หน้า **ระดับใบ ทั้ง vault** — หยิบอะไรได้ตอนนี้ · ติดที่ใคร · ใครจับอยู่ · เปิดค้างไว้เวลาทำงานกับ `/wayfinder`
ภาพรวม **ระดับแมป** (แต่ละ effort เดินไปถึงไหน · อันไหนสถานะไม่ตรงจริง): [[Wayfinder Efforts]]
ระดับใบของ **effort เดียว** (effort นี้เหลืออะไร · ปิดใบไหนแล้วอะไรเดินต่อ · กราฟ dependency): [[Wayfinder Effort Tickets]]
วิธี setup + โครงสร้างโฟลเดอร์: ดู [[README]]
ค่าที่คุณจูนเอง — ตัวอัปเดตไม่แตะ: [[Wayfinder Config]] (สี · เส้นแบ่งเวลา · ป้ายสถานะ map) · [[Wayfinder Picks]] (กฎ "หยิบอันไหนต่อ")

> **ทุกบล็อกในหน้านี้คำนวณจาก core ตัวเดียวกับ `wf`** (`_tools/lib/core.mjs` ผ่าน loader `_tools/views/wf-core.js`) · โค้ดของทุกบล็อกอยู่ที่ `_tools/views/dashboard.js` บล็อกในโน้ตเป็นแค่บรรทัดเรียก
> ⇒ Frontier ที่นี่ = `wf frontier` · ตาราง lint ที่นี่ = `wf lint` บนโน้ตชุดเดียวกัน — หน้านี้แค่จัดตาราง ไม่มีกฎของตัวเอง
> **สี่ view หลักเห็นเฉพาะใบใน map ที่ `status: active`** — ใบจาก map ที่ `paused` / `draft` ถูกพับไว้ข้างล่าง
> ส่วนใบจาก map ที่ `dropped` ไม่แสดงเลย (นับจำนวนไว้ท้ายหน้า จะได้ไม่ใช่การซ่อนเงียบ ๆ)

---

## 🩺 Lint — ของที่ผิดใน vault

ชุดเดียวกับ `wf lint` เรียง error ก่อน warn · คอลัมน์ Fix คือคำสั่ง `wf` ที่แก้ข้อนั้น (ก๊อปไปรันได้เลย)
เห็นได้เฉพาะ frontmatter กับบล็อก `## Tickets` — เรื่อง install · git · hook ไปดูที่ `node _tools/doctor.mjs`

```dataviewjs
await dv.view("_tools/views/dashboard", { block: "lint" })
```

## 🔥 Frontier — หยิบได้ตอนนี้

open + ไม่ถูก block + อยู่ใน map ที่เดินอยู่ · เรียงตาม `sort:` ใน frontmatter ของ [[Wayfinder Picks]] — ลำดับเดียวกับ `wf frontier`
(ไม่มี `sort:` = ค่าเริ่มต้น `[unblocks desc, nn asc]` · ตารางในหน้า Picks คือรายการเดียวกันนี้)
blocker ที่ลิงก์หาใบไม่เจอ = **ยัง block อยู่** (fail closed) ใบนั้นจึงไปโผล่ใน 🚧 แทน

```dataviewjs
await dv.view("_tools/views/dashboard", { block: "frontier" })
```

## 🚧 Blocked — ติดใบอื่นที่อยู่ในมือเรา

แสดง blocker ที่ยัง **ไม่** resolved เท่านั้น จะได้เห็นว่าติดที่ใคร
ต่างจาก ⏳ ข้างล่าง: อันนี้ปลดล็อกได้เองด้วยการไปปิดใบที่บล็อกอยู่

```dataviewjs
await dv.view("_tools/views/dashboard", { block: "blocked" })
```

## ⏳ รอของนอก — ทำอะไรไม่ได้เลย

`status: waiting` = รอเหตุการณ์ที่ไม่ได้อยู่ในมือเรา (คนกดปุ่ม · prod release · พาร์ตเนอร์ตอบ)
**ตัวรายการนี้เองคือสัญญาณ** — เรียงรอนานสุดขึ้นก่อน ถ้ามันเริ่มยาวแปลว่ามีของค้างที่ควรไปทวง

```dataviewjs
await dv.view("_tools/views/dashboard", { block: "waiting" })
```

## 🖐 Claimed — มี session จับอยู่

ถ้าอันไหนค้างนาน = session ตายกลางทาง ⇒ `wf release` (🩺 ข้างบนเตือน stale claim ให้แล้ว)

```dataviewjs
await dv.view("_tools/views/dashboard", { block: "claimed" })
```

---

## ⚠️ ค้างเติ่ง — ใบยังไม่ปิด ใน map ที่ประกาศว่าปิดแล้ว

ข้อมูลขัดกันเอง ต้องเลือกข้าง: **ถ้ายังจะทำ** → map ไม่ใช่ `done` (ใช้ `active`/`paused`)
**ถ้าไม่ทำแล้ว** → ปิดใบทิ้ง · 🩺 ข้างบนก็ฟ้องข้อนี้เหมือนกัน ปกติตารางนี้ต้องว่าง

```dataviewjs
await dv.view("_tools/views/dashboard", { block: "stranded" })
```

## ⏸ จาก map ที่พักไว้

ไม่ใช่ของที่หายไป — แค่ไม่ควรแย่งที่กับงานที่เดินอยู่ ปลด map กลับเป็น `active` แล้วมันขึ้น Frontier เอง

```dataviewjs
await dv.view("_tools/views/dashboard", { block: "paused" })
```

## ✏️ จาก map ที่ยังไม่ได้ชาร์ต

`draft` = ยังไม่ผ่าน grill หา Destination — **อย่าต่อยอดจากใบพวกนี้** ให้ chart map ใหม่ก่อน

```dataviewjs
await dv.view("_tools/views/dashboard", { block: "draft" })
```

## 🗑 ใบใน map ที่ทิ้งแล้ว — นับไว้เฉย ๆ

ไม่แสดงรายใบ แต่ต้องรู้ว่ามีกี่ใบ ไม่งั้นการซ่อนจะกลายเป็นการโกหก

```dataviewjs
await dv.view("_tools/views/dashboard", { block: "dropped" })
```

---

## ✅ Decisions so far

```dataviewjs
await dv.view("_tools/views/dashboard", { block: "decisions" })
```

---

## 🎯 หยิบอันไหนต่อ — [[Wayfinder Picks]]

หน้านี้ตอบว่า *"อะไรหยิบได้"* แต่ไม่ได้ตอบว่า *"ควรหยิบอะไร"* — ซึ่งเป็นการตัดสินใจที่มีแต่คุณตอบได้
กฎการจัดลำดับจึงอยู่คนละใบ: [[Wayfinder Picks]] เป็น**โน้ตของคุณ** ตัวอัปเดตไม่แตะ — `sort:` ของมันคือลำดับของ 🔥 ข้างบน

ค่าคงที่ที่จูนได้ (เส้นแบ่งเวลา · สี · ป้ายสถานะ map) อยู่ที่ [[Wayfinder Config]] — คนละใบกันเพราะ
อันนั้นเป็น *ค่า* ส่วนอันนี้เป็น *กฎการเรียง*

> **บล็อกขึ้นข้อความ "โหลด core ไม่ได้"?** แปลว่า `_tools/lib/core.mjs` หาย · พัง · หรือรุ่นไม่ตรงกับหน้านี้
> รัน `node _tools/doctor.mjs` ใน vault — ข้อความนั้นมาจาก loader เอง ไม่ใช่กล่องแดงของ Dataview
