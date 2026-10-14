// Where the Wayfinder pages keep their code (spec docs/specs/ticket-store.md, *Sandbox grant (Q2)*).
// A `dataviewjs` block runs with the owner's full rights when its note is opened in Obsidian, and the
// sandbox can write notes but not `_tools/`. So each page's code is a view under `_tools/views/`, and
// every block in a page note is one line that calls it — a stub:
//   await dv.view("_tools/views/<view>")
//   await dv.view("_tools/views/<view>", { block: "<section>" })
// doctor holds the pages to that shape and flags any other note that carries a `dataviewjs` block. Inline
// JS queries (`$=`) stay off: `enableInlineDataviewJs` is false in the Dataview settings, which live under
// `.obsidian/`, also denied to the sandbox.

export const VIEWS_DIR = "_tools/views"
// The shared loader every view reads the core through; no page calls it directly.
export const LOADER_VIEW = "wf-core"

// The sections of the Dashboard view, one stub each, in page order — test/dashboard.test.mjs holds the view's
// own list to this one.
export const DASHBOARD_SECTIONS = Object.freeze([
  "lint", "frontier", "blocked", "waiting", "claimed", "stranded", "paused", "draft", "dropped", "decisions",
])

/** Each page note's stubs, as the `block` each names (null: the view takes no section), in page order. */
export const PAGE_STUBS = Object.freeze({
  "Wayfinder Dashboard": DASHBOARD_SECTIONS,
  "Wayfinder Efforts": Object.freeze([null]),
  "Wayfinder Effort Tickets": Object.freeze([null]),
  "Wayfinder Picks": Object.freeze([null]),
})

/** Each page note (by name, without `.md`) and the view its stubs call. */
export const PAGE_VIEWS = Object.freeze({
  "Wayfinder Dashboard": "dashboard",
  "Wayfinder Efforts": "efforts",
  "Wayfinder Effort Tickets": "effort-tickets",
  "Wayfinder Picks": "picks",
})

const BLOCK_RE = /^```dataviewjs[ \t]*\r?\n([\s\S]*?)^```/gm
// Any fence Dataview might run as JS, however it is written: backticks or tildes, indented, inside a quote,
// callout or list item. Not anchored to the line start on purpose — counting too many is safe, too few is a
// false green. BLOCK_RE reads the plain fences the template writes; a page whose count here is higher has a
// block written some other way, which doctor then refuses.
const JS_FENCE_RE = /(?:`{3,}|~{3,})[ \t]*dataviewjs\b/gi
const STUB_RE = /^await dv\.view\("_tools\/views\/([a-z-]+)"(?:, \{ block: "([a-z]+)" \})?\)[ \t]*$/

/** The `dataviewjs` blocks of a note, in order: `{ src, line }` with `line` the 1-based fence line. */
export function dataviewjsBlocks(text) {
  return [...text.matchAll(BLOCK_RE)].map((m) => ({ src: m[1], line: text.slice(0, m.index).split("\n").length }))
}

/** A block's `{ view, block }` when it is a stub (one line, nothing else), or null. */
export function stubOf(src) {
  const lines = src.split(/\r?\n/).filter((l) => l.trim() !== "")
  const m = lines.length === 1 ? STUB_RE.exec(lines[0]) : null
  return m ? { view: m[1], block: m[2] ?? null } : null
}


/** How many fences in a note Dataview would run as JS, plain or not. */
export const jsFenceCount = (text) => text.match(JS_FENCE_RE)?.length ?? 0
