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
    blockedBy: fm.blocked_by === "" ? null : (fm.blocked_by ?? null),
    supersededBy: fm.superseded_by ?? null,
    // The text between the `wf:tickets` markers, when the caller read the body: null = no markers,
    // undefined = not read (drift isn't checked).
    ticketsBlock: note.ticketsBlock,
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
 * Build the read model from raw notes (`{ path, frontmatter, ticketsBlock? }`). Returns
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
 * Where a ticket stands, as the pages group it: `ready` (open, nothing blocking), `blocked` (open,
 * a blocker unresolved or dangling), `claimed`, `waiting` or `resolved`. A status outside the enum → null.
 */
export function ticketState(index, ticketOrRef) {
  const t = ticketOf(index, ticketOrRef)
  if (t.status === "open") return isBlocked(index, t) ? "blocked" : "ready"
  return TICKET_STATUSES.includes(t.status) ? t.status : null
}

/** Still to do: open, claimed or waiting. Resolved tickets and status typos are not pending. */
export function isPending(index, ticketOrRef) {
  return PENDING.has(ticketOf(index, ticketOrRef).status)
}

/**
 * Ready tickets on active maps, in pick order. `repo` matches the home repo or
 * `target_repo`; `from` (`repo/effort`) is the context for `same_effort`; `sort` defaults to the
 * Picks default.
 */
export function frontier(index, { repo, from, sort } = {}) {
  const ready = [...index.tickets.values()].filter(
    (t) =>
      (!repo || t.repo === repo || t.targetRepo === repo) &&
      index.maps.get(t.effortKey)?.status === "active" &&
      ticketState(index, t) === "ready",
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

const BLOCK_OPEN = "<!-- wf:tickets -->"
const BLOCK_CLOSE = "<!-- /wf:tickets -->"

/**
 * A map note's `ticketsBlock` input: the text between the `wf:tickets` markers in its body, or null
 * when they are missing. Here so the Node store and the Obsidian loader extract it the same way.
 */
export function ticketsBlockOf(body) {
  const start = body.indexOf(BLOCK_OPEN)
  const end = start === -1 ? -1 : body.indexOf(BLOCK_CLOSE, start + BLOCK_OPEN.length)
  return end === -1 ? null : body.slice(start + BLOCK_OPEN.length, end)
}

// ── Lint ───────────────────────────────────────────────────────────────────

const SEVERITY_ORDER = Object.freeze({ error: 0, warn: 1 })

const finding = (severity, rule, ref, message, fix = null) => ({ severity, rule, ref, message, fix })
const byFinding = (a, b) =>
  SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
  compare(a.ref, b.ref) ||
  compare(a.rule, b.rule) ||
  compare(a.message, b.message)

// Every note the index holds, as `{ kind, ref, fields, frontmatter, status }`.
const indexedNotes = (index) => [
  ...[...index.maps.values()].map((m) => ({ ...m, kind: "map", ref: m.key, fields: MAP_FIELDS })),
  ...[...index.tickets.values()].map((t) => ({ ...t, kind: "ticket", fields: TICKET_FIELDS })),
]

const LEGACY_KEYS = Object.freeze(["repo", "effort"])
const LEGACY_HINT = "identity comes from the path; preview with wf migrate"
// Where a fix needs the owner's words. Unquoted, so a fix run verbatim is a shell syntax error
// rather than a placeholder note that would satisfy the rule.
const NOTE_ARG = "--note <note>"

const isBlank = (value) => value == null || value === ""
const quote = (value) => JSON.stringify(value)
const isDateLike = (value) => value instanceof Date || typeof value?.toISODate === "function"
const isNested = (value) => value !== null && typeof value === "object" && !isDateLike(value)
const isWholeNumber = (value) => (typeof value === "number" ? Number.isInteger(value) : /^\d+$/.test(String(value)))
const isOutsideSubset = (value) => (Array.isArray(value) ? value.some(isNested) : isNested(value))

// What is wrong with one present value of a known field, or null. Nested values are `yaml-subset`'s.
const valueProblem = (f, value) => {
  if (isOutsideSubset(value)) return null
  if (f.shape === "scalar" && Array.isArray(value)) return "a list; expected a single value"
  if (f.shape === "list" && !Array.isArray(value)) return `${quote(value)}; expected a list`
  if (Array.isArray(value)) return null
  if (f.values && !f.values.includes(value)) return `${quote(value)}; expected ${f.values.join(" | ")}`
  if (f.format === "date" && !isoDate(value)) return `${quote(value)}; expected YYYY-MM-DD`
  if (f.format === "integer" && !isWholeNumber(value)) return `${quote(value)}; expected a whole number`
  return null
}

const invalidValues = (note) =>
  Object.entries(note.fields)
    .filter(([name]) => !isBlank(note.frontmatter[name]))
    .map(([name, f]) => [name, valueProblem(f, note.frontmatter[name])])
    .filter(([, problem]) => problem)
    .map(([name, problem]) => finding("error", "invalid-value", note.ref, `${name} is ${problem}`))

// `status_note` on a waiting ticket is `waiting-without-note`'s, which carries a fix.
const isWaitingNote = (note, name) => note.kind === "ticket" && note.status === "waiting" && name === "status_note"

const missingFields = (note) =>
  requiredFields(note.kind, note.status)
    .filter((name) => !isWaitingNote(note, name) && isBlank(note.frontmatter[name]))
    .map((name) => {
      const when = note.fields[name].required === true ? "" : ` when status is ${note.status}`
      return finding("error", "missing-field", note.ref, `${name} is required${when}`)
    })

const waitingWithoutNote = (note) =>
  note.kind === "ticket" && note.status === "waiting" && isBlank(note.frontmatter.status_note)
    ? [
        finding(
          "error",
          "waiting-without-note",
          note.ref,
          `waiting without status_note — release it, then wait again with ${NOTE_ARG}`,
          `wf release ${note.ref}`,
        ),
      ]
    : []

const keyFindings = (note) =>
  Object.entries(note.frontmatter).flatMap(([name, value]) => {
    if (LEGACY_KEYS.includes(name))
      return [finding("warn", "legacy-field", note.ref, `legacy field ${name} — ${LEGACY_HINT}`, "wf migrate --yes")]
    if (isOutsideSubset(value))
      return [finding("error", "yaml-subset", note.ref, `${name} is outside the YAML subset (flat scalars and lists of strings)`)]
    return hasOwn(note.fields, name) ? [] : [finding("warn", "unknown-key", note.ref, `unknown frontmatter key ${name}`)]
  })

// A `map.md` the index skipped (no `kind: map`) in an effort that has tickets is a map missing `kind`.
const unreadMaps = (index) =>
  index.skipped.flatMap(({ path }) => {
    const id = parseRef(path)
    const effort = id && index.efforts.get(formatRef(id))
    if (!effort?.tickets.length || effort.map) return []
    return [finding("error", "missing-field", effort.key, `kind: map is required — ${path} is not read as a map`)]
  })

const noteFindings = (note) => [
  ...invalidValues(note),
  ...missingFields(note),
  ...waitingWithoutNote(note),
  ...keyFindings(note),
]

// A nested entry is `yaml-subset`'s. `wf block --remove` takes the dangling link as written.
const danglingBlockers = (t) =>
  t.blockers.flatMap((ref, i) => {
    const raw = t.rawBlockers[i]
    if (ref != null || isNested(raw)) return []
    const isLink = typeof raw === "string" && WIKILINK_RE.test(raw.trim())
    const fix = isLink ? `wf block ${t.ref} ${quote(raw)} --remove` : null
    return [finding("error", "dangling-blocker", t.ref, `blocker ${quote(raw)} resolves to no ticket`, fix)]
  })

// The shortest blocker path from `start` back to itself, as refs (start first), or null.
const cycleThrough = (index, start) => {
  const parent = new Map()
  const queue = [start]
  while (queue.length) {
    const ref = queue.shift()
    for (const next of [...new Set(index.tickets.get(ref).blockers)].filter(Boolean).sort(compare)) {
      if (next === start) return [...pathTo(parent, ref, start), start]
      if (parent.has(next) || !index.tickets.has(next)) continue
      parent.set(next, ref)
      queue.push(next)
    }
  }
  return null
}

const pathTo = (parent, ref, start) => {
  const path = [ref]
  while (path[0] !== start) path.unshift(parent.get(path[0]))
  return path
}

// Tarjan's strongly connected components over `graph` (Map ref → refs), iteratively — a long
// blocker chain must not overflow the stack.
const stronglyConnected = (graph) => {
  let counter = 0
  const order = new Map()
  const low = new Map()
  const stack = []
  const onStack = new Set()
  const groups = []
  const visit = (v) => {
    order.set(v, counter)
    low.set(v, counter++)
    stack.push(v)
    onStack.add(v)
  }
  for (const root of graph.keys()) {
    if (order.has(root)) continue
    visit(root)
    const work = [{ v: root, i: 0 }]
    while (work.length) {
      const frame = work[work.length - 1]
      const w = graph.get(frame.v)[frame.i++]
      if (w !== undefined) {
        if (!order.has(w)) {
          visit(w)
          work.push({ v: w, i: 0 })
        } else if (onStack.has(w)) low.set(frame.v, Math.min(low.get(frame.v), order.get(w)))
        continue
      }
      work.pop()
      if (work.length) low.set(work[work.length - 1].v, Math.min(low.get(work[work.length - 1].v), low.get(frame.v)))
      if (low.get(frame.v) !== order.get(frame.v)) continue
      const group = []
      let top
      do {
        top = stack.pop()
        onStack.delete(top)
        group.push(top)
      } while (top !== frame.v)
      groups.push(group.sort(compare))
    }
  }
  return groups
}

// Each cycle group (strongly connected blockers) once, at its smallest ref, with the shortest cycle
// through that ref; the fix cuts that cycle's first edge. Fixing one cycle may leave another in
// the group, which the next lint reports.
const blockerCycles = (index) => {
  const graph = new Map(
    [...index.tickets.values()].map((t) => [t.ref, [...new Set(t.blockers)].filter((r) => index.tickets.has(r))]),
  )
  return stronglyConnected(graph)
    .filter((group) => group.length > 1 || graph.get(group[0]).includes(group[0]))
    .map((group) => {
      const cycle = cycleThrough(index, group[0])
      const extra = group.length > new Set(cycle).size ? ` (cycle group: ${group.join(", ")})` : ""
      const message = `blocker cycle ${cycle.join(" → ")}${extra}`
      return finding("error", "blocker-cycle", group[0], message, `wf block ${cycle[0]} ${cycle[1]} --remove`)
    })
}

const duplicateNns = (index) =>
  index.duplicates.map(({ ref, path }) => {
    const nn = ref.split("#").pop()
    const kept = index.tickets.get(ref).path
    return finding("error", "duplicate-nn", ref, `${path} reuses NN ${nn} (kept ${kept})`)
  })

const BLOCK_MESSAGES = Object.freeze({
  cleared: (target) => `blocked_by ${target} has cleared — remove blocked_by`,
  dead: (target) => `blocked_by ${target} sits in a paused or dropped map and can't clear`,
})

const mapBlockFindings = (index, m) => {
  const block = mapBlockState(index, m)
  if (block?.state === "dangling" && typeof block.raw === "string")
    return [finding("error", "dangling-blocker", m.key, `blocked_by ${quote(block.raw)} resolves to no map or ticket`)]
  const message = BLOCK_MESSAGES[block?.state]
  return message ? [finding("warn", "map-blocked-by", m.key, message(block.target))] : []
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

// `done`, `paused` and `dropped` claim nothing moves; a ticket that moved after `status_since` says otherwise.
const mapStatusFindings = ({ map: m, tickets }) => {
  const pending = tickets.filter((t) => PENDING.has(t.status))
  const reopen = `wf map-status ${m.key} active`
  if (m.status === "done" && pending.length) {
    const verb = pending.length === 1 ? "is" : "are"
    const refs = pending.map((t) => t.ref).join(", ")
    const message = `done, but ${plural(pending.length, "ticket")} ${verb} still pending: ${refs}`
    return [finding("error", "done-map-pending", m.key, message, reopen)]
  }
  const isKnown = tickets.every((t) => TICKET_STATUSES.includes(t.status))
  if (m.status === "active" && tickets.length && isKnown && !pending.length)
    return [finding("warn", "map-finished", m.key, "active with no pending tickets → done", `wf map-status ${m.key} done`)]
  if (!["done", ...STOPPED_MAP].includes(m.status) || !m.statusSince) return []
  const movers = tickets.filter((t) => t.statusSince > m.statusSince)
  if (!movers.length) return []
  const last = movers.reduce((a, b) => (b.statusSince > a.statusSince ? b : a))
  const message = `${m.status} since ${m.statusSince}, but ${last.ref} moved on ${last.statusSince}`
  return [finding("warn", "lying-map-status", m.key, message, reopen)]
}

const STALE_MAP_FINDINGS = Object.freeze({
  idle: (m, days, config) =>
    finding(
      "warn",
      "idle-map",
      m.key,
      `active, but nothing moved for ${days} days (stale_days ${configValue(config, "stale_days")})`,
      `wf map-status ${m.key} paused ${NOTE_ARG}`,
    ),
  paused: (m, days, config) =>
    finding(
      "warn",
      "stale-paused-map",
      m.key,
      `paused for ${days} days (paused_stale_days ${configValue(config, "paused_stale_days")}) — resume or drop it`,
      `wf map-status ${m.key} dropped ${NOTE_ARG}`,
    ),
})

const timeFindings = (index, { today, config }) => [
  ...staleMaps(index, { today, config }).map(({ map: m, reason, days }) => STALE_MAP_FINDINGS[reason](m, days, config)),
  ...staleClaims(index, { today, config }).map(({ ticket: t, days }) =>
    finding(
      "warn",
      "stale-claim",
      t.ref,
      `claimed by ${t.claimedBy ?? "nobody"} for ${days} days (claim_stale_days ${configValue(config, "claim_stale_days")})`,
      `wf release ${t.ref}`,
    ),
  ),
  ...overdueWaits(index, { today }).map(({ ticket: t, days }) =>
    finding("warn", "overdue-wait", t.ref, `wait_until ${t.waitUntil} passed ${plural(days, "day")} ago`, `wf release ${t.ref}`),
  ),
]

const normalizeBlock = (text) => String(text).replace(/\r\n?/g, "\n").trim()

const blockDrift = (index, m, language) => {
  if (m.ticketsBlock === undefined) return []
  const fix = `wf lint --fix ${m.key}`
  if (m.ticketsBlock === null) return [finding("warn", "tickets-block-drift", m.key, "no generated ## Tickets block", fix)]
  const drifted = normalizeBlock(m.ticketsBlock) !== normalizeBlock(renderTicketsBlock(index, m.key, language))
  return drifted ? [finding("warn", "tickets-block-drift", m.key, "## Tickets block differs from the rendering", fix)] : []
}

// *Wayfinder Picks* isn't an effort, so its findings carry the note's name as the ref.
const PICKS_REF = "Wayfinder Picks"

const unknownSortKeys = (sort) =>
  parsePickSort(sort).unknown.map((rule) =>
    finding("error", "unknown-sort-key", PICKS_REF, `unknown sort rule ${quote(rule)} — keys: ${PICK_SORT_KEYS.join(", ")}`),
  )

/**
 * Every content rule over the read model (spec *Lint rules*): `Finding[]` of
 * `{ severity: "error"|"warn", rule, ref, message, fix }`, errors first, then by ref. `fix` is the
 * `wf` command that resolves the finding, or null when no verb does. `config` is *Wayfinder Config*
 * (thresholds, `language` for the block rendering); `sort` is *Wayfinder Picks* `sort:`.
 */
export function lint(index, { today, config, sort } = {}) {
  requireToday(today)
  const findings = [
    ...indexedNotes(index).flatMap(noteFindings),
    ...unreadMaps(index),
    ...[...index.tickets.values()].flatMap(danglingBlockers),
    ...blockerCycles(index),
    ...duplicateNns(index),
    ...[...index.maps.values()].flatMap((m) => mapBlockFindings(index, m)),
    ...[...index.efforts.values()].filter((e) => e.map).flatMap(mapStatusFindings),
    ...[...index.maps.values()].flatMap((m) => blockDrift(index, m, config?.language)),
    ...unknownSortKeys(sort),
    ...timeFindings(index, { today, config }),
  ]
  return findings.sort(byFinding)
}
