// How bootstrap writes a file outside the vault (`~/.claude/settings.json`, `~/.claude/CLAUDE.md`), issue #47:
// it re-reads the file right before writing, so an edit made since bootstrap first read it (Claude Code
// saving an "always allow") is rewired rather than lost, and its `.bak` is written once — the file as it was
// before bootstrap first changed it — never overwritten by a later run. Temp files only.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { copyFile, readFile, writeFile } from "node:fs/promises"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { writeOwned } from "../template/_tools/lib/bootstrap/owned-file.mjs"

const io = { readFile, writeFile, copyFile }
const tempFile = (text) => {
  const path = join(mkdtempSync(join(tmpdir(), "owned-file-")), "settings.json")
  if (text !== null) writeFileSync(path, text)
  return path
}
// The rewiring bootstrap planned: append a line, or refuse what does not start with "ok".
const rewire = (text) => (text === null || text.startsWith("ok") ? { text: `${text ?? "ok"}\n+ wired` } : { error: "not ok" })

describe("writeOwned", () => {
  test("unchanged since it was read: writes what was planned, and backs the file up", async () => {
    const path = tempFile("ok 1")
    const r = await writeOwned(path, { seen: "ok 1", planned: "ok 1\n+ wired", rewire, io })
    assert.deepEqual(r, { status: "written", raced: false, backup: "created" })
    assert.equal(readFileSync(path, "utf8"), "ok 1\n+ wired")
    assert.equal(readFileSync(`${path}.bak`, "utf8"), "ok 1")
  })

  test("changed since it was read: rewires the content there now, so the other edit is kept", async () => {
    const path = tempFile("ok 1")
    writeFileSync(path, "ok 2 — always allow")
    const r = await writeOwned(path, { seen: "ok 1", planned: "ok 1\n+ wired", rewire, io })
    assert.deepEqual(r, { status: "written", raced: true, backup: "created" })
    assert.equal(readFileSync(path, "utf8"), "ok 2 — always allow\n+ wired")
  })

  test("changed into something it cannot rewire: writes nothing and says why", async () => {
    const path = tempFile("ok 1")
    writeFileSync(path, "{ half-written")
    const r = await writeOwned(path, { seen: "ok 1", planned: "ok 1\n+ wired", rewire, io })
    assert.deepEqual(r, { status: "refused", raced: true, backup: null, error: "not ok" })
    assert.equal(readFileSync(path, "utf8"), "{ half-written")
    assert.equal(existsSync(`${path}.bak`), false)
  })

  test("changed into what is already wired: writes nothing", async () => {
    const path = tempFile("ok 1")
    writeFileSync(path, "ok 1\n+ wired")
    const r = await writeOwned(path, { seen: "ok 1", planned: "ok 1\n+ wired", rewire: () => ({ text: "ok 1\n+ wired" }), io })
    assert.deepEqual(r, { status: "current", raced: true, backup: null })
  })

  test("a .bak already there is kept: it is the file from before the first change", async () => {
    const path = tempFile("ok 2")
    writeFileSync(`${path}.bak`, "ok 0 — before bootstrap")
    const r = await writeOwned(path, { seen: "ok 2", planned: "ok 2\n+ wired", rewire, io })
    assert.deepEqual(r, { status: "written", raced: false, backup: "kept" })
    assert.equal(readFileSync(`${path}.bak`, "utf8"), "ok 0 — before bootstrap")
  })

  test("no file before: written, nothing to back up", async () => {
    const path = tempFile(null)
    const r = await writeOwned(path, { seen: null, planned: "ok\n+ wired", rewire, io })
    assert.deepEqual(r, { status: "written", raced: false, backup: null })
    assert.equal(existsSync(`${path}.bak`), false)
  })

  test("with the writers switched off (--plan), reports the same and writes nothing", async () => {
    const path = tempFile("ok 1")
    const nop = async () => {}
    const r = await writeOwned(path, { seen: "ok 1", planned: "ok 1\n+ wired", rewire, io: { readFile, writeFile: nop, copyFile: nop } })
    assert.deepEqual(r, { status: "written", raced: false, backup: "created" })
    assert.equal(readFileSync(path, "utf8"), "ok 1")
    assert.equal(existsSync(`${path}.bak`), false)
  })
})

// `template/_tools/lib/` is copied into the vault and rendered like any other file: a lib file with the
// vault or date token in it would have it replaced on install (only bootstrap, doctor and autocommit.sh are
// exempt), so bootstrap's helpers there must never spell them.
describe("template/_tools/lib", () => {
  const LIB = fileURLToPath(new URL("../template/_tools/lib/", import.meta.url))
  const files = (dir) => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))

  test("no lib file holds the __VAULT__ or __TODAY__ token", () => {
    const holding = files(LIB).filter((path) => /__VAULT__|__TODAY__/.test(readFileSync(path, "utf8")))
    assert.deepEqual(holding, [])
  })
})
