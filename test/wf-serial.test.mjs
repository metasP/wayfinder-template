// Serial maps through the CLI against fixture vaults (spec *Verbs*: `serial`; map `serial` field):
// `wf serial on|off`, `wf chart --serial`, `wf claim` refusing a second claimed ticket on a serial map
// unless `--force`, the `serial` column of `wf frontier --json`, and what lint says about the key.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { yamlScalar } from "../template/_tools/lib/edit.mjs"
import { git, makeVault, map, read, seed, ticket, wf } from "./vault.mjs"

const NO_SESSION = { CLAUDE_CODE_SESSION_ID: undefined }
const run = (vault, args) => wf(vault, args, { env: NO_SESSION })

const DESTINATION = "# The map\n\n## Destination\n\nSomewhere real.\n"
const vaultWith = (mapFields = {}, tickets = []) => seed(makeVault({ notes: [{ ...map("r/e/map.md", mapFields), body: DESTINATION }, ...tickets] }))
const frontmatterOf = (vault, rel) => read(vault, rel).split("---\n")[1]
// Lint findings about the `serial` key (the fixture maps have no tickets block, which lint warns about).
const serialFindings = (vault) =>
  run(vault, ["lint", "--json"]).json.data.findings.filter((f) => f.message.includes("serial")).map((f) => [f.severity, f.rule, f.message])

const refused = (vault, args, code, message, fix) => {
  const head = git(vault, "rev-parse", "HEAD")
  const r = run(vault, args)
  assert.equal(r.code, code, r.stderr)
  assert.match(r.stderr, message)
  if (fix) assert.match(r.stderr, new RegExp(`^  fix: ${fix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m"))
  assert.equal(git(vault, "rev-parse", "HEAD"), head, "no commit")
  assert.equal(git(vault, "status", "--porcelain"), "", "nothing written")
}

describe("wf serial", () => {
  test("on writes serial: true and commits only the map; off removes the key", () => {
    const vault = vaultWith()
    const on = run(vault, ["serial", "r/e", "on", "--json"])
    assert.equal(on.code, 0, on.stderr)
    assert.deepEqual([on.json.data.ref, on.json.data.serial], ["r/e", true])
    assert.match(frontmatterOf(vault, "r/e/map.md"), /^serial: true$/m)
    assert.equal(git(vault, "log", "-1", "--format=%s"), "wf(serial): r/e")
    assert.deepEqual(serialFindings(vault), [])
    const off = run(vault, ["serial", "r/e", "off"])
    assert.equal(off.code, 0, off.stderr)
    assert.match(off.stdout, /^map r\/e: serial off/)
    assert.doesNotMatch(frontmatterOf(vault, "r/e/map.md"), /serial/)
  })

  test("works on a map in any status", () => {
    for (const status of ["draft", "paused", "done"]) {
      const vault = vaultWith({ status, ...(status === "paused" && { status_note: "later" }) })
      assert.equal(run(vault, ["serial", "r/e", "on"]).code, 0, status)
    }
  })

  test("off clears a serial value lint calls invalid", () => {
    const vault = vaultWith({ serial: "yes" })
    assert.equal(run(vault, ["serial", "r/e", "off"]).code, 0)
    assert.doesNotMatch(frontmatterOf(vault, "r/e/map.md"), /serial/)
  })

  test("refuses a map already in that state (exit 1)", () => {
    refused(vaultWith({ serial: true }), ["serial", "r/e", "on"], 1, /map r\/e is already serial/, "nothing to do")
    refused(vaultWith(), ["serial", "r/e", "off"], 1, /map r\/e is already not serial/, "nothing to do")
  })

  test("refuses an effort without a map (exit 1) and a switch that isn't on or off (exit 2)", () => {
    refused(vaultWith(), ["serial", "r/none", "on"], 1, /r\/none has no map/, "wf chart r/none --title <title>")
    refused(vaultWith(), ["serial", "r/e", "true"], 2, /serial takes on or off, got "true"/)
    refused(vaultWith(), ["serial", "r/e"], 2, /usage/)
  })
})

describe("wf chart --serial", () => {
  test("charts the map with serial: true; without it there is no serial key", () => {
    const vault = vaultWith()
    const r = run(vault, ["chart", "r/new", "--title", "New", "--serial", "--json"])
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.json.data.serial, true)
    assert.match(frontmatterOf(vault, "r/new/map.md"), /^serial: true$/m)
    assert.equal(run(vault, ["chart", "r/plain", "--title", "Plain"]).code, 0)
    assert.doesNotMatch(frontmatterOf(vault, "r/plain/map.md"), /serial/)
  })
})

describe("wf claim on a serial map", () => {
  const tickets = (second = {}) => [
    ticket("r/e/issues/01-a.md", { title: "A", status: "claimed", claimed_by: "bob" }),
    ticket("r/e/issues/02-b.md", { title: "B", ...second }),
  ]

  test("refuses a second claimed ticket, naming the one in progress (exit 1)", () => {
    refused(
      vaultWith({ serial: true }, tickets()),
      ["claim", "r/e#02", "--by", "alice"],
      1,
      /map r\/e is serial and r\/e#01 \(claimed by bob\) is in progress — its tickets are claimed one at a time/,
      'wf resolve r/e#01 --gist "…" (finish it first)',
    )
  })

  test("--force claims it anyway", () => {
    const vault = vaultWith({ serial: true }, tickets())
    const r = run(vault, ["claim", "r/e#02", "--by", "alice", "--force"])
    assert.equal(r.code, 0, r.stderr)
    assert.match(frontmatterOf(vault, "r/e/issues/02-b.md"), /^claimed_by: alice$/m)
  })

  test("claims when nothing else is claimed: waiting and resolved tickets don't hold the map", () => {
    const notes = [
      ticket("r/e/issues/01-a.md", { title: "A", status: "waiting", status_note: "PR review", claimed_by: "bob" }),
      ticket("r/e/issues/02-b.md", { title: "B", status: "resolved" }),
      ticket("r/e/issues/03-c.md", { title: "C" }),
    ]
    assert.equal(run(vaultWith({ serial: true }, notes), ["claim", "r/e#03", "--by", "alice"]).code, 0)
  })

  test("a map that isn't serial (absent or false) claims in parallel", () => {
    assert.equal(run(vaultWith({}, tickets()), ["claim", "r/e#02", "--by", "alice"]).code, 0)
    assert.equal(run(vaultWith({ serial: false }, tickets()), ["claim", "r/e#02", "--by", "alice"]).code, 0)
  })

  test("a claimed ticket in another effort doesn't count", () => {
    const vault = seed(
      makeVault({
        notes: [
          { ...map("r/e/map.md", { serial: true }), body: DESTINATION },
          { ...map("r/other/map.md", { serial: true }), body: DESTINATION },
          ticket("r/other/issues/01-x.md", { title: "X", status: "claimed", claimed_by: "bob" }),
          ticket("r/e/issues/01-a.md", { title: "A" }),
        ],
      }),
    )
    assert.equal(run(vault, ["claim", "r/e#01", "--by", "alice"]).code, 0)
  })
})

describe("serial elsewhere", () => {
  test("wf frontier --json carries the map's serial on every row", () => {
    const vault = seed(
      makeVault({
        notes: [
          map("r/s/map.md", { serial: true }),
          ticket("r/s/issues/01-a.md", { title: "A" }),
          map("r/p/map.md"),
          ticket("r/p/issues/01-b.md", { title: "B" }),
        ],
      }),
    )
    const rows = run(vault, ["frontier", "--json"]).json.data.tickets
    assert.deepEqual(Object.fromEntries(rows.map((r) => [r.ref, r.serial])), { "r/s#01": true, "r/p#01": false })
  })

  test("lint knows the key: true and false are clean, anything else is invalid-value", () => {
    for (const value of [true, false]) assert.deepEqual(serialFindings(vaultWith({ serial: value })), [])
    assert.deepEqual(serialFindings(vaultWith({ serial: "yes" })), [["error", "invalid-value", 'serial is "yes"; expected true | false']])
  })

  test("a boolean frontmatter value is written plain, the string true stays quoted", () => {
    assert.equal(yamlScalar(true), "true")
    assert.equal(yamlScalar("true"), '"true"')
  })
})
