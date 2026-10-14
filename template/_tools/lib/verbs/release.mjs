// `wf release <ref>` — claimed/waiting → open (spec *Verbs*): hands a ticket back, clearing the claim
// and the wait.
import { ticketArg } from "../args.mjs"
import { report } from "../pipeline.mjs"
import { assertTransition, transition } from "./ticket.mjs"

export default {
  name: "release",
  summary: "claimed/waiting → open, clearing the claim and the wait",
  usage: "wf release <ref> [--json]",
  flags: {},
  minPositionals: 1,
  maxPositionals: 1,
  writes: () => true,
  plan(ctx, { positionals }) {
    const t = ticketArg(positionals[0], ctx)
    assertTransition(t, "release")
    const changes = [["status", "open"], ["status_since", ctx.today], ["claimed_by", null], ["status_note", null], ["wait_until", null]]
    return transition(ctx, t, changes, { status: "open", status_since: ctx.today })
  },
  report: (outcome) => report(outcome, `released ${outcome.ref}`),
}
