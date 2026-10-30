// `wf claim <ref> [--by name]` — open → claimed (spec *Verbs*; *`claimed_by` value*). The ticket is
// re-read under the lock, so a claim another session made a moment ago is never overwritten.
import { ticketArg } from "../args.mjs"
import { usageError } from "../errors.mjs"
import { report } from "../pipeline.mjs"
import { linkedWorktreeBranch } from "../repo.mjs"
import { assertMapActive, assertTransition, assertUnblocked, transition } from "./ticket.mjs"

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
    return { ...transition(ctx, t, Object.entries(fields), fields), trailers: claimTrailers() }
  },
  report: (outcome) => report(outcome, `claimed ${outcome.ref} as ${outcome.data.claimed_by}`),
}

// The claim commit's trailers (spec *Claim commit trailers*): the full Claude Code session id and the
// directory the claim ran in, whatever `claimed_by` says. A worktree can carry another effort's name,
// so a retro finds a ticket's session from `git log --grep "wf(claim): <repo>/<effort>#"` instead.
const claimTrailers = () => {
  const session = process.env.CLAUDE_CODE_SESSION_ID?.trim()
  return [...(session ? [["Session", session]] : []), ["Cwd", process.cwd()]]
}
