// A resolved ticket whose claim ran in a worktree (the claim commit's `Cwd:` trailer) on a branch that
// main doesn't contain yet: `wf lint` and `wf resolve` warn `unmerged-branch`, and `wf map-status done`
// refuses until the branch is merged (`--force` closes it anyway). Through the CLI against fixture vaults.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { realpathSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { git, makeVault, map, read, seed, ticket, wf, write } from "./vault.mjs"

const NO_SESSION = { CLAUDE_CODE_SESSION_ID: undefined }
const DESTINATION = "# The map\n\n## Destination\n\nSomewhere real.\n"
const ANSWER = "## Question\n\nq\n\n## Answer\n\n(filled in at resolve)\n"

// A vault with r/e#01 open, and a work repo with a worktree on branch e-01 holding one commit main lacks.
const setup = () => {
  const vault = seed(
    makeVault({ notes: [{ ...map("r/e/map.md"), body: DESTINATION }, { ...ticket("r/e/issues/01-a.md"), body: ANSWER }] }),
  )
  const repo = realpathSync(seed(makeVault({ manifest: null })))
  const main = git(repo, "rev-parse", "--abbrev-ref", "HEAD")
  const worktree = join(repo, ".worktrees/e-01")
  git(repo, "worktree", "add", "-q", "-b", "e-01", worktree)
  write(worktree, "work.txt", "done\n")
  git(worktree, "add", "work.txt")
  git(worktree, "commit", "-qm", "work")
  const answerFile = join(repo, "answer.md")
  writeFileSync(answerFile, "Did it.\n")
  const run = (args, cwd = worktree) => wf(vault, args, { cwd, env: NO_SESSION })
  return { vault, repo, main, worktree, answerFile, run }
}

const claimAndResolve = (s, cwd = s.worktree) => {
  assert.equal(s.run(["claim", "r/e#01", "--by", "me"], cwd).code, 0)
  return s.run(["resolve", "r/e#01", "--gist", "did it", "--answer-file", s.answerFile], cwd)
}

const unmergedOf = (r) => r.json.data.findings.filter((f) => f.rule === "unmerged-branch")

describe("unmerged-branch", () => {
  test("wf resolve warns when the claim's branch is not in main", () => {
    const s = setup()
    const r = claimAndResolve(s)
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stderr, /lint warn unmerged-branch r\/e#01: .*on branch e-01, not merged into /)
  })

  test("wf lint warns, naming the branch, main and the ff-merge command", () => {
    const s = setup()
    claimAndResolve(s)
    const r = s.run(["lint", "r/e", "--json"])
    assert.equal(r.code, 0, r.stderr)
    const [f] = unmergedOf(r)
    assert.equal(f.severity, "warn")
    assert.equal(f.ref, "r/e#01")
    assert.match(f.message, new RegExp(`claimed in ${s.worktree} on branch e-01, not merged into ${s.main}`))
    assert.equal(f.fix, `git -C ${s.worktree} rebase ${s.main} && git -C ${s.repo} merge --ff-only e-01`)
  })

  test("no warning once the branch is merged into main", () => {
    const s = setup()
    claimAndResolve(s)
    git(s.repo, "merge", "-q", "--ff-only", "e-01")
    assert.deepEqual(unmergedOf(s.run(["lint", "r/e", "--json"])), [])
  })

  test("no warning for a claim made in the main checkout, or a worktree since removed", () => {
    const inMain = setup()
    claimAndResolve(inMain, inMain.repo)
    assert.deepEqual(unmergedOf(inMain.run(["lint", "--json"], inMain.repo)), [])
    const removed = setup()
    claimAndResolve(removed)
    git(removed.repo, "worktree", "remove", "--force", removed.worktree)
    assert.deepEqual(unmergedOf(removed.run(["lint", "--json"], removed.repo)), [])
  })

  test("the latest claim wins: released and reclaimed from main, no warning", () => {
    const s = setup()
    assert.equal(s.run(["claim", "r/e#01", "--by", "me"]).code, 0)
    assert.equal(s.run(["release", "r/e#01", "--by", "me"]).code, 0)
    claimAndResolve(s, s.repo)
    assert.deepEqual(unmergedOf(s.run(["lint", "--json"], s.repo)), [])
  })

  test("wf map-status done refuses (exit 1) while a branch is unmerged; --force closes it anyway", () => {
    const s = setup()
    claimAndResolve(s)
    const head = git(s.vault, "rev-parse", "HEAD")
    const r = s.run(["map-status", "r/e", "done"])
    assert.equal(r.code, 1, r.stderr)
    assert.match(r.stderr, /r\/e has 1 unmerged branch: r\/e#01 \(e-01\) — merge it into main before the map is done/)
    assert.ok(r.stderr.split("\n").includes(`  fix: git -C ${s.worktree} rebase ${s.main} && git -C ${s.repo} merge --ff-only e-01`), r.stderr)
    assert.equal(git(s.vault, "rev-parse", "HEAD"), head, "no commit")
    assert.equal(s.run(["map-status", "r/e", "done", "--force"]).code, 0)
    assert.match(read(s.vault, "r/e/map.md"), /^status: done$/m)
  })

  test("wf map-status done goes through once the branch is merged", () => {
    const s = setup()
    claimAndResolve(s)
    git(s.repo, "merge", "-q", "--ff-only", "e-01")
    const r = s.run(["map-status", "r/e", "done"])
    assert.equal(r.code, 0, r.stderr)
  })
})
