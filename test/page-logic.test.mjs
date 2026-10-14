// The guard the page tests use to say "this page keeps no read-model code of its own" must catch the
// usual ways to write that code, and not trip on prose in comments.
import { test } from "node:test"
import assert from "node:assert/strict"
import { pageLogic } from "./page-logic.mjs"

test("catches status checks in either quote style and order, and blocker reads", () => {
  for (const src of [`t.status === 'open'`, `"waiting" === t.status`, `x.status!=="resolved"`, `const { blockers } = t`, `t.blockers.map(f)`])
    assert.notDeepEqual(pageLogic(src), [], src)
})

test("catches a page that reads the vault, Config or the clock itself", () => {
  for (const src of [`dv.pages()`, `dv.page("Wayfinder Config")`, `cfgColor("x", "#fff")`, `dv.luxon.DateTime.now()`, `Date.now()`])
    assert.notDeepEqual(pageLogic(src), [], src)
})

test("ignores prose in line comments", () => {
  assert.deepEqual(pageLogic(`// the old lookup( and blockState helpers are gone\nrender() // no dv.pages() here`), [])
})
