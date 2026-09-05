---
repo: example-repo
effort: getting-started
type: task
status: open
status_since: __TODAY__
---

## Question

**ชาร์ต map แรกจากงานจริงของคุณ**

ใบนี้คือใบที่หยิบได้จริง — มันเป็น `open` ไม่ติดใคร และอยู่ใน map ที่ `active` ⇒ ครบเงื่อนไขของ
🔥 Frontier บน [[Wayfinder Dashboard]] พอดี · ทั้งสามข้อต้องจริงพร้อมกัน ใบถึงจะขึ้น Frontier
(ข้อที่ลืมกันบ่อยที่สุดคือข้อสาม: `status` ของ **map** เป็นตัวกรองระดับใบ)

### ทำยังไง

เปิด session ที่ repo ที่คุณกำลังทำงานอยู่ แล้วสั่ง `/wayfinder` พร้อมบอกว่างานคืออะไร ·
สกิลจะพาคุณ**หา Destination ก่อน** แล้วค่อยแตกใบ — ไม่ใช่แตกใบก่อนแล้วค่อยเดาว่าจะจบตรงไหน

### Destination ที่ดีหน้าตาเป็นยังไง

**เขียนเป็น "รูปตอนถึงปลายทาง" ไม่ใช่รายการสิ่งที่จะทำ** เส้นแบ่งอยู่ตรงที่ *คนอื่นเดินมาดูแล้ว
ตอบได้ไหมว่าถึงหรือยัง* โดยไม่ต้องถามคุณ

| ไม่ใช่ Destination | เป็น Destination |
| --- | --- |
| "ทำระบบ export ให้เสร็จ" | "กดปุ่ม export บนหน้ารายงาน แล้วได้ไฟล์ที่เปิดใน Excel ได้ ภายใน 10 วิ" |
| "ปรับปรุงให้เร็วขึ้น" | "หน้าแรกโหลดต่ำกว่า 1.5 วิ บนเครื่องที่ throttle 4G" |
| "แก้บั๊ก login" | "ผู้ใช้ที่เคยติดหน้าขาวหลัง login เข้าได้ทุกคน และมี test ที่จับเคสนั้นไว้" |

### เขียนลงตรงไหน

```
<vault>/<repo>/<effort>/
├── map.md            ← kind: map · status: active · status_since: วันนี้
└── issues/
    └── NN-<slug>.md
```

`<repo>` ตั้งตามชื่อ repo ที่งานอยู่ · `<effort>` ตั้งตามชื่องาน ไม่ใช่ชื่อ branch — branch เปลี่ยนได้
แต่ effort เดิม · frontmatter `repo`/`effort` ของทุกใบ **ต้องตรงกับชื่อโฟลเดอร์เป๊ะ ๆ** เพราะ query
บน Dashboard ประกอบ path จากสองค่านี้เพื่อไปอ่าน `status` ของ map (`repo + "/" + effort + "/map"`)
พิมพ์ผิดตัวเดียว = ใบหายจาก Frontier เงียบ ๆ โดยไม่มีอะไรฟ้อง

### เสร็จแล้วเช็คสองอย่าง

1. `node _tools/doctor.mjs` — ผ่านทุกข้อ
2. เปิด `Wayfinder Dashboard` — ใบของคุณต้องอยู่ใน 🔥 Frontier แล้ว

ถ้า doctor ผ่านแต่ใบไม่ขึ้น Frontier ให้ไล่ตามลำดับนี้: `status` ของ map เป็น `active` หรือยัง →
`repo`/`effort` ตรงชื่อโฟลเดอร์ไหม → Dataview index อัปเดตหรือยัง (สั่ง *Reload app without saving*)

## Answer

(เติมตอน resolve)
