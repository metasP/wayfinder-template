// `wf frontier` — open, unblocked tickets on active maps, in *Wayfinder Picks* order (spec *Verbs*),
// each with the round it can run in beside the others: round 1 starts now, alongside the claimed
// tickets; a ticket whose `touches:` overlap one ahead of it waits for a later round (lib/rounds.mjs).
import { frontier, unblocks } from "../core.mjs"
import { effortArg } from "../args.mjs"
import { planRounds } from "../rounds.mjs"

// Tickets being worked right now, on maps that are active: their files are taken.
const inFlightOf = (index) =>
  [...index.tickets.values()].filter((t) => t.status === "claimed" && index.maps.get(t.effortKey)?.status === "active")

const row = (index, t, plan) => ({
  ref: t.ref,
  path: t.path,
  repo: t.repo,
  effort: t.effort,
  nn: t.nn,
  type: t.type,
  title: t.title,
  target_repo: t.targetRepo,
  serial: index.maps.get(t.effortKey).serial,
  unblocks: unblocks(index, t),
  touches: t.touches,
  round: plan.get(t.ref).round,
  collides_with: plan.get(t.ref).collidesWith,
})

// One block per round, `round N` then its tickets in pick order; a later round's line names what it waits for.
const textOf = (rows) => {
  if (!rows.length) return "no open, unblocked tickets on active maps"
  const width = Math.max(...rows.map((r) => r.ref.length))
  const typeWidth = Math.max(...rows.map((r) => String(r.type).length))
  const line = (r) => {
    const target = r.target_repo ? `  → ${r.target_repo}` : ""
    const after = r.round > 1 ? `  (after ${r.collides_with.join(", ")})` : ""
    return `  ${r.ref.padEnd(width)}  ${String(r.type).padEnd(typeWidth)}  ${r.title ?? ""}${target}${after}`
  }
  const last = Math.max(...rows.map((r) => r.round))
  return Array.from({ length: last }, (_, i) => i + 1)
    .flatMap((n) => {
      const members = rows.filter((r) => r.round === n)
      return members.length ? [`round ${n}`, ...members.map(line)] : []
    })
    .join("\n")
}

export default {
  name: "frontier",
  summary: "open, unblocked tickets on active maps, in Picks order, dealt into rounds whose tickets touch separate files (round 1 can start now); --effort keeps one map's tickets only, --from sorts that effort's first without filtering, --repo filters by repo",
  usage: "wf frontier [--repo R] [--from repo/effort] [--effort repo/effort] [--json]",
  flags: { repo: "string", from: "string", effort: "string" },
  maxPositionals: 0,
  run({ roots, index, sort }, { flags }) {
    const effortOf = (value) => (value === undefined ? undefined : effortArg(value, { roots, index }))
    const only = effortOf(flags.effort)
    const from = effortOf(flags.from) ?? only
    const tickets = frontier(index, { repo: flags.repo, from, sort }).filter((t) => !only || t.effortKey === only)
    const isSerial = (key) => index.maps.get(key)?.serial === true
    const plan = planRounds(tickets, { inFlight: inFlightOf(index), isSerial })
    const rows = tickets.map((t) => row(index, t, plan))
    return { data: { tickets: rows }, text: textOf(rows) }
  },
}
