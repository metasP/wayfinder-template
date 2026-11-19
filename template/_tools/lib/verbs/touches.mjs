// `wf touches <ref> <glob>… | --none | --clear` (spec *Verbs*: other verbs) — sets the paths or globs a
// ticket writes, relative to its repo, so `wf frontier` can tell which tickets run side by side
// (lib/rounds.mjs). `--none` writes `touches: []` (the ticket writes only its `## Answer`); `--clear`
// removes the key (back to the type's default). Any status; nothing else in the ticket changes.
import { ticketArg, touchesArg } from "../args.mjs"
import { usageError } from "../errors.mjs"
import { report } from "../pipeline.mjs"
import { transition } from "./ticket.mjs"

const USAGE = "wf touches <ref> <glob>… | --none | --clear [--json]"

// The value to write: a list, [] for --none, or null (remove the key) for --clear.
const valueOf = ({ flags, positionals }) => {
  const globs = positionals.slice(1)
  const given = [globs.length > 0, flags.none === true, flags.clear === true].filter(Boolean).length
  if (given !== 1) throw usageError(`touches takes globs, --none or --clear — exactly one of them (${USAGE})`)
  if (flags.none) return []
  if (flags.clear) return null
  return [...new Set(touchesArg("touches", globs))]
}

export default {
  name: "touches",
  summary: "set the paths/globs a ticket writes (--none: only its answer; --clear: remove), for frontier's rounds",
  usage: USAGE,
  flags: { none: "boolean", clear: "boolean" },
  minPositionals: 1,
  maxPositionals: Infinity,
  writes: () => true,
  prepare: (args) => ({ ...args, touches: valueOf(args) }),
  plan(ctx, { positionals, touches }) {
    const t = ticketArg(positionals[0], ctx)
    const same = JSON.stringify(t.touches) === JSON.stringify(touches)
    if (same) return { ref: t.ref, edits: [], data: { ref: t.ref, touches } }
    return transition(ctx, t, [["touches", touches]], { touches })
  },
  report: (outcome) => {
    const { touches } = outcome.data
    const what = touches === null ? "no touches (type default)" : touches.length ? touches.join(", ") : "nothing but its answer"
    return report(outcome, `${outcome.ref} ${outcome.commit ? "touches" : "already touches"} ${what}`)
  },
}
