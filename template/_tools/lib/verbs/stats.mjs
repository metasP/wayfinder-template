// `wf stats <repo/effort>` — how long a map took, read from the vault's git history, for estimating the next
// one. Wall-clock claim → resolve counts the hours a ticket sat waiting on a person and the nights between
// sessions, so the worked time cuts both: a stretch with no ticket claimed and one waiting, and any gap over
// GAP_HOURS with no commit on the map. A ticket claimed and resolved inside a minute (claimed only so
// resolve would take it) says nothing about effort and is left out of the per-ticket numbers. Those numbers
// read every ticket now waiting or resolved: a build ticket waits on its PR's merge once the work is done.
import { dirname } from "node:path"
import { usageError } from "../errors.mjs"
import { runGit } from "../git.mjs"
import { mapArg } from "./map.mjs"

export const GAP_HOURS = 4
const GAP = GAP_HOURS * 3600
const INSTANT = 60
const MOVES = new Set(["claim", "release", "wait", "resolve"])

// Interval sets: sorted, disjoint `[start, end)` pairs in seconds.
const union = (intervals) => {
  const out = []
  for (const [a, b] of [...intervals].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])) {
    const last = out.at(-1)
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}
const minus = (set, cut) =>
  set.flatMap(([a, b]) => {
    const out = []
    let from = a
    for (const [c, d] of cut) {
      if (d <= from || c >= b) continue
      if (c > from) out.push([from, c])
      from = Math.max(from, d)
    }
    return from < b ? [...out, [from, b]] : out
  })
const overlap = (set, other) => minus(set, minus(set, other))
const length = (set) => set.reduce((sum, [a, b]) => sum + (b - a), 0)

// The nearest-rank quantile of a sorted, non-empty list.
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]

/**
 * The numbers of one map from its commits, oldest first: `{ at, subject }` with `at` in epoch seconds, every
 * commit that touched the map's folder. Moves are read from `wf(<verb>): <key>#NN` subjects.
 */
export function mapStats(key, commits, tickets) {
  const prefix = `: ${key}#`
  // nn → the ticket's claimed and waiting stretches, its state and since when, its first claim and last resolve
  const runs = new Map()
  for (const { at, subject } of commits) {
    const verb = /^wf\(([a-z-]+)\)/.exec(subject)?.[1]
    const i = subject.indexOf(prefix)
    if (!MOVES.has(verb) || i === -1) continue
    const nn = subject.slice(i + prefix.length).match(/^\d+/)?.[0]
    if (!nn) continue
    const t = runs.get(nn) ?? { active: [], waiting: [], state: "open", since: at, claimedAt: null, resolvedAt: null }
    if (t.state === "claimed") t.active.push([t.since, at])
    if (t.state === "waiting") t.waiting.push([t.since, at])
    if (verb === "claim") t.claimedAt ??= at
    if (verb === "resolve") t.resolvedAt = at
    t.state = { claim: "claimed", release: "open", wait: "waiting", resolve: "resolved" }[verb]
    t.since = at
    runs.set(nn, t)
  }

  const times = commits.map((c) => c.at)
  const gaps = union(times.slice(1).map((b, i) => [times[i], b]).filter(([a, b]) => b - a > GAP))
  const all = [...runs.values()]
  const claims = all.map((t) => t.claimedAt).filter((x) => x != null)
  const resolves = all.map((t) => t.resolvedAt).filter((x) => x != null)
  const resolvedCount = tickets.filter((t) => t.status === "resolved").length
  const base = { ref: key, tickets: tickets.length, resolved: resolvedCount, claimed: claims.length, gap_hours: GAP_HOURS }
  if (!claims.length || !resolves.length) return { ...base, span: null, per_ticket: null }

  const span = [[Math.min(...claims), Math.max(...resolves)]]
  const active = union(all.flatMap((t) => t.active))
  // Waiting counts only while nothing else on the map is claimed, and a gap is cut once, as a gap.
  const waiting = minus(minus(union(all.flatMap((t) => t.waiting)), active), gaps)
  const gapCut = length(overlap(span, gaps))
  const waitCut = length(overlap(span, waiting))
  const wall = span[0][1] - span[0][0]
  const work = all
    .filter((t) => t.state === "waiting" || t.state === "resolved")
    .map((t) => length(minus(union(t.active), gaps)))
  const counted = work.filter((s) => s >= INSTANT).sort((a, b) => a - b)
  return {
    ...base,
    span: { from: span[0][0], to: span[0][1], wall, waiting: waitCut, gaps: gapCut, worked: wall - waitCut - gapCut },
    per_ticket: {
      n: counted.length,
      instant: work.length - counted.length,
      median: counted.length ? quantile(counted, 0.5) : null,
      p75: counted.length ? quantile(counted, 0.75) : null,
      max: counted.length ? counted.at(-1) : null,
    },
  }
}

const duration = (s) => {
  if (s == null) return "—"
  const m = Math.round(s / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`
}
const stamp = (at) => {
  const d = new Date(at * 1000)
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const textOf = (s) => {
  const head = `${s.ref} — ${s.tickets} tickets · ${s.resolved} resolved · ${s.claimed} claimed through wf`
  if (!s.span) return `${head}
no span yet: needs a wf claim and a wf resolve on this map`
  const { span: x, per_ticket: p } = s
  const rows = [
    [`span ${stamp(x.from)} → ${stamp(x.to)} (first claim → last resolve)`, duration(x.wall)],
    ["  − waiting, with no ticket claimed", duration(x.waiting)],
    [`  − gaps over ${s.gap_hours}h with no commit on the map`, duration(x.gaps)],
    ["  = worked", duration(x.worked)],
  ]
  const width = Math.max(...rows.map(([label]) => label.length))
  const perTicket = p.n
    ? `per ticket waiting or resolved (claimed time, gaps cut): n=${p.n} · median ${duration(p.median)} · p75 ${duration(p.p75)} · max ${duration(p.max)}`
    : "per ticket: no waiting or resolved ticket was claimed for a minute or more"
  return [
    head,
    ...rows.map(([label, value]) => `${label.padEnd(width)}  ${value}`),
    `${perTicket}${p.instant ? ` · ${p.instant} under 1m left out` : ""}`,
    "from wf(claim|release|wait|resolve) commits only — moves made before wf, or by hand, are not seen",
  ].join("\n")
}

// Every commit that touched `dir` in the vault's main checkout, oldest first.
const commitsOf = (vault, dir) => {
  const r = runGit(vault, ["log", "--reverse", "--format=%at%x09%s", "--", dir])
  if (!r.ok) throw usageError(`cannot read the vault's history: ${r.why}`)
  return r.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t")
      return { at: Number(line.slice(0, tab)), subject: line.slice(tab + 1) }
    })
}

export default {
  name: "stats",
  summary: "a map's span first claim → last resolve, minus waiting and gaps over 4h",
  usage: "wf stats <repo/effort> [--json]",
  flags: {},
  minPositionals: 1,
  maxPositionals: 1,
  run(ctx, { positionals }) {
    const m = mapArg(positionals[0], ctx, "stats are read for a map")
    const tickets = ctx.index.efforts.get(m.key)?.tickets ?? []
    const data = mapStats(m.key, commitsOf(ctx.vault, dirname(m.path)), tickets)
    return { data, text: textOf(data) }
  },
}
