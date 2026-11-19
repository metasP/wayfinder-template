// `wf claim <ref> [--by name] [--force]` — open → claimed (spec *Verbs*; *`claimed_by` value*). The
// ticket is re-read under the lock, so a claim another session made a moment ago is never overwritten.
// On a serial map a second claimed ticket is refused unless `--force`.
import { ticketArg } from "../args.mjs"
import { runGit } from "../git.mjs"
import { report } from "../pipeline.mjs"
import { assertMapActive, assertSerialFree, assertTransition, assertUnblocked, claimant, transition } from "./ticket.mjs"

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
    return { ...transition(ctx, t, Object.entries(fields), fields), trailers: claimTrailers() }
  },
  report: (outcome) => report(outcome, `claimed ${outcome.ref} as ${outcome.data.claimed_by}`),
}

// The claim commit's trailers (spec *Claim commit trailers*): the full Claude Code session id, the
// directory the claim ran in and the branch checked out there (none when detached or outside git),
// whatever `claimed_by` says. A worktree can carry another effort's name, so a retro finds a ticket's
// session from `git log --grep "wf(claim): <repo>/<effort>#"` instead; `unmerged-branch` checks the branch.
const claimTrailers = () => {
  const session = process.env.CLAUDE_CODE_SESSION_ID?.trim()
  const branch = runGit(process.cwd(), ["symbolic-ref", "--quiet", "--short", "HEAD"])
  return [
    ...(session ? [["Session", session]] : []),
    ["Cwd", process.cwd()],
    ...(branch.ok && branch.stdout.trim() ? [["Branch", branch.stdout.trim()]] : []),
  ]
}
