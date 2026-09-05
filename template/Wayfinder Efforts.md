# Wayfinder Efforts

ภาพรวม **ระดับแมป ทั้ง vault** — แต่ละ effort เดินไปถึงไหน · อันไหนสถานะไม่ตรงกับที่เกิดขึ้นจริง
ระดับใบทั้ง vault (หยิบอะไรได้ตอนนี้ · ติดที่ใคร · ใครจับอยู่) อยู่ที่ [[Wayfinder Dashboard]]
ระดับใบของ **effort เดียว** (effort นี้เหลืออะไร · ปิดใบไหนแล้วอะไรเดินต่อ) อยู่ที่ [[Wayfinder Effort Tickets]]
ค่าที่คุณจูนเอง — ตัวอัปเดตไม่แตะ: [[Wayfinder Config]] (สี · เส้นแบ่งเวลา · ป้ายสถานะ map) · [[Wayfinder Picks]] (กฎ "หยิบอันไหนต่อ")

- แถบสีตรงกับ Graph View: 🟢 `resolved` · 🟡 `claimed` · ⚪ `open` · 🟣 `waiting`
- 🔥 = ใบที่หยิบได้เลย · 🚧 = open แต่ยังติด blocker · 🖐 = มี session จับอยู่ · ⏳ = รอของนอก
- **คลิก *ตัวเลขใบ* (`44/47`) = เด้งไป [[Wayfinder Effort Tickets]] พร้อมเลือก effort นั้นให้แล้ว**
  ส่วนคลิก *ชื่อ* effort ยังไป `map.md` เหมือนเดิม — ชื่อ = "effort นี้จะไปไหน" · ตัวเลข = "effort นี้มีใบอะไร"
- หน้านี้เห็นเต็มตัวแค่ **2 กลุ่ม** — ที่เดินอยู่ กับที่ต้องมือคุณ ที่เหลือพับเก็บข้างล่าง
- **"คืบหน้าล่าสุด" = วันที่ใบล่าสุดเปลี่ยนสถานะ** (`status_since`) ไม่ใช่วันที่ไฟล์ถูกแตะ
  ⇒ แก้คำผิดไม่รีเซ็ตนาฬิกาอีกแล้ว และตัวเลขนี้รอดการ clone ไปเครื่องใหม่

```dataviewjs
// ── ค่าที่ผู้ใช้จูนได้ — อ่านจากโน้ต `Wayfinder Config` ─────────────────────────
// ตัวอัปเดต **ทับไฟล์นี้ทั้งชุดโดยไม่ถาม** (สามหน้าอ่านค่าคงที่ข้ามกันอยู่ ทับครึ่ง ๆ = พังเงียบ)
// ⇒ ค่าที่ผู้ใช้แก้ห้ามอยู่ในไฟล์นี้ · ที่ประกาศข้างล่างคือ **ค่าเริ่มต้น** ไม่ใช่ค่าที่ใช้จริง
//
// สัญญาของตัวอ่าน — **ห้าม throw** ไม่ว่ากรณีไหน: โน้ตหาย · ถูกลบ · คีย์ไม่ครบ · พิมพ์ผิดชนิด
// ต้องตกไปใช้ค่าเริ่มต้น **เป็นราย ๆ คีย์** ไม่ใช่ทิ้งทั้งชุด · เหตุผล: กล่องแดง `Dataview: <error>`
// ไม่ได้บอกว่าสาเหตุคือโน้ตหาย ผู้ใช้จะสรุปว่า *หน้าพัง* แล้วไปไล่หาผิดทางทั้งเส้น
const CONFIG_NOTE = "Wayfinder Config"
const cfg = (() => { try { return dv.page(CONFIG_NOTE) ?? {} } catch (_) { return {} } })()
const cfgNum = (k, dflt) => { const n = Number(cfg[k]); return Number.isFinite(n) && n > 0 ? n : dflt }
// สีต้องเป็น `#rrggbb` **หกหลักเป๊ะ** ไม่ใช่แค่ "สตริงอะไรก็ได้" — กราฟต่อ alpha ท้ายสี (`${c}${TINT}`)
// ⇒ `red` หรือ `#abc` กลายเป็น `red33` / `#abc33` ที่เบราว์เซอร์ทิ้งเงียบ ๆ = โหนดใส หาสาเหตุไม่เจอ
const cfgColor = (k, dflt) => {
  const s = cfg[k]
  return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s.trim()) ? s.trim() : dflt
}
// ป้ายถูกยัดลงเนื้อ HTML ตรง ๆ ⇒ ปฏิเสธตัวที่มี `<` `>` `"` ซึ่งหลุดออกนอกแท็ก/attribute ได้
const cfgLabel = (k, dflt) => {
  const s = cfg[k]
  return typeof s === "string" && s.trim() && !/[<>"]/.test(s) ? s.trim() : dflt
}

// ── ค่าเริ่มต้น — ห้ามลบ และ **ห้ามใช้ตรง ๆ ที่หน้างาน** (ใช้ตัว camelCase ข้างล่างแทน) ────
// สองบรรทัดนี้คือ fallback ตัวจริงตอนไม่มีโน้ต Config · `_tools/doctor.mjs` เฝ้าอยู่ด้วยว่า
// เส้นแบ่งเวลาทั้งสองเส้นยังประกาศอยู่ครบ ⇒ ย้ายค่าไป Config แล้วยังต้องเหลือค่าเริ่มต้นไว้ที่นี่เสมอ
const STALE_DAYS = 14        // active แต่ไม่มีใบไหนขยับกี่วัน ถึงนับว่า "อ้างว่าเดิน"
const PAUSED_STALE_DAYS = 30 // พักกี่วันถึงควรตัดสินใจใหม่ — ที่มาของเลข 30 อยู่ในโน้ต Config

// ค่าที่ใช้จริง = ของผู้ใช้ถ้าใช้ได้ ไม่งั้นตกมาที่ค่าเริ่มต้นข้างบน
const staleDays = cfgNum("stale_days", STALE_DAYS)
const pausedStaleDays = cfgNum("paused_stale_days", PAUSED_STALE_DAYS)

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

// ── สัญญากับ `Wayfinder Effort Tickets` — ห้ามแก้ข้างเดียว ──────────────────
// คลิกตัวเลขใบ (44/47) = **เขียน** คีย์นี้ แล้วเปิดโน้ตนั้น ซึ่งเป็นฝั่ง **อ่าน**
// ค่าที่เก็บคือสตริง "<repo>/<effort>" เช่น "my-repo/some-effort" — ไม่ใช่ path ของ map.md
// คีย์ไม่ตรงกัน = เปิดหน้าไปแล้วไม่เลือกอะไร ซึ่งดูเหมือนโหลดช้ามากกว่าดูเหมือนของพัง ⇒ พังเงียบ
// `_tools/doctor.mjs` จึงดึงคีย์จากทั้งสองไฟล์มาเทียบ โดยจับที่ **ชื่อตัวแปร**
// ⇒ ทั้งสองไฟล์ต้องประกาศตัวแปรชื่อ `LS_KEY` เหมือนกัน ห้ามยัดสตริงลง setItem ตรง ๆ
// (คอมเมนต์บรรทัดนี้จงใจไม่เขียนรูปประกาศเต็ม ๆ ให้ครบ — regex ของ doctor จะได้ไม่คว้าคอมเมนต์ไปแทนของจริง)
const LS_KEY = "wayfinder-effort-tickets:selected"
// localStorage ของ Obsidian เป็นของ **ทั้งแอป ไม่ใช่ของ vault** — เปิดสอง vault พร้อมกันเมื่อไหร่
// ทั้งคู่อ่านเขียนช่องเดียวกัน ⇒ หน้าใบของ vault หนึ่งประกาศ **ชื่อ effort ของอีก vault** ออกมา
// (เจอตอนถ่ายภาพหน้าจอลง README: vault เปล่าที่สร้างใหม่โชว์ชื่อ effort จาก vault งานจริง)
// ⇒ ต่อชื่อ vault ท้ายคีย์ ให้แต่ละ vault มีช่องของตัวเอง · ทั้งสองไฟล์ต้องคิดคีย์แบบเดียวกัน
// และ **ห้ามส่ง `LS_KEY` ดิบ ๆ เข้า localStorage อีก** — `doctor.mjs` ตรวจทั้งสองข้อนี้
const lsKey = () => `${LS_KEY}:${app.vault.getName()}`
const SELECT_EVENT = "wayfinder-effort-select" // ยิงหลังเขียนคีย์ ให้ pane ที่เปิดค้างสลับ effort ตามทันที
const TICKETS_NOTE = "Wayfinder Effort Tickets"

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

// ── 1. กวาดทั้ง vault — ทำ index สองชั้น (path เต็ม + ชื่อไฟล์) เพราะ wikilink
//       ใน frontmatter เขียนได้ทั้งสองแบบ: blockers ของใบใช้ชื่อสั้น ส่วน
//       blocked_by ของ map ข้าม effort ได้จึงต้องเป็น path ────────────────
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
      status: p.status,
      since: toDT(p.status_since),
      blockers: asList(p.blockers).map((b) => stem(b).split("/").pop()),
    })
  }
}
const lookup = (link) => index.get(stem(link)) ?? index.get(stem(link).split("/").pop())

// ── 2. นับต่อ effort ────────────────────────────────────────────────────────
const rows = []
for (const e of efforts.values()) {
  const t = [...e.tickets.values()]
  if (!t.length) continue
  const n = (s) => t.filter((x) => x.status === s).length
  const open = n("open")
  const blocked = t.filter(
    (x) => x.status === "open" && x.blockers.some((b) => e.tickets.get(b)?.status !== "resolved")
  ).length

  // นาฬิกาความคืบหน้า = ใบล่าสุดที่ขยับ **หรือ** วันที่ประกาศสถานะ แล้วแต่อันไหนใหม่กว่า
  // การประกาศสถานะรีเซ็ตนาฬิกาของสถานะนั้น ไม่งั้น map ที่เพิ่งปลดเป็น active
  // จะโดนจิกทันทีด้วยประวัติเก่าที่ไม่เกี่ยวกับการตัดสินใจที่เพิ่งเกิด
  const lastTicket = t.map((x) => x.since).reduce(later, null)
  rows.push({
    ...e,
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

// ── 3. blocked_by ชี้ไปที่อะไร และมันเดินอยู่ไหม ────────────────────────────
const blockState = (r) => {
  if (!r.blockedBy) return null
  const t = lookup(r.blockedBy)
  const name = stem(r.blockedBy).split("/").pop()
  if (!t) return { state: "dangling", name }
  // ใบปลดเมื่อ resolved · map ปลดเมื่อ done
  if (t.isMap ? t.status === "done" : t.status === "resolved") return { state: "cleared", name }
  // ตายเมื่อเป้าถูกทิ้ง หรืออยู่ใน map ที่ไม่มีใครผลักให้เดิน
  const owner = efforts.get(t.owner)
  if (t.status === "dropped" || ["paused", "dropped"].includes(owner?.status))
    return { state: "dead", name }
  return { state: "waiting", name }
}
for (const r of rows) r.block = blockState(r)

// ── 4. แบ่งกลุ่ม — จัดตาม *สิ่งที่ต้องทำ* ไม่ใช่ตามค่าสถานะ ─────────────────
const warn = []
const push = (r, why, act) => warn.push({ ...r, why, act })
const active = []
const folded = { paused: [], draft: [], done: [], dropped: [] }

for (const r of rows) {
  if (r.block?.state === "cleared") { push(r, `blocker ปลดแล้ว — ${r.block.name}`, "กลับมาทำได้"); continue }
  if (r.block?.state === "dead") { push(r, `รอ ${r.block.name} ที่ไม่มีใครผลักให้เดิน`, "โซ่ตัน"); continue }
  if (r.block?.state === "dangling") { push(r, `blocked_by ชี้ไปที่ ${r.block.name} ที่ไม่มีอยู่`, "แก้ลิงก์"); continue }

  if (r.status === "active") {
    if (r.pending === 0) push(r, "ใบหมดแล้ว แต่ยังไม่ประกาศว่าถึง Destination", "→ done")
    else if (r.days > staleDays) push(r, `ประกาศ active แต่ไม่มีใบไหนขยับ ${r.days} วัน`, "→ paused")
    else active.push(r)
  } else if (r.status === "paused" && r.pausedDays > pausedStaleDays) {
    push(r, `พักมา ${r.pausedDays} วัน เกินเส้น ${pausedStaleDays} วัน`, "→ dropped")
  } else {
    (folded[r.status] ?? folded.done).push(r)
  }
}
const byRecent = (a, b) => (a.days ?? 0) - (b.days ?? 0) // ขยับล่าสุดขึ้นก่อน
active.sort(byRecent)
for (const k of Object.keys(folded)) folded[k].sort(byRecent)
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0)

// ── 5. วาด ──────────────────────────────────────────────────────────────────
const link = (r) =>
  r.map
    ? `<a class="internal-link" data-href="${esc(r.map)}" href="${esc(r.map)}">${esc(r.effort)}</a>`
    : esc(r.effort)
const name = (r) => `<span class="wfe-nm">${link(r)}<small>${esc(r.repo)}</small></span>`
const bar = (r) => {
  const w = (n) => `${(n / r.total) * 100}%`
  return (
    `<span class="wfe-bar">` +
    `<i style="width:${w(r.resolved)};background:${COLORS.resolved}"></i>` +
    `<i style="width:${w(r.claimed)};background:${COLORS.claimed}"></i>` +
    `<i style="width:${w(r.open)};background:${COLORS.open}"></i>` +
    `<i style="width:${w(r.waiting)};background:${COLORS.waiting}"></i>` +
    `</span>`
  )
}
const chips = (r) =>
  [
    r.frontier ? `<span class="wfe-chip wfe-fro">🔥${r.frontier}</span>` : "",
    r.blocked ? `<span class="wfe-chip wfe-blk">🚧${r.blocked}</span>` : "",
    r.claimed ? `<span class="wfe-chip wfe-hld">🖐${r.claimed}</span>` : "",
    r.waiting ? `<span class="wfe-chip wfe-wai">⏳${r.waiting}</span>` : "",
  ].join("")

// ตัวเลขใบ = ทางเข้าหน้า `Wayfinder Effort Tickets` — **ชื่อ effort ยังลิงก์ไป map.md เหมือนเดิม**
// ชื่อ = "effort นี้จะไปไหน" (map) · ตัวเลขใบ = "effort นี้มีใบอะไร" (หน้าใบ) ⇒ คลิกถูกโดยไม่ต้องจำ
// `data-go` ถือ key ไว้เพื่อผูก listener ทีเดียวหลังวาดเสร็จ (ดูท้ายบล็อก) แทนที่จะ inline onclick
const num = (r) =>
  `<span class="wfe-num wfe-go" data-go="${esc(r.key)}" role="link" tabindex="0"` +
  ` title="ดูใบทั้งหมดของ ${esc(r.key)}" aria-label="ดูใบทั้งหมดของ ${esc(r.key)}">` +
  `${r.resolved}/${r.total}</span>`

const grp = (title, count, cls = "") =>
  `<div class="wfe-grp${cls}">${title}<span class="wfe-cnt">· ${count}</span></div>`
const hdr = `<div class="wfe-hdr"><span>effort</span><span>ความคืบหน้า</span><span>ใบ</span><span>สถานะ</span><span>คืบหน้าล่าสุด</span></div>`
const row = (r) =>
  `<div class="wfe-row">${name(r)}${bar(r)}${num(r)}` +
  `<span>${chips(r)}</span><span class="wfe-when">${ago(r.days)}</span></div>`
const warnRow = (r) =>
  `<div class="wfe-wrow">${name(r)}<span class="wfe-why">${esc(r.why)}</span>` +
  `<span class="wfe-act">${esc(r.act)}</span></div>`

// กลุ่มพับเก็บ — โชว์ status_note ตรงนี้เลย จะได้ไม่ต้องเปิด map ทีละอันเพื่อนึกออกว่าทำไม
const foldRow = (r) => {
  const meta = [
    r.block ? `รอ ${esc(r.block.name)}` : "",
    r.note ? esc(r.note) : "",
    r.supersededBy ? `→ ${esc(stem(r.supersededBy).split("/")[1] ?? r.supersededBy)}` : "",
  ].filter(Boolean).join(" · ")
  return (
    `<div class="wfe-frow">${name(r)}` +
    `<span class="wfe-note">${meta}</span>` +
    num(r) +
    `<span class="wfe-when">${ago(r.status === "paused" ? r.pausedDays : r.days)}</span></div>`
  )
}
const foldGroup = (k) => {
  const list = folded[k]
  if (!list.length) return ""
  const label = k === "paused" ? "พักมาแล้ว" : k === "done" ? "ปิดเมื่อ" : "แตะล่าสุด"
  return (
    `<details><summary>${MAP_LABEL[k]} — ${list.length} effort · ${sum(list, (r) => r.total)} ใบ</summary>` +
    `<div class="wfe-fhdr"><span>effort</span><span>${k === "dropped" ? "ทำไมถึงทิ้ง" : "เงื่อนไขกลับมา"}</span>` +
    `<span>ใบ</span><span>${label}</span></div>` +
    list.map(foldRow).join("") +
    `</details>`
  )
}

const CSS = `
.wfe { font-size: var(--font-ui-medium); }
.wfe-grp { display: flex; align-items: baseline; gap: 6px; margin: 1.1em 0 .35em;
  padding-bottom: .2em; border-bottom: 1px solid var(--background-modifier-border);
  text-transform: uppercase; letter-spacing: .04em; font-size: .86em; color: var(--text-faint); }
.wfe-grp.is-warn { color: var(--text-error); border-bottom-color: var(--text-error); }
.wfe-cnt { font-family: var(--font-monospace); text-transform: none; letter-spacing: 0; }
.wfe-row, .wfe-hdr { display: grid; gap: 10px; align-items: center;
  grid-template-columns: minmax(0, 1fr) 110px 56px 108px 88px; }
.wfe-wrow { display: grid; gap: 10px; align-items: center;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) 104px; }
.wfe-frow, .wfe-fhdr { display: grid; gap: 10px; align-items: center;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) 56px 88px; }
.wfe-hdr, .wfe-fhdr { font-size: .8em; text-transform: uppercase; letter-spacing: .03em; color: var(--text-faint); }
.wfe-row, .wfe-wrow, .wfe-frow { padding: 5px 0; border-bottom: 1px solid var(--background-modifier-border); }
.wfe-row:last-child, .wfe-wrow:last-child, .wfe-frow:last-child { border-bottom: 0; }
.wfe-nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.25; }
.wfe-nm small { display: block; color: var(--text-faint); font-size: .85em; }
.wfe-why { font-size: .92em; color: var(--text-muted); }
.wfe-note { font-size: .9em; color: var(--text-faint); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.wfe-act { font-family: var(--font-monospace); font-size: .86em; text-align: center;
  padding: 2px 6px; border-radius: 4px; background: var(--background-secondary); color: var(--text-error); }
.wfe-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden;
  background: var(--background-modifier-border); }
.wfe-bar i { display: block; height: 100%; }
.wfe-num, .wfe-when { font-family: var(--font-monospace); font-size: .9em; color: var(--text-muted); }
/* ตัวเลขใบคลิกได้ — ต้องดูออกตั้งแต่ยังไม่เอาเมาส์ไปจ่อ ไม่ใช่ affordance ที่ซ่อนอยู่
   จึงขีดเส้นใต้ประไว้ตลอด แล้วค่อยเปลี่ยนเป็นสี accent + พื้นตอน hover/focus */
.wfe-go { cursor: pointer; width: fit-content; padding: 1px 4px; margin: -1px -4px; border-radius: 4px;
  text-decoration: underline dotted var(--text-faint); text-underline-offset: 3px; }
.wfe-go:hover { color: var(--text-accent); background: var(--background-modifier-hover);
  text-decoration-color: var(--text-accent); }
.wfe-go:focus-visible { outline: 1px solid var(--text-accent); outline-offset: 1px; }
.wfe-chip { font-family: var(--font-monospace); font-size: .84em; padding: 1px 4px;
  border-radius: 4px; margin-right: 3px; white-space: nowrap; background: var(--background-secondary); }
.wfe-fro { color: var(--text-accent); }
.wfe-blk { color: var(--text-error); }
.wfe-hld { color: #FFB300; }
.wfe-wai { color: #AB47BC; }
.wfe-none { color: var(--text-faint); padding: 6px 0; }
.wfe summary { cursor: pointer; color: var(--text-muted); font-size: 1em; margin-top: 1.1em; }
`

dv.container.innerHTML = !rows.length
  ? "<p>ยังไม่มี effort ใน vault</p>"
  : `<style>${CSS}</style><div class="wfe">` +
    grp("รวม",
      `${rows.length} effort · ${sum(rows, (r) => r.total)} ใบ · ` +
      `ปิดแล้ว ${sum(rows, (r) => r.resolved)} · เหลือ ${sum(rows, (r) => r.pending)}`) +
    grp("🔥 กำลังเดิน", `${active.length} effort · ขยับภายใน ${staleDays} วัน`) +
    (active.length ? hdr + active.map(row).join("") : `<div class="wfe-none">ไม่มี effort ที่เดินอยู่</div>`) +
    grp("⚠️ สถานะไม่ตรงพฤติกรรม", `${warn.length}`, " is-warn") +
    (warn.length
      ? warn.map(warnRow).join("")
      : `<div class="wfe-none">ไม่มี — ทุก map สถานะตรงกับพฤติกรรมจริง</div>`) +
    ["paused", "draft", "done", "dropped"].map(foldGroup).join("") +
    `</div>`

// ── 6. คลิกตัวเลขใบ → เปิดหน้าใบของ effort นั้น ─────────────────────────────
// ผูกหลังวาดเสร็จเสมอ: `innerHTML` สร้าง element ใหม่ทั้งชุด listener ที่ผูกไว้ก่อนหน้าตายไปด้วย
const goTickets = (key) => {
  try { localStorage.setItem(lsKey(), key) } catch (_) {} // ① เขียนคีย์ก่อน — หน้าใบอ่านตอนวาด
  window.dispatchEvent(new CustomEvent(SELECT_EVENT))    // ② ปลุก pane ที่เปิดหน้าใบค้างอยู่ให้สลับตาม
  app.workspace.openLinkText(TICKETS_NOTE, "")           // ③ ค่อยเปิด/โฟกัสโน้ต
}
// `registerDomEvent` ปลด listener ให้เองตอนบล็อกถูกทิ้ง ⇒ ไม่ค้างสะสมทุกครั้งที่ dataview วาดใหม่
const comp = dv.component ?? dv.currentComponent
const on = (el, ev, fn) =>
  comp?.registerDomEvent ? comp.registerDomEvent(el, ev, fn) : el.addEventListener(ev, fn)
for (const el of dv.container.querySelectorAll("[data-go]")) {
  on(el, "click", (ev) => { ev.preventDefault(); ev.stopPropagation(); goTickets(el.dataset.go) })
  // แถวในกลุ่มที่พับไว้ก็โฟกัสด้วยคีย์บอร์ดได้ ⇒ ต้องกดด้วยคีย์บอร์ดได้ด้วย ไม่ใช่เมาส์อย่างเดียว
  on(el, "keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return
    ev.preventDefault()
    goTickets(el.dataset.go)
  })
}
```

> **เส้นแบ่งเวลาทั้งสองเส้นย้ายไปอยู่ที่ [[Wayfinder Config]] แล้ว** (`stale_days` · `paused_stale_days`)
> — แก้ที่นั่นแล้วหน้านี้ขยับตามรอบวาดถัดไป · ค่าที่ประกาศในบล็อกข้างบนคือ **ค่าเริ่มต้น**
> ที่ใช้เมื่อโน้ตนั้นหายหรือคีย์ไม่ครบเท่านั้น · ที่มาของเลข `30` (ไม่ใช่เลขกลม ๆ) อยู่ในโน้ต Config
>
> map ที่มี `blocked_by` ค้างอยู่ **ไม่ถูกนับนาฬิกา 30 วัน** — มันไม่ได้ดอง มันรอ
> สิ่งที่ตัดสินคือสภาพของเป้าหมาย: ปลดแล้ว → เด้งขึ้น ⚠️ ให้กลับมาทำ · เป้าไม่มีใครผลัก → เด้งขึ้น ⚠️ ว่าโซ่ตัน
