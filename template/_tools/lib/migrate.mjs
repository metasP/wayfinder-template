// What `wf migrate` changes to take a vault to schema 2 (spec *`wf migrate` (Q28, Q29)*), as pure text
// edits — the verb prints them as a diff or applies them through the write pipeline. For each note:
//   · ticket — `repo`/`effort` go; an old `repo` that isn't the path's repo becomes `target_repo`;
//     a missing `title` comes from the map's hand-written `## Tickets` line (the text after the last
//     ` — `, or the `title` cell of a table row), else from the slug.
//   · map — `repo`/`effort` go; a missing `title` comes from the `# H1`; a hand-written `## Tickets`
//     section becomes the generated block with the old list folded whole under it; a map without the
//     section gets the block after `## Notes`.
// *Wayfinder Picks*, *Wayfinder Config* and the manifest are migrate-seeds.mjs. Every step leaves an
// already-migrated note as it is, so a second run plans nothing.
import { BLOCK_CLOSE, BLOCK_OPEN, buildIndex, noteText, parseRef, renderTicketsBlock, TICKET_STATUSES, TICKET_TYPES } from "./core.mjs"
import { codeMask, contentOf, editFrontmatter, eolOf, foldedCallout, linesOf, withTicketsBlock } from "./edit.mjs"
import { usageError } from "./errors.mjs"
import { OPEN_RE, parseNote } from "./frontmatter.mjs"
import { migrateConfig, migrateManifest, migratePicks } from "./migrate-seeds.mjs"
import { CONFIG_NOTE, MANIFEST, PICKS_NOTE } from "./store.mjs"

const LEGACY_KEYS = Object.freeze(["repo", "effort"])
// `## Tickets`, `### Tickets` and `## Tickets (anything)` — the headings hand-written lists sit under.
const HAND_TICKETS_RE = /^(#{2,3})\s+Tickets\b/
const HEADING_RE = /^(#{1,6})\s/
// A closing `#` run counts only after a space: `# Learn C#` keeps its `#`.
const H1_RE = /^#\s+(.+?)(?:\s+#+)?\s*$/
const GIST_SEPARATOR = " — "
// What a list line's last segment may hold that is no title: a type, a status, marks and dates.
const NOT_A_TITLE = new Set([...TICKET_TYPES, ...TICKET_STATUSES])
const NOISE_RE = /\d{4}-\d{2}-\d{2}|[*~`✅⛔()·]/g

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)
const isBlank = (value) => value == null || value === ""
const isMapPath = (path) => path === "map.md" || path.endsWith("/map.md")
const effortKey = ({ repo, effort }) => `${repo}/${effort}`

// The changes that drop the legacy identity fields a note carries.
const legacyChanges = (fm) => LEGACY_KEYS.filter((key) => hasOwn(fm, key)).map((key) => [key, null])

const hasFrontmatter = (text) => OPEN_RE.test(text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0])

const withChanges = (text, changes) => (changes.length ? editFrontmatter(text, changes) : text)

/**
 * The hand-written tickets section of a map: `{ start, end, level, heading, content }` (line indexes
 * into `linesOf(text)`; `heading` and `content` without terminators), or null when there is none or
 * the map already has the generated block. A `##` section wins over a `###` one; it runs to the next
 * heading at its level or above, outside fenced code.
 */
const handWrittenSection = (text) => {
  if (text.includes(BLOCK_OPEN)) return null
  const lines = linesOf(text)
  const isCode = codeMask(lines)
  const levelAt = (i) => (isCode[i] ? null : (HEADING_RE.exec(contentOf(lines[i]))?.[1].length ?? null))
  const sectionLevel = (i) => (levelAt(i) !== null && HAND_TICKETS_RE.test(contentOf(lines[i])) ? levelAt(i) : null)
  const start = [2, 3].map((level) => lines.findIndex((_, i) => sectionLevel(i) === level)).find((i) => i !== -1)
  if (start === undefined) return null
  const level = levelAt(start)
  let end = start + 1
  while (end < lines.length && !(levelAt(end) !== null && levelAt(end) <= level)) end++
  return { start, end, level, heading: contentOf(lines[start]), content: lines.slice(start + 1, end).map(contentOf) }
}

// ── Titles ────────────────────────────────────────────────────────────────

// A table row's cells, without the outer pipes.
const cellsOf = (row) =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim())

const isTableRow = (line) => line.trim().startsWith("|")

// The `title` cell of a table row, read against the header row of its table.
const tableTitle = (content, i) => {
  let header = i
  while (header > 0 && isTableRow(content[header - 1])) header--
  const column = cellsOf(content[header]).findIndex((c) => c.toLowerCase() === "title")
  return column === -1 || header === i ? null : (cellsOf(content[i])[column] ?? null)
}

// The text after the last ` — ` of a list line, unless all it says is a type, a status or a date.
const gistTitle = (line) => {
  const at = line.lastIndexOf(GIST_SEPARATOR)
  if (at === -1) return null
  const gist = line.slice(at + GIST_SEPARATOR.length).trim()
  const words = gist.replace(NOISE_RE, " ").trim().toLowerCase().split(/\s+/).filter(Boolean)
  return words.every((w) => NOT_A_TITLE.has(w)) ? null : gist
}

// The note a line's first link points at, as its file name (`NN-slug`): `[[NN-slug]]`,
// `[[…/NN-slug|alias]]` or `[x](…/NN-slug.md)`. A line lists the ticket its first link names; later
// links are mentions (`- [[02-b]] — after [[01-a]]` lists 02, not 01).
const FIRST_LINK_RE = /\[\[([^\]|#]+)[^\]]*\]\]|\[[^\]]*\]\(([^)]+)\)/
const firstLinkName = (line) => {
  const m = FIRST_LINK_RE.exec(line)
  const target = m?.[1] ?? m?.[2]
  return target ? target.trim().split("/").pop().replace(/\.md$/, "") : null
}

/** A ticket's title from its map's hand-written list (null when the list doesn't give one). */
const listedTitle = (section, name) => {
  if (!section) return null
  const i = section.content.findIndex((l) => firstLinkName(l) === name)
  if (i === -1) return null
  const line = section.content[i]
  const title = isTableRow(line) ? tableTitle(section.content, i) : gistTitle(line)
  return isBlank(title) ? null : title
}

const slugTitle = (slug) => slug.replace(/-/g, " ")

// ── Tickets ───────────────────────────────────────────────────────────────

const migrateTicket = (note, section) => {
  const fm = note.frontmatter
  if (!hasFrontmatter(note.text))
    throw usageError(`${note.path} has no frontmatter — give it one (or move it out of issues/), then rerun wf migrate`)
  const changes = legacyChanges(fm)
  if (!isBlank(fm.repo) && String(fm.repo) !== note.id.repo && isBlank(fm.target_repo))
    changes.push(["target_repo", String(fm.repo)])
  if (isBlank(fm.title)) changes.push(["title", listedTitle(section, note.name) ?? slugTitle(note.id.slug)])
  return withChanges(note.text, changes)
}

// ── Maps ──────────────────────────────────────────────────────────────────

const h1Of = (body) => {
  const lines = linesOf(body)
  const isCode = codeMask(lines)
  const i = lines.findIndex((l, n) => !isCode[n] && H1_RE.test(contentOf(l)))
  return i === -1 ? null : H1_RE.exec(contentOf(lines[i]))[1]
}

// The hand-written section replaced by the (still empty) generated block, the old list folded under it.
const replaceSection = (text, section, language) => {
  const lines = linesOf(text)
  const eol = eolOf(lines)
  const own = `${"#".repeat(section.level)} Tickets`
  // A heading that said more (`## Tickets (7 of 12 done)`) is kept with the list.
  const gap = section.content[0]?.trim() === "" ? [] : [""]
  const folded = section.heading.trim() === own ? section.content : [section.heading, ...gap, ...section.content]
  const callout = foldedCallout(noteText("originalList", language), folded)
  const replacement = [
    own,
    "",
    BLOCK_OPEN,
    BLOCK_CLOSE,
    "",
    ...callout,
    ...(callout.length ? [""] : []),
  ]
  const before = lines.slice(0, section.start).join("")
  const after = lines.slice(section.end).join("")
  return before + replacement.map((l) => l + eol).join("") + after
}

const mapFrontmatterChanges = (note) => {
  const changes = legacyChanges(note.frontmatter)
  if (isBlank(note.frontmatter.title)) changes.push(["title", h1Of(note.body) ?? note.id.effort])
  return changes
}

// A map's frontmatter and section, before its block is rendered (that needs every ticket migrated).
const migrateMapText = (note, language) => {
  if (!note.isMap) return withChanges(note.text, legacyChanges(note.frontmatter))
  const text = withChanges(note.text, mapFrontmatterChanges(note))
  const section = handWrittenSection(text)
  return section ? replaceSection(text, section, language) : text
}

// ── The plan ──────────────────────────────────────────────────────────────

const readNotes = (notes) =>
  notes.map(({ path, text }) => {
    const { frontmatter, body } = parseNote(text)
    const isMapFile = isMapPath(path)
    return {
      path,
      text,
      frontmatter,
      body,
      id: parseRef(path),
      name: path.split("/").pop().replace(/\.md$/, ""),
      isMapFile,
      // A `map.md` without `kind: map` isn't read as a map: only its legacy fields go.
      isMap: isMapFile && frontmatter.kind === "map",
    }
  })

/**
 * The edits that take a vault to schema 2: `[{ path, text }]` for every file that changes, in path
 * order. `notes` are the tracker notes (`{ path, text }`); `picks`, `config` are those notes' texts
 * (null when missing) and `manifest` is the manifest's text.
 */
export function planMigration({ notes, picks = null, config = null, manifest }) {
  const read = readNotes(notes)
  const language = config == null ? undefined : (parseNote(config).frontmatter.language ?? undefined)
  const sections = new Map(read.filter((n) => n.isMap).map((n) => [effortKey(n.id), handWrittenSection(n.text)]))
  const migrated = read.map((n) => ({
    note: n,
    text: n.isMapFile ? migrateMapText(n, language) : migrateTicket(n, sections.get(effortKey(n.id))),
  }))
  const index = buildIndex(migrated.map(({ note, text }) => ({ path: note.path, frontmatter: parseNote(text).frontmatter })))
  const withBlocks = migrated.map(({ note, text }) => ({
    path: note.path,
    before: note.text,
    text: note.isMap ? withTicketsBlock(text, renderTicketsBlock(index, effortKey(note.id), language), note.path) : text,
  }))
  const seeds = [
    { path: PICKS_NOTE, before: picks, text: migratePicks(picks, language) },
    { path: CONFIG_NOTE, before: config, text: migrateConfig(config) },
    { path: MANIFEST, before: manifest, text: migrateManifest(manifest) },
  ]
  return [...withBlocks, ...seeds]
    .filter((e) => e.text != null && e.text !== e.before)
    .map(({ path, text }) => ({ path, text }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
