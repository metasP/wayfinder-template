// `wf frontier` through the CLI against a fixture vault (spec *Verbs*: frontier; Testing Decisions §1).
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { makeVault, map, ticket, wf } from "./vault.mjs"

const refsOf = (r) => r.json.data.tickets.map((t) => t.ref)

describe("wf frontier", () => {
  test("lists open, unblocked tickets on active maps, most-unblocking first", () => {
    const vault = makeVault({
      notes: [
        map("r/e/map.md"),
        ticket("r/e/issues/01-first.md"),
        ticket("r/e/issues/02-gate.md"),
        ticket("r/e/issues/03-waits-on-gate.md", { blockers: ["[[02-gate]]"] }),
        ticket("r/e/issues/04-done.md", { status: "resolved" }),
        map("r/paused/map.md", { status: "paused", status_note: "later" }),
        ticket("r/paused/issues/01-idle.md"),
      ],
    })
    const r = wf(vault, ["frontier", "--json"])
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.json.ok, true)
    assert.deepEqual(refsOf(r), ["r/e#02", "r/e#01"])
  })

  test("--repo matches the home repo or target_repo", () => {
    const vault = makeVault({
      notes: [
        map("app/e/map.md"),
        ticket("app/e/issues/01-home.md"),
        ticket("app/e/issues/02-elsewhere.md", { target_repo: "lib" }),
        map("lib/e/map.md"),
        ticket("lib/e/issues/01-lib-home.md"),
      ],
    })
    assert.deepEqual(refsOf(wf(vault, ["frontier", "--repo", "lib", "--json"])), ["lib/e#01", "app/e#02"])
    assert.deepEqual(refsOf(wf(vault, ["frontier", "--repo=app", "--json"])), ["app/e#01", "app/e#02"])
    assert.deepEqual(refsOf(wf(vault, ["frontier", "--repo", "nowhere", "--json"])), [])
  })

  const twoEfforts = () => [
    map("r/a/map.md"),
    ticket("r/a/issues/01-a1.md"),
    ticket("r/a/issues/02-a2.md", { type: "research" }),
    map("r/b/map.md"),
    ticket("r/b/issues/01-b1.md"),
  ]

  test("orders by the Picks sort: key, with --from giving same_effort its context", () => {
    const vault = makeVault({ notes: twoEfforts(), picks: { sort: ["same_effort", "nn desc"] } })
    assert.deepEqual(refsOf(wf(vault, ["frontier", "--from", "r/b", "--json"])), ["r/b#01", "r/a#02", "r/a#01"])
    assert.deepEqual(refsOf(wf(vault, ["frontier", "--json"])), ["r/a#02", "r/a#01", "r/b#01"])
  })

  test("falls back to unblocks desc, nn asc when Picks has no sort: key or no note at all", () => {
    const expected = ["r/a#01", "r/b#01", "r/a#02"]
    assert.deepEqual(refsOf(wf(makeVault({ notes: twoEfforts(), picks: { kind: "picks" } }), ["frontier", "--json"])), expected)
    assert.deepEqual(refsOf(wf(makeVault({ notes: twoEfforts() }), ["frontier", "--json"])), expected)
  })

  test("--from takes the effort as repo/effort, a ticket ref, a vault path or a wikilink", () => {
    const vault = makeVault({ notes: twoEfforts(), picks: { sort: ["same_effort"] } })
    for (const from of ["r/b", "r/b#01", "r/b/map.md", `${vault}/r/b/issues/01-b1.md`, "[[r/b/map]]", "[[r/b/issues/01-b1]]"]) {
      const r = wf(vault, ["frontier", "--from", from, "--json"])
      assert.equal(r.code, 0, `${from}: ${r.stderr}`)
      assert.deepEqual(refsOf(r)[0], "r/b#01", from)
    }
  })

  test("--json carries each ticket's identity, title and unblocks count", () => {
    const vault = makeVault({
      notes: [
        map("r/e/map.md"),
        ticket("r/e/issues/07-gate.md", { title: "Gate", target_repo: "lib" }),
        ticket("r/e/issues/08-after.md", { blockers: ["[[07-gate]]"] }),
      ],
    })
    assert.deepEqual(wf(vault, ["frontier", "--json"]).json, {
      ok: true,
      error: null,
      data: {
        tickets: [
          {
            ref: "r/e#07",
            path: "r/e/issues/07-gate.md",
            repo: "r",
            effort: "e",
            nn: 7,
            type: "task",
            title: "Gate",
            target_repo: "lib",
            unblocks: 1,
          },
        ],
      },
    })
  })

  test("prints one aligned line per ticket, or says the frontier is empty", () => {
    const vault = makeVault({
      notes: [
        map("r/e/map.md"),
        ticket("r/e/issues/01-a.md", { title: "First", type: "research" }),
        ticket("r/e/issues/12-b.md", { title: "Second", target_repo: "lib" }),
      ],
    })
    const r = wf(vault, ["frontier"])
    assert.equal(r.code, 0)
    assert.equal(r.stdout, "r/e#01  research  First\nr/e#12  task      Second  → lib\n")
    const empty = wf(makeVault({ notes: [map("r/e/map.md")] }), ["frontier"])
    assert.equal(empty.stdout, "no open, unblocked tickets on active maps\n")
  })
})
