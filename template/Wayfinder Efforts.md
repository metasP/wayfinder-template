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
// หน้านี้ **ไม่มีกฎของตัวเอง** — ทุกตัวเลข · ทุกกลุ่ม · ทุกเคส ⚠️ มาจาก core (`_tools/lib/core.mjs`)
// ผ่าน loader กลาง `_tools/views/wf-core.js` ตัวเดียวกับ Dashboard และ `wf` ⇒ สามที่ตัดสินเหมือนกันเสมอ
// (blocker ข้าม effort ตัดสินจากสถานะจริงของมัน · ค่าจาก [[Wayfinder Config]] อ่านผ่าน `core.readConfig`)
// ที่อยู่ในบล็อกนี้มีแค่ **การวาด**: HTML · CSS · การจัดเรียง · คลิกตัวเลขใบ

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
// ⇒ ต่อชื่อ vault ท้ายคีย์ ให้แต่ละ vault มีช่องของตัวเอง · ทั้งสองไฟล์ต้องคิดคีย์แบบเดียวกัน
// และ **ห้ามส่ง `LS_KEY` ดิบ ๆ เข้า localStorage อีก** — `doctor.mjs` ตรวจทั้งสองข้อนี้
const lsKey = () => `${LS_KEY}:${app.vault.getName()}`
const SELECT_EVENT = "wayfinder-effort-select" // ยิงหลังเขียนคีย์ ให้ pane ที่เปิดค้างสลับ effort ตามทันที
const TICKETS_NOTE = "Wayfinder Effort Tickets"

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

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
const ago = (d) => (d == null ? "—" : d <= 0 ? "วันนี้" : d === 1 ? "เมื่อวาน" : `${d} วันก่อน`)
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0)
const byRecent = (a, b) => (a.days ?? 0) - (b.days ?? 0) // ขยับล่าสุดขึ้นก่อน

// ── ตัวอ่าน — แปลง read model ของ core เป็นแถวที่หน้านี้วาด ไม่ตัดสินอะไรเอง ──────
// ลิงก์ดิบตามที่เขียนไว้ใน frontmatter ไม่มี `[[ ]]` — ใช้ตอนที่ลิงก์ชี้ไปที่ที่ไม่มีอยู่
const linkText = (raw) => String(raw).replace(/^\[\[|\]\]$/g, "")

const effortRows = ({ core, index, today }) => {
  // blocked_by ชี้ใบ → ชื่อใบ · ชี้ map → key ของมัน · หาไม่เจอ → ลิงก์ตามที่เขียนไว้
  const blockName = (b) => index.tickets.get(b.target)?.name ?? b.target ?? linkText(b.raw)
  return [...index.efforts.values()]
    .filter((e) => e.tickets.length) // effort ที่ยังไม่มีใบ ไม่มีอะไรให้นับ
    .map((e) => {
      // ตัวเลขทุกตัว (🔥 = frontier ของ core ตัวเดียวกับ Dashboard และ `wf frontier`) · นาฬิกา · blocked_by
      const n = core.effortSummary(index, e.key, { today })
      return {
        ...n,
        open: n.ready + n.blocked,
        key: e.key,
        repo: e.repo,
        effort: e.effort,
        map: e.map?.path ?? null,
        status: e.map?.status ?? null,
        note: e.map?.statusNote ?? null,
        supersededBy: e.map?.supersededBy ? core.parseRef(e.map.supersededBy)?.effort ?? linkText(e.map.supersededBy) : null,
        block: n.block && { ...n.block, name: blockName(n.block) },
      }
    })
}

// ── ⚠️ สถานะไม่ตรงพฤติกรรม — เคสและลำดับความสำคัญคือ `core.mapWarnings` (blocked_by → ใบหมด → นาฬิกา)
// ที่นี่แค่แปลเหตุผลเป็นคำ: [ทำไม, ต้องทำอะไร]
const WARNING = {
  cleared: (r) => [`blocker ปลดแล้ว — ${r.block.name}`, "กลับมาทำได้"],
  dead: (r) => [`รอ ${r.block.name} ที่ไม่มีใครผลักให้เดิน`, "โซ่ตัน"],
  dangling: (r) => [`blocked_by ชี้ไปที่ ${r.block.name} ที่ไม่มีอยู่`, "แก้ลิงก์"],
  finished: () => ["ใบหมดแล้ว แต่ยังไม่ประกาศว่าถึง Destination", "→ done"],
  idle: (r, w) => [`ประกาศ active แต่ไม่มีใบไหนขยับ ${w.days} วัน`, "→ paused"],
  paused: (r, w, cfg) => [`พักมา ${w.days} วัน เกินเส้น ${cfg.paused_stale_days} วัน`, "→ dropped"],
}
const warningOf = ({ core, index, today, config, cfg }) => {
  const warnings = new Map(core.mapWarnings(index, { today, config }).map((w) => [w.map.key, w]))
  return (r) => {
    const w = warnings.get(r.key)
    if (w) return WARNING[w.reason](r, w, cfg)
    // status ที่ไม่มี หรือนอก enum — ไม่ใช่ทั้ง "เดินอยู่" และ "พับได้" ⇒ บอกให้แก้ (🩺 lint ฟ้องข้อเดียวกัน)
    if (r.map && !core.MAP_STATUSES.includes(r.status)) return [`status ของ map ไม่รู้จัก (${r.status ?? "ไม่มี"})`, "แก้ status"]
    return null
  }
}

// ── แบ่งกลุ่ม — จัดตาม *สิ่งที่ต้องทำ* ไม่ใช่ตามค่าสถานะ ─────────────────
const FOLDED = ["paused", "draft", "done", "dropped"]
const groupRows = (rows, warning) => {
  const warn = []
  const active = []
  const folded = Object.fromEntries(FOLDED.map((k) => [k, []]))
  for (const r of rows) {
    const w = warning(r)
    if (w) warn.push({ ...r, why: w[0], act: w[1] })
    else if (r.status === "active") active.push(r)
    else folded[FOLDED.includes(r.status) ? r.status : "done"].push(r) // effort ที่ไม่มี map เลย พับไว้กับ ✅
  }
  active.sort(byRecent)
  for (const k of FOLDED) folded[k].sort(byRecent)
  return { warn, active, folded }
}

// ── วาด ────────────────────────────────────────────────────────────────────
const draw = ({ rows, warn, active, folded, cfg }) => {
  const COLORS = { resolved: cfg.color_resolved, claimed: cfg.color_claimed, open: cfg.color_open, waiting: cfg.color_waiting }
  const MAP_LABEL = { paused: cfg.label_paused, draft: cfg.label_draft, done: cfg.label_done, dropped: cfg.label_dropped }
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
  // `data-go` ถือ key ไว้เพื่อผูก listener ทีเดียวหลังวาดเสร็จ (ดู `bindCounts`) แทนที่จะ inline onclick
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
      r.supersededBy ? `→ ${esc(r.supersededBy)}` : "",
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

  return !rows.length
    ? "<p>ยังไม่มี effort ใน vault</p>"
    : `<style>${CSS}</style><div class="wfe">` +
      grp("รวม",
        `${rows.length} effort · ${sum(rows, (r) => r.total)} ใบ · ` +
        `ปิดแล้ว ${sum(rows, (r) => r.resolved)} · เหลือ ${sum(rows, (r) => r.pending)}`) +
      grp("🔥 กำลังเดิน", `${active.length} effort · ขยับภายใน ${cfg.stale_days} วัน`) +
      (active.length ? hdr + active.map(row).join("") : `<div class="wfe-none">ไม่มี effort ที่เดินอยู่</div>`) +
      grp("⚠️ สถานะไม่ตรงพฤติกรรม", `${warn.length}`, " is-warn") +
      (warn.length
        ? warn.map(warnRow).join("")
        : `<div class="wfe-none">ไม่มี — ทุก map สถานะตรงกับพฤติกรรมจริง</div>`) +
      FOLDED.map(foldGroup).join("") +
      `</div>`
}

// ── คลิกตัวเลขใบ → เปิดหน้าใบของ effort นั้น ─────────────────────────────
// ผูกหลังวาดเสร็จเสมอ: `innerHTML` สร้าง element ใหม่ทั้งชุด listener ที่ผูกไว้ก่อนหน้าตายไปด้วย
const goTickets = (key) => {
  try { localStorage.setItem(lsKey(), key) } catch (_) {} // ① เขียนคีย์ก่อน — หน้าใบอ่านตอนวาด
  window.dispatchEvent(new CustomEvent(SELECT_EVENT))    // ② ปลุก pane ที่เปิดหน้าใบค้างอยู่ให้สลับตาม
  app.workspace.openLinkText(TICKETS_NOTE, "")           // ③ ค่อยเปิด/โฟกัสโน้ต
}
const bindCounts = () => {
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
}

await dv.view("_tools/views/wf-core", {
  render: (wf) => {
    const cfg = wf.core.readConfig(wf.config)
    const rows = effortRows(wf)
    const groups = groupRows(rows, warningOf({ ...wf, cfg }))
    dv.container.innerHTML = draw({ rows, ...groups, cfg })
    bindCounts()
  },
})
```

> **ค่าเส้นแบ่งเวลา สี และป้าย อยู่ที่ [[Wayfinder Config]]** (`stale_days` · `paused_stale_days` · `color_*` · `label_*`)
> — แก้ที่นั่นแล้วหน้านี้ขยับตามรอบวาดถัดไป · ค่าเริ่มต้นอยู่ใน core (`CONFIG_DEFAULTS`) ที่เดียว
> ใช้เมื่อโน้ตนั้นหาย คีย์ไม่ครบ หรือค่าใช้ไม่ได้ (ทีละคีย์) · ที่มาของเลข `30` (ไม่ใช่เลขกลม ๆ) อยู่ในโน้ต Config
>
> map ที่มี `blocked_by` ค้างอยู่ **ไม่ถูกนับนาฬิกา** — มันไม่ได้ดอง มันรอ
> · map `active` ที่ใบค้างทุกใบเป็น `waiting` ก็ **ไม่ถูกนับนาฬิกา `stale_days`** ด้วยเหตุผลเดียวกัน
> สิ่งที่ตัดสินคือสภาพของเป้าหมาย: ปลดแล้ว → เด้งขึ้น ⚠️ ให้กลับมาทำ · เป้าไม่มีใครผลัก → เด้งขึ้น ⚠️ ว่าโซ่ตัน
