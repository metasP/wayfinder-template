// `wf frontier` — open, unblocked tickets on active maps, in *Wayfinder Picks* order (spec *Verbs*).
import { frontier, unblocks } from "../core.mjs"
import { effortArg } from "../args.mjs"

const row = (index, t) => ({
  ref: t.ref,
  path: t.path,
  repo: t.repo,
  effort: t.effort,
  nn: t.nn,
  type: t.type,
  title: t.title,
  target_repo: t.targetRepo,
  unblocks: unblocks(index, t),
})

const textOf = (rows) => {
  if (!rows.length) return "no open, unblocked tickets on active maps"
  const width = Math.max(...rows.map((r) => r.ref.length))
  const typeWidth = Math.max(...rows.map((r) => String(r.type).length))
  return rows
    .map((r) => {
      const target = r.target_repo ? `  → ${r.target_repo}` : ""
      return `${r.ref.padEnd(width)}  ${String(r.type).padEnd(typeWidth)}  ${r.title ?? ""}${target}`
    })
    .join("\n")
}

export default {
  name: "frontier",
  summary: "open, unblocked tickets on active maps, in Picks order",
  usage: "wf frontier [--repo R] [--from repo/effort] [--json]",
  flags: { repo: "string", from: "string" },
  maxPositionals: 0,
  run({ roots, index, sort }, { flags }) {
    const from = flags.from === undefined ? undefined : effortArg(flags.from, { roots, index })
    const rows = frontier(index, { repo: flags.repo, from, sort }).map((t) => row(index, t))
    return { data: { tickets: rows }, text: textOf(rows) }
  },
}
