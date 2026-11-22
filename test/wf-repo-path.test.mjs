// `wf repo-path <repo>` — where a repo's main checkout is on this machine, so a chip prompt names it and the
// session never guesses (nova-dance-retro-fixes-followup#04: a chip guessed /…/Git/blender, which doesn't
// exist). *Wayfinder Config* `repo_paths:` wins; else the main checkout its tickets' claims ran in.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { realpathSync } from "node:fs"
import { join } from "node:path"
import { git, makeVault, map, seed, ticket, wf } from "./vault.mjs"

const NO_SESSION = { CLAUDE_CODE_SESSION_ID: undefined }
const DESTINATION = "# The map\n\n## Destination\n\nSomewhere real.\n"
const BODY = "## Question\n\nq\n\n## Answer\n\n(filled in at resolve)\n"

// A work repo with a linked worktree on branch e-01, both real paths.
const workRepo = () => {
  const repo = realpathSync(seed(makeVault({ manifest: null })))
  const worktree = join(repo, ".worktrees/e-01")
  git(repo, "worktree", "add", "-q", "-b", "e-01", worktree)
  return { repo, worktree }
}

const vaultWith = ({ config, fields = {} } = {}) =>
  seed(
    makeVault({
      config,
      notes: [{ ...map("r/e/map.md"), body: DESTINATION }, { ...ticket("r/e/issues/01-a.md", fields), body: BODY }],
    }),
  )

const run = (vault, args, cwd = vault) => wf(vault, args, { cwd, env: NO_SESSION })

describe("wf repo-path", () => {
  test("prints the path Wayfinder Config repo_paths gives the repo", () => {
    const { repo } = workRepo()
    const vault = vaultWith({ config: { repo_paths: [`other=/nowhere`, `r=${repo}`] } })
    const r = run(vault, ["repo-path", "r"])
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.stdout.trim(), repo)
  })

  test("--json says where the path came from and whether the repo has origin", () => {
    const { repo } = workRepo()
    const vault = vaultWith({ config: { repo_paths: [`r = ${repo}`] } })
    const r = run(vault, ["repo-path", "r", "--json"])
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(r.json.data, { repo: "r", path: repo, source: "config", remote: false })
  })

  test("a configured path that does not exist is refused, naming the entry", () => {
    const vault = vaultWith({ config: { repo_paths: ["r=/no/such/dir"] } })
    const r = run(vault, ["repo-path", "r"])
    assert.equal(r.code, 1)
    assert.match(r.stderr, /r=\/no\/such\/dir/)
    assert.match(r.stderr, /fix: /)
  })

  test("without a Config entry, the main checkout the repo's claims ran in", () => {
    const { repo, worktree } = workRepo()
    const vault = vaultWith()
    assert.equal(run(vault, ["claim", "r/e#01", "--by", "me"], worktree).code, 0)
    const r = run(vault, ["repo-path", "r", "--json"])
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(r.json.data, { repo: "r", path: repo, source: "claims", remote: false })
  })

  test("a ticket's target_repo claims count for that repo, not its home repo", () => {
    const { repo, worktree } = workRepo()
    const vault = vaultWith({ fields: { target_repo: "t" } })
    assert.equal(run(vault, ["claim", "r/e#01", "--by", "me"], worktree).code, 0)
    assert.equal(run(vault, ["repo-path", "t"]).stdout.trim(), repo)
    assert.equal(run(vault, ["repo-path", "r"]).code, 1)
  })

  test("claims run in the vault itself say nothing about the repo", () => {
    const vault = vaultWith()
    assert.equal(run(vault, ["claim", "r/e#01", "--by", "me"], vault).code, 0)
    const r = run(vault, ["repo-path", "r"])
    assert.equal(r.code, 1)
    assert.match(r.stderr, /no path known for repo r/)
    assert.match(r.stderr, /repo_paths/)
  })

  test("a malformed repo_paths entry is refused", () => {
    const vault = vaultWith({ config: { repo_paths: ["just-a-name"] } })
    const r = run(vault, ["repo-path", "r"])
    assert.equal(r.code, 1)
    assert.match(r.stderr, /just-a-name/)
  })
})
