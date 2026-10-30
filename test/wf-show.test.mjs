// `wf show` through the CLI against a fixture vault (spec *Verbs*: show).
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { makeVault, map, ticket, ticketsBlock, wf } from "./vault.mjs"

const MAP_BODY = [
  "## Destination",
  "",
  "Ship the thing.",
  "",
  "## Notes",
  "",
  "- the repo can't push — see [[02-other]]",
  "",
  ticketsBlock("- [[01-first]] — open\n- [[02-other]] — open"),
  "## Decisions so far",
  "",
  "- [[02-other]]: chose B",
  "- [[01-first|the first one]]: chose A",
  "- [[r/e/issues/01-first]]: a full-path link counts too",
  "- [[01-firstly]]: a different ticket",
  "",
  "## Not yet specified",
  "",
  "- what 01 means for [[02-other]]",
  "- after [[r/e/issues/01-first|01]], the rollout",
  "",
].join("\n")

const vaultWith = (mapFields = {}) =>
  makeVault({
    notes: [
      { ...map("r/e/map.md", mapFields), body: MAP_BODY },
      { ...ticket("r/e/issues/01-first.md", { title: "First" }), body: "## Question\n\nWhy?\n\n## Answer\n\n(later)\n" },
      ticket("r/e/issues/02-other.md"),
      ticket("r/e/issues/10-firstly.md"),
    ],
  })

describe("wf show", () => {
  test("prints the ticket, the map's Destination and Notes, and only the map lines that link it", () => {
    const r = wf(vaultWith(), ["show", "r/e#01"])
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stdout, /^# r\/e#01 — \/.+\/r\/e\/issues\/01-first\.md\n/)
    assert.match(r.stdout, /\ntitle: "?First"?\n/)
    assert.match(r.stdout, /## Question\n\nWhy\?/)
    assert.match(r.stdout, /## Destination\n\nShip the thing\./)
    assert.match(r.stdout, /## Notes\n\n- the repo can't push/)
    assert.match(r.stdout, /## Decisions so far — lines that link r\/e#01\n\n- \[\[01-first\|the first one\]\]: chose A\n- \[\[r\/e\/issues\/01-first\]\]: a full-path link counts too/)
    assert.match(r.stdout, /## Not yet specified — lines that link r\/e#01\n\n- after \[\[r\/e\/issues\/01-first\|01\]\], the rollout\n?$/)
    assert.doesNotMatch(r.stdout, /chose B|01-firstly|what 01 means|wf:tickets/)
  })

  test("--json carries the ticket's frontmatter and body, and the map's parts", () => {
    const r = wf(vaultWith(), ["show", "r/e/issues/02-other.md", "--json"])
    assert.equal(r.code, 0, r.stderr)
    const { data } = r.json
    assert.equal(data.ref, "r/e#02")
    assert.equal(data.path, "r/e/issues/02-other.md")
    assert.equal(data.frontmatter.status, "open")
    assert.equal(data.map.key, "r/e")
    assert.equal(data.map.status, "active")
    assert.equal(data.map.destination, "Ship the thing.")
    assert.equal(data.map.notes, "- the repo can't push — see [[02-other]]")
    assert.deepEqual(data.map.mentions, [
      { section: "Decisions so far", line: "- [[02-other]]: chose B" },
      { section: "Not yet specified", line: "- what 01 means for [[02-other]]" },
    ])
  })

  test("takes a wikilink ref, and a ticket nothing links shows no mention sections", () => {
    const r = wf(vaultWith(), ["show", "[[r/e/issues/10-firstly]]"])
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stdout, /^# r\/e#10 — /)
    assert.doesNotMatch(r.stdout, /lines that link/)
  })

  test("a ticket whose map is missing still shows the ticket", () => {
    const vault = makeVault({ notes: [ticket("r/lost/issues/01-alone.md")] })
    const r = wf(vault, ["show", "r/lost#01"])
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stdout, /\(no map for r\/lost#01\)\n?$/)
    assert.equal(wf(vault, ["show", "r/lost#01", "--json"]).json.data.map, null)
  })

  test("refuses a missing ticket, an effort ref and a missing argument", () => {
    const vault = vaultWith()
    for (const [args, message] of [
      [["show", "r/e#99"], /no ticket r\/e#99 in the vault/],
      [["show", "r/e"], /cannot read "r\/e" as a ticket ref/],
      [["show"], /missing argument/],
    ]) {
      const r = wf(vault, args)
      assert.equal(r.code, 2, `${args.join(" ")}: ${r.stderr}`)
      assert.match(r.stderr, message)
    }
  })
})
