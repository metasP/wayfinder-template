// `unmerged-branch`: a resolved ticket whose latest claim commit names a branch (`Branch:` trailer, with
// the directory in `Cwd:`) that the main checkout's branch doesn't contain yet. The work was approved
// and the ticket closed, but the branch never reached main — nobody owned the merge. It reads git
// outside the vault, so it lives here and not in core's pure `lint()`: `wf lint`, the post-write lint and
// `wf map-status done` add it.
//
// A claim without `Branch:` (made before the trailer, or detached) names no branch, so the branch is found
// by its name instead: every local branch of the Cwd's repository named `<effort>-<NN>` — a whole path
// segment, optionally followed by a hex suffix (`claude/<effort>-<NN>-7c4ab6`). The Cwd can't tell: a
// worktree reused for another ticket has some other branch checked out by now.
//
// No finding when there is nothing to check or the merge isn't ours: a claim with neither `Branch:` nor a
// branch named for the ticket, a claim in the main checkout's own branch, a branch since deleted,
// a Cwd with no git repository left above it, or an `## Answer` that links a pull request (the PR owns
// the merge — a squash merge never makes the branch an ancestor of main).
import { existsSync, realpathSync } from "node:fs"
import { dirname } from "node:path"
import { runGit } from "./git.mjs"

export const UNMERGED_RULE = "unmerged-branch"
const CLAIM_SUBJECT = "wf(claim): "
const PULL_REQUEST_RE = /\/pull\/\d+/

const trailerOf = (block, key) => block.match(new RegExp(`^${key}: (.+)$`, "m"))?.[1].trim() ?? null

/** ref → `{ cwd, branch }` of its latest claim commit, from one `git log` over the vault. */
export function latestClaims(vault) {
  const r = runGit(vault, ["log", "--fixed-strings", `--grep=${CLAIM_SUBJECT}`, "--format=%x1e%s%x1f%(trailers:only,unfold)"])
  const claims = new Map()
  if (!r.ok) return claims
  for (const record of r.stdout.split("\x1e").slice(1)) {
    const [subject, trailers = ""] = record.split("\x1f")
    if (!subject.startsWith(CLAIM_SUBJECT)) continue
    const ref = subject.slice(CLAIM_SUBJECT.length).trim()
    // newest first: the first seen is the latest claim
    if (!claims.has(ref)) claims.set(ref, { cwd: trailerOf(trailers, "Cwd"), branch: trailerOf(trailers, "Branch") })
  }
  return claims
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

// The nearest directory at or above `path` that still exists — a removed worktree's repository is above it.
const existingDirOf = (path) => {
  let dir = path
  while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir)
  return existsSync(dir) ? dir : null
}

// The main worktree (first in `git worktree list`) and the branch it has checked out.
const mainCheckoutOf = (dir) => {
  const list = out(dir, ["worktree", "list", "--porcelain"])
  if (!list) return null
  const [first] = list.split("\n\n")
  const path = first.match(/^worktree (.+)$/m)?.[1]
  const branch = first.match(/^branch refs\/heads\/(.+)$/m)?.[1]
  return path && branch ? { path, branch } : null
}

// Per-run caches, so a vault with hundreds of claims costs a few git calls per repository, not per claim.
const caches = () => ({ mains: new Map(), merged: new Map(), branches: new Map() })

const memo = (map, key, compute) => {
  if (!map.has(key)) map.set(key, compute())
  return map.get(key)
}

// The local branches main contains, from one `for-each-ref` per main checkout.
const mergedInto = (main) => {
  const list = out(main.path, ["for-each-ref", "--merged", `refs/heads/${main.branch}`, "--format=%(refname:short)", "refs/heads"])
  return list === null ? null : new Set(list.split("\n").filter(Boolean))
}

// The local branches of main's repository, from one `for-each-ref` per main checkout.
// `%(refname)`, not `:short` — a tag of the same name would make it `heads/<name>`.
const branchesOf = (main) =>
  (out(main.path, ["for-each-ref", "--format=%(refname)", "refs/heads"]) ?? "")
    .split("\n")
    .filter(Boolean)
    .map((ref) => ref.slice("refs/heads/".length))

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// `repo/effort#NN` → a matcher for the branch names that carry the ticket: `<effort>-<NN>` as a path segment,
// optionally with the app's hex suffix. Only hex: `a-01-02` is effort `a-01`'s ticket 02, not `a`'s 01.
const ticketBranchRe = (ref) => {
  const m = ref.match(/\/([^/#]+)#(\d+)$/)
  return m && new RegExp(`(?:^|/)${escapeRe(m[1])}-${m[2]}(?:-[0-9a-f]{4,})?$`)
}

// Every commit of the branch already in main by content (`git cherry` marks it `-`): a local squash or
// cherry-pick merged it without making it an ancestor.
const appliedToMain = (main, branch) => {
  const cherry = out(main.path, ["cherry", main.branch, branch])
  return cherry !== null && cherry.split("\n").every((line) => !line.startsWith("+"))
}

/**
 * `{ cwd, branch, main, mainPath, worktree }` when `branch` (claimed in `cwd`) is not in main; else null.
 * `worktree` is `cwd` while it still has `branch` checked out, else null.
 */
export function unmergedBranch({ cwd, branch }, { mains, merged } = caches()) {
  if (!cwd || !branch) return null
  const dir = existingDirOf(cwd)
  const main = dir && memo(mains, dir, () => mainCheckoutOf(dir))
  if (!main || branch === main.branch) return null
  const contained = memo(merged, main.path, () => mergedInto(main))
  if (!contained || contained.has(branch)) return null // merged, or git couldn't tell
  if (out(main.path, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]) === null) return null // deleted
  if (appliedToMain(main, branch)) return null
  // Rebase in the claim's worktree only while it still has this branch checked out (a reused one doesn't).
  const onBranch = existsSync(cwd) && out(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]) === branch
  const worktree = onBranch && realOf(cwd) !== realOf(main.path) ? cwd : null
  return { cwd, branch, main: main.branch, mainPath: main.path, worktree }
}

/** `[{ ref, cwd, branch, main, mainPath, worktree }]`: the resolved tickets `keep(ticket)` selects whose branch is unmerged. */
export function unmergedTickets(vault, index, keep = () => true) {
  const resolved = [...index.tickets.values()].filter(
    (t) => t.status === "resolved" && keep(t) && !PULL_REQUEST_RE.test(t.answer ?? ""),
  )
  if (!resolved.length) return []
  const claims = latestClaims(vault)
  const cache = caches()
  const seen = new Map()
  return resolved.flatMap((t) => {
    const claim = claims.get(t.ref)
    if (!claim) return []
    const branches = claim.branch ? [claim.branch] : branchesNamedFor(t.ref, claim.cwd, cache)
    return branches.flatMap((branch) => {
      const u = memo(seen, `${claim.cwd}\n${branch}`, () => unmergedBranch({ cwd: claim.cwd, branch }, cache))
      return u ? [{ ref: t.ref, ...u, byName: !claim.branch }] : []
    })
  })
}

// The branches of the claim's repository named for the ticket — for a claim without `Branch:`.
const branchesNamedFor = (ref, cwd, cache) => {
  const re = ticketBranchRe(ref)
  const dir = cwd && re && existingDirOf(cwd)
  const main = dir && memo(cache.mains, dir, () => mainCheckoutOf(dir))
  if (!main) return []
  return memo(cache.branches, main.path, () => branchesOf(main)).filter((b) => re.test(b))
}

// A shell word as itself when it is safe bare, else single-quoted — the fix line is pasted into a shell.
const shellWord = (word) => (/^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`)

/** The command that merges an unmerged ticket's branch: rebase it onto main in its worktree, then fast-forward. */
export const mergeCommand = (u) => {
  const [main, branch, mainPath] = [u.main, u.branch, u.mainPath].map(shellWord)
  const rebase = u.worktree ? `git -C ${shellWord(u.worktree)} rebase ${main} && ` : ""
  return `${rebase}git -C ${mainPath} merge --ff-only ${branch}`
}

/** `unmerged-branch` warnings, finding-shaped like core's `lint()`. */
export const unmergedFindings = (vault, index, keep) =>
  unmergedTickets(vault, index, keep).map((u) => ({
    severity: "warn",
    rule: UNMERGED_RULE,
    ref: u.ref,
    message: `claimed in ${u.cwd} on branch ${u.branch}${u.byName ? " (found by name — the claim has no Branch:)" : ""}, not merged into ${u.main} — merge it into main`,
    fix: mergeCommand(u),
  }))
