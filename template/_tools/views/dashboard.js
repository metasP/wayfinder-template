// The *Wayfinder Dashboard* page — each of its blocks is a one-line stub naming one section here:
//   dv.view("_tools/views/dashboard", { block: "frontier" })
// so a sandboxed command can't edit what the page runs: `_tools/` is denied to the sandbox, notes
// aren't (spec docs/specs/ticket-store.md, *Sandbox grant (Q2)*). Like every view, this file must never
// hold the a-word Dataview searches for (see the head of wf-core.js): it returns the loader's promise.
//
// A section is the loader's input: `render` gets `wf` (see wf-core.js), `bodies: true` reads map bodies.

const LOADER = "_tools/views/wf-core"

const onActiveMap = (index, t) => index.maps.get(t.effortKey)?.status === "active"
const bySince = (a, b) => (a.statusSince ?? "").localeCompare(b.statusSince ?? "")

const SECTIONS = {
  // 🩺 Lint — ชุดเดียวกับ `wf lint`
  lint: {
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
  },

  // 🔥 Frontier — ลำดับเดียวกับ `wf frontier`
  frontier: {
    render: ({ core, index, sort, link }) => {
      const tickets = core.frontier(index, { sort })
      if (!tickets.length) return dv.paragraph("_ไม่มีใบที่หยิบได้ตอนนี้_")
      dv.table(
        ["Ticket", "Effort", "Type", "ปลดล็อกกี่ใบ"],
        tickets.map((t) => [link(t.ref), link(t.effortKey), t.type, core.unblocks(index, t)]),
      )
    },
  },

  // 🚧 Blocked — blocker ที่ยังไม่ resolved เท่านั้น
  blocked: {
    render: ({ core, index, link }) => {
      const tickets = [...index.tickets.values()].filter(
        (t) => onActiveMap(index, t) && core.ticketState(index, t) === "blocked",
      )
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
    render: ({ core, index, link, text }) => {
      const tickets = [...index.tickets.values()]
        .filter((t) => onActiveMap(index, t) && core.ticketState(index, t) === "waiting")
        .sort(bySince)
      if (!tickets.length) return dv.paragraph("_ไม่มีใบที่รอของนอก_")
      dv.table(
        ["Ticket", "Effort", "รออะไร", "รอตั้งแต่", "นัดดูอีกที"],
        tickets.map((t) => [link(t.ref), link(t.effortKey), text(t.statusNote), t.statusSince, t.waitUntil ?? "—"]),
      )
    },
  },

  // 🖐 Claimed — มี session จับอยู่
  claimed: {
    render: ({ core, index, link, text }) => {
      const tickets = [...index.tickets.values()]
        .filter((t) => onActiveMap(index, t) && core.ticketState(index, t) === "claimed")
        .sort(bySince)
      if (!tickets.length) return dv.paragraph("_ไม่มี session ไหนจับใบอยู่_")
      dv.table(
        ["Ticket", "Effort", "Type", "จับโดย", "จับตั้งแต่"],
        tickets.map((t) => [link(t.ref), link(t.effortKey), t.type, text(t.claimedBy), t.statusSince]),
      )
    },
  },

  // ⚠️ ค้างเติ่ง — ใบยังไม่ปิด ใน map ที่ประกาศว่าปิดแล้ว
  stranded: {
    render: ({ core, index, link }) => {
      const tickets = [...index.tickets.values()].filter(
        (t) => index.maps.get(t.effortKey)?.status === "done" && core.isPending(index, t),
      )
      if (!tickets.length) return dv.paragraph("_ว่าง — ดีแล้ว_")
      dv.table(["Ticket", "Effort", "Status"], tickets.map((t) => [link(t.ref), link(t.effortKey), t.status]))
    },
  },

  // ⏸ จาก map ที่พักไว้
  paused: {
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
  },

  // ✏️ จาก map ที่ยังไม่ได้ชาร์ต
  draft: {
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
  },

  // 🗑 ใบใน map ที่ทิ้งแล้ว — นับไว้เฉย ๆ
  dropped: {
    render: ({ core, index, link }) => {
      const efforts = [...index.efforts.values()]
        .filter((e) => e.map?.status === "dropped")
        .map((e) => [link(e.key), e.tickets.filter((t) => core.isPending(index, t)).length])
        .filter(([, count]) => count > 0)
      if (!efforts.length) return dv.paragraph("_ไม่มีใบค้างใน map ที่ทิ้งแล้ว_")
      dv.table(["Effort", "ใบที่ไม่แสดง"], efforts)
    },
  },

  // ✅ Decisions so far — 30 ใบที่ปิดล่าสุด
  decisions: {
    render: ({ core, index, link }) => {
      const tickets = [...index.tickets.values()]
        .filter((t) => index.maps.get(t.effortKey)?.status !== "dropped" && core.ticketState(index, t) === "resolved")
        .sort((a, b) => (b.statusSince ?? "").localeCompare(a.statusSince ?? ""))
        .slice(0, 30)
      if (!tickets.length) return dv.paragraph("_ยังไม่มีใบที่ปิด_")
      dv.table(["Ticket", "Effort", "ปิดเมื่อ"], tickets.map((t) => [link(t.ref), link(t.effortKey), t.statusSince]))
    },
  },
}

const name = input?.block
if (!Object.hasOwn(SECTIONS, name)) {
  dv.paragraph(
    `⚠️ **Wayfinder:** ไม่รู้จักบล็อก \`${String(name)}\` — ใช้ \`dv.view("_tools/views/dashboard", { block: … })\`` +
      ` กับหนึ่งใน ${Object.keys(SECTIONS).join(" · ")}`,
  )
  return
}

return dv.view(LOADER, SECTIONS[name])
