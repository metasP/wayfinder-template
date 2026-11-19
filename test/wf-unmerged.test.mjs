// A resolved ticket whose claim ran on a branch (the claim commit's `Branch:` and `Cwd:` trailers) that
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

  test("no warning for a claim made on main's own branch", () => {
    const s = setup()
    claimAndResolve(s, s.repo)
    assert.deepEqual(unmergedOf(s.run(["lint", "--json"], s.repo)), [])
  })

  test("a removed worktree whose branch is kept still warns, with no rebase; deleting the branch clears it", () => {
    const s = setup()
    claimAndResolve(s)
    git(s.repo, "worktree", "remove", "--force", s.worktree)
    const [f] = unmergedOf(s.run(["lint", "--json"], s.repo))
    assert.equal(f.fix, `git -C ${s.repo} merge --ff-only e-01`)
    git(s.repo, "branch", "-D", "e-01")
    assert.deepEqual(unmergedOf(s.run(["lint", "--json"], s.repo)), [])
  })

  test("a worktree reused for another branch: still the claimed branch, and no rebase in the wrong one", () => {
    const s = setup()
    claimAndResolve(s)
    git(s.worktree, "switch", "-q", "-c", "other")
    const [f] = unmergedOf(s.run(["lint", "--json"], s.repo))
    assert.match(f.message, /on branch e-01,/)
    assert.equal(f.fix, `git -C ${s.repo} merge --ff-only e-01`)
  })

  test("a branch squash-merged into main by hand counts as merged", () => {
    const s = setup()
    claimAndResolve(s)
    git(s.repo, "merge", "-q", "--squash", "e-01")
    git(s.repo, "commit", "-qm", "squash e-01")
    assert.deepEqual(unmergedOf(s.run(["lint", "--json"], s.repo)), [])
  })

  test("the fix quotes a branch name the shell would read", () => {
    const s = setup()
    git(s.worktree, "branch", "-m", "e-01", "e-01$x")
    claimAndResolve(s)
    const [f] = unmergedOf(s.run(["lint", "--json"], s.repo))
    assert.equal(f.fix, `git -C ${s.worktree} rebase ${s.main} && git -C ${s.repo} merge --ff-only 'e-01$x'`)
  })

  test("an answer that links a pull request: the PR owns the merge", () => {
    const s = setup()
    writeFileSync(s.answerFile, "Did it: https://github.com/o/r/pull/12\n")
    claimAndResolve(s)
    assert.deepEqual(unmergedOf(s.run(["lint", "--json"], s.repo)), [])
  })

  // As an older wf left it: the worktree's claim, with only Cwd — and this time from a worktree reused for
  // another ticket, so its checked-out branch says nothing.
  const oldClaim = (s, cwd = s.worktree) =>
    git(s.vault, "commit", "-q", "--allow-empty", "-m", `wf(claim): r/e#01\n\nCwd: ${cwd}`)

  test("a claim without a Branch trailer: the branch is found by its <effort>-<NN> name", () => {
    const s = setup()
    git(s.worktree, "branch", "-m", "e-01", "claude/e-01-7c4ab6")
    claimAndResolve(s, s.repo)
    oldClaim(s)
    git(s.worktree, "switch", "-q", "-c", "reused-for-e-06")
    const [f] = unmergedOf(s.run(["lint", "--json"], s.repo))
    assert.equal(f.ref, "r/e#01")
    assert.match(f.message, /on branch claude\/e-01-7c4ab6 \(found by name — the claim has no Branch:\), not merged into /)
    assert.equal(f.fix, `git -C ${s.repo} merge --ff-only claude/e-01-7c4ab6`)
  })

  test("a claim without a Branch trailer: wf map-status done refuses while the named branch is unmerged", () => {
    const s = setup()
    claimAndResolve(s, s.repo)
    oldClaim(s)
    const r = s.run(["map-status", "r/e", "done"], s.repo)
    assert.equal(r.code, 1, r.stderr)
    assert.match(r.stderr, /r\/e has 1 unmerged branch: r\/e#01 \(e-01\)/)
  })

  test("a claim without a Branch trailer: a name that only contains <effort>-<NN> is not the ticket's", () => {
    const s = setup()
    git(s.worktree, "branch", "-m", "e-01", "other-e-012")
    claimAndResolve(s, s.repo)
    oldClaim(s)
    assert.deepEqual(unmergedOf(s.run(["lint", "--json"], s.repo)), [])
  })

  test("a claim without a Branch trailer: another effort's ticket (<effort>-<NN>-<NN>) is not the ticket's", () => {
    const s = setup()
    git(s.worktree, "branch", "-m", "e-01", "claude/e-01-02")
    claimAndResolve(s, s.repo)
    oldClaim(s)
    assert.deepEqual(unmergedOf(s.run(["lint", "--json"], s.repo)), [])
  })

  test("a claim without a Branch trailer: no warning once the named branch is merged", () => {
    const s = setup()
    claimAndResolve(s, s.repo)
    oldClaim(s)
    git(s.repo, "merge", "-q", "--ff-only", "e-01")
    assert.deepEqual(unmergedOf(s.run(["lint", "--json"], s.repo)), [])
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

// merge-route-fixes#01: chips fast-forwarded main in the main checkout (tickets 04–07) beside `gh pr merge`
// (01–03), and local main ended up ahead 5 / behind 2 of origin. With an `origin`, merged means in
// origin/main — a branch local main has but origin doesn't is not shipped — and the fix opens a PR.
describe("unmerged-branch with an origin", () => {
  // `setup()`'s work repo, with a bare `origin` holding main as it stood before the work.
  const setupWithOrigin = () => {
    const s = setup()
    const bare = `${s.repo}-origin.git`
    git(s.repo, "clone", "-q", "--bare", s.repo, bare)
    git(s.repo, "remote", "add", "origin", bare)
    git(s.repo, "fetch", "-q", "origin")
    return s
  }
  const prFix = (s, dir = s.worktree, rebase = true) =>
    `git -C ${dir} fetch origin && ${rebase ? `git -C ${dir} rebase origin/${s.main} && ` : ""}git -C ${dir} push --force-with-lease -u origin e-01 && cd ${dir} && gh pr create --base ${s.main} --head e-01 --fill`

  test("warns against origin/main and fixes it with a PR, not a fast-forward of local main", () => {
    const s = setupWithOrigin()
    claimAndResolve(s)
    const [f] = unmergedOf(s.run(["lint", "--json"], s.repo))
    assert.match(f.message, new RegExp(`on branch e-01, not merged into origin/${s.main} — open a PR`))
    assert.equal(f.fix, prFix(s))
  })

  test("a branch fast-forwarded into local main only still warns: main in this checkout is not shipped", () => {
    const s = setupWithOrigin()
    claimAndResolve(s)
    git(s.repo, "merge", "-q", "--ff-only", "e-01")
    const [f] = unmergedOf(s.run(["lint", "--json"], s.repo))
    assert.match(f.message, new RegExp(`not merged into origin/${s.main}`))
  })

  test("no warning once origin/main has the branch, even while local main is behind", () => {
    const s = setupWithOrigin()
    claimAndResolve(s)
    git(s.repo, "push", "-q", "origin", `e-01:${s.main}`)
    git(s.repo, "fetch", "-q", "origin")
    assert.deepEqual(unmergedOf(s.run(["lint", "--json"], s.repo)), [])
  })

  test("a removed worktree: the PR fix pushes from the main checkout, with no rebase", () => {
    const s = setupWithOrigin()
    claimAndResolve(s)
    git(s.repo, "worktree", "remove", "--force", s.worktree)
    const [f] = unmergedOf(s.run(["lint", "--json"], s.repo))
    assert.equal(f.fix, prFix(s, s.repo, false))
  })

  test("wf map-status done refuses while only local main has the branch", () => {
    const s = setupWithOrigin()
    claimAndResolve(s)
    git(s.repo, "merge", "-q", "--ff-only", "e-01")
    const r = s.run(["map-status", "r/e", "done"])
    assert.equal(r.code, 1, r.stderr)
    assert.ok(r.stderr.split("\n").includes(`  fix: ${prFix(s)}`), r.stderr)
  })
})
