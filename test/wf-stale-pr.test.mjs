// merge-route-fixes#03: PR #73 stayed open after its commits were cherry-picked into main, and later
// tickets kept building on it as pending. `wf resolve` and `wf map-status done` warn `stale-pr` for an open
// PR whose patch is already in origin/main, in the repositories the effort's claims ran in. `gh` is a stub
// on PATH printing the open PRs. Through the CLI against fixture vaults.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { chmodSync, mkdirSync, realpathSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { git, makeVault, map, seed, ticket, wf, write } from "./vault.mjs"
import { stalePullRequests } from "../template/_tools/lib/stale-prs.mjs"
import { mainCheckoutOf } from "../template/_tools/lib/unmerged.mjs"

const DESTINATION = "# The map\n\n## Destination\n\nSomewhere real.\n"
const ANSWER = "## Question\n\nq\n\n## Answer\n\n(filled in at resolve)\n"

// A `gh` that prints `prs` for `gh pr list` (or fails with `exit`), in a fresh directory to put on PATH.
const ghStub = (dir, { prs = [], exit = 0 } = {}) => {
  const bin = join(dir, "gh-bin")
  mkdirSync(bin, { recursive: true })
  const script = exit ? `#!/bin/sh\necho 'gh: offline' >&2\nexit ${exit}\n` : `#!/bin/sh\ncat <<'JSON'\n${JSON.stringify(prs)}\nJSON\n`
  writeFileSync(join(bin, "gh"), script)
  chmodSync(join(bin, "gh"), 0o755)
  return bin
}

// A vault with r/e#01 open; a work repo with an origin, and branch `old-73` pushed to origin.
const setup = () => {
  const vault = seed(
    makeVault({ notes: [{ ...map("r/e/map.md"), body: DESTINATION }, { ...ticket("r/e/issues/01-a.md"), body: ANSWER }] }),
  )
  const repo = realpathSync(seed(makeVault({ manifest: null })))
  const main = git(repo, "rev-parse", "--abbrev-ref", "HEAD")
  const bare = `${repo}-origin.git`
  git(repo, "clone", "-q", "--bare", repo, bare)
  git(repo, "remote", "add", "origin", bare)
  git(repo, "switch", "-q", "-c", "old-73")
  write(repo, "pr73.txt", "73\n")
  git(repo, "add", "pr73.txt")
  git(repo, "commit", "-qm", "pr 73")
  git(repo, "push", "-q", "origin", "old-73")
  git(repo, "switch", "-q", main)
  git(repo, "fetch", "-q", "origin")
  const answerFile = join(repo, "answer.md")
  writeFileSync(answerFile, "Did it.\n")
  const pr73 = { number: 73, headRefName: "old-73", headRefOid: git(repo, "rev-parse", "old-73"), isCrossRepository: false, url: "https://github.com/o/r/pull/73" }
  const run = (args, gh = {}) =>
    wf(vault, args, { cwd: repo, env: { CLAUDE_CODE_SESSION_ID: undefined, PATH: `${ghStub(repo, gh)}:${process.env.PATH}` } })
  return { vault, repo, main, answerFile, pr73, run }
}

// Cherry-pick old-73 into main and push it: the patch is in origin/main, the branch isn't in its history.
const landByCherryPick = (s) => {
  git(s.repo, "cherry-pick", "old-73")
  git(s.repo, "push", "-q", "origin", s.main)
  git(s.repo, "fetch", "-q", "origin")
}

const claimAndResolve = (s, gh) => {
  assert.equal(s.run(["claim", "r/e#01", "--by", "me"], gh).code, 0)
  return s.run(["resolve", "r/e#01", "--gist", "did it", "--answer-file", s.answerFile, "--json"], gh)
}

// `stalePullRequests` in-process, with the stub `gh` answering `pr` on PATH.
const stalePullRequestsOf = (s, pr) => {
  const path = process.env.PATH
  process.env.PATH = `${ghStub(s.repo, { prs: [pr] })}:${path}`
  try {
    return stalePullRequests(mainCheckoutOf(s.repo))
  } finally {
    process.env.PATH = path
  }
}

const staleOf = (r) => r.json.data.lint.filter((f) => f.rule === "stale-pr")

describe("stale-pr", () => {
  test("wf resolve warns about an open PR whose patch is already in origin/main, with the close command", () => {
    const s = setup()
    landByCherryPick(s)
    const r = claimAndResolve(s, { prs: [s.pr73] })
    assert.equal(r.code, 0, r.stderr)
    const [f] = staleOf(r)
    assert.equal(f.ref, "r/e")
    assert.match(f.message, new RegExp(`PR #73 \\(old-73\\) in ${s.repo} is still open, but its patch is already in origin/${s.main}`))
    assert.equal(f.fix, `cd ${s.repo} && gh pr close 73 --comment 'Already in origin/${s.main}.'`)
  })

  test("no warning while the PR has commits origin/main lacks", () => {
    const s = setup()
    const r = claimAndResolve(s, { prs: [s.pr73] })
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(staleOf(r), [])
  })

  test("no warning when the PR's head isn't the commit this clone has under that name, or is a fork's", () => {
    const s = setup()
    landByCherryPick(s)
    const moved = { ...s.pr73, headRefOid: "f".repeat(40) }
    assert.deepEqual(staleOf(claimAndResolve(s, { prs: [moved] })), [])
    const fork = { ...s.pr73, isCrossRepository: true }
    assert.deepEqual(stalePullRequestsOf(s, fork), [])
  })

  test("a gh that fails adds no finding and never fails the verb", () => {
    const s = setup()
    landByCherryPick(s)
    const r = claimAndResolve(s, { exit: 1 })
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(staleOf(r), [])
  })

  test("wf claim doesn't ask the host", () => {
    const s = setup()
    landByCherryPick(s)
    const r = s.run(["claim", "r/e#01", "--by", "me", "--json"], { prs: [s.pr73] })
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(staleOf(r), [])
  })

  test("wf map-status done warns too, and still closes the map", () => {
    const s = setup()
    landByCherryPick(s)
    claimAndResolve(s, { exit: 1 })
    const r = s.run(["map-status", "r/e", "done", "--force", "--json"], { prs: [s.pr73] })
    assert.equal(r.code, 0, r.stderr)
    assert.equal(staleOf(r).length, 1)
  })
})
