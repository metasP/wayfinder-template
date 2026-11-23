// `off-touches`: a ticket with `touches:` whose claim branch changes files that no entry covers
// (actor-toolkit-retro-fixes#08). `touches:` is what `wf frontier` deals rounds by, so a file a ticket writes but
// doesn't list is a collision nobody sees until the merge — the retro found touches widened mid-ticket in four
// tickets of one map. The warning comes while the ticket is still `claimed` (`wf lint`), and once more from
// the post-write lint of the verb that wrote the ticket (`wf resolve`, `wf touches`), so the list is fixed
// before the branch merges.
//
// The changed files are the branch's commits since it left main (`<main>...<branch>`), plus — while the claim's
// worktree still has the branch checked out — its uncommitted and untracked files. Paths are relative to the
// repository root, as `touches:` is. A claim in the vault itself ignores the ticket's own effort folder: the
// `## Answer` written in the worktree is not work.
//
// No finding when there is nothing to compare: no `touches:` (the type default — `wf frontier` already
// counts it as the whole repo), no branch for the claim, the main checkout's own branch, a deleted branch, or
// a Cwd with no repository left above it. Like `unmerged-branch`, it reads git outside the vault, so it is
// not part of core's pure `lint()`.
import { existsSync } from "node:fs"
import { dirname } from "node:path"
import { globsOverlap } from "./rounds.mjs"
import { branchesNamedFor, caches, existingDirOf, latestClaims, mainCheckoutOf, memo, out, realOf, shellWord } from "./unmerged.mjs"

export const OFF_TOUCHES_RULE = "off-touches"
const SHOWN_FILES = 5
const FIX_FILES = 20

const nulSplit = (text) => (text ?? "").split("\0").filter(Boolean)

// The files `branch` changes relative to main, committed and — in its own worktree — not yet committed.
const changedFiles = (main, cwd, branch) => {
  const head = `refs/heads/${branch}`
  if (out(main.path, ["rev-parse", "--verify", "--quiet", head]) === null) return null // deleted
  const committed = out(main.path, ["diff", "-z", "--name-only", `${main.targetRef}...${head}`])
  if (committed === null) return null
  const onBranch = existsSync(cwd) && out(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]) === branch
  const top = onBranch ? out(cwd, ["rev-parse", "--show-toplevel"]) : null
  const local = top
    ? [...nulSplit(out(top, ["diff", "-z", "--name-only", "HEAD"])), ...nulSplit(out(top, ["ls-files", "-z", "--others", "--exclude-standard"]))]
    : []
  return [...new Set([...nulSplit(committed), ...local])].sort()
}

const covered = (file, touches) => touches.some((entry) => globsOverlap(file, entry))

// The ticket's own effort folder, when the claim ran in the vault (main checkout or a worktree of it — `vault`
// is the worktree when wf runs from one): its notes are written there, not work.
const ownNotes = (vaultMain, main, t) => (vaultMain && realOf(main.path) === realOf(vaultMain.path) ? `${t.effortKey}/` : null)

/** `[{ ref, branch, files, touches }]`: the tickets `keep(t)` selects whose branch writes outside `touches:`. */
export function offTouchesTickets(vault, index, keep = () => true) {
  const tickets = [...index.tickets.values()].filter((t) => Array.isArray(t.touches) && keep(t))
  if (!tickets.length) return []
  const claims = latestClaims(vault)
  const cache = caches()
  const vaultMain = memo(cache.mains, vault, () => mainCheckoutOf(vault))
  return tickets.flatMap((t) => {
    const claim = claims.get(t.ref)
    const dir = claim?.cwd && existingDirOf(claim.cwd)
    const main = dir && memo(cache.mains, dir, () => mainCheckoutOf(dir))
    if (!main) return []
    const branches = claim.branch ? [claim.branch] : branchesNamedFor(t.ref, claim.cwd, cache)
    const skip = ownNotes(vaultMain, main, t)
    return branches
      .filter((branch) => branch !== main.branch)
      .flatMap((branch) => {
        const files = (changedFiles(main, claim.cwd, branch) ?? []).filter(
          (f) => !(skip && f.startsWith(skip)) && !covered(f, t.touches),
        )
        return files.length ? [{ ref: t.ref, branch, files, touches: t.touches }] : []
      })
  })
}

const listOf = (files) => {
  const shown = files.slice(0, SHOWN_FILES).join(", ")
  return files.length > SHOWN_FILES ? `${shown} … (+${files.length - SHOWN_FILES} more)` : shown
}

// The entries the fix adds: each file, or — past FIX_FILES — each file's folder as `<dir>/**`, so a branch of
// generated files doesn't make a command nobody pastes. `./` keeps a name starting with `-` from reading as a flag.
const fixEntries = (files) => {
  const entries = files.length > FIX_FILES ? files.map((f) => (f.includes("/") ? `${dirname(f)}/**` : f)) : files
  return [...new Set(entries)].map((e) => (e.startsWith("-") ? `./${e}` : e))
}

/** `off-touches` warnings, finding-shaped like core's `lint()`. The fix widens `touches:` by the files. */
export const offTouchesFindings = (vault, index, keep) =>
  offTouchesTickets(vault, index, keep).map((o) => ({
    severity: "warn",
    rule: OFF_TOUCHES_RULE,
    ref: o.ref,
    message: `branch ${o.branch} changes ${o.files.length} file${o.files.length === 1 ? "" : "s"} outside touches: ${listOf(o.files)} — add them (or a glob) so frontier sees the collision`,
    fix: ["wf", "touches", o.ref, ...o.touches, ...fixEntries(o.files)].map(shellWord).join(" "),
  }))
