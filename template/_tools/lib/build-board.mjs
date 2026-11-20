// A map's `## Build board` as checkbox lines (retro of dashboard-navigation, B): a line
// `- [ ] [#80](url) ↔ 02 — title` points at a card on the work repo's tracker and is bound to the
// map's ticket 02 by `↔ NN`. `wf resolve` ticks the lines bound to the ticket it resolves; lint flags a
// resolved ticket whose line is still unticked, and a done map with any unticked line. Lines that are
// not checkboxes (a board of plain links) are not read. Pure: text in, items or text out.
import { codeMask } from "./core.mjs"

const BOX_RE = /^(\s*[-*+]\s+\[)([ xX])(\].*)$/
const BINDING_RE = /↔\s*(?:\[\[)?(\d+)\b/

// A checkbox line as `{ line, checked, nn }`: nn is the bound ticket's number, or null without `↔ NN`.
const itemOf = (line) => {
  const box = BOX_RE.exec(line)
  if (!box) return null
  const nn = BINDING_RE.exec(line)?.[1]
  return { line, checked: box[2] !== " ", nn: nn === undefined ? null : Number(nn) }
}

/**
 * The checkbox lines of a `## Build board` section's text (as `sectionText` gives it), outside code
 * fences: `{ line, checked, nn }[]`. Null section text (no board) → [].
 */
export function boardItems(section) {
  if (section == null) return []
  const lines = section.split("\n").map((l) => l.replace(/\r$/, ""))
  const isCode = codeMask(lines)
  return lines.flatMap((l, i) => (isCode[i] ? [] : [itemOf(l)].filter(Boolean)))
}

/**
 * `lines` (a section's lines, terminators kept) with every unticked checkbox bound to ticket `nn`
 * ticked, skipping code fences: `{ lines, ticked }`, `ticked` the new lines' content.
 */
export function tickLines(lines, nn) {
  const isCode = codeMask(lines)
  const ticked = []
  const next = lines.map((l, i) => {
    const content = l.replace(/\r?\n$/, "")
    const item = isCode[i] ? null : itemOf(content)
    if (!item || item.checked || item.nn !== nn) return l
    const done = content.replace(BOX_RE, "$1x$3")
    ticked.push(done)
    return done + l.slice(content.length)
  })
  return { lines: next, ticked }
}
