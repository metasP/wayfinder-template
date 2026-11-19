// `npm run try-in-vault` (ticket dashboard-navigation-retro-fixes#01): put the template files a branch changed
// against main into a real vault in one command, back up what was there, undo it, and keep the tried files
// out of the vault's git history (autocommit runs `git add -A`).
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT = fileURLToPath(new URL("../scripts/try-in-vault.mjs", import.meta.url))
const DRIFT = fileURLToPath(new URL("../template/_tools/lib/template-drift.mjs", import.meta.url))
const TOKEN = "__" + "VAULT" + "__"
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" }

const put = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
}
const read = (root, rel) => readFileSync(join(root, rel), "utf8")
const git = (cwd, ...args) => {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: GIT_ENV })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout
}
const tryIn = (cwd, vault, ...args) =>
  spawnSync(process.execPath, [SCRIPT, "--vault", vault, ...args], { cwd, encoding: "utf8", env: GIT_ENV })

/** A template repo on `main` with a feature branch checked out. */
const makeRepo = () => {
  const repo = mkdtempSync(join(tmpdir(), "try-repo-"))
  git(repo, "init", "-q", "-b", "main")
  put(repo, "LICENSE", "MIT\n")
  put(repo, "template/README.md", "# vault\n")
  put(repo, "template/_tools/views/dashboard.js", "old view\n")
  put(repo, "template/_tools/doctor.mjs", "// old doctor\n")
  put(repo, "template/_tools/wf.mjs", `// ${TOKEN}/_tools\n`)
  put(repo, "skills/next/SKILL.md", "old skill\n")
  cpSync(DRIFT, join(repo, "template/_tools/lib/template-drift.mjs"))
  git(repo, "add", "-A")
  git(repo, "commit", "-qm", "init")
  git(repo, "switch", "-qc", "feature")
  return repo
}

/** An installed vault (its own git repo) and skills dir matching `main` of `makeRepo()`. */
const makeVault = () => {
  const vault = mkdtempSync(join(tmpdir(), "try-vault-"))
  const skills = mkdtempSync(join(tmpdir(), "try-skills-"))
  put(vault, ".wayfinder-template.json", JSON.stringify({ skills_dir: skills, parts: ["skills", "vault"] }))
  put(vault, "README.md", "# vault\n")
  put(vault, "_tools/views/dashboard.js", "old view\n")
  put(vault, "_tools/doctor.mjs", "// old doctor\n")
  put(vault, "_tools/wf.mjs", `// ${vault}/_tools\n`)
  put(skills, "next/SKILL.md", "old skill\n")
  git(vault, "init", "-q", "-b", "main")
  git(vault, "add", "-A")
  git(vault, "commit", "-qm", "install")
  return { vault, skills }
}

/** Branch work: a committed view + doctor, an uncommitted wf.mjs, a new lib file, a skill edit. */
const branchWork = (repo) => {
  put(repo, "template/_tools/views/dashboard.js", "new view\n")
  put(repo, "template/_tools/doctor.mjs", "console.log(\"doctor v2 ran\")\n")
  git(repo, "commit", "-qam", "view")
  put(repo, "template/_tools/wf.mjs", `// ${TOKEN}/_tools v2\n`)
  put(repo, "template/_tools/lib/new.mjs", "fresh\n")
  put(repo, "skills/next/SKILL.md", "new skill\n")
}

describe("try-in-vault", () => {
  test("puts every changed template file into the vault, rendered, with the doctor going along", () => {
    const repo = makeRepo()
    const { vault, skills } = makeVault()
    branchWork(repo)

    const r = tryIn(repo, vault)

    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.equal(read(vault, "_tools/views/dashboard.js"), "new view\n")
    assert.equal(read(vault, "_tools/doctor.mjs"), "console.log(\"doctor v2 ran\")\n")
    assert.equal(read(vault, "_tools/wf.mjs"), `// ${vault}/_tools v2\n`)
    assert.equal(read(vault, "_tools/lib/new.mjs"), "fresh\n")
    assert.equal(read(skills, "next/SKILL.md"), "new skill\n")
    assert.equal(read(vault, "README.md"), "# vault\n")
    assert.match(r.stdout, /doctor v2 ran/)
    assert.match(r.stdout, /ดูด้วยตา/)
  })

  test("keeps the tried files out of the vault's git so autocommit does not commit them", () => {
    const repo = makeRepo()
    const { vault } = makeVault()
    branchWork(repo)

    tryIn(repo, vault)

    assert.equal(git(vault, "status", "--porcelain", "-uall"), "")
  })

  test("--undo puts back what was there, removes new files, and leaves git as it was", () => {
    const repo = makeRepo()
    const { vault, skills } = makeVault()
    branchWork(repo)
    tryIn(repo, vault)

    const r = tryIn(repo, vault, "--undo")

    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.equal(read(vault, "_tools/views/dashboard.js"), "old view\n")
    assert.equal(read(vault, "_tools/wf.mjs"), `// ${vault}/_tools\n`)
    assert.equal(existsSync(join(vault, "_tools/lib/new.mjs")), false)
    assert.equal(read(skills, "next/SKILL.md"), "old skill\n")
    assert.equal(git(vault, "status", "--porcelain", "-uall"), "")
    assert.equal(git(vault, "ls-files", "-v").split("\n").filter((l) => l.startsWith("S ")).length, 0)
    assert.match(tryIn(repo, vault, "--status").stdout, /ไม่มีอะไรลองค้าง/)
  })

  test("trying again from the same worktree keeps the first backup", () => {
    const repo = makeRepo()
    const { vault } = makeVault()
    branchWork(repo)
    tryIn(repo, vault)
    put(repo, "template/_tools/views/dashboard.js", "newer view\n")

    tryIn(repo, vault)
    assert.equal(read(vault, "_tools/views/dashboard.js"), "newer view\n")
    tryIn(repo, vault, "--undo")

    assert.equal(read(vault, "_tools/views/dashboard.js"), "old view\n")
  })

  test("a vault behind main gets main's files too, so the doctor never lags the views", () => {
    const repo = makeRepo()
    const { vault } = makeVault()
    put(vault, "_tools/doctor.mjs", "// doctor from an older release\n")
    git(vault, "commit", "-qam", "older")
    put(repo, "template/_tools/views/dashboard.js", "new view\n")

    tryIn(repo, vault)

    assert.equal(read(vault, "_tools/doctor.mjs"), "// old doctor\n")
    tryIn(repo, vault, "--undo")
    assert.equal(read(vault, "_tools/doctor.mjs"), "// doctor from an older release\n")
  })

  test("--forget keeps the tried files and hands them back to the vault's git", () => {
    const repo = makeRepo()
    const { vault } = makeVault()
    branchWork(repo)
    tryIn(repo, vault)

    const r = tryIn(repo, vault, "--forget")

    assert.equal(r.status, 0, r.stderr)
    assert.equal(read(vault, "_tools/views/dashboard.js"), "new view\n")
    assert.match(git(vault, "status", "--porcelain", "-uall"), /_tools\/views\/dashboard\.js[\s\S]*_tools\/lib\/new\.mjs|_tools\/lib\/new\.mjs[\s\S]*_tools\/views\/dashboard\.js/)
    assert.match(tryIn(repo, vault, "--status").stdout, /ไม่มีอะไรลองค้าง/)
  })

  test("a file the branch stopped changing is put back on the next try", () => {
    const repo = makeRepo()
    const { vault } = makeVault()
    branchWork(repo)
    tryIn(repo, vault)
    put(repo, "template/_tools/wf.mjs", `// ${TOKEN}/_tools\n`)

    tryIn(repo, vault)

    assert.equal(read(vault, "_tools/wf.mjs"), `// ${vault}/_tools\n`)
  })

  test("refuses to try a second worktree on top of another one's try", () => {
    const repo = makeRepo()
    const other = makeRepo()
    const { vault } = makeVault()
    branchWork(repo)
    branchWork(other)
    tryIn(repo, vault)

    const r = tryIn(other, vault)

    assert.equal(r.status, 2)
    assert.match(r.stderr, /undo ก่อน/)
    assert.equal(read(vault, "_tools/views/dashboard.js"), "new view\n")
  })

  test("--undo skips a file someone edited after the try, unless --force", () => {
    const repo = makeRepo()
    const { vault } = makeVault()
    branchWork(repo)
    tryIn(repo, vault)
    put(vault, "_tools/views/dashboard.js", "hand edit\n")

    const r = tryIn(repo, vault, "--undo")
    assert.equal(r.status, 1)
    assert.equal(read(vault, "_tools/views/dashboard.js"), "hand edit\n")
    assert.equal(read(vault, "_tools/doctor.mjs"), "// old doctor\n")

    tryIn(repo, vault, "--undo", "--force")
    assert.equal(read(vault, "_tools/views/dashboard.js"), "old view\n")
  })

  test("refuses a folder that is not an installed vault", () => {
    const repo = makeRepo()
    const r = tryIn(repo, mkdtempSync(join(tmpdir(), "not-vault-")))
    assert.equal(r.status, 2)
    assert.match(r.stderr, /ไม่ใช่ vault/)
  })
})
