// `unmerged-branch`: a resolved ticket whose latest claim ran in a git worktree (the claim commit's `Cwd:`
// trailer) whose HEAD the main checkout's branch doesn't contain yet. The work was approved and the
// ticket closed, but the branch never reached main — nobody owned the merge. It reads git outside the
// vault, so it lives here and not in core's pure `lint()`: `wf lint`, the post-write lint and
// `wf map-status done` add it. A Cwd that is gone (worktree removed), the main checkout itself, or not a
// git repository gives no finding — there is nothing left to check.
import { existsSync, realpathSync } from "node:fs"
import { runGit } from "./git.mjs"

export const UNMERGED_RULE = "unmerged-branch"
const CLAIM_SUBJECT = "wf(claim): "

/** ref → the `Cwd:` of its latest claim commit, from one `git log` over the vault. */
export function claimCwds(vault) {
  const format = `%x1e%s%x1f%(trailers:key=Cwd,valueonly)`
  const r = runGit(vault, ["log", "--fixed-strings", `--grep=${CLAIM_SUBJECT}`, `--format=${format}`])
  const cwds = new Map()
  if (!r.ok) return cwds
  for (const record of r.stdout.split("\x1e").slice(1)) {
    const [subject, trailer = ""] = record.split("\x1f")
    if (!subject.startsWith(CLAIM_SUBJECT)) continue
    const ref = subject.slice(CLAIM_SUBJECT.length).trim()
    const cwd = trailer.trim().split("\n")[0]
    if (cwd && !cwds.has(ref)) cwds.set(ref, cwd) // newest first: the first seen is the latest claim
  }
  return cwds
}

const out = (cwd, args) => {
  const r = runGit(cwd, args)
  return r.ok ? r.stdout.trim() : null
}

const realOf = (path) => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

// The main worktree (first in `git worktree list`) and the branch it has checked out.
const mainCheckoutOf = (cwd) => {
  const list = out(cwd, ["worktree", "list", "--porcelain"])
  if (!list) return null
  const [first] = list.split("\n\n")
  const path = first.match(/^worktree (.+)$/m)?.[1]
  const branch = first.match(/^branch refs\/heads\/(.+)$/m)?.[1]
  return path && branch ? { path, branch } : null
}

/** `{ cwd, branch, main, mainPath }` when `cwd` is a linked worktree whose HEAD main lacks; else null. */
export function unmergedBranchAt(cwd) {
  if (!existsSync(cwd)) return null
  const top = out(cwd, ["rev-parse", "--show-toplevel"])
  const main = top && mainCheckoutOf(cwd)
  if (!main || realOf(top) === realOf(main.path)) return null
  const merged = runGit(cwd, ["merge-base", "--is-ancestor", "HEAD", `refs/heads/${main.branch}`])
  if (merged.ok || merged.why) return null // merged, or git couldn't tell (an exit 1 has no stderr)
  const branch = out(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])
  const name = branch && branch !== "HEAD" ? branch : out(cwd, ["rev-parse", "--short", "HEAD"])
  return { cwd, branch: name, main: main.branch, mainPath: main.path }
}

/** `[{ ref, cwd, branch, main, mainPath }]`: the resolved tickets `keep(ticket)` selects whose branch is unmerged. */
export function unmergedTickets(vault, index, keep = () => true) {
  const resolved = [...index.tickets.values()].filter((t) => t.status === "resolved" && keep(t))
  if (!resolved.length) return []
  const cwds = claimCwds(vault)
  const byCwd = new Map()
  return resolved.flatMap((t) => {
    const cwd = cwds.get(t.ref)
    if (!cwd) return []
    if (!byCwd.has(cwd)) byCwd.set(cwd, unmergedBranchAt(cwd))
    const u = byCwd.get(cwd)
    return u ? [{ ref: t.ref, ...u }] : []
  })
}

/** The command that merges an unmerged ticket's branch, run from anywhere: rebase onto main, then fast-forward. */
export const mergeCommand = (u) => `git -C ${u.cwd} rebase ${u.main} && git -C ${u.mainPath} merge --ff-only ${u.branch}`

/** `unmerged-branch` warnings, finding-shaped like core's `lint()`. */
export const unmergedFindings = (vault, index, keep) =>
  unmergedTickets(vault, index, keep).map((u) => ({
    severity: "warn",
    rule: UNMERGED_RULE,
    ref: u.ref,
    message: `claimed in ${u.cwd} on branch ${u.branch}, not merged into ${u.main} — merge it, then remove the worktree`,
    fix: mergeCommand(u),
  }))
