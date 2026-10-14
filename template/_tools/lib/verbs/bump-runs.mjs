// `wf bump-runs <repo/effort> [--count k]` (spec *Verbs*: other verbs). Allocates the run numbers
// `runs+1 … runs+k` for chip titles under the lock, so two sessions never hand out the same number.
// A map without `runs` starts at 0. Nothing else in the map changes: this is not a status transition.
import { usageError, invariantError } from "../errors.mjs"
import { editFrontmatter } from "../edit.mjs"
import { report } from "../pipeline.mjs"
import { mapArg } from "./map.mjs"

const COUNT_RE = /^[1-9]\d*$/

const countArg = (count) => {
  if (count === undefined) return 1
  if (!COUNT_RE.test(count) || !Number.isSafeInteger(Number(count)))
    throw usageError(`--count must be a whole number ≥ 1, got ${JSON.stringify(count)}`)
  return Number(count)
}

// The map's `runs` so far; a quoted whole number counts too (lint accepts it).
const runsOf = (m) => {
  const runs = m.frontmatter.runs ?? 0
  const n = typeof runs === "string" && /^\d+$/.test(runs) ? Number(runs) : runs
  if (Number.isSafeInteger(n) && n >= 0) return n
  throw invariantError(`map ${m.key} has runs: ${JSON.stringify(runs)}, which is not a whole number`, { fix: `wf lint ${m.key}` })
}

const range = ({ from, to }) => (from === to ? `run ${from}` : `runs ${from}–${to}`)

export default {
  name: "bump-runs",
  summary: "allocate the next run numbers of a map",
  usage: "wf bump-runs <repo/effort> [--count k] [--json]",
  flags: { count: "string" },
  minPositionals: 1,
  maxPositionals: 1,
  writes: () => true,
  prepare: (args) => ({ ...args, count: countArg(args.flags.count) }),
  plan(ctx, { positionals, count }) {
    const m = mapArg(positionals[0], ctx, "runs are counted on the map")
    const runs = runsOf(m) + count
    if (!Number.isSafeInteger(runs)) throw usageError(`--count ${count} takes runs past ${Number.MAX_SAFE_INTEGER}`)
    const text = editFrontmatter(ctx.textOf(m.path), [["runs", runs]])
    return { ref: m.key, edits: [{ path: m.path, text }], data: { ref: m.key, from: runs - count + 1, to: runs, runs } }
  },
  report: (outcome) => report(outcome, `${outcome.ref} ${range(outcome.data)}`),
}
