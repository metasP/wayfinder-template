// The pages' navigation helpers (spec docs/specs/dashboard-navigation.md, *Modules* §1–2): the fold rule,
// the remembered override, and the Dashboard summary counts. Pure, so they run here without Obsidian.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  ALWAYS_FOLDED,
  bindFoldClicks,
  foldKey,
  foldOpen,
  folds,
  parseTabs,
  pruneTabs,
  summaryCounts,
  tabEffort,
  tabShowing,
} from "../template/_tools/lib/page-nav.mjs"

const memoryStorage = (entries = []) => {
  const map = new Map(entries)
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  }
}

describe("foldOpen", () => {
  test("opens a section that has content and closes an empty one", () => {
    assert.equal(foldOpen({ id: "frontier", hasContent: true }), true)
    assert.equal(foldOpen({ id: "frontier", hasContent: false }), false)
  })

  test("keeps paused, draft, dropped and decisions closed even with content", () => {
    assert.deepEqual([...ALWAYS_FOLDED].sort(), ["decisions", "draft", "dropped", "paused"])
    for (const id of ALWAYS_FOLDED) assert.equal(foldOpen({ id, hasContent: true }), false, id)
  })

  test("a page can mark another group as low-traffic, or lift the always-folded rule", () => {
    assert.equal(foldOpen({ id: "done", hasContent: true, lowTraffic: true }), false)
    assert.equal(foldOpen({ id: "paused", hasContent: true, lowTraffic: false }), true)
  })

  test("a stored override wins over every default", () => {
    assert.equal(foldOpen({ id: "frontier", hasContent: true, stored: "closed" }), false)
    assert.equal(foldOpen({ id: "frontier", hasContent: false, stored: "open" }), true)
    assert.equal(foldOpen({ id: "paused", hasContent: true, stored: "open" }), true)
  })

  test("ignores a stored value it doesn't know", () => {
    assert.equal(foldOpen({ id: "frontier", hasContent: true, stored: "maybe" }), true)
  })
})

describe("foldKey", () => {
  test("is namespaced by page, vault and section", () => {
    const keys = new Set([
      foldKey("dashboard", "v1", "frontier"),
      foldKey("dashboard", "v2", "frontier"),
      foldKey("efforts", "v1", "frontier"),
      foldKey("dashboard", "v1", "blocked"),
    ])
    assert.equal(keys.size, 4)
    assert.match(foldKey("dashboard", "v1", "frontier"), /dashboard.*v1.*frontier/)
  })
})

describe("folds", () => {
  test("reads the default until the owner toggles, then remembers per vault", () => {
    const storage = memoryStorage()
    const one = folds({ storage, vault: "one" })
    const two = folds({ storage, vault: "two" })
    assert.equal(one.isOpen("dashboard", "frontier", { hasContent: true }), true)
    assert.equal(storage.map.size, 0, "reading writes nothing")
    one.remember("dashboard", "frontier", false)
    assert.equal(one.isOpen("dashboard", "frontier", { hasContent: true }), false)
    assert.equal(two.isOpen("dashboard", "frontier", { hasContent: true }), true, "the other vault keeps its own")
  })

  test("falls back to the default when storage throws", () => {
    const storage = { getItem: () => { throw new Error("denied") }, setItem: () => { throw new Error("denied") } }
    const f = folds({ storage, vault: "v" })
    assert.equal(f.isOpen("dashboard", "frontier", { hasContent: true }), true)
    assert.doesNotThrow(() => f.remember("dashboard", "frontier", false))
  })
})

describe("bindFoldClicks", () => {
  const rootWithListener = () => {
    const listeners = []
    return { listeners, addEventListener: (type, fn) => listeners.push({ type, fn }) }
  }
  const clickOn = (root, target) => root.listeners.filter((l) => l.type === "click").forEach((l) => l.fn({ target }))
  const summaryOf = (details) => ({ closest: (sel) => (sel === "summary" ? { parentElement: details } : null) })

  test("a click on a fold's summary remembers the state it toggles to", () => {
    const storage = memoryStorage()
    const f = folds({ storage, vault: "v" })
    const root = rootWithListener()
    bindFoldClicks(root, "dashboard", f)
    clickOn(root, summaryOf({ open: true, dataset: { fold: "frontier" } }))
    assert.equal(f.isOpen("dashboard", "frontier", { hasContent: true }), false)
    clickOn(root, summaryOf({ open: false, dataset: { fold: "paused" } }))
    assert.equal(f.isOpen("dashboard", "paused", { hasContent: true }), true)
  })

  test("clicks elsewhere, or on a summary that isn't a fold, remember nothing", () => {
    const storage = memoryStorage()
    const root = rootWithListener()
    bindFoldClicks(root, "dashboard", folds({ storage, vault: "v" }))
    clickOn(root, { closest: () => null })
    clickOn(root, summaryOf({ open: true, dataset: {} }))
    clickOn(root, {})
    assert.equal(storage.map.size, 0)
  })
})

describe("summaryCounts", () => {
  test("counts each section's items, in the order given", () => {
    const counts = summaryCounts({ frontier: [1, 2], blocked: [], decisions: [1] })
    assert.deepEqual(counts, [
      { id: "frontier", count: 2 },
      { id: "blocked", count: 0 },
      { id: "decisions", count: 1 },
    ])
  })

  test("splits lint into errors and warnings", () => {
    const lint = [{ severity: "error" }, { severity: "warn" }, { severity: "warn" }]
    assert.deepEqual(summaryCounts({ lint }), [{ id: "lint", count: 3, errors: 1, warnings: 2 }])
  })
})

// Effort Tickets per tab (spec *Modules* §5–6): which effort a tab shows, what is kept for tabs that are gone,
// and which tab already shows an effort.
describe("tabEffort", () => {
  const known = ["r/a", "r/b"]

  test("a tab shows its own stored effort over the most recent one", () => {
    assert.deepEqual(tabEffort({ tab: "r/b", recent: "r/a", known }), { key: "r/b", missing: null })
  })

  test("a tab with nothing stored starts on the most recently selected effort", () => {
    assert.deepEqual(tabEffort({ tab: null, recent: "r/a", known }), { key: "r/a", missing: null })
  })

  test("a tab whose effort no longer exists falls through to the most recent one", () => {
    assert.deepEqual(tabEffort({ tab: "r/gone", recent: "r/a", known }), { key: "r/a", missing: null })
  })

  test("with nothing usable it selects nothing and names the first stored effort that is gone", () => {
    assert.deepEqual(tabEffort({ tab: "r/gone", recent: "r/old", known }), { key: null, missing: "r/gone" })
    assert.deepEqual(tabEffort({ tab: null, recent: "r/old", known }), { key: null, missing: "r/old" })
    assert.deepEqual(tabEffort({ tab: null, recent: null, known }), { key: null, missing: null })
  })
})

describe("parseTabs", () => {
  test("reads the stored tab → effort object", () => {
    assert.deepEqual(parseTabs('{"leaf1":"r/a"}'), { leaf1: "r/a" })
  })

  test("nothing stored, broken JSON or a non-object reads as no tabs", () => {
    for (const text of [null, "", "{oops", "[]", '"r/a"', "null"]) assert.deepEqual(parseTabs(text), {}, String(text))
  })

  test("drops entries whose effort isn't a string", () => {
    assert.deepEqual(parseTabs('{"a":"r/a","b":3,"c":null}'), { a: "r/a" })
  })
})

describe("pruneTabs", () => {
  test("keeps only the tabs that are still open, without touching the input", () => {
    const tabs = Object.freeze({ a: "r/a", b: "r/b", c: "r/a" })
    assert.deepEqual(pruneTabs(tabs, ["a", "c", "z"]), { a: "r/a", c: "r/a" })
    assert.deepEqual(tabs, { a: "r/a", b: "r/b", c: "r/a" })
  })
})

describe("tabShowing", () => {
  const tabs = { a: "r/a", b: "r/b" }

  test("finds the open tab already showing an effort", () => {
    assert.equal(tabShowing(tabs, "r/b", ["a", "b"]), "b")
  })

  test("a tab that is closed doesn't count, and an effort no tab shows gives null", () => {
    assert.equal(tabShowing(tabs, "r/b", ["a"]), null)
    assert.equal(tabShowing(tabs, "r/c", ["a", "b"]), null)
  })
})
