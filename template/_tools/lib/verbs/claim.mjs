// `wf claim <ref> [--by name] [--force]` — open → claimed (spec *Verbs*; *`claimed_by` value*). The
// ticket is re-read under the lock, so a claim another session made a moment ago is never overwritten.
// On a serial map a second claimed ticket is refused unless `--force`.
import { ticketArg } from "../args.mjs"
import { usageError } from "../errors.mjs"
import { report } from "../pipeline.mjs"
import { linkedWorktreeBranch } from "../repo.mjs"
import { assertMapActive, assertSerialFree, assertTransition, assertUnblocked, transition } from "./ticket.mjs"

const SESSION_ID_CHARS = 8

// Who is claiming: `--by`, else the branch of a linked worktree the caller runs in, else the Claude
// Code session id. A main checkout's branch names no session, so it is never used.
const claimant = (by) => {
  if (by !== undefined) return by
  const branch = linkedWorktreeBranch(process.cwd())
  if (branch) return branch
  const session = process.env.CLAUDE_CODE_SESSION_ID?.trim()
  if (session) return `session:${session.slice(0, SESSION_ID_CHARS)}`
  throw usageError("cannot tell who is claiming — pass `--by <name>`")
}

export default {
  name: "claim",
  summary: "open → claimed, stamped with who holds the ticket",
  usage: "wf claim <ref> [--by name] [--force] [--json]",
  flags: { by: "string", force: "boolean" },
  minPositionals: 1,
  maxPositionals: 1,
  writes: () => true,
  plan(ctx, { flags, positionals }) {
    const by = claimant(flags.by)
    const t = ticketArg(positionals[0], ctx)
    assertTransition(t, "claim")
    assertUnblocked(ctx.index, t)
    assertMapActive(ctx.index, t)
    assertSerialFree(ctx.index, t, { force: flags.force })
    const fields = { status: "claimed", status_since: ctx.today, claimed_by: by }
    return transition(ctx, t, Object.entries(fields), fields)
  },
  report: (outcome) => report(outcome, `claimed ${outcome.ref} as ${outcome.data.claimed_by}`),
}
