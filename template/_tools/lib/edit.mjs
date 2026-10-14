// Line-level edits of a note's text for the write verbs (spec *Frontmatter schema* rules): a verb
// rewrites only the keys it owns, and every other byte — unknown keys, their order, comments, quoting,
// line endings — is kept. The generated `## Tickets` block is spliced the same way (spec *Generated
// `## Tickets` block*). Pure: text in, text out.
import { usageError } from "./errors.mjs"
import { BLOCK_CLOSE, BLOCK_OPEN } from "./core.mjs"
import { CLOSE_RE, KEY_RE, OPEN_RE, parseNote } from "./frontmatter.mjs"

const BOM = "﻿"
const ITEM_RE = /^\s*-(\s|$)/
const TICKETS_HEADING_RE = /^##\s+Tickets\s*$/
const NOTES_HEADING_RE = /^##\s+Notes\s*$/
const SECTION_HEADING_RE = /^#{1,2}\s/

/** A text's lines with their own terminators, so joining them gives the text back unchanged. */
export const linesOf = (text) => text.split(/(?<=\n)/)
/** A line without its terminator. */
export const contentOf = (line) => line.replace(/\r?\n$/, "")
/** The line ending the text uses (`\r\n` or `\n`). */
export const eolOf = (lines) => (lines.find((l) => l.endsWith("\n"))?.endsWith("\r\n") ? "\r\n" : "\n")

/**
 * A string or number as a YAML scalar that `parseNote` reads back as the same value: plain when it
 * survives unquoted (`claimed`, `2026-10-14`, `claude/x`, the number `3`), double-quoted otherwise
 * (`a #b`, `true`, the string `007`).
 */
export function yamlScalar(value) {
  const text = String(value)
  const same = typeof value === "number" ? value : text
  const readsBack = (scalar) => {
    const parsed = parseNote(`---\nk: ${scalar}\n---\n`)
    return !parsed.errors.length && parsed.frontmatter.k === same
  }
  if (!/[\r\n\u2028\u2029]/.test(text) && readsBack(text)) return text
  // JSON leaves U+2028/U+2029 raw; escaped, the value stays on one line.
  const quoted = JSON.stringify(text).replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`)
  if (readsBack(quoted)) return quoted
  throw usageError(`cannot write ${JSON.stringify(text)} as a frontmatter value`)
}

const isBlankOrComment = (l) => contentOf(l).trim() === "" || /^\s*#/.test(l)
const isUnder = (l) => !isBlankOrComment(l) && (ITEM_RE.test(l) || /^\s/.test(l))

// The line range a top-level key's value spans: its own line, plus the block-list items or indented
// lines under it. Blank and comment lines between items belong to the list (as the reader sees it);
// trailing ones don't.
const keyRange = (lines, key) => {
  const start = lines.findIndex((l) => KEY_RE.exec(contentOf(l))?.[1] === key)
  if (start === -1) return null
  let end = start + 1
  for (let i = end; i < lines.length && (isUnder(lines[i]) || isBlankOrComment(lines[i])); i++) if (isUnder(lines[i])) end = i + 1
  return { start, end }
}

// A key's lines: a scalar on one line; a list as `[]` when empty, else one `- item` line per item.
const keyLines = (key, value, eol) => {
  if (value == null) return []
  if (!Array.isArray(value)) return [`${key}: ${yamlScalar(value)}${eol}`]
  if (!value.length) return [`${key}: []${eol}`]
  return [`${key}:${eol}`, ...value.map((item) => `  - ${yamlScalar(item)}${eol}`)]
}

/**
 * Set or remove frontmatter keys in `text`. `changes` is `[key, value]` pairs: a string or list value
 * replaces the key's lines in place (or is appended before the closing `---` when the key is
 * missing); `null` removes the key and any lines under it. Nothing else changes.
 */
export function editFrontmatter(text, changes) {
  const bom = text.startsWith(BOM) ? BOM : ""
  const lines = linesOf(text.slice(bom.length))
  const close = lines.findIndex((l, i) => i > 0 && CLOSE_RE.test(contentOf(l)))
  if (!OPEN_RE.test(contentOf(lines[0] ?? "")) || close === -1) throw usageError("the note has no frontmatter to edit")
  const eol = eolOf(lines)
  let fm = lines.slice(1, close)
  for (const [key, value] of changes) {
    const range = keyRange(fm, key)
    const replacement = keyLines(key, value, eol)
    fm = range
      ? [...fm.slice(0, range.start), ...replacement, ...fm.slice(range.end)]
      : [...fm, ...replacement]
  }
  return bom + [lines[0], ...fm, ...lines.slice(close)].join("")
}

const blockLines = (rendered) => [BLOCK_OPEN, ...rendered.split("\n"), BLOCK_CLOSE]

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/

/** Per line, whether it is fenced code (a fence line or inside one), where `# comment` is not a heading. */
export const codeMask = (lines) => {
  let fence = null
  return lines.map((l) => {
    const open = FENCE_RE.exec(contentOf(l))?.[1]
    if (fence) {
      if (open && open[0] === fence[0] && open.length >= fence.length) fence = null
      return true
    }
    if (open) fence = open
    return Boolean(open)
  })
}

// Per line, whether it is a `#`/`##` Markdown heading outside fenced code.
const headingMask = (lines) => {
  const isCode = codeMask(lines)
  return lines.map((l, i) => !isCode[i] && SECTION_HEADING_RE.test(contentOf(l)))
}

const headingIndex = (lines, isHeading, re, from = 0) =>
  lines.findIndex((l, i) => i >= from && isHeading[i] && re.test(contentOf(l)))

// Where a new `## Tickets` section goes: after the `## Notes` section, else at the end.
const sectionIndex = (lines, isHeading) => {
  const notes = headingIndex(lines, isHeading, NOTES_HEADING_RE)
  if (notes === -1) return lines.length
  const next = headingIndex(lines, isHeading, SECTION_HEADING_RE, notes + 1)
  return next === -1 ? lines.length : next
}

const insertLines = (lines, at, inserted, eol) => {
  const before = lines.slice(0, at)
  // The line before the insertion may be the last one, without a terminator.
  if (before.length && !before[before.length - 1].endsWith("\n")) before[before.length - 1] += eol
  return [...before, ...inserted.map((l) => l + eol), ...lines.slice(at)].join("")
}

/**
 * A map's text with `rendered` as its generated `## Tickets` block. The text between the markers is
 * replaced; without markers the block goes under an existing `## Tickets` heading (any hand-written
 * list stays below it), else in a new `## Tickets` section after `## Notes`, else at the end.
 */
export function withTicketsBlock(text, rendered, path = "the map") {
  const lines = linesOf(text)
  const eol = eolOf(lines)
  const start = text.indexOf(BLOCK_OPEN)
  const end = start === -1 ? -1 : text.indexOf(BLOCK_CLOSE, start + BLOCK_OPEN.length)
  if (end !== -1) return text.slice(0, start + BLOCK_OPEN.length) + eol + rendered.split("\n").join(eol) + eol + text.slice(end)
  if (start !== -1) throw usageError(`${path} has ${BLOCK_OPEN} without ${BLOCK_CLOSE} — close the block, then rerun`)
  const isHeading = headingMask(lines)
  const heading = headingIndex(lines, isHeading, TICKETS_HEADING_RE)
  if (heading !== -1) return insertLines(lines, heading + 1, ["", ...blockLines(rendered)], eol)
  const at = sectionIndex(lines, isHeading)
  const section = ["## Tickets", "", ...blockLines(rendered), ""]
  const needsGap = at > 0 && contentOf(lines[at - 1]).trim() !== ""
  return insertLines(lines, at, needsGap ? ["", ...section] : section, eol)
}

// A fence that Dataview would run (```dataview, ```dataviewjs) — inside a callout it still renders.
const LIVE_FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*dataview(?:js)?\s*$/

/**
 * `content` lines folded in a `> [!quote]- title` callout, blank lines at either end dropped; [] when
 * nothing is left. A Dataview fence becomes a `text` fence, so the folded query is shown, not run.
 */
export function foldedCallout(title, content) {
  const first = content.findIndex((l) => l.trim() !== "")
  if (first === -1) return []
  const last = content.length - 1 - [...content].reverse().findIndex((l) => l.trim() !== "")
  const inert = (l) => l.replace(LIVE_FENCE_RE, "$1$2text")
  const quoted = content.slice(first, last + 1).map((l) => (l.trim() === "" ? ">" : `> ${inert(l)}`))
  return [`> [!quote]- ${title}`, ...quoted]
}

const headingRe = (heading) => new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`)

// The `## heading` section's line range: `start` is the heading, `end` the next `#`/`##` heading or
// the end of the text. Null when there's no such heading.
const sectionRange = (lines, heading) => {
  const isHeading = headingMask(lines)
  const start = headingIndex(lines, isHeading, headingRe(heading))
  if (start === -1) return null
  const next = headingIndex(lines, isHeading, SECTION_HEADING_RE, start + 1)
  return { start, end: next === -1 ? lines.length : next }
}

/** The text under `## heading` (to the next `#`/`##` heading), or null when the note has no such section. */
export function sectionText(text, heading) {
  const lines = linesOf(text)
  const range = sectionRange(lines, heading)
  return range && lines.slice(range.start + 1, range.end).join("")
}

/**
 * `text` with `line` appended to the `## heading` section, after its last non-blank line; a missing
 * section is added at the end. Nothing else changes.
 */
export function appendToSection(text, heading, line) {
  const lines = linesOf(text)
  const eol = eolOf(lines)
  const range = sectionRange(lines, heading)
  if (!range) {
    const gap = lines.length && contentOf(lines[lines.length - 1]).trim() !== "" ? [""] : []
    return insertLines(lines, lines.length, [...gap, `## ${heading}`, "", line], eol)
  }
  let last = range.end - 1
  while (last > range.start && contentOf(lines[last]).trim() === "") last--
  const inserted = last === range.start ? ["", line] : [line]
  const after = last + 1 === lines.length || last + 1 < range.end ? [] : [""]
  return insertLines(lines, last + 1, [...inserted, ...after], eol)
}
