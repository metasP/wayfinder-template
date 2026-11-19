// merge-route-fixes#03: tickets built on unmerged PR #73 copied its files into the vault and the installed
// skills by hand; `bootstrap --yes` from main then overwrote or removed them, and the next ticket had to
// cherry-pick them back. An update now stops `--yes` before writing anything when it would overwrite or
// remove a change only the vault has — an installed copy edited after the last install, or one the last
// install wrote from a commit this checkout lacks — unless `--discard-vault-changes`. Every run gets a temp
// `HOME` and a vault inside it.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { execFile, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { templateLineage, vaultOnlyChanges } from "../template/_tools/lib/bootstrap/vault-only.mjs"

const BOOTSTRAP = fileURLToPath(new URL("../template/_tools/bootstrap.mjs", import.meta.url))
const run = promisify(execFile)

function machine() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "bootstrap-vault-only-")))
  writeFileSync(join(home, ".gitconfig"), "[user]\n\tname = t\n\temail = t@example.invalid\n[commit]\n\tgpgsign = false\n")
  mkdirSync(join(home, "Library/Application Support/obsidian"), { recursive: true })
  writeFileSync(join(home, "Library/Application Support/obsidian/obsidian.json"), '{ "vaults": {} }\n')
  mkdirSync(join(home, ".claude"))
  return { home, vault: join(home, "vault"), skills: join(home, "skills") }
}

function bootstrap({ home }, args) {
  const env = { ...process.env, HOME: home }
  delete env.GIT_CONFIG_GLOBAL
  const r = spawnSync(process.execPath, [BOOTSTRAP, ...args], { encoding: "utf8", env })
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, out: `${r.stdout}\n${r.stderr}` }
}

const installed = () => {
  const m = machine()
  const r = bootstrap(m, ["--vault", m.vault, "--parts", "all", "--on-conflict", "skip", "--skills-dir", m.skills, "--allow-brew", "no"])
  assert.equal(r.code, 0, r.out)
  return m
}

const update = (m, ...flags) => bootstrap(m, ["--vault", m.vault, ...flags])
const EDIT = "\nA line only the vault has.\n"
const editVault = (m, rel) => writeFileSync(join(m.vault, rel), readFileSync(join(m.vault, rel), "utf8") + EDIT)

describe("bootstrap update: a change only the vault has", () => {
  test("--yes stops before writing anything, naming the file and the way out", () => {
    const m = installed()
    editVault(m, "README.md")
    const r = update(m, "--yes")
    assert.equal(r.code, 2, r.out)
    assert.match(r.stderr, /หยุดก่อนเขียนอะไรทั้งนั้น — update นี้จะทับ\/ลบของที่มีแต่ใน vault 1 ไฟล์:\n\s+README\.md/)
    assert.match(r.stderr, /--discard-vault-changes/)
    assert.ok(readFileSync(join(m.vault, "README.md"), "utf8").endsWith(EDIT), "the edit is kept")
  })

  test("an edited installed skill stops it too", () => {
    const m = installed()
    const skill = join(m.skills, "wayfinder-next/SKILL.md")
    writeFileSync(skill, readFileSync(skill, "utf8") + EDIT)
    const r = update(m, "--yes")
    assert.equal(r.code, 2, r.out)
    assert.match(r.stderr, /skills\/wayfinder-next\/SKILL\.md/)
    assert.ok(readFileSync(skill, "utf8").endsWith(EDIT))
  })

  test("--plan says --yes would stop there, and exits as a plan", () => {
    const m = installed()
    editVault(m, "README.md")
    const r = update(m, "--plan")
    assert.equal(r.code, 0, r.out)
    assert.match(r.stdout, /--yes จะหยุดตรงนี้ — update นี้จะทับ\/ลบของที่มีแต่ใน vault 1 ไฟล์/)
  })

  test("--discard-vault-changes overwrites it with the template's copy", () => {
    const m = installed()
    editVault(m, "README.md")
    const r = update(m, "--yes", "--discard-vault-changes")
    assert.equal(r.code, 0, r.out)
    assert.ok(!readFileSync(join(m.vault, "README.md"), "utf8").endsWith(EDIT))
  })

  test("an installed copy that already matches the template is no reason to stop", () => {
    const m = installed()
    const r = update(m, "--yes")
    assert.equal(r.code, 0, r.out)
    assert.doesNotMatch(r.out, /ของที่มีแต่ใน vault/)
  })
})

describe("vaultOnlyChanges", () => {
  const e = (shown, now, next, prev) => ({ shown, now, next, prev })
  test("an installed copy edited since the last install, to be overwritten or removed", () => {
    const entries = [e("edited", "x", "n", "p"), e("removed", "x", null, "p"), e("as-installed", "p", "n", "p"), e("gone", null, "n", "p"), e("current", "n", "n", "p")]
    assert.deepEqual(vaultOnlyChanges({ entries, diverged: false }), ["edited", "removed"])
  })

  test("after an install from a commit this checkout lacks, even the installed bytes count", () => {
    const entries = [e("as-installed", "p", "n", "p"), e("dropped", "p", null, "p"), e("current", "n", "n", "p")]
    assert.deepEqual(vaultOnlyChanges({ entries, diverged: true }), ["as-installed", "dropped"])
  })
})

describe("templateLineage", () => {
  const repo = () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "lineage-")))
    const g = (...args) => spawnSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).stdout.trim()
    g("init", "-q", "-b", "main")
    g("commit", "-q", "--allow-empty", "-m", "base")
    const base = g("rev-parse", "HEAD")
    g("switch", "-q", "-c", "pr-73")
    g("commit", "-q", "--allow-empty", "-m", "pr 73")
    const pr = g("rev-parse", "HEAD")
    g("switch", "-q", "main")
    g("commit", "-q", "--allow-empty", "-m", "main moves on")
    return { dir, base, pr, head: g("rev-parse", "HEAD") }
  }

  test("an install from a branch main lacks names that branch", async () => {
    const r = repo()
    assert.deepEqual(await templateLineage({ run, repo: r.dir, installed: r.pr, head: r.head }), { installed: r.pr, branches: ["pr-73"] })
  })

  test("null for an ancestor, the same commit, an unknown commit or no sha", async () => {
    const r = repo()
    assert.equal(await templateLineage({ run, repo: r.dir, installed: r.base, head: r.head }), null)
    assert.equal(await templateLineage({ run, repo: r.dir, installed: r.head, head: r.head }), null)
    assert.equal(await templateLineage({ run, repo: r.dir, installed: "0".repeat(40), head: r.head }), null)
    assert.equal(await templateLineage({ run, repo: r.dir, installed: null, head: r.head }), null)
  })
})
