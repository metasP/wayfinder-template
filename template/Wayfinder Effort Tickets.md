# Wayfinder Effort Tickets

หน้า **ระดับใบ · ขอบเขต effort เดียว** — เลือก effort หนึ่งอัน แล้วเห็นว่ามันเหลืออะไร และปิดใบไหนแล้วอะไรเดินต่อ
ระดับใบทั้ง vault (หยิบอะไรได้ตอนนี้ · ติดที่ใคร · ใครจับอยู่): [[Wayfinder Dashboard]]
ระดับแมปทั้ง vault (แต่ละ effort เดินไปถึงไหน · สถานะตรงกับพฤติกรรมไหม): [[Wayfinder Efforts]]
วิธี setup + โครงสร้างโฟลเดอร์: ดู [[README]]
ค่าที่คุณจูนเอง — ตัวอัปเดตไม่แตะ: [[Wayfinder Config]] (สี · เส้นแบ่งเวลา · ป้ายสถานะ map) · [[Wayfinder Picks]] (กฎ "หยิบอันไหนต่อ")

> [!info]- กติกาของหน้านี้ — ช่องค้น · กราฟ · การแบ่งกลุ่ม · เลข "ปลดกี่ใบ"
> - ช่องค้นแมตช์ `repo` และ `effort` เท่านั้น (ไม่ใช่ชื่อใบ) · `Enter` = เลือกตัวบนสุดของรายการที่กรองแล้ว
> - รายการ **ไม่กรองสถานะทิ้ง** — หน้านี้คนเลือกเอง จึงไม่มีสิทธิ์ซ่อน effort ที่ `paused`/`dropped`
>   ⇒ กันหน้าโกหกด้วยการ **บอก** แทน: badge ในรายการ + หัว effort ที่ย้ำสถานะ/`status_note`/`blocked_by` ซ้ำอีกที
> - เรียง **ขยับล่าสุดก่อน** ด้วยนาฬิกาเดียวกับ [[Wayfinder Efforts]] (`status_since` ของใบล่าสุด หรือของ map เอง แล้วแต่อันไหนใหม่กว่า)
> - effort ที่เลือกล่าสุดถูกจำไว้ใน `localStorage` — เปิดหน้ามาครั้งหน้าได้ตัวเดิมโดยไม่ต้องพิมพ์
> - **กราฟอยู่เหนือตาราง** · ลูกศร = `blocker → ใบที่มันปลด` (สวนทาง Graph View โดยตั้งใจ) ⇒ ตอบว่า
>   *"ปิดใบนี้แล้วอะไรเดินต่อ"* ส่วน *"ใบนี้ติดอะไร"* อ่านจากคอลัมน์ "รออยู่" ของกลุ่ม 🚧 แทน
>   โหนดมีแค่เลข `NN` (จ่อเมาส์เห็นชื่อเต็ม · คลิกเปิดใบ) ⇒ ทางอ่านคือ **เห็นรูปทรง → เจอเลขที่สนใจ →
>   เลื่อนลงหาชื่อในตาราง** · ป้าย `◂07 12` เหนือโหนดบอกว่า**ใบนั้นติดใบไหนบ้าง**โดยไม่ต้องไล่เส้น
>   (เกิน 3 ตัวตัดเป็น `+N` — ดูครบที่คอลัมน์ "รออยู่") · `resolved` ยังอยู่ในกราฟ ไม่จาง ไม่ตัด เพราะสีเขียวที่ไล่ซ้าย→ขวาคือ
>   "เดินมาถึงไหนแล้ว" · effort ที่ไม่มีใบไหนผูกกันเลย **ไม่มีส่วนกราฟ** ไม่ใช่โชว์กรอบเปล่า
> - แถบ **"ไม่ผูกกับใบไหนใน effort นี้"** ใต้กราฟ เก็บใบที่ไม่มีเส้นสักเส้น — ตัดทิ้งไม่ได้เพราะกราฟจะโกหก
>   ว่า effort มีแค่นี้ · ใบที่ blocker อยู่คนละ effort ล้วน ๆ ก็ลงที่นี่ ⇒ เห็นมันทั้งในกลุ่ม 🚧 และในแถบ
> - ใบแยกตาม **action ไม่ใช่ `status` ดิบ** (🔥 หยิบได้ · 🚧 ติดใบอื่น · ⏳ รอของนอก · 🖐 มีคนจับ · ✅ ปิดแล้ว)
>   แกนเดียวกับ [[Wayfinder Dashboard]] · **กลุ่มที่ว่างจะไม่โชว์หัวข้อ** · ✅ พับไว้ ยกเว้นไม่มีใบค้างเลย
> - ทุกกลุ่มเรียงตาม `NN` เพื่อให้เห็นเลขในกราฟแล้วกวาดเจอในตารางทันที · คอลัมน์ที่สามต่างกันทุกกลุ่ม
>   ตามคำถามค้างคาของกลุ่มนั้น · `↗` หลังชื่อ blocker = blocker ตัวนั้นอยู่คนละ effort
> - **"ปลดกี่ใบ" นับจาก `blockers` ของใบอื่นจริง ๆ ไม่ใช่ `file.inlinks`** ⇒ ตั้งใจให้ไม่ตรงกับคอลัมน์
>   "ปลดล็อกกี่ใบ" ของ Dashboard ซึ่งเลขเฟ้อเพราะนับตอน `map.md` เอ่ยถึงใบในเนื้อความด้วย

```dataviewjs
// ── 0. สัญญากับหน้าอื่น — ห้ามแก้ข้างเดียว ──────────────────────────────────
// คีย์นี้ถูก **เขียน** โดย `Wayfinder Efforts.md` (ตอนคลิกตัวเลข 44/47) และ **อ่าน** ที่นี่
// ค่าที่เก็บคือสตริง "<repo>/<effort>" เช่น "my-repo/some-effort"
// ถ้าสองหน้าใช้คีย์คนละตัว อาการคือ "เปิดหน้ามาแล้วไม่เลือกอะไร" — ดูเหมือนโหลดช้า ไม่เหมือนของพัง
// ⇒ ไม่มีใครรู้ว่ามันเสีย · `_tools/doctor.mjs` จึงดึงสตริงนี้จากทั้งสองไฟล์แล้วเทียบ
//    regex ที่ doctor ใช้จับ **ชื่อตัวแปร** ⇒ ทั้งสองไฟล์ต้องประกาศเป็น `const LS_KEY = "..."` เหมือนกัน
const LS_KEY = "wayfinder-effort-tickets:selected"

// event ที่ `Wayfinder Efforts` ยิงต่อจากการเขียนคีย์ — ทำให้หน้านี้ที่เปิดค้างอยู่ใน pane อื่น
// สลับ effort ตามทันที แทนที่จะต้องรอ dataview วาดบล็อกใหม่ (หรือปิดเปิดหน้า)
const SELECT_EVENT = "wayfinder-effort-select"

// ── ค่าที่ผู้ใช้จูนได้ — อ่านจากโน้ต `Wayfinder Config` ─────────────────────────
// เดิมสี/ป้ายชุดนี้ถูก **คัดลอก** มาจาก `Wayfinder Efforts.md` ⇒ ประกาศซ้ำสองไฟล์ และไม่ตรงกัน
// ได้ทุกเมื่อ · ตอนนี้ทั้งสองหน้าอ่านจาก **ที่เดียว** ⇒ ไม่มีทางไม่ตรงกันอีกต่อไปโดยโครงสร้าง
// ค่าที่ประกาศข้างล่างจึงเป็น **ค่าเริ่มต้น** อย่างเดียว ไม่ใช่สำเนาที่ต้องคอยไล่ให้ตรงกัน
//
// สัญญาของตัวอ่าน — **ห้าม throw** ไม่ว่ากรณีไหน: โน้ตหาย · ถูกลบ · คีย์ไม่ครบ · พิมพ์ผิดชนิด
// ต้องตกไปใช้ค่าเริ่มต้น **เป็นราย ๆ คีย์** ไม่ใช่ทิ้งทั้งชุด · เหตุผล: กล่องแดง `Dataview: <error>`
// ไม่ได้บอกว่าสาเหตุคือโน้ตหาย ผู้ใช้จะสรุปว่า *หน้าพัง* แล้วไปไล่หาผิดทางทั้งเส้น
const CONFIG_NOTE = "Wayfinder Config"
const cfg = (() => { try { return dv.page(CONFIG_NOTE) ?? {} } catch (_) { return {} } })()
// สีต้องเป็น `#rrggbb` **หกหลักเป๊ะ** ไม่ใช่แค่ "สตริงอะไรก็ได้" — §9a ต่อ alpha ท้ายสี (`${c}${TINT}`)
// ⇒ `red` หรือ `#abc` กลายเป็น `red33` / `#abc33` ที่เบราว์เซอร์ทิ้งเงียบ ๆ = โหนดใส หาสาเหตุไม่เจอ
const cfgColor = (k, dflt) => {
  const s = cfg[k]
  return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s.trim()) ? s.trim() : dflt
}
// ป้ายถูกยัดลงเนื้อ HTML ตรง ๆ (badge ไม่ผ่าน `esc()`) ⇒ ปฏิเสธตัวที่มี `<` `>` `"`
const cfgLabel = (k, dflt) => {
  const s = cfg[k]
  return typeof s === "string" && s.trim() && !/[<>"]/.test(s) ? s.trim() : dflt
}

const COLORS = {
  resolved: cfgColor("color_resolved", "#4CAF50"),
  claimed: cfgColor("color_claimed", "#FFB300"),
  open: cfgColor("color_open", "#9E9E9E"),
  waiting: cfgColor("color_waiting", "#AB47BC"),
}
const MAP_LABEL = {
  paused: cfgLabel("label_paused", "⏸ พักไว้"),
  draft: cfgLabel("label_draft", "✏️ ยังไม่ได้ชาร์ต"),
  done: cfgLabel("label_done", "✅ ปิดแล้ว"),
  dropped: cfgLabel("label_dropped", "🗑 ทิ้งแล้ว"),
}

// หน่วยวัดของกราฟ (§9a) — ล็อกจากใบ 01 ที่วัดมาแล้วว่าทั้ง 32 effort ไม่มีอันไหนล้น 700px
// (ลึกสุด 12 ชั้น = 670px) · ถ้าวันหนึ่งต้องบีบอีก **ให้ลด `GX` ก่อน ห้ามแตะ `NW`** (สเปกข้อ 8)
// อยู่บนสุดเพราะ CSS ใน §6 ต้องใช้ค่าเดียวกัน — ชิปในแถบ "ไม่ผูกกับใบไหน" ต้องเท่าโหนดเป๊ะ
// ไม่งั้นแถบจะดูเหมือนของคนละชุดกับกราฟที่มันห้อยอยู่ด้วย
// `GY` ขยายจาก 12 เป็น 18 ตอนใบ 11 เพิ่มป้าย blocker — ป้ายอยู่ใน**ช่องว่างนี้** เหนือโหนดของตัวเอง
// 12px ทำให้ป้ายลอยกึ่งกลางระหว่างสองโหนด (ห่างตัวบน 2px ตัวล่าง 4px) ⇒ อ่านไม่ออกว่าเป็นของใคร
// 18px ได้ 8px/2.5px = ชิดโหนดตัวเองชัดเจน · `LBL` คือที่ว่างเหนือ**แถวบนสุด** ซึ่งไม่มี `GY` อยู่ข้างบน
const NW = 40, NH = 26, GX = 16, GY = 18, PAD = 7, LBL = 6
const TINT = "33" // alpha 20% ทับพื้นโน้ตที่โปร่งใส แทนการ hardcode สีพื้น ⇒ รอดทั้งธีมสว่างและมืด

const DT = dv.luxon.DateTime
const today = DT.now().startOf("day")
const toDT = (v) =>
  v == null ? null : typeof v === "string" ? DT.fromISO(v) : v.toMillis ? v : null
const daysAgo = (d) => (d == null ? null : Math.round(today.diff(d.startOf("day"), "days").days))
const ago = (d) => (d == null ? "—" : d <= 0 ? "วันนี้" : d === 1 ? "เมื่อวาน" : `${d} วันก่อน`)
const later = (a, b) => (!a ? b : !b ? a : a > b ? a : b)

const asList = (v) =>
  v == null ? [] : typeof v.array === "function" ? v.array() : Array.isArray(v) ? v : [v]
const stem = (v) => String(v?.path ?? v ?? "").replace(/\.md$/, "")
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))

// ── 1. กวาดทั้ง vault รอบเดียว — index สองชั้น (ยกจาก `Wayfinder Efforts`) ──
//       รอบนี้เก็บฟิลด์ของใบให้ครบ (`type` / `status_note` / `blockers` / path) ตั้งแต่ตอนนี้
//       เพราะกลุ่มใบ (ใบ 03) กับกราฟ (ใบ 04) ต้องใช้ต่อ และห้ามกลายเป็นสองลูป
const efforts = new Map()
const index = new Map()
for (const p of dv.pages()) {
  const parts = p.file.path.split("/")
  if (parts.length < 3 || parts[0].startsWith("_") || parts[0].startsWith(".")) continue
  const isMap = parts.length === 3 && p.file.name === "map"
  const isTicket = parts.length === 4 && parts[2] === "issues"
  if (!isMap && !isTicket) continue // assets/ ไม่นับ

  const key = `${parts[0]}/${parts[1]}`
  if (!efforts.has(key))
    efforts.set(key, { repo: parts[0], effort: parts[1], key, map: null, tickets: new Map() })
  const e = efforts.get(key)
  const rec = { isMap, status: p.status, owner: key, name: p.file.name }
  index.set(stem(p.file.path), rec)
  if (!index.has(p.file.name)) index.set(p.file.name, rec)

  if (isMap) {
    e.map = p.file.path
    e.status = p.status ?? "active"
    e.since = toDT(p.status_since)
    e.note = p.status_note
    e.blockedBy = p.blocked_by
    e.supersededBy = p.superseded_by
  } else {
    e.tickets.set(p.file.name, {
      name: p.file.name,
      path: p.file.path,
      status: p.status,
      type: p.type,
      since: toDT(p.status_since),
      note: p.status_note,
      blockers: asList(p.blockers).map((b) => stem(b).split("/").pop()),
    })
  }
}
const lookup = (link) => index.get(stem(link)) ?? index.get(stem(link).split("/").pop())

// ── 1b. blocker ตัวหนึ่ง "ปิดแล้วหรือยัง" — กฎเดียวที่ chips ในหัว (§2) กับกลุ่ม 🚧 (§9) ใช้ร่วมกัน ──
//   ⚠️ ต้องเป็น **ฟังก์ชันเดียวจริง ๆ** ไม่ใช่สองที่ที่เขียนเหมือนกัน — ถ้าหัวบอก `🚧2` แต่ตาราง 🚧
//      มีแถวเดียว หน้านี้จะขัดกันเองในจอเดียว ซึ่งแย่กว่าเลขผิด เพราะไม่มีทางรู้ว่าฝั่งไหนถูก
//   blocker ข้าม effort **มีจริง** — ตอนเขียนกฎนี้ทั้ง vault มี 6 เส้น กระจุกอยู่ใน effort เดียว
//      และ 5 ใน 6 `resolved` ไปแล้ว ⇒ ถ้าดูแค่ `e.tickets` ใบพวกนั้นจะค้างใน 🚧 ตลอดกาลโดยไม่มีทางปลด
//      ⇒ ไม่เจอในบ้าน ค่อยถามทั้ง vault ต่อ · หาไม่เจอจริง ๆ ถือว่ายังไม่ปิด (ไม่เดาเข้าข้างตัวเอง)
const blockerOpen = (e, name) => {
  const own = e.tickets.get(name)
  if (own) return own.status !== "resolved"
  const far = lookup(name)
  // `blockers` เหลือแค่ชื่อไฟล์ (§1) ⇒ ถ้าชี้ไป map จะได้ชื่อ `"map"` ซึ่งซ้ำกันทั้ง vault
  // ⇒ แยกไม่ออกว่า map ไหน · ตอบไม่ได้ = ยังไม่ปิด ห้ามเดาว่าปลดแล้ว (blocker ระดับ map
  //    ที่ถูกต้องใช้ `blocked_by` บน map ไม่ใช่ `blockers` บนใบ — เคสนี้จึงไม่ควรมีจริง)
  return !far || far.isMap || far.status !== "resolved"
}

// ── 2. นับต่อ effort ────────────────────────────────────────────────────────
// ⚠️ ต่างจาก `Wayfinder Efforts` ตรงนี้จุดเดียว: หน้านั้น `continue` ทิ้ง effort ที่ยังไม่มีใบ
//    หน้านี้ทิ้งไม่ได้ — คนพิมพ์ค้นเอง ถ้าค้นแล้วไม่เจอจะแยกไม่ออกว่า "ไม่มี effort นี้"
//    กับ "มีแต่ยังไม่มีใบ" ⇒ เก็บไว้ทุกอัน แล้วไปบอกด้วยข้อความตอนวาด
const rows = []
for (const e of efforts.values()) {
  const t = [...e.tickets.values()]
  const n = (s) => t.filter((x) => x.status === s).length
  const open = n("open")
  const blocked = t.filter(
    (x) => x.status === "open" && x.blockers.some((b) => blockerOpen(e, b))
  ).length

  const lastTicket = t.map((x) => x.since).reduce(later, null)
  rows.push({
    ...e,
    hasMap: !!e.map,
    total: t.length,
    resolved: n("resolved"),
    claimed: n("claimed"),
    waiting: n("waiting"),
    open,
    blocked,
    frontier: open - blocked,
    pending: open + n("claimed") + n("waiting"),
    days: daysAgo(later(lastTicket, e.since)),
    pausedDays: daysAgo(e.since),
  })
}

// ── 3. blocked_by ของ map ชี้ไปที่อะไร และมันเดินอยู่ไหม (ยกจาก `Wayfinder Efforts`) ──
const blockState = (r) => {
  if (!r.blockedBy) return null
  const t = lookup(r.blockedBy)
  const name = stem(r.blockedBy).split("/").pop()
  if (!t) return { state: "dangling", name }
  if (t.isMap ? t.status === "done" : t.status === "resolved") return { state: "cleared", name }
  const owner = efforts.get(t.owner)
  if (t.status === "dropped" || ["paused", "dropped"].includes(owner?.status))
    return { state: "dead", name }
  return { state: "waiting", name }
}
for (const r of rows) r.block = blockState(r)

rows.sort((a, b) => (a.days ?? 0) - (b.days ?? 0)) // ขยับล่าสุดขึ้นก่อน — เหมือน `Wayfinder Efforts`

// ── 4. state — selection อยู่ใน localStorage ตัวเดียว ที่เหลือเป็นของชั่วคราว ──
const readLS = () => { try { return localStorage.getItem(LS_KEY) } catch (_) { return null } }
const writeLS = (k) => { try { localStorage.setItem(LS_KEY, k) } catch (_) {} }

let selected = readLS()
// effort ที่จำไว้อาจถูกลบ/เปลี่ยนชื่อไปแล้ว — บอกตรง ๆ ดีกว่าเปิดมาเจอหน้าว่างแบบไม่มีเหตุผล
const missing = selected && !rows.some((r) => r.key === selected) ? selected : null
if (missing) selected = null
let query = ""
let listOpen = !selected // ยังไม่เคยเลือกอะไร → มีแค่รายการให้เลือก

// ── 5. ชิ้นส่วนที่วาดซ้ำ ────────────────────────────────────────────────────
const nameOf = (r, asLink) => {
  const inner =
    asLink && r.map
      ? `<a class="internal-link" data-href="${esc(r.map)}" href="${esc(r.map)}">${esc(r.effort)}</a>`
      : esc(r.effort)
  return `<span class="wft-nm">${inner}<small>${esc(r.repo)}</small></span>`
}
const badge = (r) => {
  if (!r.hasMap) return `<span class="wft-badge is-nomap">⚠️ ไม่มี map</span>`
  if (r.status === "active") return `<span class="wft-badge is-blank"></span>`
  return `<span class="wft-badge is-${esc(r.status)}">${MAP_LABEL[r.status] ?? esc(r.status)}</span>`
}
const bar = (r) => {
  const w = (n) => `${(n / r.total) * 100}%`
  return (
    `<span class="wft-bar">` +
    `<i style="width:${w(r.resolved)};background:${COLORS.resolved}"></i>` +
    `<i style="width:${w(r.claimed)};background:${COLORS.claimed}"></i>` +
    `<i style="width:${w(r.open)};background:${COLORS.open}"></i>` +
    `<i style="width:${w(r.waiting)};background:${COLORS.waiting}"></i>` +
    `</span>`
  )
}
const chips = (r) =>
  [
    r.frontier ? `<span class="wft-chip wft-fro">🔥${r.frontier}</span>` : "",
    r.blocked ? `<span class="wft-chip wft-blk">🚧${r.blocked}</span>` : "",
    r.claimed ? `<span class="wft-chip wft-hld">🖐${r.claimed}</span>` : "",
    r.waiting ? `<span class="wft-chip wft-wai">⏳${r.waiting}</span>` : "",
  ].join("") || `<span class="wft-chip wft-non">ไม่มีใบค้าง</span>`

// ── 6. โครงหน้า — วาดครั้งเดียว แล้วอัปเดตทีละส่วน ──────────────────────────
//       ห้ามเขียน `dv.container.innerHTML` ทับทุกครั้งที่พิมพ์ ไม่งั้น `<input>` เสีย focus
//       และข้อความที่พิมพ์ค้างจะหายทุกตัวอักษร
const CSS = `
.wft { font-size: var(--font-ui-medium); }
.wft-input { width: 100%; font-size: var(--font-ui-medium); }
.wft-list { max-height: 320px; overflow-y: auto; margin-top: 6px;
  border: 1px solid var(--background-modifier-border); border-radius: 6px; }
.wft-opt { display: grid; gap: 10px; align-items: center; cursor: pointer; padding: 5px 10px;
  grid-template-columns: minmax(0, 1fr) 56px 108px;
  border-bottom: 1px solid var(--background-modifier-border); }
.wft-opt:last-child { border-bottom: 0; }
.wft-opt:hover, .wft-opt.is-sel { background: var(--background-modifier-hover); }
.wft-nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.25; }
.wft-nm small { display: block; color: var(--text-faint); font-size: .85em; }
.wft-num, .wft-when { font-family: var(--font-monospace); font-size: .9em; color: var(--text-muted); }
.wft-badge { font-size: .8em; padding: 1px 6px; border-radius: 4px; white-space: nowrap;
  text-align: center; background: var(--background-secondary); color: var(--text-muted); }
.wft-badge.is-blank { background: none; }
.wft-badge.is-dropped, .wft-badge.is-nomap { color: var(--text-error); }
.wft-badge.is-paused { color: #FFB300; }
.wft-badge.is-draft { color: var(--text-faint); }
.wft-badge.is-done { color: #4CAF50; }
.wft-empty { color: var(--text-faint); padding: 8px 10px; }
.wft-warn { color: var(--text-error); font-size: .9em; padding: 6px 0; }
.wft-head { margin: 1.2em 0 .4em; padding: 8px 0 8px 12px;
  border-left: 3px solid var(--background-modifier-border); }
.wft-head.is-paused { border-left-color: #FFB300; }
.wft-head.is-dropped, .wft-head.is-nomap { border-left-color: var(--text-error); }
.wft-head.is-done { border-left-color: #4CAF50; }
.wft-head.is-active { border-left-color: var(--text-accent); }
.wft-htop { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.wft-htop .wft-nm { font-size: 1.15em; font-weight: 600; }
.wft-htop .wft-nm small { display: inline; font-weight: normal; margin-left: 8px; font-size: .72em; }
.wft-hbar { display: grid; gap: 10px; align-items: center; margin-top: 8px;
  grid-template-columns: 140px 56px minmax(0, 1fr); }
.wft-hmeta { margin-top: 6px; font-size: .9em; color: var(--text-faint); }
.wft-hmeta b { color: var(--text-muted); font-weight: normal; }
.wft-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden;
  background: var(--background-modifier-border); }
.wft-bar i { display: block; height: 100%; }
.wft-chip { font-family: var(--font-monospace); font-size: .84em; padding: 1px 4px;
  border-radius: 4px; margin-right: 3px; white-space: nowrap; background: var(--background-secondary); }
.wft-fro { color: var(--text-accent); }
.wft-blk { color: var(--text-error); }
.wft-hld { color: #FFB300; }
.wft-wai { color: #AB47BC; }
.wft-non { color: var(--text-faint); background: none; padding-left: 0; }

/* ── 5 กลุ่มใบ (ใบ 03) — สีทั้งหมดมาจากตัวแปรธีม ยกเว้นสีสถานะสี่สีที่ตกลงกันไว้ ── */
.wft-grp { margin-top: 1.1em; }
.wft-gh { display: flex; align-items: baseline; gap: 8px; }
.wft-gh small { color: var(--text-faint); font-weight: normal; }
details.wft-grp > summary { cursor: pointer; list-style: none; }
details.wft-grp > summary::-webkit-details-marker { display: none; }
details.wft-grp > summary::before { content: "▸"; color: var(--text-faint); }
details.wft-grp[open] > summary::before { content: "▾"; }
.wft-tbl { margin-top: 5px; border: 1px solid var(--background-modifier-border); border-radius: 6px; }
.wft-row { display: grid; gap: 10px; align-items: baseline; padding: 4px 10px;
  border-bottom: 1px solid var(--background-modifier-border); }
.wft-row:last-child { border-bottom: 0; }
.wft-row.is-th { font-size: .82em; color: var(--text-faint);
  background: var(--background-secondary); border-radius: 5px 5px 0 0; }
.wft-tbl.is-fro .wft-row { grid-template-columns: minmax(0, 1fr) 22px 72px; }
.wft-tbl.is-blk .wft-row { grid-template-columns: minmax(0, 1fr) 22px minmax(0, 1.1fr); }
.wft-tbl.is-wai .wft-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr) 96px; }
.wft-tbl.is-hld .wft-row, .wft-tbl.is-res .wft-row, .wft-tbl.is-unk .wft-row {
  grid-template-columns: minmax(0, 1fr) 22px 96px; }
.wft-tbl.is-fro .wft-row > span:last-child { text-align: right; }
.wft-tk { display: inline-block; max-width: 100%; vertical-align: bottom;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wft-tk b { font-family: var(--font-monospace); font-weight: 600; }
.wft-ty { font-family: var(--font-monospace); font-size: .78em; padding: 0 4px; border-radius: 3px;
  background: var(--background-secondary); color: var(--text-muted); }
.wft-bk { display: inline-block; max-width: 100%; vertical-align: bottom; font-size: .9em;
  margin-right: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wft-bk.is-dead { color: var(--text-error); }
.wft-bk small { color: var(--text-faint); }
.wft-note { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; font-size: .9em; color: var(--text-muted); }

/* ── กราฟ dependency (ใบ 04) — ยกจากต้นแบบใบ 01 ──
   ⚠️ หัวลูกศรในต้นแบบใช้คลาส \`.wft-head\` ซึ่ง**ชนกับหัว effort**ในไฟล์นี้ (\`<div class="wft-head">\`)
      ปล่อยไว้จะได้ \`opacity:.5\` ทับทั้งหัว effort ⇒ เปลี่ยนเป็น \`.wft-arw\` ตอนยกเข้ามา
   ขนาดชิปในแถบโดดเดี่ยวผูกกับ NW/NH ตรง ๆ — โหนดกับชิปต้องเป็นของชุดเดียวกันเสมอ */
.wft-svg { display: block; max-width: 100%; height: auto; overflow: visible; margin: 1.1em 0 .2em; }
.wft-edge { fill: none; stroke: var(--text-faint); stroke-width: 1.2; opacity: .5; }
.wft-arw { fill: var(--text-faint); opacity: .5; }
.wft-lbl { fill: var(--text-normal); font-family: var(--font-monospace); font-size: 12px;
  text-anchor: middle; dominant-baseline: middle; pointer-events: none; }
/* ป้าย blocker (ใบ 11) — \`paint-order: stroke\` วาดขอบสีพื้นก่อนตัวอักษร = halo
   จำเป็นเพราะป้ายนั่งอยู่บนเส้นที่ลอดผ่านช่องว่างระหว่าง lane พอดี ไม่มี halo แล้วอ่านไม่ออก
   (บล็อกนี้เป็น template literal — backtick ในคอมเมนต์ต้อง escape ไม่งั้นสตริงขาดกลางทาง) */
/* 9px ไม่ใช่ 7.5 — วัดแล้วป้ายยาวสุด 50.2px จาก 56px ที่มี ⇒ ยังเหลือที่ให้ "+10" (10 อักษร) ในอนาคต
   ที่ 10px จะกลายเป็น 55.8 คือชนเพดานพอดี ไม่เหลือที่เผื่อเลย
   (อย่าใช้ backtick ในคอมเมนต์นี้ — บล็อกนี้เป็น template literal สตริงจะขาดกลางทาง) */
.wft-blk { font-family: var(--font-monospace); font-size: 9px; fill: var(--text-muted);
  pointer-events: none;
  paint-order: stroke; stroke: var(--background-primary); stroke-width: 2.5px;
  stroke-linejoin: round; }
.wft-more { fill: var(--text-faint); }
.wft-svg a { cursor: pointer; }
.wft-svg a:hover rect { stroke-width: 2; }
.wft-isohd { margin: 1.1em 0 .4em; font-size: .84em; text-transform: uppercase;
  letter-spacing: .04em; color: var(--text-faint); }
.wft-isorow { display: flex; flex-wrap: wrap; gap: 8px; }
.wft-iso { display: inline-flex; align-items: center; justify-content: center;
  width: ${NW}px; height: ${NH}px; border-radius: 6px; border: 1px solid;
  font-family: var(--font-monospace); font-size: 12px; color: var(--text-normal);
  text-decoration: none; }
.wft-iso:hover { border-width: 2px; }
`

dv.container.innerHTML =
  `<style>${CSS}</style><div class="wft">` +
  `<input class="wft-input" type="text" spellcheck="false" ` +
  `placeholder="ค้น effort — พิมพ์ชื่อ repo หรือ effort แล้วกด Enter">` +
  `<div class="wft-list"></div><div class="wft-head"></div><div class="wft-body"></div></div>`

const $input = dv.container.querySelector(".wft-input")
const $list = dv.container.querySelector(".wft-list")
const $head = dv.container.querySelector(".wft-head")
const $body = dv.container.querySelector(".wft-body")

// ── 7. รายการ effort ────────────────────────────────────────────────────────
const matches = () => {
  const q = query.trim().toLowerCase()
  // `key` คือ "<repo>/<effort>" ⇒ แมตช์ทีเดียวได้ทั้งสองฝั่ง และพิมพ์คร่อม "/" ก็ยังเจอ
  return q ? rows.filter((r) => r.key.toLowerCase().includes(q)) : rows
}
const optRow = (r) =>
  `<div class="wft-opt${r.key === selected ? " is-sel" : ""}" data-key="${esc(r.key)}">` +
  `${nameOf(r, false)}<span class="wft-num">${r.total ? `${r.resolved}/${r.total}` : "—"}</span>` +
  `${badge(r)}</div>`

const renderList = () => {
  $list.style.display = listOpen ? "" : "none"
  if (!listOpen) return
  const list = matches()
  $list.innerHTML = list.length
    ? list.map(optRow).join("")
    : `<div class="wft-empty">ไม่พบ effort ที่ตรงกับ "${esc(query.trim())}"</div>`
}

// ── 8. หัว effort ที่เลือก ──────────────────────────────────────────────────
//       สามอย่างที่ห้ามหาย: badge สถานะ map · `status_note` · `blocked_by`
//       Dashboard กัน map ที่ถูกทิ้งด้วยการ **กรอง** — หน้านี้กรองไม่ได้ (คนเลือกเอง) ⇒ กันด้วยการ **บอก**
const BLOCK_WORD = {
  cleared: (n) => `blocker ปลดแล้ว — ${n} ⇒ กลับมาทำได้`,
  dead: (n) => `รอ ${n} ที่ไม่มีใครผลักให้เดิน ⇒ โซ่ตัน`,
  dangling: (n) => `blocked_by ชี้ไปที่ ${n} ที่ไม่มีอยู่`,
  waiting: (n) => `รอ ${n}`,
}
const renderHead = () => {
  if (missing && !selected) {
    $head.className = "wft-head is-nomap"
    $head.innerHTML = `<div class="wft-warn">effort ที่จำไว้ (<code>${esc(missing)}</code>) ไม่มีอยู่ใน vault แล้ว — เลือกใหม่จากรายการข้างบน</div>`
    return
  }
  const r = rows.find((x) => x.key === selected)
  if (!r) { $head.className = "wft-head"; $head.innerHTML = ""; return }

  const meta = [
    `คืบหน้าล่าสุด <b>${ago(r.status === "paused" ? r.pausedDays : r.days)}</b>`,
    r.block ? esc(BLOCK_WORD[r.block.state](r.block.name)) : "",
    r.note ? esc(r.note) : "",
    r.supersededBy ? `→ ${esc(stem(r.supersededBy).split("/")[1] ?? r.supersededBy)}` : "",
  ].filter(Boolean).join(" · ")

  $head.className = `wft-head is-${r.hasMap ? esc(r.status) : "nomap"}`
  $head.innerHTML =
    `<div class="wft-htop">${nameOf(r, true)}${badge(r)}</div>` +
    (r.total
      ? `<div class="wft-hbar">${bar(r)}<span class="wft-num">${r.resolved}/${r.total}</span>` +
        `<span>${chips(r)}</span></div>`
      : "") +
    `<div class="wft-hmeta">${meta}</div>`
}

// ── 9. ตัวหน้า — กราฟ (ใบ 04) แล้วตามด้วย 5 กลุ่มใบ (ใบ 03) ─────────────────

// ── 9a. กราฟ dependency ของ effort ที่เลือก (ยกจากต้นแบบใบ 01) ──────────────
//   ลูกศร: **blocker → ใบที่มันปลด** · ซ้าย→ขวา = ความคืบหน้า (สวนทาง Graph View โดยตั้งใจ)
//   อยู่**เหนือ**ตารางเพราะโหนดมีแค่เลข `NN` ⇒ ทางอ่านคือ เห็นรูปทรง → เจอเลขที่สนใจ → เลื่อนลงหาชื่อ
//   ⚠️ กราฟ **ไม่มี**กฎว่าเส้นไหน "ยังไม่ปลด" — สถานะอยู่ที่สีโหนดครบแล้ว ส่วน `blockerOpen()` (§1b)
//      เป็นกฎของคอลัมน์ "รออยู่" ⇒ กราฟไม่แตะ ไม่งั้นหน้าเดียวกันจะมีสองกฎที่เถียงกันเองได้
const SWEEPS = 4 // barycenter ลง-ขึ้น สลับกัน

// `NN` — กฎเดียวที่โหนดในกราฟกับตัวหนาใน `ticketLink()` ใช้ร่วมกัน (เหมือน `blockerOpen()` ของ §1b)
// ทางอ่านของหน้านี้คือ "เห็นเลขในรูป → กวาดหาเลขเดียวกันในตาราง" ⇒ สองที่เรียกใบคนละชื่อไม่ได้เด็ดขาด
// ตัวอักษรท้ายเลขมีจริง: เคยมี effort ที่มีทั้ง `21-…` และ `21a-…` อยู่ในโฟลเดอร์เดียวกัน
// ⇒ ถ้าจับแค่ `\d+` สองใบนี้จะกลายเป็นโหนด `21` เหมือนกันสองอัน ทั้งที่ตารางแยกเป็น `21` กับ `21a`
const num = (n) => (/^(\d+[a-z]?)/.exec(n)?.[1] ?? String(n).slice(0, 3))

function graph(tickets, uid) {
  // 1. เส้น — นับเฉพาะคู่ที่ปลายทั้งสองอยู่ใน effort เดียวกัน
  //    blocker ที่ชี้ออกนอก effort หรือชี้ใบที่ไม่มีอยู่ ไม่ใช่เส้นของกราฟนี้ (คอลัมน์ "รออยู่" ตอบไปแล้ว)
  const preds = new Map(), succs = new Map()
  for (const n of tickets.keys()) { preds.set(n, []); succs.set(n, []) }
  const edges = [], seen = new Set()
  for (const t of tickets.values())
    for (const b of t.blockers) {
      const k = `${b}>${t.name}`
      if (!tickets.has(b) || b === t.name || seen.has(k)) continue
      seen.add(k)
      edges.push([b, t.name])
      succs.get(b).push(t.name)
      preds.get(t.name).push(b)
    }
  // เรียงเส้นด้วยชื่อใบเหมือนทุกที่ในหน้านี้ — พิกัดนิ่งอยู่แล้วโดยไม่ต้องเรียง (วัดแล้ว: สลับลำดับที่
  // `dv.pages()` คืนมา โหนดกับเส้นลงที่เดิมทุกตัว) แต่ **ลำดับที่เขียน `<path>` ออกมา**ยังแกว่งตามมัน
  // ⇒ รูปเหมือนเดิมเป๊ะแต่ HTML ไม่เท่ากัน · เรียงทิ้งไว้ให้ผลเป็นไบต์เดียวกัน จะได้เทียบสองรอบได้จริง
  edges.sort((p, q) => p[0].localeCompare(q[0]) || p[1].localeCompare(q[1]))

  const linked = (n) => preds.get(n).length || succs.get(n).length
  // เรียงด้วยชื่อใบ = เรียงตาม `NN` (ชื่อ zero-pad อยู่แล้ว) — กฎเดียวกับทุกกลุ่มใน §9b
  // ทำที่นี่ที่เดียวแล้วชั้นด้านล่างรับลำดับนี้ไปเลย ⇒ ทั้ง `depth` (ตอนเจอวงจร) ลำดับตั้งต้นของแต่ละชั้น
  // และลำดับที่เขียนโหนดออกมา ล้วนไม่ขึ้นกับลำดับที่ `dv.pages()` คืนมา
  const inGraph = [...tickets.keys()].filter(linked).sort((a, b) => a.localeCompare(b))
  const iso = [...tickets.keys()].filter((n) => !linked(n))
  // ไม่มีเส้นสักเส้น = ไม่มีกราฟ ⇒ `svg` ว่าง และ §9c จะข้ามทั้งส่วน (รวมแถบโดดเดี่ยวด้วย)
  if (!inGraph.length) return { svg: "", iso }

  // 2. ชั้น = ความลึกของ dependency · depth(x)=0 ถ้าไม่มี blocker ในบ้าน
  //    `mark` กันวงจร blocker ที่เกิดจากพิมพ์ผิด ไม่งั้น recursion วนไม่จบ
  const depth = new Map(), mark = new Set()
  const dep = (n) => {
    if (depth.has(n)) return depth.get(n)
    if (mark.has(n)) return 0
    mark.add(n)
    const p = preds.get(n)
    const d = p.length ? 1 + Math.max(...p.map(dep)) : 0
    mark.delete(n)
    depth.set(n, d)
    return d
  }
  inGraph.forEach(dep)

  const cols = Math.max(...inGraph.map((n) => depth.get(n))) + 1
  const layers = Array.from({ length: cols }, () => [])
  for (const n of inGraph) layers[depth.get(n)].push(n) // ชั้นรับลำดับ `NN` มาจาก `inGraph` แล้ว

  // 3. ลดเส้นตัดด้วย barycenter sweep ลง-ขึ้น
  //    วัดด้วย y จริงไม่ใช่ index เพราะแต่ละชั้นถูกจัดกึ่งกลาง ความสูงไม่เท่ากัน
  const lanes = Math.max(...layers.map((L) => L.length)) // เลนแนวตั้ง (ไม่ใช่ `rows` ของ effort ข้างนอก)
  const y = new Map()
  const place = () => {
    for (const L of layers) {
      const off = ((lanes - L.length) * (NH + GY)) / 2
      L.forEach((n, i) => y.set(n, off + i * (NH + GY)))
    }
  }
  place()

  // นับเส้นตัดจริงบนจอ (เรขาคณิต ไม่ใช่แค่คู่ที่พาดชั้นเดียวกัน) — เป็นทั้งตัวตัดสินของ transpose
  // และตัวเลือกรอบที่ดีที่สุด
  const side2 = (a, b, c) => Math.sign((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]))
  const hits = (p1, p2, p3, p4) =>
    side2(p1,p2,p3) * side2(p1,p2,p4) < 0 && side2(p3,p4,p1) * side2(p3,p4,p2) < 0
  const count = () => {
    const seg = edges.map(([a, b]) => [
      [depth.get(a) * (NW + GX) + NW, y.get(a)],
      [depth.get(b) * (NW + GX), y.get(b)],
    ])
    let c = 0
    for (let i = 0; i < seg.length; i++)
      for (let j = i + 1; j < seg.length; j++)
        if (hits(seg[i][0], seg[i][1], seg[j][0], seg[j][1])) c++
    return c
  }

  const bary = (n, side) => {
    const nb = side.get(n)
    return nb.length ? nb.reduce((s, x) => s + y.get(x), 0) / nb.length : y.get(n)
  }
  const snap = () => layers.map((L) => L.slice())
  // barycenter ไม่การันตีว่ารอบใหม่ดีกว่ารอบเก่า (ใบ 01 วัดแล้ว: บาง effort แย่ลงจาก 19 → 27)
  // จึงต้องเก็บรอบที่ดีที่สุดไว้ แล้วคืนค่านั้นตอนจบ — ห้ามส่งผลที่แย่กว่าลำดับตั้งต้น
  let best = snap(), bestC = count()
  for (let r = 0; r < SWEEPS; r++) {
    const down = r % 2 === 0
    const side = down ? preds : succs
    const order = layers.map((_, i) => i)
    for (const i of down ? order : order.reverse()) {
      if (layers[i].every((n) => !side.get(n).length)) continue // ชั้นปลาย ไม่มีอะไรให้อ้าง
      const b = new Map(layers[i].map((n) => [n, bary(n, side)])) // วัดให้ครบก่อนค่อยเรียง
      layers[i].sort((p, q) => b.get(p) - b.get(q)) // sort นิ่ง ⇒ เสมอกันคงลำดับเดิม
    }
    place()

    // transpose — สลับคู่ที่ติดกันเมื่อเส้นตัดลดลง วนจนไม่มีอะไรดีขึ้น
    // barycenter จัดโครงหยาบ ๆ ได้ แต่คู่ที่สลับกันนิดเดียวก็หายต้องใช้ตัวนี้เก็บ
    for (let moved = true; moved; ) {
      moved = false
      for (const L of layers)
        for (let i = 0; i + 1 < L.length; i++) {
          const before = count()
          ;[L[i], L[i + 1]] = [L[i + 1], L[i]]
          place()
          if (count() < before) moved = true
          else { [L[i], L[i + 1]] = [L[i + 1], L[i]]; place() }
        }
    }
    const c = count()
    if (c < bestC) { bestC = c; best = snap() }
  }
  best.forEach((L, i) => (layers[i] = L))
  place()

  // 4. วาด
  const X = (n) => PAD + depth.get(n) * (NW + GX)
  // `TOP` = ขอบบนของโหนดแถวแรก — เผื่อ `LBL` ไว้ให้ป้าย blocker ของแถวนั้นไม่โดนตัด
  // ราคาเป็น**ค่าคงที่ 6px** ไม่ใช่ต่อ lane ⇒ effort ที่สูง 420px กลายเป็น 426 ไม่ใช่ 420+6×lanes
  const TOP = PAD + LBL
  const w = PAD * 2 + cols * NW + (cols - 1) * GX
  const h = PAD + TOP + lanes * NH + (lanes - 1) * GY

  const edge = ([a, b]) => {
    const x1 = X(a) + NW, y1 = TOP + y.get(a) + NH / 2
    const x2 = X(b) - 3, y2 = TOP + y.get(b) + NH / 2
    const c = Math.max(9, (x2 - x1) * 0.45) // เส้นข้ามหลายชั้นโค้งมากขึ้นเอง จะได้ไม่ทับโหนดกลางทาง
    return `<path class="wft-edge" d="M${x1} ${y1}C${x1 + c} ${y1} ${x2 - c} ${y2} ${x2} ${y2}" marker-end="url(#${uid})"/>`
  }

  // ป้ายบอก **ตัวตน**ของ blocker ไม่ใช่จำนวน — "ใบนี้ติด 07 กับ 12" กวาดตาทีเดียวจบ ไม่ต้องไล่เส้น
  // (ใบ 11 ลองแบบนับจำนวนก่อนแล้ว: รู้ว่า "11 ใบ" ก็ยังต้องไล่เส้นหาอยู่ดี ⇒ ไม่ได้ลดงานอะไรเลย)
  // ที่ว่างจริงคือ `NW + GX` = **56px** — เกินนั้นป้ายจะไปชนป้ายของคอลัมน์ถัดไป
  // ⇒ กฎตัด: โชว์ครบ 3 ถ้าพอดี · ถ้าเกินให้โชว์ **2 แล้วต่อ `+N`** (ไม่ใช่ 3 แล้วต่อ `+N`)
  //    ผลคือป้ายยาว **ไม่เกิน 9 ตัวอักษรเสมอ** ไม่ว่าจะติดกี่ใบ = งบเดียวใช้ได้กับทุกป้าย
  //    ⚠️ ถ้าเขียนเป็น `slice(0, BLK)` เฉย ๆ จะได้ `◂03 04 05 +1` = 12 อักษร ซึ่ง**ล้น 56px**
  //       ทันทีที่ฟอนต์ใหญ่กว่า 7.5px — และ 3-แล้ว-`+1` ก็แทบไม่ได้บอกอะไรเพิ่มอยู่ดี
  // ครอบคลุม 205 จาก 218 ใบที่มี blocker (94%) ได้ครบทุกตัว · ที่เหลือคือใบ "รวบของ" ท้าย effort
  // ซึ่งยังไงก็ต้องเปิดคอลัมน์ "รออยู่" อ่านอยู่แล้ว
  const BLK = 3
  const blockerLabel = (n, x, ny) => {
    const ids = preds.get(n).map(num).sort((a, b) => a.localeCompare(b))
    if (!ids.length) return ""
    const keep = ids.length <= BLK ? ids : ids.slice(0, BLK - 1)
    return (
      `<text class="wft-blk" x="${x}" y="${ny - 2.5}">◂${esc(keep.join(" "))}` +
      (keep.length < ids.length ? `<tspan class="wft-more"> +${ids.length - keep.length}</tspan>` : "") +
      `</text>`
    )
  }

  const node = (n) => {
    const t = tickets.get(n)
    const c = COLORS[t.status] ?? COLORS.open
    const x = X(n), ny = TOP + y.get(n)
    return (
      blockerLabel(n, x, ny) +
      `<a class="internal-link" data-href="${esc(t.path)}" href="${esc(t.path)}">` +
      `<title>${esc(n)} · ${esc(t.status ?? "ไม่มี status")}</title>` +
      `<rect x="${x}" y="${ny}" width="${NW}" height="${NH}" rx="6" fill="${c}${TINT}" stroke="${c}"/>` +
      `<text class="wft-lbl" x="${x + NW / 2}" y="${ny + NH / 2 + 0.5}">${esc(num(n))}</text>` +
      `</a>`
    )
  }

  const svg =
    `<svg class="wft-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><marker id="${uid}" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">` +
    `<path class="wft-arw" d="M0 0 6 3 0 6z"/></marker></defs>` +
    edges.map(edge).join("") +
    inGraph.map(node).join("") +
    `</svg>`
  return { svg, iso }
}

// แถบ "ไม่ผูกกับใบไหน" — ตัดทิ้งไม่ได้ (กราฟจะโกหกว่า effort มีแค่นี้) ยัดชั้น 0 ก็ไม่ได้
// (ชั้น 0 แปลว่า "ปิดแล้วของอื่นเดิน" ซึ่งไม่จริง) · ใบที่ blocker อยู่คนละ effort ล้วน ๆ ก็มาลงที่นี่
// ⇒ พาดหัวต้องพูดว่า "ใน effort นี้" ไม่งั้นจะขัดกับกลุ่ม 🚧 ที่โชว์ใบเดียวกันว่ามี blocker ค้าง (`↗`)
const isoBand = (tickets, iso) =>
  !iso.length
    ? ""
    : `<div class="wft-isohd">ไม่ผูกกับใบไหนใน effort นี้ · ${iso.length}</div><div class="wft-isorow">` +
      iso
        .sort((a, b) => a.localeCompare(b)) // กฎเดียวกับทุกกลุ่มใน §9b — เรียงตาม `NN`
        .map((n) => {
          const t = tickets.get(n)
          const c = COLORS[t.status] ?? COLORS.open
          return (
            `<a class="internal-link wft-iso" data-href="${esc(t.path)}" href="${esc(t.path)}"` +
            ` title="${esc(n)} · ${esc(t.status ?? "ไม่มี status")}" style="background:${c}${TINT};border-color:${c}">` +
            `${esc(num(n))}</a>`
          )
        })
        .join("") +
      `</div>`

// ── 9b. 5 กลุ่มใบ (ใบ 03) ───────────────────────────────────────────────────
//   แกนของกลุ่มคือ **action** ไม่ใช่ `status` ดิบ — แกนเดียวกับ `Wayfinder Dashboard`
//   เพราะ `open` ดิบปนใบที่หยิบได้กับใบที่ติด blocker ⇒ เลข "เหลือ 5 ใบ" ตอบไม่ได้ว่าพรุ่งนี้เดินได้หรือตัน
//   scope ล็อกที่ effort เดียวแล้ว ⇒ คอลัมน์ `Repo`/`Effort` ของ Dashboard ว่างลง เอาที่ไปให้ของที่ใช้ได้จริง
//   ⇒ **คอลัมน์ที่สามไม่เหมือนกันสักกลุ่ม** เพราะแต่ละกลุ่มมีคำถามค้างคาคนละข้อ
const TYPE_LETTER = { research: "R", prototype: "P", grilling: "G", task: "T" }
const GROUPS = [
  { id: "fro", title: "🔥 Frontier", sub: "หยิบได้ตอนนี้", cols: ["ใบ", "", "ปลดกี่ใบ"] },
  { id: "blk", title: "🚧 Blocked", sub: "ติดใบอื่นที่อยู่ในมือเรา", cols: ["ใบ", "", "รออยู่"] },
  { id: "wai", title: "⏳ รอของนอก", sub: "ทำอะไรไม่ได้เลย", cols: ["ใบ", "รออะไร", "รอตั้งแต่"] },
  { id: "hld", title: "🖐 Claimed", sub: "มี session จับอยู่", cols: ["ใบ", "", "จับตั้งแต่"] },
  // กลุ่มที่หกไม่ได้อยู่ในสเปก แต่ต้องมี: ห้ากลุ่มบนกินทุก `status` ที่ vault ใช้อยู่จริง (4 ค่า) พอดี
  // ถ้าวันหนึ่งมีใบ `status` แปลก มันจะหายจากทุกกลุ่มเงียบ ๆ ทั้งที่ `x/y` ในหัวยังนับอยู่
  // ⇒ ห้ากลุ่มรวมกันจะไม่เท่า `total` โดยไม่มีใครเห็น · กลุ่มนี้ทำให้บวกกันได้เท่าเสมอ (ว่าง = ซ่อน)
  { id: "unk", title: "⚠️ สถานะที่ไม่รู้จัก", sub: "ตกจากทุกกลุ่ม", cols: ["ใบ", "", "status"] },
  { id: "res", title: "✅ Resolved", sub: "ปิดแล้ว", cols: ["ใบ", "", "ปิดเมื่อ"] },
]

// `status_note` ของจริงยาวถึง ~1,200 ตัวอักษรและเป็นมาร์กดาวน์เต็มรูปแบบ — ใส่ดิบลงช่องตาราง
// จะได้กำแพง `**` กับ `[[…|…]]` ⇒ ลอกสัญลักษณ์ทิ้งให้เหลือข้อความ แล้วหนีบ 2 บรรทัดด้วย CSS
// ตัวเต็มยังอ่านได้ทาง hover ⇒ ไม่ได้ตัดข้อมูลทิ้ง แค่ไม่ให้มันกินทั้งหน้า
const plain = (s) =>
  String(s ?? "")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[>#]+\s*/gm, "")
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim()

// `NN` แยกตัวหนาไว้ เพราะโหนดในกราฟ (§9a) มีแค่ `NN` — ทางอ่านคือเห็นเลขในรูปแล้วกวาดหาในตาราง
// ⇒ ใช้ `num()` ตัวเดียวกับที่กราฟใช้ ห้ามมีสองกฎ (ก่อนหน้านี้เป็น regex คนละตัวที่บังเอิญตรงกัน)
const ticketLink = (t) => {
  const nn = num(t.name)
  const label = t.name.startsWith(`${nn}-`)
    ? `<b>${esc(nn)}</b> ${esc(t.name.slice(nn.length + 1))}`
    : esc(t.name)
  return `<a class="internal-link wft-tk" data-href="${esc(t.path)}" href="${esc(t.path)}" title="${esc(t.name)}">${label}</a>`
}
const typeChip = (t) =>
  t.type
    ? `<span class="wft-ty" title="${esc(t.type)}">${esc(TYPE_LETTER[t.type] ?? String(t.type)[0].toUpperCase())}</span>`
    : ""
const when = (d) =>
  `<span class="wft-when" title="${esc(d?.toISODate?.() ?? "")}">${esc(ago(daysAgo(d)))}</span>`

const renderBody = () => {
  const r = rows.find((x) => x.key === selected)
  if (!r) { $body.innerHTML = ""; return }
  if (!r.total) {
    // effort ที่ยังไม่มีใบสักใบ — ต้องเป็นข้อความ ไม่ใช่กราฟเปล่า/ตารางเปล่า
    $body.innerHTML = `<div class="wft-empty">effort นี้ยังไม่มีใบ — ชาร์ตแล้วแต่ยังไม่มี ticket ใน <code>issues/</code></div>`
    return
  }

  // เรียงตามชื่อใบ = เรียงตาม `NN` ทุกกลุ่ม — จงใจต่างจาก Dashboard ที่เรียง ⏳/🖐 ตามวันที่
  // (ที่นั่น "ค้างนาน" คือสัญญาณ · ที่นี่คอลัมน์วันอยู่ในแถวอยู่แล้ว และสิ่งที่ได้กลับมาคือการจับคู่กับกราฟ
  //  ซึ่งมีแต่เลข ⇒ เห็น `07` ในรูปแล้วต้องกวาดเจอในตารางโดยไม่ต้องอ่านทุกแถว)
  const list = [...r.tickets.values()].sort((a, b) => a.name.localeCompare(b.name))

  // "ปลดกี่ใบ" — นับจาก `blockers` ของใบอื่นจริง ๆ **ไม่ใช่ `file.inlinks`**
  // `inlinks` นับตอน `map.md` เอ่ยถึงใบในเนื้อความด้วย ⇒ เลขเฟ้อ
  // ⇒ **ตัวเลขนี้จะไม่ตรงกับคอลัมน์ "ปลดล็อกกี่ใบ" ของ `Wayfinder Dashboard` และนั่นคือความตั้งใจ**
  // ใบที่ปิดไปแล้วไม่นับ — ปิดใบนี้ก็ไม่ได้ทำให้มัน "เดินต่อ" (วันนี้ยังไม่มีเคสไหนต่างกัน แต่เกิดได้จริง:
  // vault นี้มีใบที่ถูกปิดทั้งที่ blocker ยัง open โดยเจตนา)
  const deps = new Map()
  for (const x of list) {
    if (x.status === "resolved") continue
    for (const b of new Set(x.blockers)) deps.set(b, [...(deps.get(b) ?? []), x])
  }

  const g = { fro: [], blk: [], wai: [], hld: [], unk: [], res: [] }
  for (const x of list) {
    if (x.status === "waiting") g.wai.push(x)
    else if (x.status === "claimed") g.hld.push(x)
    else if (x.status === "resolved") g.res.push(x)
    else if (x.status === "open") (x.blockers.some((b) => blockerOpen(r, b)) ? g.blk : g.fro).push(x)
    else g.unk.push(x)
  }

  // blocker อาจอยู่คนละ effort — ลิงก์ต้องพาไปถูกที่ และต้องบอกว่ามันไม่ได้อยู่ในบ้าน (`↗`)
  const blockerLink = (name) => {
    const own = r.tickets.get(name)
    const far = own ? null : lookup(name)
    // `far.isMap` = ชื่อ `"map"` ที่ซ้ำทั้ง vault ⇒ ลิงก์ไปจะพาไปผิด map เอา ⇒ ไม่ทำเป็นลิงก์ดีกว่า
    const path = own?.path ?? (far && !far.isMap ? `${far.owner}/issues/${far.name}.md` : null)
    if (!path)
      return `<span class="wft-bk is-dead" title="ชี้ไปที่ที่ระบุตัวไม่ได้ — ใบนี้จะไม่มีวันปลดจนกว่าจะแก้ blockers">⚠️ ${esc(name)}</span>`
    const away = own ? "" : `<small> ↗</small>` // ↗ = blocker ตัวนี้ไม่ได้อยู่ใน effort ที่กำลังดู
    return `<a class="internal-link wft-bk" data-href="${esc(path)}" href="${esc(path)}" title="${esc(path)}">${esc(name)}${away}</a>`
  }

  const CELL = {
    fro: (x) => {
      const d = deps.get(x.name) ?? []
      // ตัวเลขที่โชว์คือ "ใบที่รออยู่" ตามสเปก · ส่วน "ปิดแล้วเดินได้ทันทีกี่ใบ" (ใบที่ไม่เหลือ blocker
      // ค้างตัวอื่น) ต่างกันจริงในบางเคส ⇒ ไม่เปลี่ยนเลข แต่บอกไว้ทาง hover ไม่ให้เลขโกหกเงียบ ๆ
      const now = d.filter((y) => y.blockers.every((b) => b === x.name || !blockerOpen(r, b))).length
      const tip = d.length && now !== d.length
        ? ` title="${now} ใบเดินได้ทันที · อีก ${d.length - now} ใบยังติด blocker ตัวอื่น"`
        : ""
      return [typeChip(x), `<span class="wft-num"${tip}>${d.length || "—"}</span>`]
    },
    blk: (x) => [
      typeChip(x),
      x.blockers.filter((b) => blockerOpen(r, b)).map(blockerLink).join(""),
    ],
    wai: (x) => {
      const t = plain(x.note)
      return [
        t ? `<span class="wft-note" title="${esc(t)}">${esc(t)}</span>` : `<span class="wft-when">—</span>`,
        when(x.since),
      ]
    },
    hld: (x) => [typeChip(x), when(x.since)],
    unk: (x) => [typeChip(x), `<span class="wft-when">${esc(x.status ?? "(ไม่มี status)")}</span>`],
    res: (x) => [typeChip(x), when(x.since)],
  }

  // ✅ พับไว้เพราะแตะ 46 แถวได้ · **ยกเว้นไม่มีใบค้างเลย ให้กางเอง** — มัธยฐานใบค้างทั้ง vault = 0
  //    ⇒ ถ้าพับตายตัว effort ส่วนใหญ่ (20 จาก 32) จะเปิดมาเจอหน้าว่างเปล่า
  const pending = r.total - g.res.length
  const head = (gr, n, tag) =>
    `<${tag} class="wft-gh"><b>${gr.title}</b><small>${gr.sub}</small>` +
    `<span class="wft-num">${n}</span></${tag}>`

  // ── 9c. ประกอบ — ลำดับบนหน้า: ค้น → หัว effort → **กราฟ + แถบ "ไม่ผูกกับใบไหน"** → 5 กลุ่ม ──
  //   `uid` ผูกกับ effort เพราะ `<marker id>` เป็น id ระดับเอกสาร — หน้านี้เปิดสองบานพร้อมกันได้
  //   แถบเป็น **ชิ้นที่สองของส่วนกราฟ** ไม่ใช่ท้ายสุดของหน้า (สเปกข้อ 9 "แถบแยกใต้กราฟ") — หน้าที่ของมัน
  //   คือกันกราฟโกหกว่า effort มีแค่นี้ ซึ่งทำได้ก็ต่อเมื่อเห็นมันพร้อมกราฟ ไม่ใช่หลังเลื่อนผ่านตาราง 46 แถว
  //   ไม่มีเส้นสักเส้น (เช่น effort ที่มีใบเดียว) ⇒ **ข้ามทั้งส่วนกราฟ รวมแถบโดดเดี่ยวด้วย** ไม่ใช่โชว์กรอบเปล่า
  //   เพราะแถบมีไว้กันกราฟโกหก — ไม่มีกราฟก็ไม่มีอะไรให้มันแก้ เหลือแค่แถวเลขที่ตารางข้างล่างพูดครบแล้ว
  //   ⇒ กฎ "ไม่มีกราฟก็ไม่มีแถบ" อยู่ใน ternary เดียวกับ `svg` ที่นี่ที่เดียว จะได้ไม่มีวันหลุดจากกัน
  const gph = graph(r.tickets, `wft-mk-${r.key.replace(/[^a-z0-9]+/gi, "-")}`)
  const parts = gph.svg ? [gph.svg, isoBand(r.tickets, gph.iso)] : []
  for (const gr of GROUPS) {
    const items = g[gr.id]
    if (!items.length) continue // กลุ่มว่าง = ซ่อนหัวข้อไปเลย ไม่ต้องโชว์ "0"
    const table =
      `<div class="wft-tbl is-${gr.id}">` +
      `<div class="wft-row is-th">${gr.cols.map((c) => `<span>${esc(c)}</span>`).join("")}</div>` +
      items
        .map(
          (x) =>
            `<div class="wft-row">${ticketLink(x)}` +
            CELL[gr.id](x).map((c) => `<span>${c}</span>`).join("") +
            `</div>`
        )
        .join("") +
      `</div>`
    parts.push(
      gr.id === "res"
        ? `<details class="wft-grp"${pending ? "" : " open"}>${head(gr, items.length, "summary")}${table}</details>`
        : `<section class="wft-grp">${head(gr, items.length, "div")}${table}</section>`
    )
  }
  $body.innerHTML = parts.join("")
}

const renderAll = () => { renderList(); renderHead(); renderBody() }

// ── 10. การโต้ตอบ ───────────────────────────────────────────────────────────
const select = (key) => {
  selected = key
  writeLS(key)
  query = ""
  $input.value = ""
  listOpen = false
  renderAll()
}

$input.addEventListener("input", () => { query = $input.value; listOpen = true; renderList() })
$input.addEventListener("focus", () => { listOpen = true; renderList() })
$input.addEventListener("blur", () => { if (selected) { listOpen = false; renderList() } })
$input.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") {
    ev.preventDefault()
    const top = matches()[0] // "ตัวบนสุดของรายการที่กรองแล้ว" = ตัวที่ขยับล่าสุด
    if (top) select(top.key)
  } else if (ev.key === "Escape" && selected) {
    ev.preventDefault()
    query = ""
    $input.value = ""
    listOpen = false
    renderList()
  }
})
// ใช้ mousedown (ไม่ใช่ click) + preventDefault: blur ของ input จะได้ไม่มาแข่งกับการเลือก
$list.addEventListener("mousedown", (ev) => {
  const opt = ev.target.closest("[data-key]")
  if (!opt) return
  ev.preventDefault()
  select(opt.dataset.key)
})

// โหนดในกราฟเป็น `<a class="internal-link">` ที่อยู่ **ใน SVG** — ยังไม่มีหลักฐานว่า Obsidian delegate
// ให้ `<a>` ใน SVG เหมือนที่ทำกับ `<a>` ที่เป็น HTML (ที่พิสูจน์แล้วคือฝั่ง HTML · ใบ 08 ตรวจของจริง)
// ⇒ จัดการเอง **เฉพาะในกรอบ `.wft-svg`** แล้ว `stopPropagation` — ลิงก์ HTML ที่เหลือ (ชื่อใบ · blocker ·
//    ชิปในแถบโดดเดี่ยว · ชื่อ effort ในหัว) ปล่อยให้ Obsidian จัดการตามเดิม ของที่ใบ 02/03 พิสูจน์แล้ว
//    จะได้ไม่ถูกแตะ และไม่มีทางเปิดซ้ำสองครั้งเพราะไม่มีเส้นทางไหนซ้อนกัน
dv.container.addEventListener("click", (ev) => {
  const a = ev.target?.closest?.("a.internal-link")
  if (!a || !a.closest(".wft-svg")) return
  ev.preventDefault()
  ev.stopPropagation()
  app.workspace.openLinkText(a.getAttribute("data-href"), "", ev.ctrlKey || ev.metaKey)
})

// หน้านี้เปิดค้างอยู่ใน pane อื่น แล้วมีคนคลิก 44/47 บน `Wayfinder Efforts` (ใบ 05)
// `registerDomEvent` ปลด listener ให้เองตอนบล็อกถูกทิ้ง ⇒ ไม่มี listener ค้างสะสมทุกครั้งที่ dataview วาดใหม่
const comp = dv.component ?? dv.currentComponent
if (comp?.registerDomEvent)
  comp.registerDomEvent(window, SELECT_EVENT, () => {
    const k = readLS()
    if (k && k !== selected && rows.some((r) => r.key === k)) select(k)
  })

renderAll()
```

> **คีย์ `localStorage` เป็น coupling ข้ามไฟล์** — `const LS_KEY` ในบล็อกข้างบนต้องตรงกับตัวที่
> `Wayfinder Efforts.md` เขียนตอนคลิกตัวเลขใบ **เป๊ะ** ไม่งั้นคลิกแล้วจะได้หน้าที่ไม่เลือกอะไร
> ซึ่งดูเหมือนโหลดช้ามากกว่าดูเหมือนของพัง ⇒ `node _tools/doctor.mjs` มี check จับข้อนี้ไว้แล้ว
