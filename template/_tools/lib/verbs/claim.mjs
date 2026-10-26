// `wf claim <ref> [--by name]` — open → claimed (spec *Verbs*; *`claimed_by` value*). The ticket is
// re-read under the lock, so a claim another session made a moment ago is never overwritten.
import { ticketArg } from "../args.mjs"
import { report } from "../pipeline.mjs"
import { assertMapActive, assertTransition, assertUnblocked, claimant, transition } from "./ticket.mjs"

export default {
  name: "claim",
  summary: "open → claimed, stamped with who holds the ticket",
  usage: "wf claim <ref> [--by name] [--json]",
  flags: { by: "string" },
  minPositionals: 1,
  maxPositionals: 1,
  writes: () => true,
  plan(ctx, { flags, positionals }) {
    const by = claimant(flags.by)
    const t = ticketArg(positionals[0], ctx)
    assertTransition(t, "claim")
    assertUnblocked(ctx.index, t)
    assertMapActive(ctx.index, t)
    const fields = { status: "claimed", status_since: ctx.today, claimed_by: by }
    return transition(ctx, t, Object.entries(fields), fields)
  },
  report: (outcome) => report(outcome, `claimed ${outcome.ref} as ${outcome.data.claimed_by}`),
}
