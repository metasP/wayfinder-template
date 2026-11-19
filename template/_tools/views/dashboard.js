// The *Wayfinder Dashboard* page — each of its blocks is a one-line stub naming one section here:
//   dv.view("_tools/views/dashboard", { block: "frontier" })
// so a sandboxed command can't edit what the page runs: `_tools/` is denied to the sandbox, notes
// aren't (spec docs/specs/ticket-store.md, *Sandbox grant (Q2)*). Like every view, this file must never
// hold the a-word Dataview searches for (see the head of wf-core.js): it returns the loader's promise.
//
// A section's `items(wf)` is the list it shows (from the core — `wf` is the loader's, see wf-core.js) and
// `draw(wf, items)` draws it; `bodies: true` makes the loader read map bodies. Every section draws inside a
// fold (`<details data-fold>`, spec docs/specs/dashboard-navigation.md, *Modules* §1–3) whose summary line
// carries its count, and the `summary` block — first on the page — is the sticky bar of those counts. Bar
// and sections share `items`, so a count is always the length of what its section shows.

const LOADER = "_tools/views/wf-core"
const PAGE = "dashboard"

const onActiveMap = (index, t) => index.maps.get(t.effortKey)?.status === "active"
const bySince = (a, b) => (a.statusSince ?? "").localeCompare(b.statusSince ?? "")
const pendingOnMaps = (core, index, status) =>
  [...index.tickets.values()].filter((t) => index.maps.get(t.effortKey)?.status === status && core.isPending(index, t))

const SECTIONS = {
  // 🩺 Lint — ชุดเดียวกับ `wf lint`
  lint: {
    emoji: "🩺",
    bodies: true,
    // map ที่อ่านเนื้อไม่ได้ = ยังไม่ได้ตรวจ drift ⇒ บอกตรง ๆ นอกส่วนที่พับ ไม่ใช่เงียบแล้วอ้างว่าตรงกับ `wf lint`
    before: ({ unread }) => {
      if (unread.length) dv.paragraph(`⚠️ อ่านเนื้อ map ไม่ได้ ${unread.length} ไฟล์ — ยังไม่ได้ตรวจ \`## Tickets\` drift: ${unread.join(" · ")}`)
    },
    items: ({ core, index, config, sort, today }) => core.lint(index, { today, config, sort }),
    draw: ({ link, text }, findings) => {
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
  },

  // 🔥 Frontier — ลำดับเดียวกับ `wf frontier`
  frontier: {
    emoji: "🔥",
    items: ({ core, index, sort }) => core.frontier(index, { sort }),
    draw: ({ core, index, link }, tickets) => {
      if (!tickets.length) return dv.paragraph("_ไม่มีใบที่หยิบได้ตอนนี้_")
      dv.table(
        ["Ticket", "Effort", "Type", "ปลดล็อกกี่ใบ"],
        tickets.map((t) => [link(t.ref), link(t.effortKey), t.type, core.unblocks(index, t)]),
      )
    },
  },

  // 🚧 Blocked — blocker ที่ยังไม่ resolved เท่านั้น
  blocked: {
    emoji: "🚧",
    items: ({ core, index }) =>
      [...index.tickets.values()].filter((t) => onActiveMap(index, t) && core.ticketState(index, t) === "blocked"),
    draw: ({ core, index, link }, tickets) => {
      if (!tickets.length) return dv.paragraph("_ไม่มีใบที่ติดใบอื่น_")
      const waitingOn = (ref) => (ref == null ? "❓ ลิงก์เสีย — ดู 🩺 lint" : link(ref))
      dv.table(
        ["Ticket", "Effort", "รออยู่"],
        tickets.map((t) => [link(t.ref), link(t.effortKey), core.openBlockers(index, t).map(waitingOn)]),
      )
    },
  },

  // ⏳ รอของนอก — รอนานสุดขึ้นก่อน
  waiting: {
    emoji: "⏳",
    items: ({ core, index }) =>
      [...index.tickets.values()]
        .filter((t) => onActiveMap(index, t) && core.ticketState(index, t) === "waiting")
        .sort(bySince),
    draw: ({ link, text }, tickets) => {
      if (!tickets.length) return dv.paragraph("_ไม่มีใบที่รอของนอก_")
      dv.table(
        ["Ticket", "Effort", "รออะไร", "รอตั้งแต่", "นัดดูอีกที"],
        tickets.map((t) => [link(t.ref), link(t.effortKey), text(t.statusNote), t.statusSince, t.waitUntil ?? "—"]),
      )
    },
  },

  // 🖐 Claimed — มี session จับอยู่
  claimed: {
    emoji: "🖐",
    items: ({ core, index }) =>
      [...index.tickets.values()]
        .filter((t) => onActiveMap(index, t) && core.ticketState(index, t) === "claimed")
        .sort(bySince),
    draw: ({ link, text }, tickets) => {
      if (!tickets.length) return dv.paragraph("_ไม่มี session ไหนจับใบอยู่_")
      dv.table(
        ["Ticket", "Effort", "Type", "จับโดย", "จับตั้งแต่"],
        tickets.map((t) => [link(t.ref), link(t.effortKey), t.type, text(t.claimedBy), t.statusSince]),
      )
    },
  },

  // ⚠️ ค้างเติ่ง — ใบยังไม่ปิด ใน map ที่ประกาศว่าปิดแล้ว
  stranded: {
    emoji: "⚠️",
    items: ({ core, index }) => pendingOnMaps(core, index, "done"),
    draw: ({ link }, tickets) => {
      if (!tickets.length) return dv.paragraph("_ว่าง — ดีแล้ว_")
      dv.table(["Ticket", "Effort", "Status"], tickets.map((t) => [link(t.ref), link(t.effortKey), t.status]))
    },
  },

  // ⏸ จาก map ที่พักไว้
  paused: {
    emoji: "⏸",
    items: ({ core, index }) => pendingOnMaps(core, index, "paused"),
    draw: ({ index, link, text }, tickets) => {
      if (!tickets.length) return dv.paragraph("_ไม่มี map ที่พักไว้ซึ่งยังมีใบค้าง_")
      dv.table(
        ["Ticket", "Effort", "เงื่อนไขกลับมา"],
        tickets.map((t) => [link(t.ref), link(t.effortKey), text(index.maps.get(t.effortKey).statusNote)]),
      )
    },
  },

  // ✏️ จาก map ที่ยังไม่ได้ชาร์ต
  draft: {
    emoji: "✏️",
    items: ({ core, index }) => pendingOnMaps(core, index, "draft"),
    draw: ({ index, link, text }, tickets) => {
      if (!tickets.length) return dv.paragraph("_ไม่มี map ร่างที่มีใบค้าง_")
      dv.table(
        ["Ticket", "Effort", "ยังขาดอะไร"],
        tickets.map((t) => [link(t.ref), link(t.effortKey), text(index.maps.get(t.effortKey).statusNote)]),
      )
    },
  },

  // 🗑 ใบใน map ที่ทิ้งแล้ว — นับไว้เฉย ๆ (หนึ่งแถวต่อ effort)
  dropped: {
    emoji: "🗑",
    items: ({ core, index }) =>
      [...index.efforts.values()]
        .filter((e) => e.map?.status === "dropped")
        .map((e) => ({ key: e.key, count: e.tickets.filter((t) => core.isPending(index, t)).length }))
        .filter((e) => e.count > 0),
    draw: ({ link }, efforts) => {
      if (!efforts.length) return dv.paragraph("_ไม่มีใบค้างใน map ที่ทิ้งแล้ว_")
      dv.table(["Effort", "ใบที่ไม่แสดง"], efforts.map((e) => [link(e.key), e.count]))
    },
  },

  // ✅ Decisions so far — 30 ใบที่ปิดล่าสุด
  decisions: {
    emoji: "✅",
    items: ({ core, index }) =>
      [...index.tickets.values()]
        .filter((t) => index.maps.get(t.effortKey)?.status !== "dropped" && core.ticketState(index, t) === "resolved")
        .sort((a, b) => (b.statusSince ?? "").localeCompare(a.statusSince ?? ""))
        .slice(0, 30),
    draw: ({ link }, tickets) => {
      if (!tickets.length) return dv.paragraph("_ยังไม่มีใบที่ปิด_")
      dv.table(["Ticket", "Effort", "ปิดเมื่อ"], tickets.map((t) => [link(t.ref), link(t.effortKey), t.statusSince]))
    },
  },
}

// ── ส่วนที่พับได้ — วาดลงใน `<details data-fold>` แล้วจำการพับ/กางของเจ้าของต่อ vault ──────────
// `dv.table` วาดลง `dv.container` ณ ตอนที่เรียก ⇒ สลับ container เป็น `<details>` ชั่วคราวระหว่าง draw
const countLabel = (entry) =>
  entry.id === "lint" ? `🔴 ${entry.errors} · 🟡 ${entry.warnings}` : `${entry.count} รายการ`

const folded = (name) => (wf) => {
  const section = SECTIONS[name]
  section.before?.(wf)
  const items = section.items(wf)
  const [entry] = wf.nav.summaryCounts({ [name]: items })
  const outer = dv.container
  outer.createEl("style", { text: wf.nav.FOLD_CSS })
  const details = outer.createEl("details", { cls: "wf-fold", attr: { "data-fold": name } })
  details.open = wf.folds.isOpen(PAGE, name, { hasContent: items.length > 0 })
  details.createEl("summary", { cls: "wf-fold-sum", text: countLabel(entry) })
  dv.container = details
  try {
    section.draw(wf, items)
  } finally {
    dv.container = outer
  }
  wf.nav.bindFoldClicks(outer, PAGE, wf.folds)
}

// ── แถบสรุป — แถวเดียวติดบนสุด หนึ่งช่องต่อส่วน คลิกแล้วเลื่อนไปที่ส่วนนั้นและกางมันออก ─────────────
const BAR_CSS = `
.wf-sticky { position: sticky; top: 0; z-index: 5; background: var(--background-primary); }
.wf-bar { display: flex; flex-wrap: wrap; gap: 4px 6px; padding: 6px 0;
  border-bottom: 1px solid var(--background-modifier-border); font-size: var(--font-ui-small); }
.wf-bar button { all: unset; cursor: pointer; padding: 2px 8px; border-radius: 10px;
  background: var(--background-secondary); font-family: var(--font-monospace); white-space: nowrap; }
.wf-bar button:hover { background: var(--background-modifier-hover); }
.wf-bar button:focus-visible { outline: 1px solid var(--text-accent); }
.wf-bar button.is-zero { opacity: .45; }
.wf-bar .is-err { color: var(--text-error); font-weight: 600; }
`
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
const barEntry = (entry) => {
  const emoji = SECTIONS[entry.id].emoji
  const label =
    entry.id === "lint"
      ? `${emoji} <span class="${entry.errors ? "is-err" : ""}">🔴 ${entry.errors}</span> · 🟡 ${entry.warnings}`
      : `${emoji} ${entry.count}`
  return (
    `<button class="${entry.count ? "" : "is-zero"}" data-jump="${esc(entry.id)}" data-count="${entry.count}"` +
    ` title="ไปที่ ${esc(entry.id)}">${label}</button>`
  )
}

// หัวข้อ `##` ของส่วนอยู่คนละบล็อกกับ `<details>` ของมัน (ใน reading view หนึ่ง div ต่อหนึ่งบล็อก)
// ⇒ เดินถอยจากบล็อกของ fold ไปหาบล็อกที่มี h2 · ไม่เจอ (เช่น live preview) ก็เลื่อนไปที่ fold เอง
const headingBefore = (details) => {
  let el = details.closest?.(".markdown-preview-section > div")?.previousElementSibling
  while (el && !el.querySelector?.("h2")) el = el.previousElementSibling
  return el ?? details
}

const jump = (wf, id, bar) => {
  wf.folds.remember(PAGE, id, true) // เหมือนเจ้าของกางเอง — redraw รอบหน้าก็ยังกางอยู่
  const root = dv.container.closest?.(".markdown-preview-view, .markdown-source-view") ?? globalThis.document
  const details = root?.querySelector?.(`details[data-fold="${id}"]`)
  if (!details) return
  details.open = true
  const target = headingBefore(details)
  target.style.scrollMarginTop = `${(bar?.offsetHeight ?? 0) + 8}px`
  target.scrollIntoView?.({ behavior: "smooth", block: "start" })
}

const summaryBar = (wf) => {
  const items = Object.fromEntries(Object.keys(SECTIONS).map((name) => [name, SECTIONS[name].items(wf)]))
  dv.container.innerHTML =
    `<style>${BAR_CSS}</style><nav class="wf-bar">` + wf.nav.summaryCounts(items).map(barEntry).join("") + `</nav>`
  // sticky ได้แค่ในกล่องของ parent ⇒ ติดที่ div ของบล็อกใน reading view ซึ่งเป็นลูกของ section ทั้งหน้า
  const host = dv.container.closest?.(".markdown-preview-section > div") ?? dv.container
  host.classList?.add("wf-sticky")
  const bar = dv.container.querySelector(".wf-bar")
  for (const el of dv.container.querySelectorAll("[data-jump]"))
    el.addEventListener("click", (ev) => {
      ev.preventDefault()
      jump(wf, el.dataset.jump, bar)
    })
}

// สิ่งที่ loader รับ: `summary` อ่านทุกส่วน (lint ต้องใช้เนื้อ map) · ส่วนอื่นวาดของตัวเองในที่พับ
const BLOCKS = {
  summary: { bodies: true, render: summaryBar },
  ...Object.fromEntries(Object.keys(SECTIONS).map((name) => [name, { bodies: SECTIONS[name].bodies === true, render: folded(name) }])),
}

const name = input?.block
if (!Object.hasOwn(BLOCKS, name)) {
  dv.paragraph(
    `⚠️ **Wayfinder:** ไม่รู้จักบล็อก \`${String(name)}\` — ใช้ \`dv.view("_tools/views/dashboard", { block: … })\`` +
      ` กับหนึ่งใน ${Object.keys(BLOCKS).join(" · ")}`,
  )
  return
}

return dv.view(LOADER, BLOCKS[name])
