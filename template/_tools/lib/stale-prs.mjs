// `stale-pr`: an open pull request whose patch is already in origin/main (merge-route-fixes#03). PR #73
// stayed open after its commits were cherry-picked into main, so later tickets kept building on it as if
// it were still pending. `wf resolve` and `wf map-status done` warn about such PRs in the repositories the
// effort's claims ran in (the claim commit's `Cwd:`), with the command that closes them.
//
// It asks the host which PRs are open (`gh pr list`), so it is best effort: a repository without an
// `origin`, a machine without `gh`, or a `gh` that can't reach the host adds no finding — the check
// reports a PR only when it is sure the PR is stale. Merged by content is `git cherry` against
// origin/main (`-` on every commit), as for `unmerged-branch`: a squash or cherry-pick leaves the branch
// out of main's history.
import { spawnSync } from "node:child_process"
import { runGit } from "./git.mjs"
import { existingDirOf, latestClaims, mainCheckoutOf, REMOTE, shellWord } from "./unmerged.mjs"

export const STALE_PR_RULE = "stale-pr"
const GH_TIMEOUT_MS = 20_000
const PR_LIMIT = "100"

/** The open PRs of the repository at `path` as `[{ number, headRefName, url }]`, or null when `gh` can't tell. */
export function openPullRequests(path) {
  const r = spawnSync("gh", ["pr", "list", "--state", "open", "--limit", PR_LIMIT, "--json", "number,headRefName,url"], {
    cwd: path,
    encoding: "utf8",
    timeout: GH_TIMEOUT_MS,
  })
  if (r.error || r.status !== 0) return null
  try {
    const prs = JSON.parse(r.stdout)
    return Array.isArray(prs) ? prs : null
  } catch {
    return null
  }
}

const verified = (path, ref) => runGit(path, ["rev-parse", "--verify", "--quiet", ref]).ok

// The ref holding the PR's head here: origin's copy as of the last fetch, else a local branch of that name.
const headRefOf = (main, branch) =>
  [`refs/remotes/${REMOTE}/${branch}`, `refs/heads/${branch}`].find((ref) => verified(main.path, ref)) ?? null

// Every commit of `ref` already in main by content — or none to merge at all.
const patchInMain = (main, ref) => {
  const r = runGit(main.path, ["cherry", main.targetRef, ref])
  return r.ok && r.stdout.split("\n").every((line) => !line.startsWith("+"))
}

/** `[{ number, branch, url, main, path }]`: the open PRs of the main checkout `main` whose patch is in its target. */
export function stalePullRequests(main) {
  if (!main?.remote) return []
  const prs = openPullRequests(main.path) ?? []
  return prs.flatMap((pr) => {
    const branch = pr.headRefName
    if (!branch || branch === main.branch) return []
    const ref = headRefOf(main, branch)
    if (!ref || !patchInMain(main, ref)) return []
    return [{ number: pr.number, branch, url: pr.url, main: main.target, path: main.path }]
  })
}

/** The main checkouts (with an origin) that the latest claims of tickets `keep` selects ran in, each once. */
export function claimedRemoteMains(vault, index, keep) {
  const refs = new Set([...index.tickets.values()].filter(keep).map((t) => t.ref))
  const dirs = new Set()
  for (const [ref, claim] of latestClaims(vault)) {
    const dir = refs.has(ref) && claim.cwd && existingDirOf(claim.cwd)
    if (dir) dirs.add(dir)
  }
  const mains = new Map()
  for (const dir of dirs) {
    const main = mainCheckoutOf(dir)
    if (main?.remote && !mains.has(main.path)) mains.set(main.path, main)
  }
  return [...mains.values()].sort((a, b) => a.path.localeCompare(b.path))
}

/** `stale-pr` warnings for effort `key`, finding-shaped like core's `lint()`. */
export function stalePrFindings(vault, index, key) {
  const mains = claimedRemoteMains(vault, index, (t) => t.effortKey === key)
  return mains.flatMap(stalePullRequests).map((pr) => ({
    severity: "warn",
    rule: STALE_PR_RULE,
    ref: key,
    message: `PR #${pr.number} (${pr.branch}) in ${pr.path} is still open, but its patch is already in ${pr.main} — close it so no ticket builds on it as pending`,
    fix: `cd ${shellWord(pr.path)} && gh pr close ${pr.number} --comment ${shellWord(`Already in ${pr.main}.`)}`,
  }))
}
