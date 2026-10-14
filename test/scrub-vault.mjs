// Scrub a real wayfinder vault into a neutral snapshot for the `wf migrate` tests (spec Testing
// Decisions §3): real shapes — cross-repo tickets, hand-written `## Tickets` lists with and without
// gists, tables, odd frontmatter keys — with every repo, effort, slug, title and body text replaced.
//
//   node test/scrub-vault.mjs <vault> <out-dir>
//
// It only reads the vault. <out-dir> is replaced with the snapshot: the maps and tickets, *Wayfinder
// Picks* and *Wayfinder Config* (template defaults, pick rules and DQL keywords kept, everything else
// scrubbed), and a manifest with no `vault_schema` (a 0.4.x vault). Unknown frontmatter keys are
// renamed. Before writing, it checks that no original name, title or value of five characters or more,
// and no word outside the scrubbed vocabulary, appears in the output, and refuses to write if one does.
// `node --test` runs every file under test/ with no arguments; without them this does nothing.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  BLOCK_CLOSE,
  BLOCK_OPEN,
  CONFIG_DEFAULTS,
  MAP_FIELDS,
  MAP_STATUSES,
  parsePickSort,
  parseRef,
  PICK_SORT_KEYS,
  TICKET_FIELDS,
  TICKET_STATUSES,
  TICKET_TYPES,
} from "../template/_tools/lib/core.mjs"
import { CLOSE_RE, KEY_RE, OPEN_RE, parseNote } from "../template/_tools/lib/frontmatter.mjs"

const SEED_NOTES = Object.freeze(["Wayfinder Picks.md", "Wayfinder Config.md"])
const KEEP_KEYS = new Set(["kind", "type", "status", "status_since", "created", "wait_until", "runs"])
// Keys the snapshot keeps by name; any other key is renamed `key_N`, as owner keys can say too much.
const KNOWN_KEYS = new Set([...Object.keys(TICKET_FIELDS), ...Object.keys(MAP_FIELDS), ...Object.keys(CONFIG_DEFAULTS), "repo", "effort", "kind", "sort", "language"])
// Words a Dataview query line may keep; a line with any other word becomes "code".
const DQL_WORDS = new Set([
  "TABLE", "LIST", "TASK", "WITHOUT", "ID", "FROM", "WHERE", "AND", "OR", "NOT", "SORT", "GROUP", "BY", "LIMIT", "FLATTEN",
  "AS", "ASC", "DESC", "ASCENDING", "DESCENDING", "file", "name", "link", "path", "inlinks", "outlinks", "length", "all",
  "map", "b", "status", "type", "blockers", "repo", "effort", "_tools", "Ticket", "Type", "true", "false",
  ...TICKET_STATUSES, ...TICKET_TYPES, ...MAP_STATUSES,
])
const KEEP_BRANCHES = new Set(["main", "master", "develop"])
const STANDARD_HEADINGS = Object.freeze([
  "Destination", "Notes", "Tickets", "Decisions so far", "Not yet specified", "Out of scope",
  "Question", "Answer", "The Map", "Build board",
])
// Words a scrubbed line may keep: the tracker's own vocabulary and table headers, never owner text.
const VOCABULARY = new Set([...TICKET_TYPES, ...TICKET_STATUSES, "id", "title", "type", "status", "blocked_by", "ticket", "tickets", "✅", "⛔", "~~", "**"])
const FENCE_LANGS = new Set(["", "dataview", "dataviewjs", "bash", "sh", "text", "js", "ts", "json", "yaml", "sql", "diff"])
const MIN_LEAK = 5

// ── Neutral names ─────────────────────────────────────────────────────────

const letters = (n) => (n < 26 ? String.fromCharCode(97 + n) : letters(Math.floor(n / 26) - 1) + letters(n % 26))

const namer = (make) => {
  const names = new Map()
  return (original) => {
    if (!names.has(original)) names.set(original, make(names.size))
    return names.get(original)
  }
}

const makeNames = () => ({
  repo: namer((n) => `repo-${letters(n)}`),
  effort: namer((n) => `effort-${String(n + 1).padStart(2, "0")}`),
  slug: namer((n) => `slug-${String(n + 1).padStart(3, "0")}`),
  branch: namer((n) => `branch-${n + 1}`),
  title: namer((n) => `Title ${n + 1}`),
  note: namer((n) => `note-${n + 1}`),
  key: namer((n) => `key_${n + 1}`),
})

// ── Links ─────────────────────────────────────────────────────────────────

const scrubTarget = (target, names) => {
  const t = target.trim().replace(/\.md$/, "")
  const bare = /^(\d+)-(.+)$/.exec(t)
  if (bare && !t.includes("/")) return `${bare[1]}-${names.slug(bare[2])}`
  if (t === "map") return "map"
  const id = parseRef(`[[${t}]]`)
  if (id?.nn != null) return `${names.repo(id.repo)}/${names.effort(id.effort)}/issues/${String(id.nn).padStart(2, "0")}-${names.slug(id.slug)}`
  if (id) return `${names.repo(id.repo)}/${names.effort(id.effort)}/map`
  if (/^Wayfinder [A-Z][\w ]+$/.test(t)) return t
  return names.note(t)
}

const scrubAlias = (alias) => (/^\d+$/.test(alias) ? alias : "alias")

const scrubWikilink = (inner, names) => {
  const [target, ...rest] = inner.split("|")
  const [path, heading] = target.split("#")
  const scrubbed = scrubTarget(path, names) + (heading !== undefined ? "#section" : "")
  return `[[${scrubbed}${rest.length ? `|${scrubAlias(rest.join("|"))}` : ""}]]`
}

const scrubMdLink = (text, href, names) => {
  const ticket = /(?:^|\/)issues\/(\d+)-([^/]+?)\.md$/.exec(href)
  const target = ticket ? `issues/${ticket[1]}-${names.slug(ticket[2])}.md` : "url"
  return `[${/^\d+$/.test(text) ? text : "link"}](${target})`
}

// ── Body text ─────────────────────────────────────────────────────────────

const LINK_RE = /!?\[\[([^\]]+)\]\]|\[([^\]]*)\]\(([^)]*)\)/g
const SEPARATOR_RE = /( — | · |\|)/
const PREFIX_RE = /^(\s*(?:(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?|>\s?)*)/
const KEPT_WORD_RE = /^(?:\d+|\d{4}-\d{2}-\d{2}|-+|:?-+:?|[()[\]{}.,;:!?*~`'"#+=<>/\\-]+)$/

// A vocabulary word, bare or in Markdown emphasis (`**resolved**`, `~~task~~`).
const isVocabulary = (word) => VOCABULARY.has(word.toLowerCase()) || VOCABULARY.has(word.replace(/^[*~`]+|[*~`]+$/g, "").toLowerCase())

// A run of words: vocabulary, numbers and punctuation stay; any run of other words becomes one "text".
const scrubWords = (chunk) =>
  chunk
    .split(/(\s+)/)
    .map((word) => (/^\s*$/.test(word) || isVocabulary(word) || KEPT_WORD_RE.test(word) ? word : "text"))
    .join("")
    .replace(/text(?:\s+text)+/g, "text")

const scrubInline = (line, names) => {
  const links = []
  const masked = line.replace(LINK_RE, (m, wiki, text, href) => {
    links.push(wiki !== undefined ? scrubWikilink(wiki, names) : scrubMdLink(text, href, names))
    return `\u0000${links.length - 1}\u0000`
  })
  const prefix = PREFIX_RE.exec(masked)[1]
  const rest = masked
    .slice(prefix.length)
    .split(SEPARATOR_RE)
    .map((part) => (SEPARATOR_RE.test(part) ? part : part.split(/(\u0000\d+\u0000)/).map((p) => (/^\u0000\d+\u0000$/.test(p) ? p : scrubWords(p))).join("")))
    .join("")
  return (prefix + rest).replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)])
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*([\w-]*)/

const scrubHeading = (level, text, { h1 }) => {
  if (level === "#" && h1) return `# ${h1}`
  const standard = STANDARD_HEADINGS.find((h) => text === h || text.startsWith(`${h} `) || text.startsWith(`${h}(`))
  if (!standard) return `${level} Section`
  const rest = text.slice(standard.length).trim()
  return `${level} ${standard}${rest ? ` (text)` : ""}`
}

const isQueryLine = (line) => (line.match(/[\p{L}\p{N}_]+/gu) ?? []).every((w) => DQL_WORDS.has(w) || /^\d+$/.test(w))

const scrubBody = (body, names, { h1 }) => {
  let fence = null
  let isQuery = false
  return body
    .split("\n")
    .map((line) => {
      const open = FENCE_RE.exec(line)
      if (fence) {
        if (open && open[2][0] === fence[0] && open[2].length >= fence.length && !open[3]) {
          fence = null
          return line
        }
        return line.trim() === "" || (isQuery && isQueryLine(line)) ? line : "code"
      }
      if (open) {
        fence = open[2]
        isQuery = open[3] === "dataview"
        return `${open[1]}${open[2]}${FENCE_LANGS.has(open[3]) ? open[3] : ""}`
      }
      if (line === BLOCK_OPEN || line === BLOCK_CLOSE) return line
      const heading = HEADING_RE.exec(line)
      if (heading) return scrubHeading(heading[1], heading[2].trim(), { h1 })
      return scrubInline(line, names)
    })
    .join("\n")
}

// ── Frontmatter ───────────────────────────────────────────────────────────

// A scalar's new text, in the original's quoting style.
const styled = (raw, value) => {
  const text = raw.trim()
  if (text.startsWith('"')) return JSON.stringify(value)
  if (text.startsWith("'")) return `'${value.replace(/'/g, "''")}'`
  // An unchanged plain value stays plain (it read as plain); a new one is plain only when that's safe.
  const isSafePlain = value === unquote(text) || (/^[\w./ -]+$/.test(value) && !/^\d/.test(value))
  return isSafePlain ? value : JSON.stringify(value)
}

// A scalar's value as wf reads it (quotes and a trailing comment gone), always as text.
const unquote = (raw) => {
  const value = parseNote(`---\nk:\n  - ${raw.trim()}\n---\n`).frontmatter.k?.[0]
  return value == null ? raw.trim() : String(value)
}

const withLinks = (value, names) => value.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => scrubWikilink(inner, names))

// A *Wayfinder Config* or *Picks* value the snapshot may keep: a template default, a colour, a count,
// a language code, a pick rule. Anything else (a custom label) is the owner's words.
const isSeedValue = (key, value) =>
  value === String(CONFIG_DEFAULTS[key]) ||
  (key.startsWith("color_") && /^#[0-9a-fA-F]{6}$/.test(value)) ||
  (key.endsWith("_days") && /^\d+$/.test(value)) ||
  (key === "language" && /^[a-z]{2,3}$/.test(value)) ||
  (key === "sort" && parsePickSort([value]).keys.length === 1)

// The scrubbed value of one scalar under `key` in a note at `id`.
const scrubValue = (key, value, ctx) => {
  const { names } = ctx
  if (KEEP_KEYS.has(key) || value === "") return value
  if (ctx.isSeed) return isSeedValue(key, value) ? value : "value"
  if (key === "repo" || key === "target_repo" || key === "repos") return names.repo(value)
  if (key === "effort") return names.effort(value)
  if (key === "title") return ctx.title
  if (key === "base_branch" || key === "branch") return KEEP_BRANCHES.has(value) ? value : names.branch(value)
  if (/^\[\[[^\]]+\]\]$/.test(value.trim())) return withLinks(value.trim(), names)
  const ref = parseRef(value)
  if (ref && (key === "superseded_by" || key === "blocked_by")) return `${names.repo(ref.repo)}/${names.effort(ref.effort)}`
  return "value"
}

const scrubScalarRaw = (key, raw, ctx) => {
  const trimmed = raw.trim()
  if (trimmed === "" || trimmed.startsWith("#")) return raw === "" ? "" : " # comment"
  // A kept value is written back without a trailing comment, which is owner text.
  if (KEEP_KEYS.has(key)) return ` ${/^["']/.test(trimmed) ? JSON.stringify(unquote(trimmed)) : unquote(trimmed)}`
  if (trimmed.startsWith("[")) {
    const items = parseNote(`---\nk: ${trimmed}\n---\n`).frontmatter.k ?? []
    return ` [${items.map((item) => JSON.stringify(scrubValue(key, String(item), ctx))).join(", ")}]`
  }
  return ` ${styled(trimmed, scrubValue(key, unquote(trimmed), ctx))}`
}

const scrubFrontmatter = (lines, ctx) => {
  let listKey = null
  return lines.map((line) => {
    if (/^\s*#/.test(line)) return "# comment"
    const item = /^(\s*-\s+)(.*)$/.exec(line)
    if (item && listKey) return `${item[1]}${styled(item[2], scrubValue(listKey, unquote(item[2]), ctx))}`
    const kv = KEY_RE.exec(line)
    if (!kv) return line
    listKey = kv[1]
    const key = KNOWN_KEYS.has(kv[1]) ? kv[1] : ctx.names.key(kv[1])
    return `${key}:${scrubScalarRaw(kv[1], kv[2] ?? "", ctx)}`
  })
}

// ── Notes ─────────────────────────────────────────────────────────────────

const splitNote = (text) => {
  const lines = text.split("\n")
  const close = lines.findIndex((l, i) => i > 0 && CLOSE_RE.test(l))
  if (!OPEN_RE.test(lines[0] ?? "") || close === -1) return { fm: null, body: text }
  return { fm: lines.slice(1, close), closeLine: lines[close], body: lines.slice(close + 1).join("\n") }
}

/** *Wayfinder Picks* or *Config*: template defaults, pick rules and DQL keywords kept, owner text scrubbed. */
const scrubSeed = (text, names) => {
  const { fm, closeLine, body } = splitNote(text)
  const scrubbedBody = scrubBody(body, names, { h1: null })
  return fm ? ["---", ...scrubFrontmatter(fm, { names, isSeed: true }), closeLine, scrubbedBody].join("\n") : scrubbedBody
}

const scrubNote = (path, text, names) => {
  const id = parseRef(path)
  const isMap = id.nn == null
  const title = isMap ? `Map ${names.effort(id.effort)}` : names.title(path)
  const newPath = isMap
    ? `${names.repo(id.repo)}/${names.effort(id.effort)}/map.md`
    : `${names.repo(id.repo)}/${names.effort(id.effort)}/issues/${path.split("/").pop().split("-")[0]}-${names.slug(id.slug)}.md`
  const { fm, closeLine, body } = splitNote(text)
  const ctx = { names, title }
  const scrubbedBody = scrubBody(body, names, { h1: isMap ? title : null })
  const out = fm ? ["---", ...scrubFrontmatter(fm, ctx), closeLine, scrubbedBody].join("\n") : scrubbedBody
  return { path: newPath, text: out }
}

/**
 * Scrub `notes` (`[{ path, text }]`, the vault's maps and tickets) into `{ files: { path: text },
 * originals }`: neutral names, the same shapes. `originals` are the strings that must not survive.
 */
export function scrubNotes(notes, seeds = {}) {
  const names = makeNames()
  const sorted = [...notes].sort((a, b) => (a.path < b.path ? -1 : 1))
  // Names in path order first, so the snapshot's numbering follows the vault's layout.
  for (const { path } of sorted) {
    const id = parseRef(path)
    names.repo(id.repo)
    names.effort(id.effort)
    if (id.slug) names.slug(id.slug)
  }
  const files = Object.fromEntries([
    ...sorted.map(({ path, text }) => scrubNote(path, text, names)).map((n) => [n.path, n.text]),
    ...Object.entries(seeds).map(([path, text]) => [path, scrubSeed(text, names)]),
  ])
  const originals = new Set()
  for (const { path, text } of sorted) {
    const id = parseRef(path)
    for (const s of [id.repo, id.effort, id.slug]) if (s) originals.add(s)
    const { fm } = splitNote(text)
    for (const line of fm ?? []) {
      const kv = KEY_RE.exec(line)
      const raw = kv?.[2] ?? /^\s*-\s+(.*)$/.exec(line)?.[1]
      if (!raw || (kv && KEEP_KEYS.has(kv[1]))) continue
      const value = raw.trim().startsWith("[") ? (parseNote(`---\nk: ${raw.trim()}\n---\n`).frontmatter.k ?? []) : [unquote(raw)]
      for (const part of value) originals.add(String(part).replace(/^\[\[|\]\]$/g, ""))
    }
  }
  const leaks = [...originals].filter((s) => s.length >= MIN_LEAK && !KEEP_BRANCHES.has(s) && !/^\d+$|^\d{4}-\d{2}-\d{2}$/.test(s))
  return { files, originals: leaks }
}

// What the snapshot may say: the names scrubNotes makes, the words it writes in place of owner text,
// the tracker's vocabulary and section headings. Frontmatter keys are checked apart, as keys.
const NEUTRAL_RE = /^(?:repo-[a-z]+|effort-\d+|slug-\d+|\d+[a-z]?-slug-\d+|note-\d+|branch-\d+|\d+[a-z]?|\d{4}-\d{2}-\d{2})$/
const NEUTRAL_WORDS = new Set(
  [
    "title", "map", "text", "code", "value", "alias", "link", "url", "comment", "section", "issues", "md", "wf", "x",
    "wayfinder", "picks", "config", "dashboard", "efforts", "effort", "wayfinder-config", "asc", "desc", ...PICK_SORT_KEYS, ...DQL_WORDS,
    ...Object.values(CONFIG_DEFAULTS).flatMap((v) => String(v).match(/[\p{L}\p{N}_-]+/gu) ?? []),
    ...MAP_STATUSES, ...KEEP_BRANCHES, ...FENCE_LANGS, ...STANDARD_HEADINGS.flatMap((h) => h.split(" ")), ...VOCABULARY,
  ].map((w) => w.toLowerCase()),
)
const WORD_RE = /[\p{L}\p{N}_-]*[\p{L}\p{N}][\p{L}\p{N}_-]*/gu

const isNeutralKey = (key) => KNOWN_KEYS.has(key) || /^key_\d+$/.test(key)
const isNeutralWord = (w) => NEUTRAL_RE.test(w) || NEUTRAL_WORDS.has(w.toLowerCase()) || /^[0-9a-fA-F]{6}$|^[a-z]{2,3}$/.test(w)

// Words (and frontmatter keys) of a scrubbed note outside the neutral set, as `path: word`.
const unknownWords = (path, text) => {
  const { fm, body } = splitNote(text)
  const keys = (fm ?? []).map((line) => KEY_RE.exec(line)?.[1]).filter((k) => k && !isNeutralKey(k))
  const values = (fm ?? []).map((line) => line.replace(/^\s*[A-Za-z_][\w .-]*?\s*:/, ""))
  const words = [...path.split(/[/. ]/), ...([...values, body].join("\n").match(WORD_RE) ?? [])]
  return [...keys, ...words.filter((w) => !isNeutralWord(w))].map((w) => `${path}: ${w}`)
}

/**
 * What the scrubbed files still say that they shouldn't: any of `originals`, and any word outside
 * the neutral set. Empty when the snapshot is clean.
 */
export function leaksIn(files, originals) {
  const all = Object.entries(files).map(([path, text]) => `${path}\n${text}`).join("\n")
  const unknown = new Set(Object.entries(files).flatMap(([path, text]) => unknownWords(path, text)))
  return [...originals.filter((s) => all.includes(s)), ...unknown]
}

// ── CLI ───────────────────────────────────────────────────────────────────

const walk = (vault, rel = "") =>
  readdirSync(join(vault, rel), { withFileTypes: true }).flatMap((e) => {
    const path = rel ? `${rel}/${e.name}` : e.name
    if (e.name.startsWith(".") || (!rel && e.name.startsWith("_"))) return []
    if (e.isDirectory()) return walk(vault, path)
    return e.isFile() && e.name.endsWith(".md") ? [path] : []
  })

const isTrackerPath = (path) => {
  const id = parseRef(path)
  return Boolean(id) && (id.nn != null || path.endsWith("/map.md"))
}

const readIfThere = (path) => {
  try {
    return readFileSync(path, "utf8")
  } catch (e) {
    if (e.code === "ENOENT") return null
    throw e
  }
}

function main([vaultArg, outArg]) {
  const vault = resolve(vaultArg)
  const out = resolve(outArg)
  const notes = walk(vault).filter(isTrackerPath).map((path) => ({ path, text: readFileSync(join(vault, path), "utf8") }))
  const seeds = Object.fromEntries(SEED_NOTES.map((rel) => [rel, readIfThere(join(vault, rel))]).filter(([, text]) => text !== null))
  const { files, originals } = scrubNotes(notes, seeds)
  const leaks = leaksIn(files, originals)
  if (leaks.length) {
    process.stderr.write(`scrub-vault: ${leaks.length} original strings survived — nothing written:\n${leaks.map((l) => `  ${l}`).join("\n")}\n`)
    process.exitCode = 1
    return
  }
  rmSync(out, { recursive: true, force: true })
  const write = (rel, text) => {
    mkdirSync(dirname(join(out, rel)), { recursive: true })
    writeFileSync(join(out, rel), text)
  }
  for (const [rel, text] of Object.entries(files)) write(rel, text)
  write(".wayfinder-template.json", `${JSON.stringify({ schema: 1 }, null, 2)}\n`)
  process.stdout.write(`scrub-vault: ${Object.keys(files).length} notes and a manifest → ${out}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.length > 3) main(process.argv.slice(2))
