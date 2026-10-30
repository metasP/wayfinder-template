// `wf release <ref> [--by name] [--force]` — claimed/waiting → open (spec *Verbs*): hands a ticket
// back, clearing the claim and the wait. Only the holder releases; `--force` takes another's (Q13).
import { ticketArg } from "../args.mjs"
import { report } from "../pipeline.mjs"
import { assertHolder, assertTransition, transition } from "./ticket.mjs"

export default {
  name: "release",
  summary: "claimed/waiting → open, clearing the claim and the wait",
  usage: "wf release <ref> [--by name] [--force] [--json]",
  flags: { by: "string", force: "boolean" },
  minPositionals: 1,
  maxPositionals: 1,
  writes: () => true,
  plan(ctx, { flags, positionals }) {
    const t = ticketArg(positionals[0], ctx)
    assertTransition(t, "release")
    assertHolder(t, "release", flags)
    const changes = [["status", "open"], ["status_since", ctx.today], ["claimed_by", null], ["status_note", null], ["wait_until", null]]
    return transition(ctx, t, changes, { status: "open", status_since: ctx.today })
  },
  report: (outcome) => report(outcome, `released ${outcome.ref}`),
}
