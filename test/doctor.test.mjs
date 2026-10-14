// `doctor` as a process against a fixture vault (spec docs/specs/ticket-store.md, *`doctor`*; issue #22):
// its content findings are the core's `lint()` — the same as `wf lint` — and it checks the new hooks,
// the autocommit failure log and the vault schema version. `HOME` points at a temp dir holding the
// `~/.claude/settings.json` under test.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { git, makeVault, map, onOneDay, seed, ticket, wf, write } from "./vault.mjs"
import { sandboxGrant } from "../template/_tools/lib/sandbox.mjs"
import { LEGACY_PICKS_BLOCK } from "../template/_tools/lib/picks-page.mjs"
import { PAGE_VIEWS } from "../template/_tools/lib/page-views.mjs"

const TEMPLATE = fileURLToPath(new URL("../template/", import.meta.url))
const DOCTOR = join(TEMPLATE, "_tools/doctor.mjs")

/** A fixture vault with `doctor.mjs` in its `_tools/`. */
const vaultWithDoctor = (options) => {
  const vault = makeVault(options)
  cpSync(DOCTOR, join(vault, "_tools/doctor.mjs"))
  return vault
}

/** A temp `HOME` whose `~/.claude/settings.json` holds `settingsText` (none when null). */
const homeWith = (settingsText) => {
  const home = mkdtempSync(join(tmpdir(), "doctor-home-"))
  if (settingsText !== null) {
    mkdirSync(join(home, ".claude"))
    writeFileSync(join(home, ".claude/settings.json"), settingsText)
  }
  return home
}

/**
 * Run `node <vault>/_tools/doctor.mjs --json` with `HOME` at a temp dir whose settings.json holds
 * `settings` as JSON, or `settingsText` as given (none when both are null).
 */
function doctor(vault, { settings = null, settingsText = settings === null ? null : JSON.stringify(settings, null, 2) } = {}) {
  const r = spawnSync(process.execPath, [join(vault, "_tools/doctor.mjs"), "--json"], {
    encoding: "utf8",
    env: { ...process.env, HOME: homeWith(settingsText) },
  })
  let json
  try {
    json = JSON.parse(r.stdout)
  } catch {
    assert.fail(`doctor --json printed no JSON (exit ${r.status}):\n${r.stdout}\n${r.stderr}`)
  }
  return { code: r.status, json }
}

/** The one check whose label contains `text`. */
const checkNamed = (json, text) => {
  const found = json.checks.filter((c) => c.label.includes(text))
  assert.equal(found.length, 1, `exactly one check labelled "${text}" — got ${found.map((c) => c.label).join(" | ") || "none"}`)
  return found[0]
}

describe("doctor: content comes from the core's lint()", () => {
  test("its findings equal wf lint's on the same vault", () => {
    const vault = vaultWithDoctor({
      notes: [
        map("r/a/map.md"),
        ticket("r/a/issues/01-ok.md", { title: "OK" }),
        ticket("r/a/issues/02-stale.md", { status: "claimed", status_since: "2020-01-01", claimed_by: "session:x" }),
        ticket("r/a/issues/03-dangling.md", { blockers: ["[[09-missing]]"] }),
      ],
    })
    const { d, l } = onOneDay(() => ({ d: doctor(vault), l: wf(vault, ["lint", "--json"]) }))
    const findings = l.json.data.findings
    assert.ok(findings.some((f) => f.severity === "error") && findings.some((f) => f.severity === "warn"))
    assert.deepEqual(d.json.lint.findings, findings)
    assert.equal(checkNamed(d.json, "wf lint").ok, false, "error findings fail doctor")
    assert.equal(d.code, 1)
  })

  test("warn findings are reported without failing; a schema-2 note is held to no rule of doctor's own", () => {
    // A schema-2 ticket has no `effort` field: the old doctor content section failed it for that.
    const vault = vaultWithDoctor({
      notes: [map("r/a/map.md"), ticket("r/a/issues/01-ok.md", { title: "OK", stray_key: "x" })],
    })
    const { d, l } = onOneDay(() => ({ d: doctor(vault), l: wf(vault, ["lint", "--json"]) }))
    assert.deepEqual(d.json.lint.findings, l.json.data.findings)
    assert.deepEqual(d.json.lint.findings.map((f) => f.rule).sort(), ["tickets-block-drift", "unknown-key"], "warns only")
    assert.equal(checkNamed(d.json, "wf lint").ok, true)
    const warning = checkNamed(d.json, "lint warning")
    assert.deepEqual([warning.ok, warning.soft], [false, true])
  })

  test("frontmatter outside the YAML subset fails the content check and names the file and line", () => {
    const vault = vaultWithDoctor({
      notes: [map("r/a/map.md"), { path: "r/a/issues/01-nested.md", text: "---\ntitle: X\nnested:\n  a: 1\n---\n" }],
    })
    const { json } = doctor(vault)
    const content = checkNamed(json, "wf lint")
    assert.equal(content.ok, false)
    assert.match(content.detail, /r\/a\/issues\/01-nested\.md:\d+/)
    assert.equal(json.lint, null)
  })
})

describe("doctor's text report", () => {
  test("folds a flood of one rule's warnings and prints errors last, right above the pass count", async () => {
    const { WARN_FOLD_AT } = await import("../template/_tools/lib/core.mjs")
    const keys = Object.fromEntries(Array.from({ length: WARN_FOLD_AT }, (_, i) => [`k${i}`, "x"]))
    const vault = vaultWithDoctor({ notes: [map("r/a/map.md"), ticket("r/a/issues/01-a.md", { status: "waiting", ...keys })] })
    const r = spawnSync(process.execPath, [join(vault, "_tools/doctor.mjs")], { encoding: "utf8", env: { ...process.env, HOME: homeWith(null) } })
    const lines = r.stdout.split("\n")
    const lint = lines.slice(lines.findIndex((l) => l.startsWith("🩺 wf lint")))
    assert.doesNotMatch(r.stdout, /unknown frontmatter key k0/)
    assert.match(lint.join("\n"), new RegExp(`⚠️ {3}unknown-key {2}${WARN_FOLD_AT} warnings in 1 effort — all of them: node _tools/wf\\.mjs lint --rule unknown-key`))
    const pass = lint.findIndex((l) => /^\d+\/\d+ ผ่าน/.test(l))
    assert.deepEqual(lint.slice(pass - 3, pass), [
      "  ❌  waiting-without-note  r/a#01  waiting without status_note — release it, then wait again with --note <note>",
      "        fix: wf release r/a#01",
      "",
    ])
  })
})

describe("doctor --json", () => {
  test("prints the whole report through a pipe, however many findings there are", () => {
    // Enough findings for the pretty-printed JSON to pass a pipe buffer (64 KiB).
    const notes = Array.from({ length: 400 }, (_, i) =>
      ticket(`r/a/issues/${String(i + 1).padStart(3, "0")}-t.md`, { title: "T", stray_key: "x" }))
    const { json } = doctor(vaultWithDoctor({ notes: [map("r/a/map.md"), ...notes] }))
    assert.ok(json.lint.findings.length > 400)
  })

  test("a check that throws becomes a failing check, and the report still prints", () => {
    const vault = vaultWithDoctor()
    write(vault, ".obsidian/community-plugins.json", "{}")
    const { code, json } = doctor(vault)
    assert.equal(code, 1)
    assert.ok(json.checks.some((c) => !c.ok && !c.soft && /includes is not a function/.test(c.detail)))
    assert.ok(checkNamed(json, "wf lint"), "later sections still ran")
  })
})

describe("doctor: hooks in ~/.claude/settings.json", () => {
  const hook = (matcher, command) => ({ matcher, hooks: [{ type: "command", command }] })
  // The spec's wiring: the guard before Write|Edit, the new autocommit after Write|Edit only.
  const newWiring = (vault) => ({
    hooks: {
      PreToolUse: [hook("Write|Edit", `node ${vault}/_tools/frontmatter-guard.mjs`)],
      PostToolUse: [hook("Write|Edit", `${vault}/_tools/autocommit.sh`)],
    },
  })
  // What bootstrap wired before wf: autocommit on Write|Edit and on Bash, errors swallowed, no guard.
  const oldWiring = (vault) => ({
    hooks: {
      PostToolUse: ["Write|Edit", "Bash"].map((m) => hook(m, `${vault}/_tools/autocommit.sh 2>/dev/null || true`)),
    },
  })
  const hookChecks = (vault, settings) => {
    const { json } = doctor(vault, { settings })
    return {
      guard: checkNamed(json, "frontmatter-guard"),
      autocommit: checkNamed(json, "autocommit ต่อไว้บน PostToolUse"),
      old: checkNamed(json, "autocommit รุ่นเก่า"),
    }
  }

  test("the guard and the new autocommit wired on Write|Edit pass", () => {
    const vault = vaultWithDoctor()
    const { guard, autocommit, old } = hookChecks(vault, newWiring(vault))
    assert.deepEqual([guard.ok, autocommit.ok, old.ok], [true, true, true])
  })

  test("the old autocommit still wired on Bash is reported", () => {
    const vault = vaultWithDoctor()
    const { autocommit, old } = hookChecks(vault, oldWiring(vault))
    assert.equal(autocommit.ok, true, "Write|Edit still reaches the autocommit")
    assert.equal(old.ok, false)
    assert.match(old.detail, /Bash/)
    assert.match(old.detail, /bootstrap/)
  })

  test("autocommit wired twice on Write|Edit is reported as an old entry left behind", () => {
    const vault = vaultWithDoctor()
    const settings = newWiring(vault)
    settings.hooks.PostToolUse.push(hook("Write|Edit", `${vault}/_tools/autocommit.sh 2>/dev/null || true`))
    const { old } = hookChecks(vault, settings)
    assert.equal(old.ok, false)
    assert.match(old.detail, /2 /)
  })

  test("Write and Edit wired in separate blocks, or by a regex matcher, count as wired", () => {
    const vault = vaultWithDoctor()
    const split = {
      hooks: {
        PreToolUse: [hook("^(Edit|Write|MultiEdit)$", `node ${vault}/_tools/frontmatter-guard.mjs`)],
        PostToolUse: ["Write", "Edit"].map((m) => hook(m, `${vault}/_tools/autocommit.sh`)),
      },
    }
    const { guard, autocommit, old } = hookChecks(vault, split)
    assert.deepEqual([guard.ok, autocommit.ok, old.ok], [true, true, true])
  })

  test("a regex matcher that covers Bash is an old entry", () => {
    const vault = vaultWithDoctor()
    const { autocommit, old } = hookChecks(vault, { hooks: { PostToolUse: [hook(".*", `${vault}/_tools/autocommit.sh`)] } })
    assert.deepEqual([autocommit.ok, old.ok], [true, false])
  })

  test("an unreadable settings file is reported as such", () => {
    const vault = vaultWithDoctor()
    const { json } = doctor(vault, { settingsText: "{ not json" })
    assert.match(checkNamed(json, "settings.json").detail, /JSON/)
  })

  test("a missing guard hook is reported", () => {
    const vault = vaultWithDoctor()
    const { guard } = hookChecks(vault, oldWiring(vault))
    assert.equal(guard.ok, false)
    assert.match(guard.detail, /bootstrap/)
  })

  test("a guard hook of another vault, or on another matcher, is not this vault's guard", () => {
    const vault = vaultWithDoctor()
    const other = newWiring("/elsewhere/vault")
    assert.equal(hookChecks(vault, other).guard.ok, false)
    const onBash = newWiring(vault)
    onBash.hooks.PreToolUse = [hook("Bash", `node ${vault}/_tools/frontmatter-guard.mjs`)]
    assert.equal(hookChecks(vault, onBash).guard.ok, false)
  })

  test("no settings file reports both hooks missing", () => {
    const { guard, autocommit, old } = hookChecks(vaultWithDoctor(), null)
    assert.deepEqual([guard.ok, autocommit.ok, old.ok], [false, false, true])
  })
})

describe("doctor: the sandbox grant in ~/.claude/settings.json", () => {
  const LABEL = "sandbox ที่ให้เขียน vault"
  const withSandbox = (vault, sandbox) => doctor(vault, { settings: { sandbox } }).json
  const denies = (vault) => sandboxGrant(vault).denyWrite

  test("no grant passes, and the sandbox off says nothing more", () => {
    const vault = vaultWithDoctor()
    assert.equal(checkNamed(doctor(vault).json, LABEL).ok, true)
    assert.equal(doctor(vault).json.checks.some((c) => c.label.includes("Bash ใน sandbox เขียน vault ได้")), false)
  })

  test("the vault granted with every deny passes", () => {
    const vault = vaultWithDoctor()
    const json = withSandbox(vault, { enabled: true, filesystem: { allowWrite: [vault], denyWrite: denies(vault) } })
    assert.equal(checkNamed(json, LABEL).ok, true)
    assert.equal(checkNamed(json, "Bash ใน sandbox เขียน vault ได้").ok, true)
  })

  test("the vault granted without the denies fails, naming what to add", () => {
    const vault = vaultWithDoctor()
    const { code, json } = doctor(vault, { settings: { sandbox: { filesystem: { allowWrite: [vault], denyWrite: [`${vault}/.obsidian`] } } } })
    const found = checkNamed(json, LABEL)
    assert.equal(found.ok, false)
    assert.equal(found.soft, undefined, "a failure, not a warning")
    assert.equal(code, 1)
    for (const path of denies(vault).filter((p) => !p.endsWith(".obsidian"))) assert.ok(found.detail.includes(path), `${path} in: ${found.detail}`)
    assert.ok(!found.detail.includes(`${vault}/.obsidian`), "a deny already there is not asked for again")
  })

  test("the sandbox on without a grant warns that wf can't write", () => {
    const vault = vaultWithDoctor()
    const found = checkNamed(withSandbox(vault, { enabled: true }), "Bash ใน sandbox เขียน vault ได้")
    assert.deepEqual([found.ok, found.soft], [false, true])
  })
})

describe("doctor: the autocommit failure log", () => {
  const LOG = "wf-autocommit-failures.log"
  const logCheck = (vault) => checkNamed(doctor(vault).json, LOG)

  // A real failure: the hook refuses to commit a file that still holds conflict markers, and logs it.
  const failAnEdit = (vault) => {
    write(vault, "notes.md", "<<<<<<< ours\na\n=======\nb\n>>>>>>> theirs\n")
    const event = JSON.stringify({ tool_name: "Write", tool_input: { file_path: join(vault, "notes.md") } })
    const r = spawnSync(process.execPath, [join(vault, "_tools/autocommit.mjs")], { input: event, encoding: "utf8" })
    assert.match(r.stdout, /was not committed/)
  }

  test("no log passes", () => {
    assert.equal(logCheck(seed(vaultWithDoctor())).ok, true)
  })

  test("a logged failure is reported with how to clear the log, until it is cleared", () => {
    const vault = seed(vaultWithDoctor())
    failAnEdit(vault)
    const reported = logCheck(vault)
    assert.equal(reported.ok, false)
    assert.equal(reported.soft, undefined, "a failure, not a warning")
    assert.match(reported.detail, /1 /, "the number of failures")
    assert.match(reported.detail, /notes\.md/, "the latest failure")
    const logPath = join(realpathSync(join(vault, git(vault, "rev-parse", "--git-common-dir"))), LOG)
    assert.ok(reported.detail.includes(`: > '${logPath}'`), `the clear command for ${logPath}: ${reported.detail}`)

    assert.equal(logCheck(vault).ok, false, "still reported on the next run")
    writeFileSync(logPath, "")
    assert.equal(logCheck(vault).ok, true, "an emptied log passes")
  })
})

describe("doctor: vault schema version", () => {
  test("a manifest that is not JSON fails, as it fails wf", () => {
    const vault = vaultWithDoctor()
    write(vault, ".wayfinder-template.json", "{ broken")
    const manifest = checkNamed(doctor(vault).json, "อ่านได้")
    assert.deepEqual([manifest.ok, manifest.soft], [false, undefined])
  })

  const schemaCheck = (manifest) => checkNamed(doctor(vaultWithDoctor({ manifest })).json, "vault_schema")

  test("the supported version passes", () => {
    assert.equal(schemaCheck({ vault_schema: 2 }).ok, true)
  })

  test("an older version fails and says to run wf migrate", () => {
    const old = schemaCheck({ vault_schema: 1 })
    assert.equal(old.ok, false)
    assert.match(old.detail, /run `wf migrate`/)
  })

  test("a manifest from before wf (no vault_schema) is version 1", () => {
    const legacy = schemaCheck({ vault_schema: undefined })
    assert.equal(legacy.ok, false)
    assert.match(legacy.detail, /run `wf migrate`/)
  })

  test("a newer version fails and says to update the template", () => {
    const newer = schemaCheck({ vault_schema: 3 })
    assert.equal(newer.ok, false)
    assert.match(newer.detail, /update the template/)
  })
})

describe("doctor: the pages' code lives in _tools/views/, the notes hold stubs", () => {
  const DATAVIEW = ".obsidian/plugins/dataview/data.json"
  /** A fixture vault with the template's pages, views and Dataview settings, plus `edits` (`{ rel: text }`). */
  const vaultWithPages = (edits = {}) => {
    const vault = vaultWithDoctor()
    cpSync(join(TEMPLATE, "_tools/views"), join(vault, "_tools/views"), { recursive: true })
    for (const page of Object.keys(PAGE_VIEWS)) write(vault, `${page}.md`, readFileSync(join(TEMPLATE, `${page}.md`), "utf8"))
    write(vault, DATAVIEW, readFileSync(join(TEMPLATE, DATAVIEW), "utf8"))
    for (const [rel, text] of Object.entries(edits)) write(vault, rel, text)
    return vault
  }
  const page = (name) => readFileSync(join(TEMPLATE, `${name}.md`), "utf8")
  const PLANTED = "```dataviewjs\nrequire('child_process')\n```\n"

  test("the template's pages pass: every block a stub, every view there, inline JS off, no other note with JS", () => {
    const { json } = doctor(vaultWithPages())
    for (const label of ["มี view ครบใน _tools/views/", "parse เป็น JS ได้", "backtick ในเนื้อ CSS", "LS_KEY ตรงกัน",
      "TICKETS_NOTE ชี้ไปยังโน้ต", "ปิด enableInlineDataviewJs", "ไม่มีบล็อก dataviewjs ในโน้ตอื่น"])
      assert.equal(checkNamed(json, label).ok, true, label)
    for (const name of ["Wayfinder Dashboard", "Wayfinder Efforts", "Wayfinder Effort Tickets"])
      assert.equal(checkNamed(json, `ทุกบล็อกบน ${name} เป็น stub`).ok, true, name)
    assert.equal(checkNamed(json, "บน Wayfinder Picks เป็น stub").ok, true)
    assert.equal(checkNamed(json, "ไม่มีบล็อก inline รุ่นก่อน").ok, true)
  })

  test("a page block that is code, not a stub, fails — however its fence is written", () => {
    const shapes = [PLANTED, PLANTED.replace(/```/g, "~~~"), PLANTED.replace(/^/gm, "> "), `- ${PLANTED}`,
      `1. ${PLANTED}`, `> - ${PLANTED}`, `- a\n  - ${PLANTED}`, PLANTED.replace("```dataviewjs", "````DataviewJS")]
    for (const fence of shapes) {
      const { json } = doctor(vaultWithPages({ "Wayfinder Efforts.md": page("Wayfinder Efforts") + fence }))
      const c = checkNamed(json, "ทุกบล็อกบน Wayfinder Efforts เป็น stub")
      assert.equal(c.ok, false, fence)
      assert.match(c.detail, /1\/2 บล็อกเป็น stub/)
    }
  })

  test("a Dashboard missing a section, or naming one twice, fails", () => {
    const dash = page("Wayfinder Dashboard")
    for (const text of [dash.replace(/```dataviewjs\n.*"frontier".*\n```\n/, ""), dash.replace('"frontier"', '"lint"')]) {
      assert.notEqual(text, dash)
      const c = checkNamed(doctor(vaultWithPages({ "Wayfinder Dashboard.md": text })).json, "ทุกบล็อกบน Wayfinder Dashboard เป็น stub")
      assert.equal(c.ok, false)
    }
  })

  test("a stub calling another page's view fails", () => {
    const text = page("Wayfinder Efforts").replace('"_tools/views/efforts"', '"_tools/views/picks"')
    const { json } = doctor(vaultWithPages({ "Wayfinder Efforts.md": text }))
    assert.equal(checkNamed(json, "ทุกบล็อกบน Wayfinder Efforts เป็น stub").ok, false)
  })

  test("a missing view, or one holding the word Dataview wraps, fails", () => {
    const vault = vaultWithPages({ "_tools/views/picks.js": "// await\n" })
    const c = checkNamed(doctor(vault).json, "มี view ครบใน _tools/views/")
    assert.equal(c.ok, false)
    assert.match(c.detail, /picks\.js มีคำที่ทำให้ Dataview ทิ้ง promise/)
  })

  test("Picks with the old inline block (trailing spaces aside) warns and names wf migrate", () => {
    const block = LEGACY_PICKS_BLOCK.map((l, i) => (i === 3 ? `${l}  ` : l)).join("\n")
    const legacy = page("Wayfinder Picks").replace(/```dataviewjs[\s\S]*```\n/, `${block}\n`)
    const { json } = doctor(vaultWithPages({ "Wayfinder Picks.md": legacy }))
    const old = checkNamed(json, "ไม่มีบล็อก inline รุ่นก่อน")
    assert.deepEqual([old.ok, old.soft], [false, true])
    assert.match(old.detail, /wf migrate --yes/)
    assert.equal(checkNamed(json, "บน Wayfinder Picks เป็น stub").ok, true)
  })

  test("any other code on Picks fails: it is a note the sandbox can write", () => {
    for (const fence of [PLANTED, `- ${PLANTED}`]) {
      const { json } = doctor(vaultWithPages({ "Wayfinder Picks.md": page("Wayfinder Picks") + fence }))
      const c = checkNamed(json, "บน Wayfinder Picks เป็น stub")
      assert.equal(c.ok, false, fence)
      assert.equal(c.soft, undefined)
      assert.match(c.detail, /ตรวจว่าใครใส่ไว้/)
    }
  })

  test("a dataviewjs block in any other note warns and names the note, _ folders too; dot folders and _tools are out of scope", () => {
    const vault = vaultWithPages({
      "r/a/issues/01-x.md": `---\nstatus: open\n---\n${PLANTED}`,
      "_inbox/z.md": `- ${PLANTED}`,
      ".trash/y.md": PLANTED,
      "_tools/notes.md": PLANTED,
    })
    const c = checkNamed(doctor(vault).json, "ไม่มีบล็อก dataviewjs ในโน้ตอื่น")
    assert.deepEqual([c.ok, c.soft], [false, true])
    assert.equal(c.detail, "เปิดดูก่อนเปิดใน Obsidian: _inbox/z.md (1) · r/a/issues/01-x.md (1)")
  })

  test("inline JS left on (an older vault's seed-once settings) warns with where to turn it off", () => {
    const on = readFileSync(join(TEMPLATE, DATAVIEW), "utf8").replace('"enableInlineDataviewJs": false', '"enableInlineDataviewJs": true')
    const c = checkNamed(doctor(vaultWithPages({ [DATAVIEW]: on })).json, "ปิด enableInlineDataviewJs")
    assert.deepEqual([c.ok, c.soft], [false, true])
    assert.match(c.detail, /Enable Inline JavaScript Queries/)
  })
})
