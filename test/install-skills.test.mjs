// `npm run install-skills` (ticket nova-dance-retro-fixes-followup#05): installs the template's skills into
// the dirs the vault's manifest names, rendering the vault path the way the installer does, and
// `--check` says whether the installed copies differ from the template — instead of a hand-made sed copy.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT = fileURLToPath(new URL("../scripts/install-skills.mjs", import.meta.url))
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
const installSkills = (cwd, vault, ...args) =>
  spawnSync(process.execPath, [SCRIPT, "--vault", vault, ...args], { cwd, encoding: "utf8", env: GIT_ENV })

/** A template repo on `main` with one skill that carries the vault-path token. */
const makeRepo = () => {
  const repo = mkdtempSync(join(tmpdir(), "skills-repo-"))
  git(repo, "init", "-q", "-b", "main")
  put(repo, "LICENSE", "MIT\n")
  put(repo, "template/README.md", "# vault\n")
  put(repo, "skills/next/SKILL.md", `run ${TOKEN}/_tools/wf.mjs\n`)
  cpSync(DRIFT, join(repo, "template/_tools/lib/template-drift.mjs"))
  git(repo, "add", "-A")
  git(repo, "commit", "-qm", "init")
  return repo
}

/** A vault (a git repo) whose manifest installs skill `next` under a temp skills dir. */
const makeVault = () => {
  const vault = mkdtempSync(join(tmpdir(), "skills-vault-"))
  const skills = mkdtempSync(join(tmpdir(), "skills-dir-"))
  git(vault, "init", "-q", "-b", "main")
  const manifest = { schema: 1, parts: ["skills", "vault"], skills_dir: skills, skills_targets: { next: join(skills, "next") } }
  put(vault, ".wayfinder-template.json", `${JSON.stringify(manifest)}\n`)
  return { vault, skills }
}

describe("install-skills --check", () => {
  test("exits 1 and names the skill whose installed copy differs, without writing it", () => {
    const repo = makeRepo()
    const { vault, skills } = makeVault()
    put(skills, "next/SKILL.md", "a hand-made copy\n")
    const r = installSkills(repo, vault, "--check")
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.match(r.stdout, /≠ skills\/next\/SKILL\.md/)
    assert.equal(read(skills, "next/SKILL.md"), "a hand-made copy\n")
  })

  test("exits 1 and names a skill that is not installed", () => {
    const repo = makeRepo()
    const { vault } = makeVault()
    const r = installSkills(repo, vault, "--check")
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.match(r.stdout, /ไม่มี skills\/next\/SKILL\.md/)
  })

  test("exits 0 when the installed copy is the template rendered for this vault", () => {
    const repo = makeRepo()
    const { vault, skills } = makeVault()
    put(skills, "next/SKILL.md", `run ${vault}/_tools/wf.mjs\n`)
    const r = installSkills(repo, vault, "--check")
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /ตรงกับ template/)
  })
})

describe("install-skills", () => {
  test("writes the skill with the vault path rendered, then --check passes", () => {
    const repo = makeRepo()
    const { vault, skills } = makeVault()
    const r = installSkills(repo, vault)
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(read(skills, "next/SKILL.md"), `run ${vault}/_tools/wf.mjs\n`)
    assert.match(r.stdout, /skills\/next\/SKILL\.md/)
    assert.equal(installSkills(repo, vault, "--check").status, 0)
  })

  test("keeps the replaced copy in the vault's .git, not beside the skill", () => {
    const repo = makeRepo()
    const { vault, skills } = makeVault()
    put(skills, "next/SKILL.md", "a hand-made copy\n")
    assert.equal(installSkills(repo, vault).status, 0)
    assert.deepEqual(readdirSync(join(skills, "next")), ["SKILL.md"])
    const backups = join(vault, ".git/wayfinder-skills-backup")
    const [stamp] = readdirSync(backups)
    assert.equal(read(join(backups, stamp), "next/SKILL.md"), "a hand-made copy\n")
  })

  test("a skill that already matches is left alone and no backup is made", () => {
    const repo = makeRepo()
    const { vault, skills } = makeVault()
    put(skills, "next/SKILL.md", `run ${vault}/_tools/wf.mjs\n`)
    const r = installSkills(repo, vault)
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /ตรงกับ template อยู่แล้ว/)
    assert.equal(existsSync(join(vault, ".git/wayfinder-skills-backup")), false)
  })

  test("names the branch and commit it installs from", () => {
    const repo = makeRepo()
    const { vault } = makeVault()
    const head = git(repo, "rev-parse", "--short", "HEAD").trim()
    const r = installSkills(repo, vault)
    assert.match(r.stdout, new RegExp(`main @ ${head}`))
  })

  test("refuses a dir that is not an installed vault", () => {
    const repo = makeRepo()
    const notVault = mkdtempSync(join(tmpdir(), "not-vault-"))
    const r = installSkills(repo, notVault)
    assert.equal(r.status, 2)
    assert.match(r.stderr, /ไม่ใช่ vault ที่ติดตั้งแล้ว/)
  })

  test("a manifest that is not JSON is a usage error (exit 2), not drift (exit 1)", () => {
    const repo = makeRepo()
    const { vault } = makeVault()
    put(vault, ".wayfinder-template.json", "{ not json\n")
    const r = installSkills(repo, vault, "--check")
    assert.equal(r.status, 2, r.stdout + r.stderr)
    assert.match(r.stderr, /อ่านไม่ออก/)
  })

  test("a vault that is not a git repo is refused before any skill is written", () => {
    const repo = makeRepo()
    const vault = mkdtempSync(join(tmpdir(), "skills-nogit-"))
    const skills = mkdtempSync(join(tmpdir(), "skills-dir-"))
    put(vault, ".wayfinder-template.json", `${JSON.stringify({ schema: 1, skills_targets: { next: join(skills, "next") } })}\n`)
    put(skills, "next/SKILL.md", "a hand-made copy\n")
    const r = installSkills(repo, vault)
    assert.equal(r.status, 2, r.stdout + r.stderr)
    assert.equal(read(skills, "next/SKILL.md"), "a hand-made copy\n")
  })

  test("--vault naming a linked worktree of the vault renders and backs up as the main checkout", () => {
    const repo = makeRepo()
    const { vault, skills } = makeVault()
    git(vault, "add", "-A")
    git(vault, "commit", "-qm", "manifest")
    const wt = join(mkdtempSync(join(tmpdir(), "skills-vault-wt-")), "wt")
    git(vault, "worktree", "add", "-q", "--detach", wt)
    put(skills, "next/SKILL.md", "a hand-made copy\n")
    assert.equal(installSkills(repo, wt).status, 0)
    assert.equal(read(skills, "next/SKILL.md"), `run ${realpathSync(vault)}/_tools/wf.mjs\n`)
    assert.ok(existsSync(join(vault, ".git/wayfinder-skills-backup")))
  })

  test("refuses a vault installed without skills", () => {
    const repo = makeRepo()
    const { vault } = makeVault()
    put(vault, ".wayfinder-template.json", `${JSON.stringify({ schema: 1, parts: ["vault"] })}\n`)
    const r = installSkills(repo, vault)
    assert.equal(r.status, 2)
    assert.match(r.stderr, /ไม่ได้ติดตั้งสกิล/)
  })
})
