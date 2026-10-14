// The seed-once notes and the manifest `wf migrate` takes to schema 2 (spec *`wf migrate`*, Q28):
//   · *Wayfinder Picks* — an old page's DQL `SORT` rule becomes the `sort:` key when every term maps
//     onto the pick vocabulary; otherwise `sort:` gets the default and the old query is kept, folded
//     and inert, under the new body. The body becomes the loader view (PICKS_BODY).
//   · *Wayfinder Config* — every CONFIG_DEFAULTS key it lacks is added with its default.
//   · the manifest — `vault_schema` is set to SCHEMA_VERSION.
// Each returns the note's new text (the same text when there is nothing to do), or null for a missing note.
import { CONFIG_DEFAULTS, DEFAULT_PICK_SORT, noteText, SCHEMA_VERSION } from "./core.mjs"
import { contentOf, editFrontmatter, eolOf, foldedCallout, linesOf } from "./edit.mjs"
import { CLOSE_RE, OPEN_RE, parseNote } from "./frontmatter.mjs"
import { PICKS_BODY } from "./picks-page.mjs"

// Missing, blank, or an empty list: the note doesn't set the key.
const isUnset = (value) => value == null || value === "" || (Array.isArray(value) && value.length === 0)

// ── Wayfinder Picks ───────────────────────────────────────────────────────

const DQL_OPEN_RE = /^```dataview\s*$/
const FENCE_CLOSE_RE = /^```\s*$/
const SORT_RE = /^\s*SORT\s+(.+?)\s*$/i
const TERM_RE = /^(.*?)(?:\s+(ASC|DESC|ASCENDING|DESCENDING))?$/i

// DQL sort expressions the vocabulary can say. `flip`: the DQL direction puts the named group last,
// where the pick key's `asc` puts it first (`type = "research" DESC` sorts research first).
const DQL_TERMS = Object.freeze([
  { re: /^file\.(?:name|link)$/i, key: "nn", flip: false },
  { re: /^length\(\s*file\.inlinks\s*\)$/i, key: "unblocks", flip: false },
  { re: /^type\s*=\s*"research"$/i, key: "afk_first", flip: true },
])

// The ```dataview blocks of a body, each as its lines (fences included).
const dqlBlocks = (body) => {
  const blocks = []
  let current = null
  for (const line of body.split(/\r?\n/)) {
    if (current) {
      current.push(line)
      if (FENCE_CLOSE_RE.test(line)) {
        blocks.push(current)
        current = null
      }
    } else if (DQL_OPEN_RE.test(line)) current = [line]
  }
  return current ? [...blocks, current] : blocks
}

// Split a SORT clause on the commas outside parentheses and quotes.
const sortTerms = (clause) => {
  const terms = []
  let depth = 0
  let quote = null
  let current = ""
  for (const ch of clause) {
    if (quote) quote = ch === quote ? null : quote
    else if (ch === '"' || ch === "'") quote = ch
    else if (ch === "(") depth++
    else if (ch === ")") depth--
    if (ch === "," && !quote && depth === 0) {
      terms.push(current.trim())
      current = ""
    } else current += ch
  }
  return [...terms, current.trim()].filter(Boolean)
}

const pickRule = (term) => {
  const [, expr, given = "ASC"] = TERM_RE.exec(term)
  const known = DQL_TERMS.find((t) => t.re.test(expr.trim()))
  if (!known) return null
  const isAsc = given.toUpperCase().startsWith("ASC") !== known.flip
  return `${known.key} ${isAsc ? "asc" : "desc"}`
}

// The `sort:` rules an old page's DQL `SORT` clause says, or null when it has none or a term doesn't map.
const sortFromDql = (blocks) => {
  const clause = blocks.flat().map((l) => SORT_RE.exec(l)?.[1]).find(Boolean)
  if (!clause) return null
  const rules = sortTerms(clause).map(pickRule)
  return rules.length && rules.every(Boolean) ? rules : null
}

const BOM = "\uFEFF"

// `text` as `{ bom, frontmatter, rest }`: the frontmatter's text (`---` to `---`, terminators kept) or
// null when it has none, and everything after it. Joined back, they give `text` unchanged.
const splitFrontmatter = (text) => {
  const bom = text.startsWith(BOM) ? BOM : ""
  const lines = linesOf(text.slice(bom.length))
  const close = lines.findIndex((l, i) => i > 0 && CLOSE_RE.test(contentOf(l)))
  if (!OPEN_RE.test(contentOf(lines[0] ?? "")) || close === -1) return { bom, frontmatter: null, rest: text.slice(bom.length) }
  return { bom, frontmatter: lines.slice(0, close + 1).join(""), rest: lines.slice(close + 1).join("") }
}

// The frontmatter with `changes` set, a new one when the note has none, in the note's line endings.
const editedFrontmatter = ({ frontmatter }, changes, eol) => editFrontmatter(frontmatter ?? `---${eol}---${eol}`, changes)

/** *Wayfinder Picks* at schema 2, or null when the vault has none. */
export function migratePicks(text, language) {
  if (text == null) return null
  const { frontmatter, body } = parseNote(text)
  const blocks = dqlBlocks(body)
  const hasSort = !isUnset(frontmatter.sort)
  const parts = splitFrontmatter(text)
  const eol = eolOf(linesOf(text))
  if (!blocks.length) return hasSort ? text : parts.bom + editedFrontmatter(parts, [["sort", [...DEFAULT_PICK_SORT]]], eol) + parts.rest
  const converted = sortFromDql(blocks)
  const head = parts.bom + (hasSort ? parts.frontmatter : editedFrontmatter(parts, [["sort", converted ?? [...DEFAULT_PICK_SORT]]], eol))
  const newBody = PICKS_BODY.split("\n").join(eol)
  if (converted) return head + newBody
  // The old queries, folded and inert (a `text` fence: Dataview doesn't run them inside the callout).
  const folded = foldedCallout(noteText("originalPickRule", language), blocks.flat())
  return `${head}${newBody}${eol}${folded.join(eol)}${eol}`
}

// ── Wayfinder Config ──────────────────────────────────────────────────────

/** *Wayfinder Config* with every CONFIG_DEFAULTS key it lacks (or leaves blank) set to its default. */
export function migrateConfig(text) {
  if (text == null) return null
  const { frontmatter } = parseNote(text)
  const missing = Object.keys(CONFIG_DEFAULTS).filter((key) => isUnset(frontmatter[key]))
  if (!missing.length) return text
  const parts = splitFrontmatter(text)
  const changes = missing.map((key) => [key, CONFIG_DEFAULTS[key]])
  return parts.bom + editedFrontmatter(parts, changes, eolOf(linesOf(text))) + parts.rest
}

// ── Manifest ──────────────────────────────────────────────────────────────

/**
 * The manifest's text with `vault_schema` at SCHEMA_VERSION, right after `schema` — where bootstrap
 * writes it, so bootstrap's next update sees the same manifest and doesn't rewrite it.
 */
export function migrateManifest(text) {
  const manifest = JSON.parse(text)
  if (manifest.vault_schema === SCHEMA_VERSION) return text
  const entries = Object.entries(manifest).filter(([key]) => key !== "vault_schema")
  const at = entries.findIndex(([key]) => key === "schema") + 1
  const ordered = [...entries.slice(0, at), ["vault_schema", SCHEMA_VERSION], ...entries.slice(at)]
  return `${JSON.stringify(Object.fromEntries(ordered), null, 2)}\n`
}
