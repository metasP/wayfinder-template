// Navigation helpers the three Wayfinder pages share (spec docs/specs/dashboard-navigation.md, *Modules* §1–2):
// which fold starts open, the override the owner leaves by toggling one, and the Dashboard summary counts.
// The loader view (`_tools/views/wf-core.js`) imports this file next to the core and hands it to every
// page as `wf.nav`, with `wf.folds` already bound to the vault — a view never copies it.
//
// Nothing here reads the clock, the vault or a global: storage comes in as an argument, so `node --test`
// drives it without Obsidian.

/** Sections that start closed whatever they hold: low-traffic, and long when they aren't empty. */
export const ALWAYS_FOLDED = Object.freeze(["paused", "draft", "dropped", "decisions"])

const STORED = Object.freeze({ open: true, closed: false })

/**
 * Whether a fold starts open. A stored override ("open" / "closed") wins; otherwise a low-traffic group
 * (ALWAYS_FOLDED, unless the page says otherwise) is closed; otherwise it is open when it has content.
 */
export function foldOpen({ id, hasContent, stored = null, lowTraffic = ALWAYS_FOLDED.includes(id) }) {
  if (Object.hasOwn(STORED, stored ?? "")) return STORED[stored]
  if (lowTraffic) return false
  return Boolean(hasContent)
}

/** The `localStorage` key of one fold. Obsidian's storage is app-wide, so the vault is part of the key. */
export const foldKey = (page, vault, id) => `wayfinder-fold:${page}:${vault}:${id}`

/**
 * Fold state bound to one vault's storage: `isOpen(page, id, { hasContent, lowTraffic })` and
 * `remember(page, id, open)`. Storage that throws (private window, quota) reads as "no override".
 */
export function folds({ storage, vault }) {
  const read = (key) => {
    try {
      return storage.getItem(key)
    } catch {
      return null
    }
  }
  return {
    isOpen: (page, id, { hasContent, lowTraffic } = {}) =>
      foldOpen({ id, hasContent, lowTraffic, stored: read(foldKey(page, vault, id)) }),
    remember: (page, id, open) => {
      try {
        storage.setItem(foldKey(page, vault, id), open ? "open" : "closed")
      } catch {
        // storage refused: the fold still toggles, it just won't be remembered
      }
    },
  }
}

/**
 * Remember every owner toggle under `root`: a click on the `<summary>` of a `<details data-fold="id">`.
 * The click lands before the browser flips `open`, so the new state is `!details.open`. Listening to
 * clicks, not `toggle`, keeps the page's own `open` on render from being stored as an override.
 */
export function bindFoldClicks(root, page, bound) {
  root.addEventListener("click", (ev) => {
    const details = ev.target?.closest?.("summary")?.parentElement
    const id = details?.dataset?.fold
    if (!id) return
    bound.remember(page, id, !details.open)
  })
}

/** Marker CSS for `<details class="wf-fold">`: ▸ closed, ▾ open, in place of the browser's triangle. */
export const FOLD_CSS = `
details.wf-fold > summary { cursor: pointer; list-style: none; }
details.wf-fold > summary::-webkit-details-marker { display: none; }
details.wf-fold > summary::before { content: "▸ "; color: var(--text-faint); }
details.wf-fold[open] > summary::before { content: "▾ "; }
`

/**
 * One summary entry per section, in the order given: `{ id, count }`, where `count` is the length of what
 * the section renders. Lint also carries `errors` and `warnings` (its findings' severities).
 */
export function summaryCounts(items) {
  return Object.entries(items).map(([id, list]) => {
    const count = list.length
    if (id !== "lint") return { id, count }
    const errors = list.filter((f) => f.severity === "error").length
    return { id, count, errors, warnings: count - errors }
  })
}
