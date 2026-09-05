# Wayfinder Picks

**โน้ตนี้เป็นของคุณ ไม่ใช่ของ template** — สร้างให้ครั้งเดียวตอนติดตั้ง แล้วไม่มีอะไรมาแตะอีกเลย
เขียนทับได้ตามใจ ตัวอัปเดตข้ามไฟล์นี้ตลอดกาล (ค่าคงที่ที่จูนได้อยู่คนละใบ: [[Wayfinder Config]])

ระดับใบทั้ง vault (หยิบอะไรได้ตอนนี้ · ติดที่ใคร · ใครจับอยู่): [[Wayfinder Dashboard]]
ระดับแมปทั้ง vault (แต่ละ effort เดินไปถึงไหน): [[Wayfinder Efforts]]
ระดับใบของ effort เดียว (ปิดใบไหนแล้วอะไรเดินต่อ): [[Wayfinder Effort Tickets]]

---

## 🎯 หยิบอันไหนต่อ — TODO: เขียนกฎของคุณเอง

Frontier บน [[Wayfinder Dashboard]] ตอบว่า *"อะไรหยิบได้"* แต่ไม่ได้ตอบว่า *"ควรหยิบอะไร"* — ซึ่งเป็นการตัดสินใจที่มีแต่คุณตอบได้

แก้ `SORT` ข้างล่างให้ตรงกับกฎที่คุณใช้จริงเวลานั่งลงทำงาน เช่น

- **AFK ก่อน** (`type = "research"`) — ยิงทิ้งไว้ตอนไม่ว่างนั่งเฝ้า ส่วน HITL เก็บไว้ตอนมีสมาธิ
- **ปลดล็อกได้เยอะสุดก่อน** (`length(file.inlinks)`) — ticket ที่มีคนรออยู่หลายใบควรมาก่อน
- **effort เดียวให้จบก่อน** — กัน context switch ข้าม map

> **`ปลดล็อกกี่ใบ` ที่นี่จะสูงกว่าคอลัมน์ `ปลดกี่ใบ` ของ [[Wayfinder Effort Tickets]] — ไม่ใช่บั๊ก**
> `file.inlinks` นับ**ทุกลิงก์ที่ชี้มาหาใบนี้** รวมตอน `map.md` เอ่ยถึงใบในเนื้อความ ⇒ เลขเฟ้อขึ้น
> ส่วนหน้านั้นนับจาก `blockers` ของใบอื่นจริง ๆ อย่างเดียว · ที่นี่ใช้ `inlinks` ต่อเพราะ DQL ล้วนทำอีกแบบไม่ได้
> และงานของคอลัมน์นี้คือ **จัดลำดับ** ไม่ใช่รายงานตัวเลข

```dataview
TABLE WITHOUT ID
  file.link AS "Ticket",
  type AS "Type",
  length(file.inlinks) AS "ปลดล็อกกี่ใบ"
FROM "" AND -"_tools"
WHERE status = "open"
  AND link(repo + "/" + effort + "/map").status = "active"
  AND all(map(blockers, (b) => b.status = "resolved"))
SORT file.name ASC
```

> **TODO** — เปลี่ยนบรรทัด `SORT` (เติม `WHERE` ถ้าอยากกรอง repo/effort เดียว)
> ตัวอย่างถ้าเอา "ปลดล็อกเยอะสุดก่อน แล้วค่อย AFK ก่อน HITL":
> `SORT length(file.inlinks) DESC, type = "research" DESC, file.name ASC`
