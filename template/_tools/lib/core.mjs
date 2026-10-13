// Wayfinder read-model core — the one definition of what the vault's state means.
//
// Shape is the contract (spec docs/specs/ticket-store.md, *Modules* §1):
//   · ONE ES module, NO import statements, NO I/O, no globals beyond its input.
//   · Node loads it with `import`; Obsidian with `import(app.vault.adapter.getResourcePath(...))`.
//     A relative import is not proven under Obsidian's resource-URL loading, so the schema lives here.
//   · Input is `notes: Array<{ path, frontmatter }>` with raw frontmatter values — what Dataview's
//     `file.frontmatter` and the Node store both produce. Identity comes from the path, never frontmatter.

// ── Schema (vault schema version 2) ────────────────────────────────────────

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)

const deepFreeze = (value) => {
  if (value && typeof value === "object") for (const v of Object.values(value)) deepFreeze(v)
  return Object.freeze(value)
}

export const SCHEMA_VERSION = 2

export const TICKET_STATUSES = deepFreeze(["open", "claimed", "waiting", "resolved"])
export const MAP_STATUSES = deepFreeze(["draft", "active", "paused", "done", "dropped"])
export const TICKET_TYPES = deepFreeze(["research", "prototype", "grilling", "task"])

// `required`: true, false, or the statuses in which the field is required.
// `repo` and `effort` are not fields — identity comes from the path (Q4, Q13).
export const TICKET_FIELDS = deepFreeze({
  type: { required: true, shape: "scalar", values: TICKET_TYPES },
  status: { required: true, shape: "scalar", values: TICKET_STATUSES },
  status_since: { required: true, shape: "scalar", format: "date" },
  title: { required: true, shape: "scalar" },
  blockers: { required: true, shape: "list", format: "wikilink" },
  status_note: { required: ["waiting"], shape: "scalar" },
  wait_until: { required: false, shape: "scalar", format: "date" },
  claimed_by: { required: ["claimed"], shape: "scalar" },
  target_repo: { required: false, shape: "scalar" },
})

export const MAP_FIELDS = deepFreeze({
  kind: { required: true, shape: "scalar", values: ["map"] },
  title: { required: true, shape: "scalar" },
  status: { required: true, shape: "scalar", values: MAP_STATUSES },
  status_since: { required: true, shape: "scalar", format: "date" },
  status_note: { required: ["paused", "dropped"], shape: "scalar" },
  runs: { required: false, shape: "scalar", format: "integer" },
  repos: { required: false, shape: "list" },
  blocked_by: { required: false, shape: "scalar", format: "wikilink" },
  superseded_by: { required: false, shape: "scalar" },
  base_branch: { required: false, shape: "scalar" },
  created: { required: false, shape: "scalar", format: "date" },
})

const FIELDS = { ticket: TICKET_FIELDS, map: MAP_FIELDS }

const ofKind = (tables, kind) => {
  if (!hasOwn(tables, kind)) throw new TypeError(`unknown note kind "${kind}" (ticket | map)`)
  return tables[kind]
}

/** The fields a `ticket` or `map` must carry in the given status. */
export function requiredFields(kind, status) {
  return Object.entries(ofKind(FIELDS, kind))
    .filter(([, f]) => f.required === true || (Array.isArray(f.required) && f.required.includes(status)))
    .map(([name]) => name)
}

// One row per verb (Q24, Q25). `from: null` creates the note; `flag` selects a variant of the verb.
export const TICKET_TRANSITIONS = deepFreeze([
  { verb: "new", from: null, to: "open" },
  { verb: "claim", from: ["open"], to: "claimed" },
  { verb: "release", from: ["claimed", "waiting"], to: "open" },
  { verb: "wait", from: ["open", "claimed"], to: "waiting" },
  { verb: "resolve", from: ["claimed", "waiting"], to: "resolved" },
  { verb: "resolve", flag: "--out-of-scope", from: ["open", "claimed"], to: "resolved" },
])

const otherMapStatuses = (to) => MAP_STATUSES.filter((s) => s !== to)

export const MAP_TRANSITIONS = deepFreeze([
  { verb: "chart", from: null, to: "draft" },
  { verb: "map-status", from: otherMapStatuses("active"), to: "active" },
  { verb: "map-status", from: otherMapStatuses("paused"), to: "paused" },
  { verb: "map-status", from: otherMapStatuses("dropped"), to: "dropped" },
  { verb: "map-status", from: otherMapStatuses("done"), to: "done" },
])

const TRANSITIONS = { ticket: TICKET_TRANSITIONS, map: MAP_TRANSITIONS }

/**
 * The transition row for `verb` from status `from` (null when creating), or null when the verb
 * isn't allowed there. `flag` picks a verb variant (`--out-of-scope`); `to` picks the target of
 * `map-status`.
 */
export function findTransition(kind, verb, from, { flag, to } = {}) {
  const fits = (row) =>
    row.verb === verb &&
    (row.flag ?? null) === (flag ?? null) &&
    (to == null || row.to === to) &&
    (row.from === null ? from == null : row.from.includes(from))
  return ofKind(TRANSITIONS, kind).find(fits) ?? null
}

// ── Identity ───────────────────────────────────────────────────────────────

const TICKET_PATH_RE = /^(.+)\/([^/#]+)\/issues\/(\d+)-([^/]+?)(?:\.md)?$/
const MAP_PATH_RE = /^(.+)\/([^/#]+)\/map(?:\.md)?$/
const REF_RE = /^(.+)\/([^/#]+)#(\d+)$/
const EFFORT_RE = /^([^/_.#][^#]*)\/([^/#]+)$/
const BARE_TICKET_RE = /^(\d+)-([^/]+)$/
const WIKILINK_RE = /^\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/

const identity = (repo, effort, nn = null, slug = null) => ({ repo, effort, nn, slug })
const isVaultRoot = (repo) => !/^[_.]/.test(repo)

/**
 * Parse a vault path, a ref (`repo/effort#NN`, `repo/effort`) or a wikilink into
 * `{ repo, effort, nn, slug }` (`nn`/`slug` null when the input doesn't carry them).
 * A bare `[[NN-slug]]` resolves only against `home` (`{ repo, effort }`). Anything else → null.
 */
export function parseRef(input, { home } = {}) {
  if (typeof input !== "string") return null
  const raw = input.trim()
  const link = WIKILINK_RE.exec(raw)
  const target = link ? link[1].trim() : raw

  const bare = link && BARE_TICKET_RE.exec(target)
  if (bare) return home ? identity(home.repo, home.effort, Number(bare[1]), bare[2]) : null

  const t = TICKET_PATH_RE.exec(target)
  if (t) return isVaultRoot(t[1]) ? identity(t[1], t[2], Number(t[3]), t[4]) : null
  const m = MAP_PATH_RE.exec(target)
  if (m) return isVaultRoot(m[1]) ? identity(m[1], m[2]) : null
  if (link) return null

  const r = REF_RE.exec(target)
  if (r) return isVaultRoot(r[1]) ? identity(r[1], r[2], Number(r[3])) : null
  const e = EFFORT_RE.exec(target)
  return e && !target.endsWith(".md") ? identity(e[1], e[2]) : null
}

/** `repo/effort#NN` for a ticket (NN at least two digits), `repo/effort` for a map. */
export function formatRef({ repo, effort, nn = null }) {
  const key = `${repo}/${effort}`
  return nn == null ? key : `${key}#${String(nn).padStart(2, "0")}`
}

// ── Values ─────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?![\d])/

const isLeap = (y) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
const daysInMonth = (y, m) => (m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31)
const pad2 = (n) => String(n).padStart(2, "0")
const ymd = (y, m, d) =>
  m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m) ? `${y}-${pad2(m)}-${pad2(d)}` : null

const isUtcMidnight = (d) =>
  d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0

/**
 * `YYYY-MM-DD` from a string, a JS `Date` or a Luxon-like DateTime (anything with `toISODate()`).
 * The Node store hands strings; Dataview may hand Luxon or Date values. A `Date` at UTC midnight is
 * a date-only value (how YAML dates parse) and keeps its UTC date; any other `Date` is an instant,
 * read as the local calendar day. Impossible dates (`2026-02-30`) and anything else → null.
 */
export function isoDate(value) {
  if (value == null) return null
  if (typeof value.toISODate === "function") return isoDate(value.toISODate())
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return isUtcMidnight(value)
      ? ymd(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
      : ymd(value.getFullYear(), value.getMonth() + 1, value.getDate())
  }
  if (typeof value !== "string") return null
  const m = ISO_DATE_RE.exec(value.trim())
  return m ? ymd(Number(m[1]), Number(m[2]), Number(m[3])) : null
}

const asList = (value) => (value == null ? [] : Array.isArray(value) ? value : [value])
const optionalString = (value) => (value == null || value === "" ? null : String(value))
const stemOf = (path) => path.replace(/\.md$/, "")
// Plain code-unit order: deterministic in every runtime, unlike `localeCompare`.
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const byNn = (a, b) => a.nn - b.nn || compare(a.effortKey, b.effortKey)
const byEffortThenNn = (a, b) => compare(a.effortKey, b.effortKey) || a.nn - b.nn

// ── Index ──────────────────────────────────────────────────────────────────

const mapRecord = (id, note) => {
  const fm = note.frontmatter ?? {}
  return {
    ...id,
    key: formatRef(id),
    path: note.path,
    kind: fm.kind ?? null,
    title: optionalString(fm.title),
    status: fm.status ?? null,
    statusSince: isoDate(fm.status_since),
    statusNote: optionalString(fm.status_note),
    blockedBy: fm.blocked_by ?? null,
    supersededBy: fm.superseded_by ?? null,
    frontmatter: fm,
  }
}

const ticketRecord = (id, note) => {
  const fm = note.frontmatter ?? {}
  return {
    ...id,
    ref: formatRef(id),
    effortKey: formatRef({ repo: id.repo, effort: id.effort }),
    name: stemOf(note.path).split("/").pop(),
    path: note.path,
    type: fm.type ?? null,
    status: fm.status ?? null,
    statusSince: isoDate(fm.status_since),
    title: optionalString(fm.title),
    rawBlockers: asList(fm.blockers),
    blockers: [],
    statusNote: optionalString(fm.status_note),
    waitUntil: isoDate(fm.wait_until),
    claimedBy: optionalString(fm.claimed_by),
    targetRepo: optionalString(fm.target_repo),
    frontmatter: fm,
  }
}

// The full vault stem a wikilink points at — a bare `[[name]]` sits in the home effort's `issues/`,
// a link with a `/` is a full path. Anything that isn't a wikilink → null.
const linkStem = (raw, homeKey) => {
  const link = typeof raw === "string" ? WIKILINK_RE.exec(raw.trim()) : null
  if (!link) return null
  const target = stemOf(link[1].trim())
  return target.includes("/") ? target : `${homeKey}/issues/${target}`
}

// A ticket blocker resolves to the ref of a ticket that exists, or null (blocking, fail closed).
const resolveTicketLink = (raw, home, byStem) => byStem.get(linkStem(raw, home.effortKey))?.ref ?? null

/**
 * Build the read model from raw notes. Returns
 * `{ maps: Map<repo/effort, Map>, tickets: Map<repo/effort#NN, Ticket>, efforts: Map<repo/effort,
 * { repo, effort, key, map, tickets }>, duplicates: [{ ref, path }], skipped: [{ path, reason }] }`.
 * Notes are taken in path order, so a duplicate NN keeps the first path and reports the others.
 * A `map.md` without `kind: map` is not a map; it lands in `skipped`.
 */
export function buildIndex(notes) {
  const sorted = [...notes].sort((a, b) => compare(a.path, b.path))
  const maps = new Map()
  const parsed = []
  const duplicates = []
  const skipped = []
  const seen = new Set()
  for (const note of sorted) {
    const id = parseRef(note.path)
    if (!id || !note.path.endsWith(".md")) continue
    if (id.nn == null) {
      // The repo part may contain `/`, so any `…/x/map.md` matches the path — `kind` decides.
      if (note.frontmatter?.kind === "map") maps.set(formatRef(id), mapRecord(id, note))
      else skipped.push({ path: note.path, reason: "map.md without kind: map" })
      continue
    }
    const t = ticketRecord(id, note)
    if (seen.has(t.ref)) {
      duplicates.push({ ref: t.ref, path: t.path })
      continue
    }
    seen.add(t.ref)
    parsed.push(t)
  }

  const byStem = new Map(parsed.map((t) => [stemOf(t.path), t]))
  const tickets = new Map(
    parsed.map((t) => [t.ref, { ...t, blockers: t.rawBlockers.map((b) => resolveTicketLink(b, t, byStem)) }]),
  )
  return { maps, tickets, efforts: groupEfforts(maps, tickets), duplicates, skipped }
}

const groupEfforts = (maps, tickets) => {
  const efforts = new Map()
  const effortOf = (repo, effort) => {
    const key = formatRef({ repo, effort })
    if (!efforts.has(key)) efforts.set(key, { repo, effort, key, map: maps.get(key) ?? null, tickets: [] })
    return efforts.get(key)
  }
  for (const m of maps.values()) effortOf(m.repo, m.effort)
  for (const t of [...tickets.values()].sort(byNn)) effortOf(t.repo, t.effort).tickets.push(t)
  return efforts
}

// ── Queries ────────────────────────────────────────────────────────────────

const ticketOf = (index, ticketOrRef) => {
  const t = typeof ticketOrRef === "string" ? index.tickets.get(ticketOrRef) : ticketOrRef
  if (!t) throw new TypeError(`no ticket ${JSON.stringify(ticketOrRef)} in the index`)
  return t
}

/** Blocker refs that still block: not resolved, or not resolvable at all (null — fail closed). */
export function openBlockers(index, ticketOrRef) {
  const t = ticketOf(index, ticketOrRef)
  return t.blockers.filter((ref) => ref == null || index.tickets.get(ref)?.status !== "resolved")
}

export function isBlocked(index, ticketOrRef) {
  return openBlockers(index, ticketOrRef).length > 0
}

/**
 * Open, unblocked tickets on active maps, in pick order. `repo` matches the home repo or
 * `target_repo`; `from` (`repo/effort`) is the context for `same_effort`; `sort` defaults to the
 * Picks default.
 */
export function frontier(index, { repo, from, sort } = {}) {
  const ready = [...index.tickets.values()].filter(
    (t) =>
      (!repo || t.repo === repo || t.targetRepo === repo) &&
      t.status === "open" &&
      index.maps.get(t.effortKey)?.status === "active" &&
      !isBlocked(index, t),
  )
  return pickOrder(index, ready, sort, { from })
}

/** How many open tickets list this one in `blockers` (real edges — inlinks don't count). */
export function unblocks(index, ticketOrRef) {
  const ref = typeof ticketOrRef === "string" ? ticketOrRef : ticketOrRef.ref
  return unblockCounts(index).get(ref) ?? 0
}

const unblockCounts = (index) => {
  const counts = new Map()
  for (const t of index.tickets.values()) {
    if (t.status !== "open") continue
    for (const ref of new Set(t.blockers)) if (ref != null) counts.set(ref, (counts.get(ref) ?? 0) + 1)
  }
  return counts
}

// ── Pick order (Wayfinder Picks `sort:`) ───────────────────────────────────

export const DEFAULT_PICK_SORT = Object.freeze(["unblocks desc", "nn asc"])

// Each key maps a ticket to a number; `asc` puts the smaller first. The `*_first` keys score the
// named group 0, so their default `asc` puts that group first and `desc` puts it last.
const PICK_KEYS = Object.freeze({
  unblocks: (t, ctx) => ctx.counts.get(t.ref) ?? 0,
  afk_first: (t) => (t.type === "research" ? 0 : 1),
  same_effort: (t, ctx) => (ctx.from && t.effortKey === ctx.from ? 0 : 1),
  nn: (t) => t.nn,
})
export const PICK_SORT_KEYS = Object.freeze(Object.keys(PICK_KEYS))

const PICK_RULE_RE = /^\s*(\w+)(?:\s+(asc|desc))?\s*$/

/** Split pick rules into known `{ key, dir }` pairs and the `unknown` rule strings (a lint error). */
export function parsePickSort(rules) {
  const keys = []
  const unknown = []
  for (const rule of asList(rules)) {
    const m = typeof rule === "string" ? PICK_RULE_RE.exec(rule) : null
    if (m && hasOwn(PICK_KEYS, m[1])) keys.push({ key: m[1], dir: m[2] ?? "asc" })
    else unknown.push(rule)
  }
  return { keys, unknown }
}

/**
 * Sort tickets by the pick rules (`["key asc|desc", …]`). Unknown keys are ignored; when no known
 * key is left (empty, missing or all typos) DEFAULT_PICK_SORT applies. `from` (`repo/effort`) gives
 * `same_effort` its context. Ties fall back to effort, then numeric NN. Returns a new array.
 */
export function pickOrder(index, tickets, rules, { from } = {}) {
  const given = parsePickSort(rules).keys
  const parsed = given.length ? given : parsePickSort(DEFAULT_PICK_SORT).keys
  const ctx = { counts: unblockCounts(index), from }
  const cmp = (a, b) => {
    for (const { key, dir } of parsed) {
      const d = PICK_KEYS[key](a, ctx) - PICK_KEYS[key](b, ctx)
      if (d !== 0) return dir === "desc" ? -d : d
    }
    return byEffortThenNn(a, b)
  }
  return [...tickets].sort(cmp)
}

// ── Time-based queries ─────────────────────────────────────────────────────

/** *Wayfinder Config* keys the core reads, with their defaults. A bad value falls back per key. */
export const DEFAULT_CONFIG = Object.freeze({ claim_stale_days: 3, stale_days: 14, paused_stale_days: 30 })

const DAY_MS = 24 * 60 * 60 * 1000
const PENDING = new Set(["open", "claimed", "waiting"])

// Only a number, or a numeric string, counts — `Number(null)`, `Number("")` and `Number(false)` are 0,
// which would turn a blank Config key into "everything is stale".
const configValue = (config, key) => {
  const raw = config?.[key]
  const isNumeric = typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "")
  const v = isNumeric ? Number(raw) : NaN
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_CONFIG[key]
}

const requireToday = (today) => {
  const iso = isoDate(today)
  if (!iso) throw new TypeError("`today` is required as YYYY-MM-DD (the core never reads the clock)")
  return iso
}

const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)
const later = (a, b) => (a == null ? b : b == null ? a : a > b ? a : b)

/** Claims older than `claim_stale_days`: `[{ ticket, days }]` by effort, then NN. */
export function staleClaims(index, { today, config } = {}) {
  const now = requireToday(today)
  const limit = configValue(config, "claim_stale_days")
  return [...index.tickets.values()]
    .filter((t) => t.status === "claimed" && t.statusSince)
    .map((ticket) => ({ ticket, days: daysBetween(ticket.statusSince, now) }))
    .filter((s) => s.days > limit)
    .sort((a, b) => byEffortThenNn(a.ticket, b.ticket))
}

/** Waiting tickets whose `wait_until` has passed: `[{ ticket, days }]` (days overdue) by effort, then NN. */
export function overdueWaits(index, { today } = {}) {
  const now = requireToday(today)
  return [...index.tickets.values()]
    .filter((t) => t.status === "waiting" && t.waitUntil)
    .map((ticket) => ({ ticket, days: daysBetween(ticket.waitUntil, now) }))
    .filter((s) => s.days > 0)
    .sort((a, b) => byEffortThenNn(a.ticket, b.ticket))
}

/**
 * Maps that claim a state they aren't in: `[{ map, reason, days }]` in key order.
 *   · `idle`   — `active`, with pending tickets not all `waiting`, and nothing moved (the latest
 *                ticket `status_since` or the map's own, whichever is newer) for more than `stale_days`.
 *   · `paused` — `paused` for more than `paused_stale_days`.
 * A map with `blocked_by` is waiting on something, not stale — its block state reports it instead.
 */
export function staleMaps(index, { today, config } = {}) {
  const now = requireToday(today)
  const stale = []
  for (const effort of [...index.efforts.values()].sort((a, b) => compare(a.key, b.key))) {
    const m = effort.map
    if (!m || m.blockedBy != null) continue
    const found = staleReason(m, effort.tickets, now, config)
    if (found) stale.push({ map: m, ...found })
  }
  return stale
}

const staleReason = (m, tickets, now, config) => {
  if (m.status === "paused" && m.statusSince) {
    const days = daysBetween(m.statusSince, now)
    return days > configValue(config, "paused_stale_days") ? { reason: "paused", days } : null
  }
  if (m.status !== "active") return null
  const pending = tickets.filter((t) => PENDING.has(t.status))
  if (!pending.length || pending.every((t) => t.status === "waiting")) return null
  const moved = tickets.map((t) => t.statusSince).reduce(later, m.statusSince)
  if (!moved) return null
  const days = daysBetween(moved, now)
  return days > configValue(config, "stale_days") ? { reason: "idle", days } : null
}

// ── Map blocked_by ─────────────────────────────────────────────────────────

const MAP_STEM_RE = /\/map$/
const STOPPED_MAP = new Set(["paused", "dropped"])

const blockTarget = (index, raw, homeKey) => {
  const stem = linkStem(raw, homeKey)
  const id = stem && parseRef(stem)
  if (!id) return null
  const key = formatRef({ repo: id.repo, effort: id.effort })
  if (id.nn == null) return MAP_STEM_RE.test(stem) && index.maps.has(key) ? { map: index.maps.get(key) } : null
  const t = index.tickets.get(formatRef(id))
  return t && stemOf(t.path) === stem ? { ticket: t, owner: index.maps.get(key) } : null
}

/**
 * What a map's `blocked_by` points at, and whether it still moves:
 * `{ state, target, raw }` with state `cleared` (ticket resolved / map done), `dead` (the target is,
 * or lives in, a paused or dropped map), `dangling` (no such note) or `waiting`. Null without
 * `blocked_by`. Accepts a map record or its `repo/effort` key.
 */
export function mapBlockState(index, mapOrKey) {
  const m = typeof mapOrKey === "string" ? index.maps.get(mapOrKey) : mapOrKey
  if (!m || m.blockedBy == null) return null
  const raw = m.blockedBy
  const hit = blockTarget(index, raw, m.key)
  if (!hit) return { state: "dangling", target: null, raw }
  if (hit.map) return { state: blockedOnMap(hit.map.status), target: hit.map.key, raw }
  const state = hit.ticket.status === "resolved" ? "cleared" : STOPPED_MAP.has(hit.owner?.status) ? "dead" : "waiting"
  return { state, target: hit.ticket.ref, raw }
}

const blockedOnMap = (status) => (status === "done" ? "cleared" : STOPPED_MAP.has(status) ? "dead" : "waiting")

// ── Rendering ──────────────────────────────────────────────────────────────

// Text the core writes into notes follows *Wayfinder Config* `language:` (Q36); English otherwise.
const EMPTY_TICKETS = Object.freeze({ en: "_No tickets yet._", th: "_ยังไม่มีใบ_" })

const languageOf = (language) => String(language ?? "en").toLowerCase().split(/[-_]/)[0]

const ticketLine = (index, t) => {
  const title = t.title ?? t.slug.replace(/-/g, " ")
  const blocked = t.status !== "resolved" && isBlocked(index, t)
  return `- [[${t.name}]] · ${t.type ?? "?"} · ${t.status ?? "?"} · ${title}${blocked ? " ⛔" : ""}`
}

/**
 * The generated `## Tickets` lines for one effort (`repo/effort`), between — not including — the
 * `<!-- wf:tickets -->` markers: `- [[NN-slug]] · <type> · <status> · <title>` in NN order, plus
 * ` ⛔` when an unresolved ticket is blocked. `wf` writes it and lint compares against it.
 */
export function renderTicketsBlock(index, effort, language) {
  const tickets = index.efforts.get(effort)?.tickets ?? []
  if (!tickets.length) return EMPTY_TICKETS[languageOf(language)] ?? EMPTY_TICKETS.en
  return tickets.map((t) => ticketLine(index, t)).join("\n")
}
