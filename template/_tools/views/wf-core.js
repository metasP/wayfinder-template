// Shared loader view — every Wayfinder page reaches the read-model core through this one file
// (spec docs/specs/ticket-store.md, *Loading the core in Obsidian*). A page's view (`_tools/views/<page>.js`,
// which the page note's one-line stub calls) ends with this call, returning the promise it gives back:
//
//   dv.view("_tools/views/wf-core", { render: (wf) => { … }, bodies: true })
//
// and `render` gets `wf = { core, nav, folds, index, notes, unread, config, sort, today, link, text }`:
//   core    the module `_tools/lib/core.mjs` — every query the page shows comes from here
//   nav     the module `_tools/lib/page-nav.mjs` — fold rule and Dashboard summary counts, no vault rules
//   folds   nav.folds bound to this vault's `localStorage`: `isOpen(page, id, …)` · `remember(page, id, open)`
//   index   core.buildIndex over the vault's notes
//   config  *Wayfinder Config* frontmatter ({} without the note); `sort` is *Wayfinder Picks* `sort:`
//   today   YYYY-MM-DD, the local calendar day (the core never reads the clock); `input.today` overrides
//   link    ref → a link to its note (ticket, map, `Wayfinder Picks`), or the ref as text
//   text    a note value for a table cell: `<` `>` `&` escaped so markdown can't eat it as a tag; null → —
// `bodies: true` also reads each map's body for its `<!-- wf:tickets -->` block, which only lint's
// drift rule needs; without it maps carry no `ticketsBlock` and drift isn't checked. A body that
// can't be read is left unread too, and its path lands in `unread` so the page can say so.
//
// How the core loads, and why:
//   · Dynamic import of `app.vault.adapter.getResourcePath(CORE)` — the URL Obsidian serves the vault
//     file at, with an mtime query so an edited core is a new module on the next render.
//     Never `require` (desktop-only, cached for the whole process) and never a raw filesystem URL.
//   · The import is wrapped: a core that is missing, broken or too old renders a message naming
//     the file and `doctor` — Dataview's own error box doesn't say which file failed.
//   · Fallback, documented and not built: read the core as text with `dv.io.load(CORE)` and evaluate
//     a CommonJS build of it with `new Function("module", "exports", text)`. Ticket 01 proved that
//     route works; take it if dynamic import ever fails on Obsidian mobile.
//
// ⚠️ This file must never contain the a-word that Dataview searches for (a-w-a-i-t): a view holding
// it is wrapped in an async IIFE whose promise Dataview drops, so the page block would carry on
// before the view rendered and a failure would escape as an unhandled rejection. Promise chains
// keep the view's promise returned to Dataview, which waits on it. test/loader-view.test.mjs guards this.

const CORE = "_tools/lib/core.mjs"
const NAV = "_tools/lib/page-nav.mjs"
const NAV_REQUIRED = ["folds", "bindFoldClicks", "summaryCounts", "tabEffort", "parseTabs", "pruneTabs", "tabShowing"]
const CONFIG_NOTE = "Wayfinder Config.md"
const PICKS_NOTE = "Wayfinder Picks.md"
const PICKS_REF = "Wayfinder Picks"
// Every core export the pages call; a core without them is too old (or not the core) — same message.
const REQUIRED = [
  "buildIndex", "frontier", "lint", "ticketsBlockOf", "isoDate",
  "ticketState", "isPending", "openBlockers", "unblocks", "dependents",
  "parsePickSort", "parseRef", "readConfig", "daysBetween",
  "effortSummary", "mapWarnings", "blockerEdges",
]

const say = (text) => dv.paragraph(text)

const coreFailed = (err) =>
  say(
    `⚠️ **Wayfinder: โหลด core ไม่ได้** — \`${CORE}\` · \`${NAV}\`: ${err?.message ?? err}\n` +
      "รัน `node _tools/doctor.mjs` ใน vault เพื่อหาสาเหตุ (ไฟล์หาย · ไฟล์พัง · รุ่นไม่ตรงกับหน้า)",
  )

const blockFailed = (err) =>
  say(`⚠️ **Wayfinder: บล็อกนี้วาดไม่สำเร็จ** (core โหลดได้แล้ว) — ${err?.message ?? err}`)

// One module the pages need, checked for the exports they call; the error names the file that failed.
const loadModule = (path, required) =>
  Promise.resolve()
    .then(() => import(app.vault.adapter.getResourcePath(path)))
    .then((mod) => {
      const missing = required.filter((name) => typeof mod[name] !== "function")
      if (missing.length) throw new Error(`\`${path}\` ไม่มี export ${missing.join(", ")} — รุ่นเก่ากว่าหน้านี้`)
      return mod
    })

const loadCore = () =>
  Promise.all([loadModule(CORE, REQUIRED), loadModule(NAV, NAV_REQUIRED)]).then(([core, nav]) => ({ core, nav }))

// Same scope as the store: no dot folders at any depth, no `_` entries at the vault root.
const isVaultNote = (path) => !path.split("/").some((part) => part.startsWith(".")) && !path.startsWith("_")

// A missing note is fine (every key has a default, as in the store); any other failure surfaces.
const frontmatterOf = (path) => dv.page(path)?.file?.frontmatter ?? {}

// A body that can't be read leaves `ticketsBlock` out: unread, so lint skips drift for that map.
const withBody = (core, note) =>
  dv.io
    .load(note.path)
    .then((text) => (typeof text === "string" ? { ...note, ticketsBlock: core.ticketsBlockOf(text) } : note))
    .catch(() => note)

const escapeText = (value) =>
  value == null ? "—" : String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const readNotes = (core, bodies) => {
  const notes = dv
    .pages()
    .array()
    .map((p) => ({ path: p.file.path, frontmatter: p.file.frontmatter }))
    .filter((n) => isVaultNote(n.path))
  if (!bodies) return Promise.resolve(notes)
  return Promise.all(notes.map((n) => (n.path.endsWith("/map.md") ? withBody(core, n) : n)))
}

const linker = (index) => (ref) => {
  const ticket = index.tickets.get(ref)
  if (ticket) return dv.fileLink(ticket.path)
  const map = index.maps.get(ref)
  if (map) return dv.fileLink(map.path, false, map.key)
  return ref === PICKS_REF ? dv.fileLink(PICKS_NOTE) : ref
}

const context = ({ core, nav }, notes, bodies) => {
  const index = core.buildIndex(notes)
  return {
    core,
    nav,
    folds: nav.folds({ storage: localStorage, vault: app.vault.getName() }),
    index,
    notes,
    unread: bodies ? notes.filter((n) => n.path.endsWith("/map.md") && !("ticketsBlock" in n)).map((n) => n.path) : [],
    config: frontmatterOf(CONFIG_NOTE),
    sort: frontmatterOf(PICKS_NOTE).sort ?? undefined,
    today: input.today ?? core.isoDate(new Date()),
    link: linker(index),
    text: escapeText,
  }
}

if (typeof input?.render !== "function") {
  say('⚠️ **Wayfinder:** เรียก `dv.view("_tools/views/wf-core", { render: (wf) => … })` — ไม่มี `render`')
  return
}

const bodies = input.bodies === true

// Everything after the import runs inside the chain, so a synchronous throw (in `dv.pages()` or
// the page's `render`) reaches `blockFailed` instead of escaping as an unhandled rejection.
return loadCore().then(
  (mods) =>
    Promise.resolve()
      .then(() => readNotes(mods.core, bodies))
      .then((notes) => input.render(context(mods, notes, bodies)))
      .catch(blockFailed),
  coreFailed,
)
