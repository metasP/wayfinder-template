// Issue #47, below the process level: which hooks the wiring counts as ours and which matchers as
// `Write|Edit` (false positives remove someone else's hook, so the misses are tested too), and steps 4f/4g
// of bootstrap writing over a `~/.claude` file that was edited after bootstrap read it. Temp files only.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isWriteEdit, wfAllowRule, wireSettings } from "../template/_tools/lib/wiring.mjs"
import { readClaudeFiles, wireClaudeFiles } from "../template/_tools/lib/bootstrap/claude.mjs"

describe("isWriteEdit", () => {
  for (const matcher of ["Write|Edit", "Edit|Write", "^(Edit|Write)$", "^(?:Write|Edit)$"])
    test(`counts ${matcher}`, () => assert.equal(isWriteEdit(matcher), true))

  // `^Write|Edit$` and an unanchored group match `MultiEdit` under a regex search; the rest are wider or narrower.
  for (const matcher of ["^Write|Edit$", "(Edit|Write)", "^(Edit|Write)", "Write|Edit|Bash", ".*", "*", "", "Write", "write|edit", "Write|Write", "((Edit|Write))"])
    test(`does not count ${JSON.stringify(matcher)}`, () => assert.equal(isWriteEdit(matcher), false))

  test("does not count a matcher that is not a string", () => assert.equal(isWriteEdit(undefined), false))
})

describe("wireSettings: which hooks are ours", () => {
  const home = "/home/me"
  const vault = "/home/me/vault"
  const autocommitOn = (matcher, command) => ({ hooks: { PostToolUse: [{ matcher, hooks: [{ type: "command", command }] }] } })
  const postHooks = (settings) => wireSettings(settings, { vault, home }).settings.hooks.PostToolUse

  for (const command of ["~/vault/_tools/autocommit.sh", "$HOME/vault/_tools/autocommit.sh || true", '"${HOME}/vault/_tools/autocommit.sh"'])
    test(`removes ${command} on Bash`, () => {
      assert.deepEqual(postHooks(autocommitOn("Bash", command)).map((b) => b.matcher), ["Write|Edit"])
    })

  for (const command of ["~/vault2/_tools/autocommit.sh", "~other/vault/_tools/autocommit.sh", "$HOMEX/vault/_tools/autocommit.sh",
    "~/vault/_tools/autocommit.sh.bak", "/elsewhere/home/me/vault/_tools/autocommit.sh"])
    test(`leaves ${command} alone`, () => {
      assert.deepEqual(postHooks(autocommitOn("Bash", command))[0], { matcher: "Bash", hooks: [{ type: "command", command }] })
    })

  test("without a home, a ~/ spelling is not ours", () => {
    const settings = autocommitOn("Bash", "~/vault/_tools/autocommit.sh")
    assert.deepEqual(wireSettings(settings, { vault }).settings.hooks.PostToolUse[0], settings.hooks.PostToolUse[0])
  })

  test("our entry on ^Write|Edit$ is moved to a Write|Edit block", () => {
    const blocks = postHooks(autocommitOn("^Write|Edit$", `${vault}/_tools/autocommit.sh`))
    assert.deepEqual(blocks.map((b) => b.matcher), ["Write|Edit"])
  })
})

describe("steps 4f/4g: a ~/.claude file edited after bootstrap read it", () => {
  const VAULT = "/vault"
  const setup = async (settings, claudeMd = "# Mine\n") => {
    const claudeDir = realpathSync(mkdtempSync(join(tmpdir(), "claude-dir-")))
    const settingsPath = join(claudeDir, "settings.json")
    const claudeMdPath = join(claudeDir, "CLAUDE.md")
    writeFileSync(settingsPath, settings)
    writeFileSync(claudeMdPath, claudeMd)
    const seen = await readClaudeFiles({ settingsPath, claudeMdPath, wireHook: true, wireMemory: true })
    return { claudeDir, settingsPath, claudeMdPath, seen }
  }
  // bootstrap's io, with `edits` (path → text) written just before the re-read of that path: the race.
  const racing = (edits) => ({
    readFile: async (path, enc) => {
      if (path in edits) writeFileSync(path, edits[path])
      return readFile(path, enc)
    },
    writeFile, copyFile, mkdir,
  })
  // The steps print their plan (a unified diff among it); kept off the test runner's stdout, which it parses.
  const wire = async (files, io) => {
    const { log } = console
    console.log = () => {}
    try {
      return await wireClaudeFiles({ ...files, wireHook: true, wireMemory: true, wiring: { vault: VAULT, vaults: [] }, io, MARK: "✅", WILL: "" })
    } finally {
      console.log = log
    }
  }

  test("an allow rule added meanwhile is kept next to the wf rule", async () => {
    const files = await setup('{ "permissions": { "allow": [] } }\n')
    const edited = '{ "permissions": { "allow": ["Bash(ls:*)"] } }\n'
    const r = await wire(files, racing({ [files.settingsPath]: edited }))
    assert.equal(r.failed, 0)
    assert.deepEqual(JSON.parse(readFileSync(files.settingsPath, "utf8")).permissions.allow, ["Bash(ls:*)", wfAllowRule(VAULT)])
    assert.equal(readFileSync(`${files.settingsPath}.bak`, "utf8"), edited, "the .bak is the file as it was right before the write")
  })

  test("a file left unparseable meanwhile is not written, and the step fails", async () => {
    const files = await setup('{ "model": "opus" }\n')
    const r = await wire(files, racing({ [files.settingsPath]: '{ "model": ' }))
    assert.equal(r.failed, 1)
    assert.equal(readFileSync(files.settingsPath, "utf8"), '{ "model": ')
    assert.equal(existsSync(`${files.settingsPath}.bak`), false)
  })

  test("a file already wired meanwhile is left byte for byte", async () => {
    const files = await setup("{}\n")
    const wired = `${JSON.stringify(wireSettings({ model: "opus" }, { vault: VAULT }).settings)}\n`
    const r = await wire(files, racing({ [files.settingsPath]: wired }))
    assert.equal(r.failed, 0)
    assert.equal(readFileSync(files.settingsPath, "utf8"), wired)
  })

  test("CLAUDE.md edited meanwhile gets the block on the content there now", async () => {
    const files = await setup("{}\n", "# Mine\n")
    const r = await wire(files, racing({ [files.claudeMdPath]: "# Mine\n\n- A memory saved meanwhile.\n" }))
    assert.equal(r.failed, 0)
    const text = readFileSync(files.claudeMdPath, "utf8")
    assert.ok(text.startsWith("# Mine\n\n- A memory saved meanwhile.\n\n<!-- wayfinder-template:begin"), text)
  })
})
