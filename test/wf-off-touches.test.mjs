// A ticket with `touches:` whose claim branch changes files no entry covers: `wf lint` warns `off-touches`
// while it is claimed, the post-write lint of `wf resolve` warns once more, and widening `touches:` clears it
// (actor-toolkit-retro-fixes#08). Through the CLI against fixture vaults.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { realpathSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { git, makeVault, map, seed, ticket, wf, write } from "./vault.mjs"

const NO_SESSION = { CLAUDE_CODE_SESSION_ID: undefined }
const DESTINATION = "# The map\n\n## Destination\n\nSomewhere real.\n"
const ANSWER = "## Question\n\nq\n\n## Answer\n\n(filled in at resolve)\n"

// A vault with r/e#01 (touches: src/**), and a work repo with a worktree on branch e-01.
const setup = ({ touches = ["src/**"] } = {}) => {
  const fields = touches === undefined || touches === null ? {} : { touches }
  const vault = seed(
    makeVault({ notes: [{ ...map("r/e/map.md"), body: DESTINATION }, { ...ticket("r/e/issues/01-a.md", fields), body: ANSWER }] }),
  )
  const repo = realpathSync(seed(makeVault({ manifest: null })))
  const worktree = join(repo, ".worktrees/e-01")
  git(repo, "worktree", "add", "-q", "-b", "e-01", worktree)
  const commit = (path, text = "x\n") => {
    write(worktree, path, text)
    git(worktree, "add", path)
    git(worktree, "commit", "-qm", `add ${path}`)
  }
  const answerFile = join(repo, "answer.md")
  writeFileSync(answerFile, "Did it.\n")
  const run = (args, cwd = worktree) => wf(vault, args, { cwd, env: NO_SESSION })
  assert.equal(run(["claim", "r/e#01", "--by", "me"]).code, 0)
  return { vault, repo, worktree, commit, answerFile, run }
}

const offOf = (r) => r.json.data.findings.filter((f) => f.rule === "off-touches")
const lintOff = (s) => {
  const r = s.run(["lint", "r/e", "--json"])
  assert.equal(r.code, 0, r.stderr)
  return offOf(r)
}

describe("off-touches", () => {
  test("no warning while the branch writes only inside touches", () => {
    const s = setup()
    s.commit("src/a.js")
    assert.deepEqual(lintOff(s), [])
  })

  test("wf lint warns about a committed file outside touches, with the widening command", () => {
    const s = setup()
    s.commit("src/a.js")
    s.commit("README.md")
    const [f, ...rest] = lintOff(s)
    assert.equal(rest.length, 0)
    assert.equal(f.severity, "warn")
    assert.equal(f.ref, "r/e#01")
    assert.match(f.message, /branch e-01 changes 1 file outside touches: README\.md/)
    assert.equal(f.fix, "wf touches 'r/e#01' 'src/**' README.md")
  })

  test("counts uncommitted and untracked files in the claim's worktree", () => {
    const s = setup()
    s.commit("docs/a.md")
    write(s.worktree, "docs/a.md", "changed\n")
    write(s.worktree, "notes.txt", "new\n")
    const [f] = lintOff(s)
    assert.match(f.message, /changes 2 files outside touches: docs\/a\.md, notes\.txt/)
  })

  test("widening touches clears the warning", () => {
    const s = setup()
    s.commit("README.md")
    const r = s.run(["touches", "r/e#01", "src/**", "README.md"])
    assert.equal(r.code, 0, r.stderr)
    assert.doesNotMatch(r.stderr, /off-touches/)
    assert.deepEqual(lintOff(s), [])
  })

  test("wf resolve warns in its post-write lint", () => {
    const s = setup()
    s.commit("README.md")
    const r = s.run(["resolve", "r/e#01", "--gist", "did it", "--answer-file", s.answerFile])
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stderr, /lint warn off-touches r\/e#01: branch e-01 changes 1 file outside touches: README\.md/)
  })

  test("touches: [] (answer only) flags every file the branch writes", () => {
    const s = setup({ touches: [] })
    s.commit("src/a.js")
    const [f] = lintOff(s)
    assert.match(f.message, /outside touches: src\/a\.js/)
  })

  test("no touches: means the type default — nothing to compare", () => {
    const s = setup({ touches: null })
    s.commit("README.md")
    assert.deepEqual(lintOff(s), [])
  })

  test("past 20 files the fix widens by folder, and a leading - stays a path", () => {
    const s = setup()
    for (let i = 0; i < 21; i++) write(s.worktree, `gen/out-${i}.txt`, "x\n")
    write(s.worktree, "-odd.md", "x\n")
    const [f] = lintOff(s)
    assert.match(f.message, /changes 22 files outside touches/)
    assert.equal(f.fix, "wf touches 'r/e#01' 'src/**' ./-odd.md 'gen/**'")
  })

  test("--rule off-touches lists only this rule", () => {
    const s = setup()
    s.commit("README.md")
    const r = s.run(["lint", "r/e", "--rule", "off-touches", "--json"])
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(r.json.data.findings.map((f) => f.rule), ["off-touches"])
  })
})
