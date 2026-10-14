// `bootstrap` as a process (spec docs/specs/ticket-store.md, *`bootstrap` and release (Q20, Q21)*; issue #24):
// on update, `--plan` prints its own plan and the `wf migrate` diff and writes nothing; `--yes` applies both,
// writes the wf block into `~/.claude/CLAUDE.md`, the permission allow rule and the new hook wiring into
// `~/.claude/settings.json`. Every run gets a temp `HOME` (so `~/.claude` and git's global config are temp
// files) and a vault inside it — never the real home directory or vault.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { MANIFEST, read, wf, write } from "./vault.mjs"

const BOOTSTRAP = fileURLToPath(new URL("../template/_tools/bootstrap.mjs", import.meta.url))
const OBSIDIAN_JSON = "Library/Application Support/obsidian/obsidian.json"

/** A temp `HOME`: a git identity for the vault's commits, and Obsidian's vault registry (empty). */
function machine({ claudeDir = true, vaultName = "vault" } = {}) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "bootstrap-home-")))
  writeFileSync(join(home, ".gitconfig"), "[user]\n\tname = bootstrap-test\n\temail = bootstrap-test@example.invalid\n[commit]\n\tgpgsign = false\n")
  mkdirSync(join(home, "Library/Application Support/obsidian"), { recursive: true })
  writeFileSync(join(home, OBSIDIAN_JSON), '{ "vaults": {} }\n')
  if (claudeDir) mkdirSync(join(home, ".claude"))
  return { home, vault: join(home, vaultName) }
}

/** Run bootstrap from this repo with `HOME` at `home`. */
function bootstrap({ home }, args) {
  const env = { ...process.env, HOME: home }
  delete env.GIT_CONFIG_GLOBAL
  const r = spawnSync(process.execPath, [BOOTSTRAP, ...args], { encoding: "utf8", env })
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, out: `${r.stdout}\n${r.stderr}` }
}

/** A fresh install of every part, answering every question. */
function install(m) {
  const r = bootstrap(m, ["--vault", m.vault, "--parts", "all", "--on-conflict", "skip", "--skills-dir", join(m.home, "skills"), "--allow-brew", "no"])
  assert.equal(r.code, 0, r.out)
  return r
}

/** git in the vault, with `HOME` at the temp home (its identity). */
function git(m, ...args) {
  const r = spawnSync("git", args, { cwd: m.vault, encoding: "utf8", env: { ...process.env, HOME: m.home } })
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`)
  return r.stdout.trim()
}

/** `s` as a literal inside a RegExp. */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const update = (m, ...flags) => bootstrap(m, ["--vault", m.vault, ...flags])

const claudeMd = (m) => join(m.home, ".claude/CLAUDE.md")
const settingsFile = (m) => join(m.home, ".claude/settings.json")
const settingsOf = (m) => JSON.parse(readFileSync(settingsFile(m), "utf8"))

// What 0.4.x wired: autocommit on Write|Edit and on Bash, errors swallowed, no guard, no wf rule.
const oldHook = (vault) => ({ type: "command", command: `${vault}/_tools/autocommit.sh 2>/dev/null || true`, timeout: 15 })
const unrelated = {
  env: { PATH: "/opt/mine/bin:/usr/bin:/bin" },
  model: "opus",
  permissions: { allow: ["Bash(git status:*)"], deny: ["Bash(rm -rf:*)"] },
}
const oldSettings = (vault) => ({
  ...unrelated,
  hooks: {
    PostToolUse: [
      { matcher: "Write|Edit", hooks: [oldHook(vault)] },
      { matcher: "Bash", hooks: [{ type: "command", command: "/opt/other-plugin/hook.sh" }, oldHook(vault)] },
    ],
  },
})

// The block 0.4.x wrote into ~/.claude/CLAUDE.md, between the owner's own sections.
const OLD_BLOCK = (vault) => `## Wayfinder maps live in the vault, never in a repo

The tracker for \`/wayfinder\` is the vault at **\`${vault}\`**, whatever repo the
session runs in. Before any tracker operation, read its \`README.md\`:

- **§ Wayfinding operations** — maps and tickets: chart, claim, resolve, frontier.

- The \`autocommit.sh\` PostToolUse hook commits the vault on every Write/Edit — leave
  committing to it.
`
const MINE_BEFORE = "# Language\n\n- Answer in Thai.\n\n"
const MINE_AFTER = "\n# Token Budget\n\n- One session per ticket.\n"

const MAP_V1 = "---\nrepo: r\neffort: e\nkind: map\nstatus: active\nstatus_since: 2026-10-01\n---\n\n# The effort\n\n## Notes\n\nSome notes.\n"
const TICKET_V1 = "---\nrepo: r\neffort: e\ntype: task\nstatus: open\nstatus_since: 2026-10-01\nblockers: []\n---\n\n## Question\n\nWhat?\n"

/**
 * An install as 0.4.x left it: the old hook wiring and CLAUDE.md block, a manifest without
 * `vault_schema`, and an effort in schema 1 — all committed.
 */
function oldInstall() {
  const m = machine()
  install(m)
  const manifest = JSON.parse(read(m.vault, MANIFEST))
  delete manifest.vault_schema
  write(m.vault, MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  write(m.vault, "r/e/map.md", MAP_V1)
  write(m.vault, "r/e/issues/01-first-thing.md", TICKET_V1)
  git(m, "add", "-A")
  git(m, "commit", "-qm", "0.4.x")
  writeFileSync(settingsFile(m), `${JSON.stringify(oldSettings(m.vault), null, 2)}\n`)
  writeFileSync(claudeMd(m), MINE_BEFORE + OLD_BLOCK(m.vault) + MINE_AFTER)
  return m
}

/** `doctor --json` of the vault with `HOME` at the temp home: the checks that failed (warnings aside). */
const failedChecks = (m) => {
  const r = spawnSync(process.execPath, [join(m.vault, "_tools/doctor.mjs"), "--json"], { encoding: "utf8", env: { ...process.env, HOME: m.home } })
  return JSON.parse(r.stdout).checks.filter((c) => !c.ok && !c.soft).map((c) => `${c.label}: ${c.detail}`)
}

const sha = (buf) => createHash("sha256").update(buf).digest("hex")

// Every file under `dir` → its sha, except inside `.git` (git refreshes its index on a read).
const tree = (dir, rel = "", out = {}) => {
  for (const name of readdirSync(join(dir, rel))) {
    if (name === ".git") continue
    const path = rel ? `${rel}/${name}` : name
    if (statSync(join(dir, path)).isDirectory()) tree(dir, path, out)
    else out[path] = sha(readFileSync(join(dir, path)))
  }
  return out
}

/** Everything a run could touch: every file under `HOME` (the vault included), and the vault's git state. */
const snapshot = (m) => ({
  files: tree(m.home),
  head: git(m, "rev-parse", "HEAD"),
  status: git(m, "status", "--porcelain", "--untracked-files=all"),
})

describe("bootstrap update --plan", () => {
  test("on a 0.4.x install, shows bootstrap's plan and the wf migrate diff, and writes nothing", () => {
    const m = oldInstall()
    const before = snapshot(m)
    const r = update(m, "--plan")
    assert.equal(r.code, 0, r.out)
    assert.match(r.stdout, /wf migrate/)
    assert.match(r.stdout, /^--- a\/r\/e\/issues\/01-first-thing\.md$/m, "the migrate diff")
    assert.match(r.stdout, /^-repo: r$/m)
    assert.match(r.stdout, /^\+  "vault_schema": 2,$/m, "the manifest gets the schema")
    assert.deepEqual(snapshot(m), before)
  })

  test("shows the settings diff of the keys it owns, and never another key's value", () => {
    const m = oldInstall()
    const settings = { ...oldSettings(m.vault), env: { ...unrelated.env, API_TOKEN: "secret-value-123" } }
    writeFileSync(settingsFile(m), JSON.stringify(settings))
    const r = update(m, "--plan")
    assert.equal(r.code, 0, r.out)
    assert.ok(r.stdout.includes(`+      "Bash(node ${m.vault}/_tools/wf.mjs:*)"`), "the allow rule, in the diff")
    assert.match(r.stdout, /^-\s+"command": ".*autocommit\.sh 2>\/dev\/null \|\| true"/m, "the old entry, in the diff")
    assert.ok(!r.out.includes("secret-value-123") && !r.out.includes("/opt/mine/bin"), "no unrelated value printed")
  })

  test("an update with neither --plan nor --yes plans, writes nothing, and asks for --yes", () => {
    const m = oldInstall()
    const before = snapshot(m)
    const r = update(m)
    assert.equal(r.code, 2, r.out)
    assert.match(r.stdout, /^-repo: r$/m, "the plan was printed")
    assert.match(r.stderr, /--yes/)
    assert.deepEqual(snapshot(m), before)
  })
})

describe("bootstrap update: a migration that can't be planned", () => {
  test("stops --yes before anything is written, naming the note", () => {
    const m = oldInstall()
    write(m.vault, "r/e/issues/02-notes.md", "just notes\n")
    git(m, "add", "-A")
    git(m, "commit", "-qm", "a note without frontmatter")
    const before = snapshot(m)
    const r = update(m, "--yes")
    assert.equal(r.code, 2, r.out)
    assert.match(r.stderr, /r\/e\/issues\/02-notes\.md/)
    assert.deepEqual(snapshot(m), before)
  })
})

describe("bootstrap: idempotent", () => {
  test("--plan after --yes shows no changes, and writes nothing", () => {
    const m = oldInstall()
    assert.equal(update(m, "--yes").code, 0)
    const before = snapshot(m)
    const r = update(m, "--plan")
    assert.equal(r.code, 0, r.out)
    assert.match(r.stdout, /^  ทั้งหมด: ไม่มีอะไรต้องเปลี่ยน/m)
    assert.doesNotMatch(r.stdout, /^@@ /m, "no diff")
    assert.deepEqual(snapshot(m), before)
  })

  test("--plan on a 0.4.x install does not claim there is nothing to change", () => {
    assert.doesNotMatch(update(oldInstall(), "--plan").stdout, /^  ทั้งหมด: ไม่มีอะไรต้องเปลี่ยน/m)
  })
})

describe("bootstrap update --yes", () => {
  test("migrates the vault with wf migrate, in its own commit, and leaves the tree clean", () => {
    const m = oldInstall()
    const r = update(m, "--yes")
    assert.equal(r.code, 0, r.out)
    assert.doesNotMatch(read(m.vault, "r/e/issues/01-first-thing.md"), /^repo:/m)
    assert.equal(JSON.parse(read(m.vault, MANIFEST)).vault_schema, 2)
    assert.equal(git(m, "log", "-1", "--format=%s"), "wf(migrate): vault schema 2")
    assert.equal(git(m, "status", "--porcelain", "--untracked-files=all"), "")
    const lint = wf(m.vault, ["lint", "--json"])
    assert.deepEqual(lint.json.data.findings.filter((f) => f.severity === "error"), [])
  })
})

describe("bootstrap: hooks and the wf allow rule in ~/.claude/settings.json", () => {
  test("wires the guard and the new autocommit, removes the old entries, adds the rule once, and nothing else", () => {
    const m = oldInstall()
    assert.equal(update(m, "--yes").code, 0)
    const after = readFileSync(settingsFile(m), "utf8")
    assert.deepEqual(JSON.parse(after), {
      ...unrelated,
      permissions: { ...unrelated.permissions, allow: ["Bash(git status:*)", `Bash(node ${m.vault}/_tools/wf.mjs:*)`] },
      hooks: {
        PostToolUse: [
          {
            matcher: "Write|Edit",
            hooks: [{ type: "command", command: `${m.vault}/_tools/autocommit.sh`, timeout: 15, statusMessage: "Committing wayfinder-vault..." }],
          },
          { matcher: "Bash", hooks: [{ type: "command", command: "/opt/other-plugin/hook.sh" }] },
        ],
        PreToolUse: [{ matcher: "Write|Edit", hooks: [{ type: "command", command: `node ${m.vault}/_tools/frontmatter-guard.mjs`, timeout: 15 }] }],
      },
    })
    assert.equal(update(m, "--yes").code, 0)
    assert.equal(readFileSync(settingsFile(m), "utf8"), after, "a rerun writes nothing new")
  })

  test("a settings part in a shape Claude Code does not read stops the update before anything is written", () => {
    const m = oldInstall()
    writeFileSync(settingsFile(m), JSON.stringify({ ...unrelated, hooks: { PostToolUse: { matcher: "Bash" } } }))
    const before = snapshot(m)
    const r = update(m, "--yes")
    assert.equal(r.code, 1, r.out)
    assert.match(r.stderr, /hooks\.PostToolUse/)
    assert.deepEqual(snapshot(m), before)
  })

  test("an unparseable settings file stops the update before anything is written", () => {
    const m = oldInstall()
    writeFileSync(settingsFile(m), "{ not json")
    const before = snapshot(m)
    const r = update(m, "--yes")
    assert.equal(r.code, 1, r.out)
    assert.match(r.stderr, /settings\.json/)
    assert.deepEqual(snapshot(m), before)
  })
})

describe("bootstrap: the result passes doctor", () => {
  test("a fresh install, before ~/.claude exists: doctor and wf lint pass, the manifest is at vault schema 2", () => {
    const m = machine({ claudeDir: false })
    install(m)
    assert.equal(JSON.parse(read(m.vault, MANIFEST)).vault_schema, 2)
    assert.deepEqual(failedChecks(m), [])
    const lint = wf(m.vault, ["lint", "--json"])
    assert.equal(lint.code, 0, lint.stdout)
    assert.deepEqual(lint.json.data.findings.filter((f) => f.severity === "error"), [])
  })

  test("a vault path with a space: the quoted hooks count as wired, and a rerun changes nothing", () => {
    const m = machine({ vaultName: "my vault" })
    install(m)
    assert.deepEqual(failedChecks(m), [])
    assert.ok(settingsOf(m).permissions.allow.includes(`Bash(node '${m.vault}/_tools/wf.mjs':*)`))
    const before = snapshot(m)
    assert.equal(update(m, "--yes").code, 0)
    assert.deepEqual(snapshot(m), before)
  })

  test("after --yes on a 0.4.x install", () => {
    const m = oldInstall()
    assert.notDeepEqual(failedChecks(m), [], "the 0.4.x install fails doctor")
    assert.equal(update(m, "--yes").code, 0)
    assert.deepEqual(failedChecks(m), [])
  })
})

describe("bootstrap: the manual steps it prints at the end (INSTALL § Manual steps)", () => {
  test("lists five, the fifth naming the vault path and the sandbox's writable paths", () => {
    const m = machine()
    const { stdout } = install(m)
    const start = stdout.indexOf("ที่เหลือต้องทำมือ")
    assert.notEqual(start, -1, stdout)
    const steps = stdout.slice(start)
    assert.match(steps, /^ {2}4\. /m)
    assert.match(steps, new RegExp(`^ {2}5\\. ถ้า Claude Code รัน Bash ใน sandbox: เพิ่ม ${escapeRegExp(m.vault)}\\n.*sandbox\\.filesystem\\.allowWrite ใน ~/\\.claude/settings\\.json`, "m"))
    assert.doesNotMatch(steps, /^ {2}6\. /m)
  })
})

describe("bootstrap: a vault that had efforts before the template", () => {
  test("install leaves its schema to the update, and the update migrates it", () => {
    const m = machine()
    mkdirSync(m.vault)
    git(m, "init", "-q")
    write(m.vault, "r/e/map.md", MAP_V1)
    write(m.vault, "r/e/issues/01-first-thing.md", TICKET_V1)
    git(m, "add", "-A")
    git(m, "commit", "-qm", "before the template")
    install(m)
    assert.equal(JSON.parse(read(m.vault, MANIFEST)).vault_schema, undefined, "not stamped over schema-1 notes")
    assert.equal(update(m, "--yes").code, 0)
    assert.equal(JSON.parse(read(m.vault, MANIFEST)).vault_schema, 2)
    assert.doesNotMatch(read(m.vault, "r/e/map.md"), /^repo:/m)
  })
})

describe("bootstrap: the vault schema it records", () => {
  test("install over a schema-1 Config it keeps (answer 3: skip) leaves the schema to the update", () => {
    const m = machine()
    mkdirSync(m.vault)
    git(m, "init", "-q")
    write(m.vault, "Wayfinder Config.md", "---\nstale_days: 7\n---\n# Mine\n")
    git(m, "add", "-A")
    git(m, "commit", "-qm", "before the template")
    install(m)
    assert.equal(JSON.parse(read(m.vault, MANIFEST)).vault_schema, undefined)
    assert.equal(update(m, "--yes").code, 0)
    assert.equal(JSON.parse(read(m.vault, MANIFEST)).vault_schema, 2)
    assert.match(read(m.vault, "Wayfinder Config.md"), /^claim_stale_days:/m)
  })

  test("an update of a vault at a newer schema than the template stops before anything is written", () => {
    const m = machine()
    install(m)
    const manifest = JSON.parse(read(m.vault, MANIFEST))
    write(m.vault, MANIFEST, `${JSON.stringify({ ...manifest, vault_schema: 3 }, null, 2)}\n`)
    git(m, "commit", "-qam", "from the future")
    const before = snapshot(m)
    const r = update(m, "--yes")
    assert.equal(r.code, 2, r.out)
    assert.match(r.stderr, /schema 3/)
    assert.deepEqual(snapshot(m), before)
  })
})

describe("bootstrap: the wf block in ~/.claude/CLAUDE.md", () => {
  const blockOf = (text) => {
    assert.ok(text.startsWith(MINE_BEFORE), `the owner's section before the block is kept:\n${text}`)
    assert.ok(text.endsWith(MINE_AFTER), `the owner's section after the block is kept:\n${text}`)
    return text.slice(MINE_BEFORE.length, -MINE_AFTER.length)
  }

  test("replaces the 0.4.x block in place: wf by absolute path, prose by Write/Edit", () => {
    const m = oldInstall()
    assert.equal(update(m, "--yes").code, 0)
    const block = blockOf(readFileSync(claudeMd(m), "utf8"))
    assert.equal(block.split("## Wayfinder maps live in the vault").length, 2, "one block")
    assert.ok(block.includes(`\`node ${m.vault}/_tools/wf.mjs <verb>\``), block)
    assert.match(block, /Prose is written with Write\/Edit/)
    assert.doesNotMatch(block, /leave\s+committing to it/)
  })

  test("the owner's text right after the 0.4.x block, without a heading between, is kept", () => {
    const m = oldInstall()
    writeFileSync(claudeMd(m), MINE_BEFORE + OLD_BLOCK(m.vault) + "\nMy own note after it.\n" + MINE_AFTER)
    assert.equal(update(m, "--yes").code, 0)
    const text = readFileSync(claudeMd(m), "utf8")
    assert.ok(text.includes("<!-- wayfinder-template:end -->\n\nMy own note after it.\n"), text)
  })

  test("a CRLF file keeps CRLF and one block", () => {
    const m = oldInstall()
    const crlf = (t) => t.replace(/\n/g, "\r\n")
    writeFileSync(claudeMd(m), crlf(MINE_BEFORE + OLD_BLOCK(m.vault) + MINE_AFTER))
    assert.equal(update(m, "--yes").code, 0)
    const once = readFileSync(claudeMd(m), "utf8")
    assert.doesNotMatch(once, /[^\r]\n/, "every line ends in CRLF")
    assert.equal(once.split("<!-- wayfinder-template:begin").length, 2)
    assert.equal(update(m, "--yes").code, 0)
    assert.equal(readFileSync(claudeMd(m), "utf8"), once)
  })

  test("a stale block is replaced, not duplicated, and a current one is left as it is", () => {
    const m = oldInstall()
    // The block of the version before 0.4.x, which sent specs and build tickets into the vault.
    writeFileSync(claudeMd(m), `${MINE_BEFORE}## Wayfinder maps, specs, and build tickets live in the vault\n\nOld words.\n${MINE_AFTER}`)
    assert.equal(update(m, "--yes").code, 0)
    const once = readFileSync(claudeMd(m), "utf8")
    assert.doesNotMatch(blockOf(once), /Old words|specs, and build tickets/)
    assert.ok(blockOf(once).includes(`node ${m.vault}/_tools/wf.mjs`))

    // A block bootstrap wrote, gone stale (another wf path): replaced between its markers.
    const moved = once.split(m.vault).join("/somewhere/else")
    writeFileSync(claudeMd(m), moved)
    assert.equal(update(m, "--yes").code, 0)
    assert.equal(readFileSync(claudeMd(m), "utf8"), once)
    assert.equal(update(m, "--yes").code, 0)
    assert.equal(readFileSync(claudeMd(m), "utf8"), once, "a rerun leaves it as it is")
  })
})

describe("bootstrap: the .bak next to a ~/.claude file is the one from before the first change", () => {
  test("a second run that changes both files again leaves both .bak files as they were before the first", () => {
    const m = oldInstall()
    const settings0 = readFileSync(settingsFile(m), "utf8")
    const claudeMd0 = readFileSync(claudeMd(m), "utf8")
    assert.equal(update(m, "--yes").code, 0)
    // Something to change again: the allow rule gone, the block gone stale.
    const wired = settingsOf(m)
    writeFileSync(settingsFile(m), `${JSON.stringify({ ...wired, permissions: unrelated.permissions }, null, 2)}\n`)
    writeFileSync(claudeMd(m), readFileSync(claudeMd(m), "utf8").split(m.vault).join("/somewhere/else"))
    const r = update(m, "--yes")
    assert.equal(r.code, 0, r.out)
    assert.ok(settingsOf(m).permissions.allow.includes(`Bash(node ${m.vault}/_tools/wf.mjs:*)`), "the second run did change it")
    assert.equal(readFileSync(`${settingsFile(m)}.bak`, "utf8"), settings0)
    assert.equal(readFileSync(`${claudeMd(m)}.bak`, "utf8"), claudeMd0)
  })
})

describe("bootstrap: old hooks of this vault, whatever the spelling", () => {
  test("$HOME/…, ${HOME}/… and ~/… spellings of the vault path are removed like the absolute one", () => {
    const m = oldInstall()
    const rel = m.vault.slice(m.home.length + 1)
    const spelled = (prefix, q = "") => ({ type: "command", command: `${q}${prefix}/${rel}/_tools/autocommit.sh${q} 2>/dev/null || true`, timeout: 15 })
    writeFileSync(settingsFile(m), `${JSON.stringify({
      ...unrelated,
      hooks: {
        PostToolUse: [
          { matcher: "Write|Edit", hooks: [spelled("$HOME")] },
          { matcher: "Bash", hooks: [{ type: "command", command: "/opt/other-plugin/hook.sh" }, spelled("~"), spelled("${HOME}", '"')] },
        ],
      },
    }, null, 2)}\n`)
    const r = update(m, "--yes")
    assert.equal(r.code, 0, r.out)
    assert.deepEqual(settingsOf(m).hooks.PostToolUse, [
      {
        matcher: "Write|Edit",
        hooks: [{ type: "command", command: `${m.vault}/_tools/autocommit.sh`, timeout: 15, statusMessage: "Committing wayfinder-vault..." }],
      },
      { matcher: "Bash", hooks: [{ type: "command", command: "/opt/other-plugin/hook.sh" }] },
    ])
  })
})

describe("bootstrap: a matcher spelled differently from Write|Edit", () => {
  test("our entries on Edit|Write and ^(Edit|Write)$ are kept where they are, and nothing is written", () => {
    const m = machine()
    install(m)
    const wired = settingsOf(m)
    const respelled = {
      ...wired,
      hooks: {
        PreToolUse: wired.hooks.PreToolUse.map((b) => ({ ...b, matcher: "^(Edit|Write)$" })),
        PostToolUse: wired.hooks.PostToolUse.map((b) => ({ ...b, matcher: "Edit|Write" })),
      },
    }
    writeFileSync(settingsFile(m), `${JSON.stringify(respelled, null, 2)}\n`)
    const before = readFileSync(settingsFile(m), "utf8")
    const r = update(m, "--yes")
    assert.equal(r.code, 0, r.out)
    assert.equal(readFileSync(settingsFile(m), "utf8"), before)
    assert.deepEqual(failedChecks(m), [])
  })

  test("a missing entry is added to the Edit|Write block that is there, not to a new one", () => {
    const m = machine()
    install(m)
    const wired = settingsOf(m)
    writeFileSync(settingsFile(m), `${JSON.stringify({
      ...wired,
      hooks: { ...wired.hooks, PostToolUse: [{ matcher: "Edit|Write", hooks: [{ type: "command", command: "/opt/other-plugin/fmt.sh" }] }] },
    }, null, 2)}\n`)
    assert.equal(update(m, "--yes").code, 0)
    assert.deepEqual(settingsOf(m).hooks.PostToolUse, [{
      matcher: "Edit|Write",
      hooks: [
        { type: "command", command: "/opt/other-plugin/fmt.sh" },
        { type: "command", command: `${m.vault}/_tools/autocommit.sh`, timeout: 15, statusMessage: "Committing wayfinder-vault..." },
      ],
    }])
  })
})
