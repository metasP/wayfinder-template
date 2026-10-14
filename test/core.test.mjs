// The read model through the core: pure, in-memory `notes`, no filesystem
// (spec docs/specs/ticket-store.md, Testing Decisions §2).
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import * as core from "../template/_tools/lib/core.mjs"
import { PROTOTYPE_NOTES, TODAY, map, refs, ticket } from "./fixture.mjs"

describe("identity", () => {
  test("parses a ticket path into repo, effort, nn and slug", () => {
    assert.deepEqual(core.parseRef("repoA/eff1/issues/03-some-slug.md"), {
      repo: "repoA",
      effort: "eff1",
      nn: 3,
      slug: "some-slug",
    })
  })

  test("a repo may contain a slash", () => {
    assert.deepEqual(core.parseRef("org/repo/eff/issues/12-x.md"), { repo: "org/repo", effort: "eff", nn: 12, slug: "x" })
    assert.deepEqual(core.parseRef("org/repo/eff#07"), { repo: "org/repo", effort: "eff", nn: 7, slug: null })
  })

  test("parses a ref, a full-path wikilink and a map path", () => {
    assert.deepEqual(core.parseRef("repoA/eff1#02"), { repo: "repoA", effort: "eff1", nn: 2, slug: null })
    assert.deepEqual(core.parseRef("[[repoA/eff1/issues/02-ready|alias]]"), {
      repo: "repoA",
      effort: "eff1",
      nn: 2,
      slug: "ready",
    })
    assert.deepEqual(core.parseRef("repoA/eff1/map.md"), { repo: "repoA", effort: "eff1", nn: null, slug: null })
    assert.deepEqual(core.parseRef("repoA/eff1"), { repo: "repoA", effort: "eff1", nn: null, slug: null })
  })

  test("a bare wikilink needs a home effort", () => {
    assert.equal(core.parseRef("[[02-ready]]"), null)
    assert.deepEqual(core.parseRef("[[02-ready]]", { home: { repo: "org/r", effort: "e" } }), {
      repo: "org/r",
      effort: "e",
      nn: 2,
      slug: "ready",
    })
  })

  test("returns null for anything else", () => {
    for (const bad of ["", "nope", "_tools/lib/core.mjs", "repoA/eff1/notes.md", "#02", 42, null]) {
      assert.equal(core.parseRef(bad), null, String(bad))
    }
  })

  test("dotted repo and effort names round-trip through formatRef", () => {
    for (const id of [
      { repo: "foo.io", effort: "v2.0-migration", nn: null, slug: null },
      { repo: "org/my.repo", effort: "eff", nn: 100, slug: null },
    ]) {
      assert.deepEqual(core.parseRef(core.formatRef(id)), id)
    }
  })

  test("formats refs with a two-digit NN", () => {
    assert.equal(core.formatRef({ repo: "org/repo", effort: "eff", nn: 3 }), "org/repo/eff#03")
    assert.equal(core.formatRef({ repo: "r", effort: "e", nn: 123 }), "r/e#123")
    assert.equal(core.formatRef({ repo: "r", effort: "e", nn: null }), "r/e")
  })
})

describe("index and blockers", () => {
  test("a map.md without kind: map is not a map, and is reported", () => {
    const idx = core.buildIndex([
      ...PROTOTYPE_NOTES,
      { path: "repoA/eff1/assets/map.md", frontmatter: { title: "a diagram" } },
    ])
    assert.equal(idx.maps.has("repoA/eff1/assets"), false)
    assert.equal(idx.efforts.has("repoA/eff1/assets"), false)
    assert.deepEqual(idx.skipped, [{ path: "repoA/eff1/assets/map.md", reason: "map.md without kind: map" }])
  })

  test("blockers that aren't wikilink strings fail closed", () => {
    const idx = core.buildIndex([
      map("r/e/map.md"),
      ticket("r/e/issues/01-a.md", { status: "resolved" }),
      ticket("r/e/issues/02-b.md", { blockers: [["[[01-a]]"], { path: "r/e/issues/01-a.md" }, "01-a"] }),
      ticket("r/e/issues/03-c.md", { blockers: "[[01-a]]" }),
    ])
    assert.deepEqual(idx.tickets.get("r/e#02").blockers, [null, null, null])
    assert.deepEqual(idx.tickets.get("r/e#03").blockers, ["r/e#01"])
  })

  test("an unknown ref is a TypeError that names it", () => {
    const idx = core.buildIndex(PROTOTYPE_NOTES)
    assert.throws(() => core.isBlocked(idx, "repoA/eff1#99"), { name: "TypeError", message: /repoA\/eff1#99/ })
  })

  test("keys maps by repo/effort and tickets by repo/effort#NN", () => {
    const idx = core.buildIndex(PROTOTYPE_NOTES)
    assert.deepEqual([...idx.maps.keys()].sort(), ["repoA/eff1", "repoB/eff2"])
    const t = idx.tickets.get("repoA/eff1#02")
    assert.equal(t.path, "repoA/eff1/issues/02-ready.md")
    assert.equal(t.name, "02-ready")
    assert.equal(t.effortKey, "repoA/eff1")
    assert.deepEqual(t.blockers, ["repoA/eff1#01"])
  })

  test("a bare wikilink resolves within its own effort; a full path is absolute", () => {
    const idx = core.buildIndex([
      ...PROTOTYPE_NOTES,
      ticket("repoB/eff2/issues/03-x.md", { blockers: ["[[01-other]]", "[[repoA/eff1/issues/01-done]]"] }),
    ])
    assert.deepEqual(idx.tickets.get("repoB/eff2#03").blockers, ["repoB/eff2#01", "repoA/eff1#01"])
    assert.deepEqual(idx.tickets.get("repoA/eff1#05").blockers, ["repoB/eff2#01"])
  })

  test("a blocker that doesn't resolve becomes null — no guessing across efforts", () => {
    const idx = core.buildIndex([
      ...PROTOTYPE_NOTES,
      ticket("repoA/eff1/issues/07-odd.md", {
        blockers: ["[[01-other]]", "[[01-wrong-slug]]", "01-done", "[[repoB/eff2/map]]", 7],
      }),
    ])
    assert.deepEqual(idx.tickets.get("repoA/eff1#07").blockers, [null, null, null, null, null])
    assert.deepEqual(idx.tickets.get("repoA/eff1#06").blockers, [null])
  })

  test("ignores notes outside the effort layout", () => {
    const idx = core.buildIndex([
      { path: "Wayfinder Dashboard.md", frontmatter: {} },
      { path: "_tools/lib/x/issues/01-y.md", frontmatter: {} },
      { path: "repoA/eff1/assets/01-a/notes.md", frontmatter: {} },
      ...PROTOTYPE_NOTES,
    ])
    assert.equal(idx.tickets.size, 8)
    assert.equal(idx.maps.size, 2)
  })

  test("a duplicate NN in an effort keeps the first path in path order and reports the rest", () => {
    const idx = core.buildIndex([...PROTOTYPE_NOTES, ticket("repoA/eff1/issues/02-again.md")])
    assert.equal(idx.tickets.get("repoA/eff1#02").path, "repoA/eff1/issues/02-again.md")
    assert.deepEqual(idx.duplicates, [{ ref: "repoA/eff1#02", path: "repoA/eff1/issues/02-ready.md" }])
  })

  test("groups each effort's tickets in NN order, with its map", () => {
    const idx = core.buildIndex([...PROTOTYPE_NOTES].reverse())
    const eff = idx.efforts.get("repoA/eff1")
    assert.equal(eff.map.path, "repoA/eff1/map.md")
    assert.deepEqual(refs(eff.tickets), ["01", "02", "03", "04", "05", "06"].map((n) => `repoA/eff1#${n}`))
  })

  test("open blockers: a cross-effort blocker is judged by its real status, a dangling one fails closed", () => {
    const idx = core.buildIndex(PROTOTYPE_NOTES)
    const get = (ref) => idx.tickets.get(ref)
    assert.deepEqual(core.openBlockers(idx, get("repoA/eff1#03")), ["repoA/eff1#04"])
    assert.equal(core.isBlocked(idx, get("repoA/eff1#03")), true)
    assert.equal(core.isBlocked(idx, get("repoA/eff1#05")), false)
    assert.deepEqual(core.openBlockers(idx, get("repoA/eff1#06")), [null])
    assert.equal(core.isBlocked(idx, get("repoA/eff1#06")), true)
  })

  test("a cross-effort blocker that is still open blocks", () => {
    const notes = PROTOTYPE_NOTES.map((n) =>
      n.path === "repoB/eff2/issues/01-other.md" ? ticket(n.path, { status: "waiting", status_note: "x" }) : n,
    )
    const idx = core.buildIndex(notes)
    assert.equal(core.isBlocked(idx, idx.tickets.get("repoA/eff1#05")), true)
  })
})

describe("frontier", () => {
  test("open + unblocked + active map (the prototype's expected frontier)", () => {
    const idx = core.buildIndex(PROTOTYPE_NOTES)
    assert.deepEqual(refs(core.frontier(idx, { sort: ["nn asc"] })), ["repoA/eff1#02", "repoA/eff1#05"])
  })

  test("a paused map has no frontier", () => {
    const idx = core.buildIndex(PROTOTYPE_NOTES)
    assert.ok(core.frontier(idx).every((t) => t.effortKey !== "repoB/eff2"))
  })

  test("a ticket without a map is not on the frontier", () => {
    const idx = core.buildIndex([...PROTOTYPE_NOTES, ticket("repoC/orphan/issues/01-x.md")])
    assert.ok(core.frontier(idx).every((t) => t.repo !== "repoC"))
  })

  test("--repo matches the home repo or target_repo", () => {
    const idx = core.buildIndex([
      ...PROTOTYPE_NOTES,
      map("repoC/eff3/map.md"),
      ticket("repoC/eff3/issues/01-for-a.md", { target_repo: "repoA" }),
      ticket("repoC/eff3/issues/02-home.md"),
    ])
    assert.deepEqual(refs(core.frontier(idx, { repo: "repoA", sort: ["nn asc"] })).sort(), [
      "repoA/eff1#02",
      "repoA/eff1#05",
      "repoC/eff3#01",
    ])
    assert.deepEqual(refs(core.frontier(idx, { repo: "repoC" })).sort(), ["repoC/eff3#01", "repoC/eff3#02"])
  })
})

describe("ticket state", () => {
  const idx = core.buildIndex([
    ...PROTOTYPE_NOTES,
    ticket("repoA/eff1/issues/07-waiting.md", { status: "waiting", status_note: "deploy", blockers: ["[[04-claimed]]"] }),
    ticket("repoA/eff1/issues/08-typo.md", { status: "opne" }),
  ])
  const stateOf = (ref) => core.ticketState(idx, ref)

  test("an open ticket is ready unless a blocker is unresolved or dangling", () => {
    assert.equal(stateOf("repoA/eff1#02"), "ready")
    assert.equal(stateOf("repoA/eff1#05"), "ready")
    assert.equal(stateOf("repoA/eff1#03"), "blocked")
    assert.equal(stateOf("repoA/eff1#06"), "blocked")
  })

  test("claimed, waiting and resolved are their status, whatever the blockers", () => {
    assert.equal(stateOf("repoA/eff1#04"), "claimed")
    assert.equal(stateOf("repoA/eff1#07"), "waiting")
    assert.equal(stateOf("repoA/eff1#01"), "resolved")
  })

  test("a status outside the enum has no state (lint reports it)", () => {
    assert.equal(stateOf("repoA/eff1#08"), null)
  })

  test("pending = open, claimed or waiting — not resolved, not a status typo", () => {
    const pending = [...idx.tickets.values()].filter((t) => core.isPending(idx, t)).map((t) => t.ref)
    assert.deepEqual(pending.sort(), [
      "repoA/eff1#02", "repoA/eff1#03", "repoA/eff1#04", "repoA/eff1#05", "repoA/eff1#06", "repoA/eff1#07", "repoB/eff2#02",
    ])
  })

  test("the frontier is exactly the ready tickets on active maps", () => {
    const ready = [...idx.tickets.values()].filter(
      (t) => stateOf(t.ref) === "ready" && idx.maps.get(t.effortKey)?.status === "active",
    )
    assert.deepEqual(refs(core.frontier(idx)).sort(), refs(ready).sort())
  })
})

describe("pick order", () => {
  // r/pk#02 unblocks two open tickets; r/pk#03 unblocks one open ticket in another effort
  // (the claimed r/pk#06 doesn't count); r/pk#01 is the only research ticket.
  const PICK_NOTES = [
    map("r/pk/map.md"),
    map("r/other/map.md"),
    ticket("r/pk/issues/01-a.md", { type: "research" }),
    ticket("r/pk/issues/02-b.md"),
    ticket("r/pk/issues/03-c.md"),
    ticket("r/pk/issues/04-d.md", { blockers: ["[[02-b]]"] }),
    ticket("r/pk/issues/05-e.md", { blockers: ["[[02-b]]"] }),
    ticket("r/pk/issues/06-f.md", { status: "claimed", claimed_by: "x", blockers: ["[[03-c]]"] }),
    ticket("r/other/issues/01-g.md", { blockers: ["[[r/pk/issues/03-c]]"] }),
  ]
  const idx = core.buildIndex(PICK_NOTES)
  const pool = ["r/pk#01", "r/pk#02", "r/pk#03", "r/other#01"].map((r) => idx.tickets.get(r))
  const order = (rules, opts) => refs(core.pickOrder(idx, pool, rules, opts))

  test("unblocks counts open tickets whose blockers include this one", () => {
    assert.equal(core.unblocks(idx, "r/pk#02"), 2)
    assert.equal(core.unblocks(idx, idx.tickets.get("r/pk#03")), 1)
    assert.equal(core.unblocks(idx, "r/pk#01"), 0)
  })

  test("default is [unblocks desc, nn asc], ties fall back to the ref", () => {
    assert.deepEqual(core.DEFAULT_PICK_SORT, ["unblocks desc", "nn asc"])
    const expected = ["r/pk#02", "r/pk#03", "r/other#01", "r/pk#01"]
    assert.deepEqual(order(undefined), expected)
    assert.deepEqual(order([]), expected)
  })

  test("afk_first puts research first; desc puts it last", () => {
    assert.deepEqual(order(["afk_first"]), ["r/pk#01", "r/other#01", "r/pk#02", "r/pk#03"])
    assert.deepEqual(order(["afk_first desc"]), ["r/other#01", "r/pk#02", "r/pk#03", "r/pk#01"])
  })

  test("same_effort puts the --from effort first and is ignored without --from", () => {
    assert.deepEqual(order(["same_effort", "nn desc"], { from: "r/other" }), ["r/other#01", "r/pk#03", "r/pk#02", "r/pk#01"])
    assert.deepEqual(order(["same_effort", "nn desc"]), ["r/pk#03", "r/pk#02", "r/other#01", "r/pk#01"])
  })

  test("nn sorts by ticket number in either direction", () => {
    assert.deepEqual(order(["nn asc"]), ["r/other#01", "r/pk#01", "r/pk#02", "r/pk#03"])
    assert.deepEqual(order(["nn desc"]), ["r/pk#03", "r/pk#02", "r/other#01", "r/pk#01"])
  })

  test("unblocks asc puts the least-unblocking first", () => {
    assert.deepEqual(order(["unblocks asc"]), ["r/other#01", "r/pk#01", "r/pk#03", "r/pk#02"])
  })

  test("an unknown key is ignored when sorting and reported by parsePickSort", () => {
    assert.deepEqual(order(["bogus desc", "nn desc"]), order(["nn desc"]))
    assert.deepEqual(core.parsePickSort(["unblocks desc", "nn", "bogus asc", "nn sideways"]), {
      keys: [
        { key: "unblocks", dir: "desc" },
        { key: "nn", dir: "asc" },
      ],
      unknown: ["bogus asc", "nn sideways"],
    })
  })

  test("ties fall back to effort then numeric NN, not the ref string", () => {
    const big = core.buildIndex([map("r/e/map.md"), ticket("r/e/issues/99-a.md"), ticket("r/e/issues/100-b.md")])
    assert.deepEqual(refs(core.pickOrder(big, [...big.tickets.values()], ["unblocks desc"])), ["r/e#99", "r/e#100"])
  })

  test("rules with no known key fall back to the default", () => {
    assert.deepEqual(order(["unblock desc"]), order(undefined))
  })

  test("pickOrder doesn't reorder its input", () => {
    const input = [...pool]
    core.pickOrder(idx, input, ["nn desc"])
    assert.deepEqual(input, pool)
  })

  test("frontier is in pick order, default or given", () => {
    assert.deepEqual(refs(core.frontier(idx)), ["r/pk#02", "r/pk#03", "r/pk#01"])
    assert.deepEqual(refs(core.frontier(idx, { sort: ["afk_first", "nn desc"] })), ["r/pk#01", "r/pk#03", "r/pk#02"])
  })
})

describe("dates", () => {
  test("isoDate accepts strings, Date and Luxon-like values", () => {
    assert.equal(core.isoDate("2026-10-01"), "2026-10-01")
    assert.equal(core.isoDate("2026-10-01T09:30:00+07:00"), "2026-10-01")
    assert.equal(core.isoDate(new Date("2026-10-01T00:00:00Z")), "2026-10-01")
    assert.equal(core.isoDate({ toISODate: () => "2026-10-01" }), "2026-10-01")
    for (const bad of [null, undefined, "", "soon", 20261001, new Date("nope"), {}, "2026-13-45", "2026-02-30"]) {
      assert.equal(core.isoDate(bad), null, String(bad))
    }
  })

  test("a Date that isn't a date-only (UTC midnight) value is read in local time", () => {
    const tz = process.env.TZ
    try {
      process.env.TZ = "Asia/Bangkok"
      assert.equal(core.isoDate(new Date("2026-10-14T02:00:00+07:00")), "2026-10-14")
      assert.equal(core.isoDate(new Date(2026, 9, 10)), "2026-10-10")
      assert.equal(core.isoDate(new Date("2026-10-10T00:00:00Z")), "2026-10-10")
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })

  test("Date and Luxon frontmatter values give the same answers as strings", () => {
    const asDate = PROTOTYPE_NOTES.map((n) =>
      n.path.endsWith("04-claimed.md") ? ticket(n.path, { ...n.frontmatter, status_since: new Date("2026-09-01") }) : n,
    )
    const asLuxon = PROTOTYPE_NOTES.map((n) =>
      n.path.endsWith("04-claimed.md")
        ? ticket(n.path, { ...n.frontmatter, status_since: { toISODate: () => "2026-09-01" } })
        : n,
    )
    const expected = core.staleClaims(core.buildIndex(PROTOTYPE_NOTES), { today: TODAY })
    assert.deepEqual(core.staleClaims(core.buildIndex(asDate), { today: TODAY }).map((s) => s.days), [43])
    assert.deepEqual(
      core.staleClaims(core.buildIndex(asLuxon), { today: { toISODate: () => TODAY } }).map((s) => s.ticket.ref),
      expected.map((s) => s.ticket.ref),
    )
  })

  test("queries that need a date refuse to guess today", () => {
    const idx = core.buildIndex(PROTOTYPE_NOTES)
    assert.throws(() => core.staleClaims(idx, {}), TypeError)
    assert.throws(() => core.staleMaps(idx, { today: "soon" }), TypeError)
    assert.throws(() => core.overdueWaits(idx), TypeError)
  })
})

describe("stale claims", () => {
  test("a claim older than claim_stale_days (default 3) is stale (the prototype's case)", () => {
    const idx = core.buildIndex(PROTOTYPE_NOTES)
    assert.deepEqual(core.staleClaims(idx, { today: TODAY }), [{ ticket: idx.tickets.get("repoA/eff1#04"), days: 43 }])
  })

  test("the threshold is exclusive and comes from config", () => {
    const idx = core.buildIndex([
      map("r/e/map.md"),
      ticket("r/e/issues/01-three.md", { status: "claimed", claimed_by: "x", status_since: "2026-10-11" }),
      ticket("r/e/issues/02-four.md", { status: "claimed", claimed_by: "x", status_since: "2026-10-10" }),
      ticket("r/e/issues/03-open.md", { status_since: "2026-01-01" }),
    ])
    const stale = (config) => core.staleClaims(idx, { today: TODAY, config }).map((s) => s.ticket.ref)
    assert.deepEqual(stale(), ["r/e#02"])
    assert.deepEqual(stale({ claim_stale_days: 2 }), ["r/e#01", "r/e#02"])
    for (const bad of ["nonsense", null, "", " ", false, true, -1, [], {}]) {
      assert.deepEqual(stale({ claim_stale_days: bad }), ["r/e#02"], JSON.stringify(bad))
    }
    assert.deepEqual(stale({ claim_stale_days: "2" }), ["r/e#01", "r/e#02"])
    assert.deepEqual(core.DEFAULT_CONFIG, { claim_stale_days: 3, stale_days: 14, paused_stale_days: 30 })
  })
})

describe("stale maps", () => {
  const notes = [
    map("r/idle/map.md", { status_since: "2026-09-01" }),
    ticket("r/idle/issues/01-a.md", { status_since: "2026-09-20" }),
    map("r/fresh/map.md", { status_since: "2026-09-01" }),
    ticket("r/fresh/issues/01-a.md", { status_since: "2026-10-10" }),
    map("r/redeclared/map.md", { status_since: "2026-10-12" }),
    ticket("r/redeclared/issues/01-a.md", { status_since: "2026-08-01" }),
    map("r/allwaiting/map.md", { status_since: "2026-08-01" }),
    ticket("r/allwaiting/issues/01-a.md", { status: "waiting", status_note: "x", status_since: "2026-08-01" }),
    ticket("r/allwaiting/issues/02-b.md", { status: "resolved", status_since: "2026-08-01" }),
    map("r/mixed/map.md", { status_since: "2026-08-01" }),
    ticket("r/mixed/issues/01-a.md", { status: "waiting", status_note: "x", status_since: "2026-08-01" }),
    ticket("r/mixed/issues/02-b.md", { status_since: "2026-08-01" }),
    map("r/nopending/map.md", { status_since: "2026-08-01" }),
    ticket("r/nopending/issues/01-a.md", { status: "resolved", status_since: "2026-08-01" }),
    map("r/paused-old/map.md", { status: "paused", status_note: "x", status_since: "2026-09-01" }),
    map("r/paused-new/map.md", { status: "paused", status_note: "x", status_since: "2026-10-01" }),
    map("r/blocked/map.md", {
      status: "paused",
      status_note: "x",
      status_since: "2026-08-01",
      blocked_by: "[[r/fresh/map]]",
    }),
    map("r/done-old/map.md", { status: "done", status_since: "2026-01-01" }),
  ]
  const idx = core.buildIndex(notes)
  const stale = (config) => core.staleMaps(idx, { today: TODAY, config }).map((s) => [s.map.key, s.reason, s.days])

  test("idle active maps and long-paused maps, each with how long", () => {
    assert.deepEqual(stale(), [
      ["r/idle", "idle", 24],
      ["r/mixed", "idle", 74],
      ["r/paused-old", "paused", 43],
    ])
  })

  test("thresholds come from config", () => {
    assert.deepEqual(stale({ stale_days: 30, paused_stale_days: 60 }), [["r/mixed", "idle", 74]])
  })
})

describe("overdue waits", () => {
  test("a waiting ticket is overdue once wait_until has passed", () => {
    const idx = core.buildIndex([
      map("r/e/map.md"),
      ticket("r/e/issues/01-past.md", { status: "waiting", status_note: "x", wait_until: "2026-10-12" }),
      ticket("r/e/issues/02-today.md", { status: "waiting", status_note: "x", wait_until: TODAY }),
      ticket("r/e/issues/03-none.md", { status: "waiting", status_note: "x" }),
      ticket("r/e/issues/04-open.md", { wait_until: "2026-10-01" }),
    ])
    assert.deepEqual(core.overdueWaits(idx, { today: TODAY }), [{ ticket: idx.tickets.get("r/e#01"), days: 2 }])
  })
})

describe("map blocked_by states", () => {
  const blocked = (key, by) => map(`${key}/map.md`, { status: "paused", status_note: "x", blocked_by: by })
  const idx = core.buildIndex([
    map("r/b/map.md"),
    ticket("r/b/issues/01-x.md", { status: "resolved" }),
    ticket("r/b/issues/02-z.md"),
    map("r/d/map.md", { status: "done" }),
    map("r/f/map.md", { status: "paused", status_note: "x" }),
    ticket("r/f/issues/01-y.md"),
    map("r/h/map.md", { status: "dropped", status_note: "x" }),
    blocked("r/cleared-ticket", "[[r/b/issues/01-x]]"),
    blocked("r/cleared-map", "[[r/d/map]]"),
    blocked("r/dead-ticket", "[[r/f/issues/01-y]]"),
    blocked("r/dead-map", "[[r/h/map|the h map]]"),
    blocked("r/dangling", "[[r/nowhere/map]]"),
    blocked("r/not-a-link", 5),
    blocked("r/waiting", "[[r/b/issues/02-z]]"),
    map("r/own/map.md", { blocked_by: "[[01-own]]" }),
    ticket("r/own/issues/01-own.md"),
    map("r/free/map.md"),
  ])
  const state = (key) => core.mapBlockState(idx, key)

  test("cleared when the target ticket is resolved or the target map is done", () => {
    assert.deepEqual(state("r/cleared-ticket"), { state: "cleared", target: "r/b#01", raw: "[[r/b/issues/01-x]]" })
    assert.equal(state("r/cleared-map").state, "cleared")
    assert.equal(state("r/cleared-map").target, "r/d")
  })

  test("dead when the target is in (or is) a paused or dropped map", () => {
    assert.equal(state("r/dead-ticket").state, "dead")
    assert.deepEqual(state("r/dead-map"), { state: "dead", target: "r/h", raw: "[[r/h/map|the h map]]" })
  })

  test("dangling when the target doesn't exist", () => {
    assert.deepEqual(state("r/dangling"), { state: "dangling", target: null, raw: "[[r/nowhere/map]]" })
    assert.equal(state("r/not-a-link").state, "dangling")
  })

  test("waiting while the target is still moving; a bare link means the map's own effort", () => {
    assert.equal(state("r/waiting").state, "waiting")
    assert.deepEqual(state("r/own"), { state: "waiting", target: "r/own#01", raw: "[[01-own]]" })
  })

  test("null when the map has no blocked_by", () => {
    assert.equal(state("r/free"), null)
    assert.equal(core.mapBlockState(idx, idx.maps.get("r/free")), null)
  })
})

describe("rendered ## Tickets block", () => {
  const idx = core.buildIndex([
    map("r/e/map.md"),
    map("r/empty/map.md"),
    ticket("r/e/issues/10-ten-things.md", { status: "waiting", status_note: "x", title: undefined }),
    ticket("r/e/issues/01-a.md", { type: "research", status: "resolved", title: "Find the vault" }),
    ticket("r/e/issues/02-b.md", { title: "Chart it", blockers: ["[[01-a]]"] }),
    ticket("r/e/issues/03-c.md", { type: "grilling", status: "claimed", claimed_by: "x", title: "Grill", blockers: ["[[04-d]]"] }),
    ticket("r/e/issues/04-d.md", { type: "prototype", title: "Try · it", blockers: ["[[99-gone]]"] }),
    ticket("r/e/issues/05-e.md", { status: "resolved", title: "Done anyway", blockers: ["[[04-d]]"] }),
    { path: "r/e/issues/11-bare.md", frontmatter: {} },
  ])

  test("one line per ticket in NN order, ⛔ on unresolved tickets that are blocked", () => {
    assert.equal(
      core.renderTicketsBlock(idx, "r/e", "en"),
      [
        "- [[01-a]] · research · resolved · Find the vault",
        "- [[02-b]] · task · open · Chart it",
        "- [[03-c]] · grilling · claimed · Grill ⛔",
        "- [[04-d]] · prototype · open · Try · it ⛔",
        "- [[05-e]] · task · resolved · Done anyway",
        "- [[10-ten-things]] · task · waiting · ten things",
        "- [[11-bare]] · ? · ? · bare",
      ].join("\n"),
    )
  })

  test("an effort without tickets renders a localised placeholder", () => {
    assert.equal(core.renderTicketsBlock(idx, "r/empty", "en"), "_No tickets yet._")
    assert.equal(core.renderTicketsBlock(idx, "r/empty", "th"), "_ยังไม่มีใบ_")
    assert.equal(core.renderTicketsBlock(idx, "r/empty", "xx"), "_No tickets yet._")
    assert.equal(core.renderTicketsBlock(idx, "r/missing"), "_No tickets yet._")
  })

  test("the language only changes the placeholder, never the ticket lines", () => {
    assert.equal(core.renderTicketsBlock(idx, "r/e", "th"), core.renderTicketsBlock(idx, "r/e", "en"))
  })

  test("ticketsBlockOf reads the text between the markers out of a note body, or null without them", () => {
    const body = "## Tickets\n\n<!-- wf:tickets -->\n- [[01-a]] · x\n<!-- /wf:tickets -->\n\nafter"
    assert.equal(core.ticketsBlockOf(body), "\n- [[01-a]] · x\n")
    assert.equal(core.ticketsBlockOf("<!-- wf:tickets --><!-- /wf:tickets -->"), "")
    assert.equal(core.ticketsBlockOf("## Tickets\n- hand-written\n"), null)
    assert.equal(core.ticketsBlockOf("<!-- /wf:tickets --> then <!-- wf:tickets --> unclosed"), null)
  })
})

describe("schema", () => {
  test("vault schema version 2 enums", () => {
    assert.equal(core.SCHEMA_VERSION, 2)
    assert.deepEqual(core.TICKET_STATUSES, ["open", "claimed", "waiting", "resolved"])
    assert.deepEqual(core.MAP_STATUSES, ["draft", "active", "paused", "done", "dropped"])
    assert.deepEqual(core.TICKET_TYPES, ["research", "prototype", "grilling", "task"])
  })

  test("ticket fields: no repo/effort; list vs scalar; required always or per status", () => {
    const f = core.TICKET_FIELDS
    assert.deepEqual(Object.keys(f), [
      "type", "status", "status_since", "title", "blockers",
      "status_note", "wait_until", "claimed_by", "target_repo",
    ])
    assert.equal(f.blockers.shape, "list")
    assert.equal(f.title.shape, "scalar")
    assert.deepEqual(core.requiredFields("ticket", "open"), ["type", "status", "status_since", "title", "blockers"])
    assert.ok(core.requiredFields("ticket", "waiting").includes("status_note"))
    assert.ok(core.requiredFields("ticket", "claimed").includes("claimed_by"))
    assert.ok(!core.requiredFields("ticket", "resolved").includes("claimed_by"))
  })

  test("map fields: kind, title, status, status_since; status_note when paused or dropped", () => {
    assert.ok(!("repo" in core.MAP_FIELDS) && !("effort" in core.MAP_FIELDS))
    assert.deepEqual(core.requiredFields("map", "active"), ["kind", "title", "status", "status_since"])
    assert.ok(core.requiredFields("map", "paused").includes("status_note"))
    assert.ok(core.requiredFields("map", "dropped").includes("status_note"))
    assert.equal(core.MAP_FIELDS.repos.shape, "list")
    assert.throws(() => core.requiredFields("note", "open"), TypeError)
  })

  test("ticket transitions follow the verb table", () => {
    const to = (verb, from, flag) => core.findTransition("ticket", verb, from, { flag })?.to ?? null
    assert.equal(to("new", null), "open")
    assert.equal(to("claim", "open"), "claimed")
    assert.equal(to("claim", "waiting"), null)
    assert.equal(to("release", "claimed"), "open")
    assert.equal(to("release", "waiting"), "open")
    assert.equal(to("wait", "open"), "waiting")
    assert.equal(to("wait", "resolved"), null)
    assert.equal(to("resolve", "claimed"), "resolved")
    assert.equal(to("resolve", "open"), null, "an open ticket can't be resolved directly")
    assert.equal(to("resolve", "open", "--out-of-scope"), "resolved")
    assert.equal(to("resolve", "waiting", "--out-of-scope"), null)
  })

  test("map transitions follow the verb table", () => {
    const to = (verb, from, target) => core.findTransition("map", verb, from, { to: target })?.to ?? null
    assert.equal(to("chart", null), "draft")
    assert.equal(to("map-status", "draft", "active"), "active")
    assert.equal(to("map-status", "active", "paused"), "paused")
    assert.equal(to("map-status", "paused", "dropped"), "dropped")
    assert.equal(to("map-status", "active", "done"), "done")
    assert.equal(to("map-status", "active", "active"), null)
    assert.equal(to("map-status", "active", "draft"), null)
  })

  test("the schema can't be changed by a consumer", () => {
    assert.throws(() => core.TICKET_STATUSES.push("x"), TypeError)
    assert.throws(() => { core.TICKET_FIELDS.title.required = false }, TypeError)
  })
})
