// The *Wayfinder Picks* table — the note holds only the stub
//   dv.view("_tools/views/picks")
// so a sandboxed command can't edit what the page runs: `_tools/` is denied to the sandbox, notes
// aren't (spec docs/specs/ticket-store.md, *Sandbox grant (Q2)*). The note is the user's and the
// updater never touches it, so `wf migrate` swaps the inline block older vaults carry for the stub.
// Like every view, this file must never hold the a-word Dataview searches for (see the head of wf-core.js).

return dv.view("_tools/views/wf-core", {
  render: ({ core, index, sort, link, text }) => {
    const { keys, unknown } = core.parsePickSort(sort)
    const rule = keys.length ? keys.map((k) => `${k.key} ${k.dir}`).join(", ") : `${core.DEFAULT_PICK_SORT.join(", ")} (ค่าเริ่มต้น)`
    dv.paragraph(`เรียงตาม: \`${rule}\`` + (unknown.length ? ` · ⚠️ ข้าม key ที่ไม่รู้จัก: ${unknown.map((u) => `\`${text(u)}\``).join(" ")}` : ""))
    const tickets = core.frontier(index, { sort })
    if (!tickets.length) return dv.paragraph("_ไม่มีใบที่หยิบได้ตอนนี้_")
    dv.table(
      ["Ticket", "Effort", "Type", "ปลดล็อกกี่ใบ"],
      tickets.map((t) => [link(t.ref), link(t.effortKey), text(t.type), core.unblocks(index, t)]),
    )
  },
})
