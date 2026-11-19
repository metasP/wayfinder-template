// Local main against origin/main, for doctor (merge-route-fixes#01). Chips that fast-forwarded main in the
// main checkout beside chips that merged PRs left a work repo's main ahead 5 / behind 2 of origin, and a
// later `reset --hard origin/main` silently dropped what only local main had. Merging is one route — a PR —
// so local main should only ever trail origin by a `pull --ff-only`, and never lead it.
//
// The repositories checked are the ones an active map's claims ran in (the claim commit's `Cwd:`), read
// from the same `git log` as `unmerged-branch`. A repository with no `origin/<main>` is out of scope.
import { runGit } from "./git.mjs"
import { existingDirOf, latestClaims, mainCheckoutOf, shellWord } from "./unmerged.mjs"

/** `{ path, branch, target, ahead, behind }` for the main checkout holding `dir`, or null with no origin. */
export function mainDrift(dir) {
  const main = mainCheckoutOf(dir)
  if (!main?.remote) return null
  const r = runGit(main.path, ["rev-list", "--left-right", "--count", `refs/heads/${main.branch}...${main.targetRef}`])
  if (!r.ok) return null
  const [ahead, behind] = r.stdout.trim().split(/\s+/).map(Number)
  return { path: main.path, branch: main.branch, target: main.target, ahead, behind }
}

/** The main checkouts that the latest claims of tickets in active maps ran in, each once. */
export function claimedMainCheckouts(vault, index) {
  const active = (t) => index.maps.get(t.effortKey)?.status === "active"
  const refs = new Set([...index.tickets.values()].filter(active).map((t) => t.ref))
  // One `mainCheckoutOf` per directory: many claims share a worktree folder or the main checkout.
  const dirs = new Set()
  for (const [ref, claim] of latestClaims(vault)) {
    const dir = refs.has(ref) && claim.cwd && existingDirOf(claim.cwd)
    if (dir) dirs.add(dir)
  }
  const paths = new Set([...dirs].map((dir) => mainCheckoutOf(dir)?.path).filter(Boolean))
  return [...paths].sort()
}

/** What to run for a drifted main: inspect the commits only it has (they belong in a PR), or catch up. */
export const driftAdvice = (d) => {
  const path = shellWord(d.path)
  return d.ahead > 0
    ? `commits only local ${d.branch} has belong on a branch and a PR: git -C ${path} log ${shellWord(`${d.target}..${d.branch}`)}`
    : `git -C ${path} pull --ff-only`
}

/** One line per drifted repository. */
export const driftLine = (d) => `${d.path}: ${d.branch} ahead ${d.ahead} / behind ${d.behind} of ${d.target} — ${driftAdvice(d)}`
