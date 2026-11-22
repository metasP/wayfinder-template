// `mainCheckout` (ticket nova-dance-retro-fixes-followup#05): doctor §10 also compares against the main
// checkout of a `source_repo` that is a linked worktree, since a worktree keeps its old branch.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mainCheckout } from "../template/_tools/lib/bootstrap/find-repo.mjs"

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" }
const git = (cwd, ...args) => assert.equal(spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: GIT_ENV }).status, 0)

/** A template repo root (template/ · skills/ · LICENSE) with one commit. */
const makeRepo = () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "find-repo-")))
  for (const d of ["template", "skills"]) mkdirSync(join(repo, d))
  writeFileSync(join(repo, "LICENSE"), "MIT\n")
  writeFileSync(join(repo, "template/README.md"), "# vault\n")
  git(repo, "init", "-q", "-b", "main")
  git(repo, "add", "-A")
  git(repo, "commit", "-qm", "init")
  return repo
}

describe("mainCheckout", () => {
  test("maps a linked worktree to the repo's main checkout", async () => {
    const repo = makeRepo()
    const wt = join(realpathSync(mkdtempSync(join(tmpdir(), "find-wt-"))), "old")
    git(repo, "worktree", "add", "-q", "--detach", wt)
    assert.equal(await mainCheckout(wt), repo)
  })

  test("returns the main checkout itself unchanged", async () => {
    const repo = makeRepo()
    assert.equal(await mainCheckout(repo), repo)
  })

  test("returns a dir git knows nothing about unchanged", async () => {
    const dir = mkdtempSync(join(tmpdir(), "find-plain-"))
    assert.equal(await mainCheckout(dir), dir)
    assert.equal(await mainCheckout(join(dir, "gone")), join(dir, "gone"))
  })
})
