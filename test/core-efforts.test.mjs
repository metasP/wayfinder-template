// Effort-level queries of the read model, through the core (spec Testing Decisions §2): the ones the
// Efforts and Effort Tickets pages show — the progress clock, finished maps, a blocker graph, and the
// Wayfinder Config values the pages read.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import * as core from "../template/_tools/lib/core.mjs"
import { map, ticket } from "./fixture.mjs"

describe("progress clock", () => {
  const idx = core.buildIndex([
    map("r/a/map.md", { status_since: "2026-10-01" }),
    ticket("r/a/issues/01-x.md", { status_since: "2026-10-05" }),
    ticket("r/a/issues/02-y.md", { status_since: "2026-09-20" }),
    map("r/b/map.md", { status_since: "2026-10-12" }),
    ticket("r/b/issues/01-x.md", { status_since: "2026-10-03" }),
    map("r/c/map.md", { status_since: null }),
  ])

  test("lastMoved is the newest status_since among the map and its tickets", () => {
    assert.equal(core.lastMoved(idx, "r/a"), "2026-10-05")
    assert.equal(core.lastMoved(idx, idx.maps.get("r/b")), "2026-10-12", "declaring a status resets the clock")
    assert.equal(core.lastMoved(idx, "r/c"), null)
  })

  test("daysBetween counts calendar days", () => {
    assert.equal(core.daysBetween("2026-10-05", "2026-10-14"), 9)
    assert.equal(core.daysBetween("2026-10-14", "2026-10-14"), 0)
    assert.equal(core.daysBetween("2026-02-27", "2026-03-01"), 2)
  })
})

describe("effort counts", () => {
  const idx = core.buildIndex([
    map("r/a/map.md"),
    ticket("r/a/issues/01-done.md", { status: "resolved" }),
    ticket("r/a/issues/02-ready.md"),
    ticket("r/a/issues/03-cross.md", { blockers: ["[[r/p/issues/01-x]]"] }),
    ticket("r/a/issues/04-blocked.md", { blockers: ["[[02-ready]]"] }),
    ticket("r/a/issues/05-claimed.md", { status: "claimed" }),
    ticket("r/a/issues/06-waiting.md", { status: "waiting" }),
    ticket("r/a/issues/07-typo.md", { status: "opne" }),
    map("r/p/map.md", { status: "paused" }),
    ticket("r/p/issues/01-x.md", { status: "resolved" }),
    ticket("r/p/issues/02-y.md"),
  ])

  test("counts an effort's tickets by state; frontier is the ready ones on an active map", () => {
    assert.deepEqual(core.effortCounts(idx, "r/a"), {
      total: 7,
      resolved: 1,
      ready: 2,
      frontier: 2,
      blocked: 1,
      claimed: 1,
      waiting: 1,
      unknown: 1,
      pending: 5,
    })
  })

  test("ready tickets on a map that isn't active are not frontier", () => {
    const counts = core.effortCounts(idx, "r/p")
    assert.equal(counts.ready, 1)
    assert.equal(counts.frontier, 0)
  })

  test("an unknown effort counts nothing", () => {
    assert.equal(core.effortCounts(idx, "r/none").total, 0)
  })
})

describe("effort summary", () => {
  test("counts, the progress clock in days, and the map's blocked_by state, for one effort", () => {
    const idx = core.buildIndex([
      map("r/a/map.md", { status: "paused", status_since: "2026-10-04", blocked_by: "[[r/b/issues/01-x]]" }),
      ticket("r/a/issues/01-x.md", { status_since: "2026-10-09" }),
      ticket("r/b/issues/01-x.md", { status: "resolved" }),
    ])
    const s = core.effortSummary(idx, "r/a", { today: "2026-10-14" })
    assert.deepEqual(s, {
      ...core.effortCounts(idx, "r/a"),
      lastMoved: "2026-10-09",
      days: 5,
      pausedDays: 10,
      block: { state: "cleared", target: "r/b#01", raw: "[[r/b/issues/01-x]]" },
    })
  })

  test("an effort without a map or dates has nulls, not zeros", () => {
    const idx = core.buildIndex([ticket("r/x/issues/01-x.md", { status_since: null })])
    const s = core.effortSummary(idx, "r/x", { today: "2026-10-14" })
    assert.equal(s.days, null)
    assert.equal(s.pausedDays, null)
    assert.equal(s.block, null)
  })
})

describe("finished maps", () => {
  test("an active map whose tickets are all resolved is finished", () => {
    const idx = core.buildIndex([
      map("r/done/map.md"),
      ticket("r/done/issues/01-x.md", { status: "resolved" }),
      map("r/open/map.md"),
      ticket("r/open/issues/01-x.md", { status: "resolved" }),
      ticket("r/open/issues/02-y.md", { status: "waiting" }),
      map("r/empty/map.md"),
      map("r/typo/map.md"),
      ticket("r/typo/issues/01-x.md", { status: "resovled" }),
      map("r/paused/map.md", { status: "paused" }),
      ticket("r/paused/issues/01-x.md", { status: "resolved" }),
    ])
    assert.deepEqual(core.finishedMaps(idx).map((m) => m.key), ["r/done"])
  })
})

describe("map warnings", () => {
  const TODAY = "2026-10-14"
  const idx = core.buildIndex([
    map("r/far/map.md", { status_since: "2026-10-13" }),
    ticket("r/far/issues/01-x.md", { status: "resolved", status_since: "2026-10-13" }),
    ticket("r/far/issues/02-y.md", { status_since: "2026-10-13" }),
    // cleared beats finished: both hold, the blocker is reported.
    map("r/cleared/map.md", { blocked_by: "[[r/far/issues/01-x]]", status_since: "2026-10-13" }),
    ticket("r/cleared/issues/01-x.md", { status: "resolved", status_since: "2026-10-13" }),
    map("r/dangling/map.md", { blocked_by: "[[r/none/issues/01-x]]", status_since: "2026-10-13" }),
    ticket("r/dangling/issues/01-x.md", { status_since: "2026-10-13" }),
    map("r/finished/map.md", { status_since: "2026-10-13" }),
    ticket("r/finished/issues/01-x.md", { status: "resolved", status_since: "2026-10-13" }),
    map("r/idle/map.md", { status_since: "2026-09-01" }),
    ticket("r/idle/issues/01-x.md", { status_since: "2026-09-01" }),
    map("r/old/map.md", { status: "paused", status_since: "2026-09-01" }),
    ticket("r/old/issues/01-x.md", { status_since: "2026-09-01" }),
    // still waiting on an open ticket: no warning, and no clock.
    map("r/waits/map.md", { status: "paused", blocked_by: "[[r/far/issues/02-y]]", status_since: "2026-08-01" }),
    ticket("r/waits/issues/01-x.md", { status_since: "2026-08-01" }),
  ])

  test("one warning per map, blocked_by first, then finished, then the stale clock", () => {
    const warnings = core.mapWarnings(idx, { today: TODAY }).map((w) => [w.map.key, w.reason, w.days ?? null])
    assert.deepEqual(warnings, [
      ["r/cleared", "cleared", null],
      ["r/dangling", "dangling", null],
      ["r/finished", "finished", null],
      ["r/idle", "idle", 43],
      ["r/old", "paused", 43],
    ])
  })

  test("a blocked_by warning carries the block state", () => {
    const [w] = core.mapWarnings(idx, { today: TODAY })
    assert.deepEqual(w.block, { state: "cleared", target: "r/far#01", raw: "[[r/far/issues/01-x]]" })
  })
})

describe("dependents", () => {
  test("open tickets a ticket still blocks, and the ones closing it frees", () => {
    const idx = core.buildIndex([
      map("r/a/map.md"),
      ticket("r/a/issues/01-hub.md"),
      ticket("r/a/issues/02-only.md", { blockers: ["[[01-hub]]", "[[01-hub]]"] }),
      ticket("r/a/issues/03-two.md", { blockers: ["[[01-hub]]", "[[04-other]]"] }),
      ticket("r/a/issues/04-other.md"),
      ticket("r/a/issues/05-done.md", { status: "resolved", blockers: ["[[01-hub]]"] }),
    ])
    const { waiting, freed } = core.dependents(idx, "r/a#01")
    assert.deepEqual(waiting.map((t) => t.ref), ["r/a#02", "r/a#03"])
    assert.deepEqual(freed.map((t) => t.ref), ["r/a#02"])
    assert.equal(core.unblocks(idx, "r/a#01"), waiting.length)
  })
})

describe("blocker graph", () => {
  test("edges run blocker → blocked, inside one effort, deduplicated, in NN order", () => {
    const idx = core.buildIndex([
      map("r/a/map.md"),
      ticket("r/a/issues/01-a.md"),
      ticket("r/a/issues/02-b.md", { blockers: ["[[01-a]]", "[[01-a]]"] }),
      ticket("r/a/issues/03-c.md", { blockers: ["[[02-b]]", "[[01-a]]", "[[99-gone]]", "[[r/z/issues/01-far]]"] }),
      ticket("r/a/issues/04-d.md", { blockers: ["[[04-d]]"] }),
      ticket("r/z/issues/01-far.md"),
    ])
    assert.deepEqual(core.blockerEdges(idx, "r/a"), [
      ["r/a#01", "r/a#02"],
      ["r/a#01", "r/a#03"],
      ["r/a#02", "r/a#03"],
    ])
    assert.deepEqual(core.blockerEdges(idx, "r/nothing"), [])
  })
})

describe("page config", () => {
  test("readConfig fills every key with its default", () => {
    const cfg = core.readConfig({})
    assert.equal(cfg.stale_days, 14)
    assert.equal(cfg.paused_stale_days, 30)
    assert.equal(cfg.claim_stale_days, 3)
    assert.equal(cfg.color_resolved, "#4CAF50")
    assert.equal(cfg.label_paused, "⏸ พักไว้")
    assert.deepEqual(Object.keys(cfg).sort(), Object.keys(core.CONFIG_DEFAULTS).sort())
  })

  test("a bad value falls back per key, a good one is kept", () => {
    const cfg = core.readConfig({
      stale_days: "7",
      paused_stale_days: "",
      color_open: " #123abc ",
      color_waiting: "red",
      color_claimed: "#abc",
      label_done: "fin",
      label_draft: '<b x="1">',
      label_dropped: "   ",
    })
    assert.equal(cfg.stale_days, 7)
    assert.equal(cfg.paused_stale_days, 30)
    assert.equal(cfg.color_open, "#123abc")
    assert.equal(cfg.color_waiting, "#AB47BC")
    assert.equal(cfg.color_claimed, "#FFB300")
    assert.equal(cfg.label_done, "fin")
    assert.equal(cfg.label_draft, "✏️ ยังไม่ได้ชาร์ต")
    assert.equal(cfg.label_dropped, "🗑 ทิ้งแล้ว")
  })

  test("readConfig without a Config note is all defaults", () => {
    assert.deepEqual(core.readConfig(undefined), { ...core.CONFIG_DEFAULTS })
  })

  test("isConfigValue tells which present values a page would ignore", () => {
    assert.equal(core.isConfigValue("stale_days", "0"), true)
    assert.equal(core.isConfigValue("stale_days", "-1"), false)
    assert.equal(core.isConfigValue("color_open", "#9E9E9E"), true)
    assert.equal(core.isConfigValue("color_open", "grey"), false)
    assert.equal(core.isConfigValue("label_done", "a > b"), false)
    assert.equal(core.isConfigValue("no_such_key", "x"), false)
  })

  test("the thresholds the queries use follow readConfig", () => {
    const idx = core.buildIndex([
      map("r/a/map.md", { status_since: "2026-10-01" }),
      ticket("r/a/issues/01-x.md", { status_since: "2026-10-01" }),
    ])
    const stale = (config) => core.staleMaps(idx, { today: "2026-10-14", config }).length
    assert.equal(stale({ stale_days: "7" }), 1)
    assert.equal(stale({ stale_days: "nope" }), 0, "falls back to 14")
  })
})
