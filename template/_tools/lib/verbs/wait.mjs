// `wf wait <ref> --note "…" [--until YYYY-MM-DD] [--by name] [--force]` — open/claimed → waiting (spec
// *Verbs*; Q26): the ticket leaves the frontier until an outside event, and lint flags it once
// `wait_until` passes. A claim stays with whoever waits, and only the holder waits it (`--force`: Q13).
import { ticketArg } from "../args.mjs"
import { isoDate } from "../core.mjs"
import { usageError } from "../errors.mjs"
import { report } from "../pipeline.mjs"
import { assertHolder, assertTransition, transition } from "./ticket.mjs"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const untilArg = (until) => {
  if (until === undefined) return null
  if (!DATE_RE.test(until) || isoDate(until) !== until) throw usageError(`--until must be a date YYYY-MM-DD, got ${JSON.stringify(until)}`)
  return until
}

const noteArg = (note) => {
  if (note === undefined || note.trim() === "") throw usageError('wait needs --note "…" saying what the ticket waits on')
  return note.trim()
}

export default {
  name: "wait",
  summary: "open/claimed → waiting on an outside event",
  usage: 'wf wait <ref> --note "…" [--until YYYY-MM-DD] [--by name] [--force] [--json]',
  flags: { note: "string", until: "string", by: "string", force: "boolean" },
  minPositionals: 1,
  maxPositionals: 1,
  writes: () => true,
  plan(ctx, { flags, positionals }) {
    const note = noteArg(flags.note)
    const until = untilArg(flags.until)
    const t = ticketArg(positionals[0], ctx)
    assertTransition(t, "wait")
    assertHolder(t, "wait", flags)
    const changes = [["status", "waiting"], ["status_since", ctx.today], ["status_note", note], ["wait_until", until]]
    return transition(ctx, t, changes, { status: "waiting", status_since: ctx.today, status_note: note, wait_until: until })
  },
  report: (outcome) => report(outcome, `${outcome.ref} is waiting: ${outcome.data.status_note}`),
}
