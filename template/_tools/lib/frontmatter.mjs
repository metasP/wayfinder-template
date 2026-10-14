// Frontmatter reader for the YAML subset (spec *Frontmatter schema* rules): flat `key: value` scalars
// and lists of strings, block (`- item`) or flow (`[a, "b"]`). Anything else — nested maps, anchors,
// aliases, tags, block or multi-line scalars, nested lists — is reported with its line, never guessed.
// Plain scalars read as null, booleans and decimal numbers whose spelling survives the round trip
// (`3`, `1.5`); everything else stays text (`007`, `1.50`, dates — as Dataview's `file.frontmatter`
// hands them). List items are always text.

export const OPEN_RE = /^---\s*$/
export const CLOSE_RE = /^(?:---|\.\.\.)\s*$/
export const KEY_RE = /^([A-Za-z_][\w .-]*?)\s*:(?:\s+(.*))?$/
const ITEM_RE = /^\s*-(?:\s+(.*))?$/
const NULLS = new Set(["", "~", "null", "Null", "NULL"])
const BOOLS = new Map([["true", true], ["True", true], ["TRUE", true], ["false", false], ["False", false], ["FALSE", false]])

const SUBSET = "outside the YAML subset (flat scalars and lists of strings)"

class SubsetError extends Error {}
const fail = (what) => {
  throw new SubsetError(`${what} — ${SUBSET}`)
}

// A number only when reading it loses nothing: `3` and `1.5`, not `007`, `1.50` or `1e3`.
const isPlainNumber = (text) => Number.isFinite(Number(text)) && String(Number(text)) === text

// A plain (unquoted) scalar's text, with a ` #` comment dropped.
const plainText = (raw) => {
  const text = raw.replace(/(^|\s)#.*$/, "").trim()
  if (/^[&*!]/.test(text)) fail("anchor, alias or tag")
  if (/^[|>]/.test(text)) fail("block scalar")
  if (/^[{]/.test(text)) fail("nested map")
  if (/^[@`]/.test(text)) fail(`reserved indicator ${text[0]}`)
  if (/^-(\s|$)/.test(text)) fail("nested list")
  if (/:(\s|$)/.test(text)) fail("nested map")
  return text
}

const typed = (text) => {
  if (NULLS.has(text)) return null
  if (BOOLS.has(text)) return BOOLS.get(text)
  return isPlainNumber(text) ? Number(text) : text
}

const assertOnlyComment = (rest) => {
  if (rest.trim() !== "" && !/^\s+#/.test(rest)) fail(`unexpected text after a quoted scalar: ${rest.trim()}`)
}

// A quoted scalar at the start of `raw`: `{ value, rest }`.
const quotedScalar = (raw) => {
  if (raw[0] === "'") {
    const m = /^'((?:[^']|'')*)'/.exec(raw)
    if (!m) fail("unterminated single-quoted scalar")
    return { value: m[1].replace(/''/g, "'"), rest: raw.slice(m[0].length) }
  }
  const m = /^"((?:[^"\\]|\\.)*)"/.exec(raw)
  if (!m) fail("unterminated double-quoted scalar")
  try {
    // YAML allows a literal tab inside double quotes; JSON doesn't.
    return { value: JSON.parse(m[0].replace(/\t/g, "\\t")), rest: raw.slice(m[0].length) }
  } catch {
    return fail("unsupported escape in a double-quoted scalar")
  }
}

/**
 * One scalar (a whole `key: value` value or a list item). A plain one is typed unless `asText`.
 * Lists inside it are out of subset.
 */
const scalar = (raw, { asText = false } = {}) => {
  const text = raw.trim()
  if (text[0] === "[") fail("nested list")
  if (text[0] !== '"' && text[0] !== "'") {
    const plain = plainText(text)
    return asText && plain !== "" ? plain : typed(plain)
  }
  const { value, rest } = quotedScalar(text)
  assertOnlyComment(rest)
  return value
}

// Split flow-list contents on commas outside quotes.
const flowItems = (inner) => {
  const items = []
  let current = ""
  let quote = null
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (quote) {
      current += ch
      if (ch === "\\" && quote === '"') current += inner[++i] ?? ""
      else if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
    } else if (ch === ",") {
      items.push(current)
      current = ""
    } else if (ch === "[" || ch === "{") {
      fail(ch === "[" ? "nested list" : "nested map")
    } else if (ch === "]") {
      return { items: [...items, current], rest: inner.slice(i + 1) }
    } else current += ch
  }
  return fail("unterminated flow list")
}

const flowList = (raw) => {
  const { items, rest } = flowItems(raw.slice(1))
  assertOnlyComment(rest)
  const trimmed = items.map((s) => s.trim())
  // `[]` and a trailing comma (`[a, b,]`) leave one empty last item.
  if (trimmed[trimmed.length - 1] === "") trimmed.pop()
  if (trimmed.includes("")) fail("empty flow-list item")
  return trimmed.map(listItem)
}

const listItem = (raw) => {
  const value = scalar(raw, { asText: true })
  if (value === null) fail("empty list item")
  return value
}

const value = (raw) => (raw.trim()[0] === "[" ? flowList(raw.trim()) : scalar(raw))

// The frontmatter lines and where the body starts, or null when the note has no frontmatter.
const split = (lines) => {
  if (!OPEN_RE.test(lines[0] ?? "")) return null
  const close = lines.findIndex((line, i) => i > 0 && CLOSE_RE.test(line))
  return close === -1 ? { unclosed: true } : { fm: lines.slice(1, close), bodyStart: close + 1 }
}

const isSkippable = (line) => line.trim() === "" || /^\s*#/.test(line)

// Parse frontmatter lines (file line of the first = `firstLine`). Collects every error; the indented
// lines right after an error belong to the value that failed, so they aren't reported again.
const parseLines = (fmLines, firstLine) => {
  // A Map, so a key like `__proto__` is a plain key; `Object.fromEntries` defines it as one too.
  const fields = new Map()
  const errors = []
  let listKey = null
  let afterError = false
  fmLines.forEach((line, i) => {
    const at = firstLine + i
    try {
      if (isSkippable(line) || (afterError && /^\s/.test(line))) return
      afterError = false
      const item = ITEM_RE.exec(line)
      if (item && listKey) {
        fields.set(listKey, [...(fields.get(listKey) ?? []), listItem(item[1] ?? "")])
        return
      }
      listKey = null
      if (/^\s/.test(line)) fail("indented line (nested map or multi-line scalar)")
      const kv = KEY_RE.exec(line)
      if (!kv) fail(line.startsWith("- ") ? "list item without a key" : "not a `key: value` line")
      const [, key, raw = ""] = kv
      if (fields.has(key)) fail(`duplicate key ${key}`)
      if (raw.trim() === "" || /^#/.test(raw.trim())) {
        fields.set(key, null)
        listKey = key
      } else fields.set(key, value(raw))
    } catch (e) {
      if (!(e instanceof SubsetError)) throw e
      errors.push({ line: at, message: e.message })
      listKey = null
      afterError = true
    }
  })
  return { frontmatter: Object.fromEntries(fields), errors }
}

/**
 * Read a note's text into `{ frontmatter, body, errors: [{ line, message }] }`. A note without
 * frontmatter has `{}`. Line numbers are 1-based file lines.
 */
export function parseNote(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/)
  const parts = split(lines)
  if (!parts) return { frontmatter: {}, body: lines.join("\n"), errors: [] }
  if (parts.unclosed) return { frontmatter: {}, body: "", errors: [{ line: 1, message: "frontmatter is never closed with ---" }] }
  const { frontmatter, errors } = parseLines(parts.fm, 2)
  return { frontmatter, body: lines.slice(parts.bodyStart).join("\n"), errors }
}

export const BLOCK_OPEN = "<!-- wf:tickets -->"
export const BLOCK_CLOSE = "<!-- /wf:tickets -->"

/** The text between the `wf:tickets` markers in a map body, or null when they are missing. */
export function ticketsBlockOf(body) {
  const start = body.indexOf(BLOCK_OPEN)
  const end = start === -1 ? -1 : body.indexOf(BLOCK_CLOSE, start + BLOCK_OPEN.length)
  return end === -1 ? null : body.slice(start + BLOCK_OPEN.length, end)
}
