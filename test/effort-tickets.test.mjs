// The *Wayfinder Effort Tickets* page, run unchanged through the Dataview stand-in over fixture notes (spec
// *Modules* §4, user stories 26–27): its action buckets, "unblocks" and dependency graph come from the core
// through the shared loader; the effort shown is the one *Wayfinder Efforts* stored when its count was clicked.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as core from "../template/_tools/lib/core.mjs"
import { dataviewjsBlocks, fakeDataview, LOADER, TEMPLATE } from "./dataview.mjs"
import { map, ticket } from "./fixture.mjs"
import { pageLogic } from "./page-logic.mjs"

const PAGE = readFileSync(join(TEMPLATE, "Wayfinder Effort Tickets.md"), "utf8")
const BLOCKS = dataviewjsBlocks(PAGE)
const SELECTED = "wayfinder-effort-tickets:selected:test-vault"

const plain = (notes) => notes.map((n) => ({ ...n, frontmatter: JSON.parse(JSON.stringify(n.frontmatter)) }))
const NOTES = plain([
  map("r/a/map.md"),
  ticket("r/a/issues/01-done.md", { status: "resolved" }),
  ticket("r/a/issues/02-hub.md"),
  ticket("r/a/issues/03-two-ways.md", { blockers: ["[[02-hub]]", "[[05-claimed]]"] }),
  ticket("r/a/issues/04-after-hub.md", { blockers: ["[[02-hub]]"] }),
  ticket("r/a/issues/05-claimed.md", { status: "claimed", claimed_by: "session:x" }),
  ticket("r/a/issues/06-waiting.md", { status: "waiting", status_note: "**partner** reply" }),
  ticket("r/a/issues/07-cross-done.md", { blockers: ["[[r/b/issues/01-far]]"] }),
  ticket("r/a/issues/08-cross-open.md", { blockers: ["[[r/b/issues/02-near]]"] }),
  ticket("r/a/issues/09-dangling.md", { blockers: ["[[99-missing]]"] }),
  ticket("r/a/issues/10-typo.md", { status: "opne" }),
  map("r/b/map.md"),
  ticket("r/b/issues/01-far.md", { status: "resolved" }),
  ticket("r/b/issues/02-near.md"),
  map("r/p/map.md", { status: "paused", status_note: "after the release" }),
  ticket("r/p/issues/01-ready.md"),
  map("r/empty/map.md"),
])

const render = async (selected, notes = NOTES) => {
  const storage = new Map(selected ? [[SELECTED, selected]] : [])
  const dv = fakeDataview({ notes, storage })
  for (const src of BLOCKS) await dv.run(src)
  assert.deepEqual(dv.out, [], "nothing but the page's own HTML (no loader error)")
  const part = (cls) => dv.dv.container.querySelector(cls).innerHTML
  return { dv, head: part(".wft-head"), body: part(".wft-body"), list: part(".wft-list") }
}

const hrefs = (html) => [...html.matchAll(/data-href="([^"]+)"/g)].map((m) => m[1])
const textOf = (html) => html.replace(/<[^>]+>/g, "")
// `{ id: [{ path, cells: [html…] }] }` for the action groups in the body, in page order.
const groups = (body) =>
  Object.fromEntries(
    [...body.matchAll(/<div class="wft-tbl is-(\w+)">([\s\S]*?)<\/div><\/(?:section|details)>/g)].map((m) => [
      m[1],
      m[2]
        .split('<div class="wft-row">')
        .slice(1)
        .map((row) => ({ path: hrefs(row)[0], cells: [...row.matchAll(/<span>([\s\S]*?)<\/span>(?=<span>|<\/div>)/g)].map((c) => c[1]) })),
    ]),
  )
const pathsOf = (rows) => rows.map((r) => r.path)
const svgOf = (body) => /<svg[\s\S]*<\/svg>/.exec(body)?.[0] ?? ""
const isoOf = (body) => [...body.matchAll(/class="internal-link wft-iso" data-href="([^"]+)"/g)].map((m) => m[1])

describe("Effort Tickets structure", () => {
  test("its block goes through the shared loader and keeps no read-model code of its own", () => {
    assert.equal(BLOCKS.length, 1)
    assert.ok(BLOCKS[0].includes(`dv.view(${JSON.stringify(LOADER)}`))
    assert.deepEqual(pageLogic(BLOCKS[0]), [])
  })
})

describe("action buckets", () => {
  test("group the selected effort's tickets by the core's ticket state, in NN order", async () => {
    const g = groups((await render("r/a")).body)
    assert.deepEqual(Object.keys(g), ["fro", "blk", "wai", "hld", "unk", "res"])
    const p = (nn) => NOTES.find((n) => n.path.startsWith(`r/a/issues/${nn}-`)).path
    assert.deepEqual(pathsOf(g.fro), [p("02"), p("07")], "07's blocker is resolved in another effort")
    assert.deepEqual(pathsOf(g.blk), [p("03"), p("04"), p("08"), p("09")])
    assert.deepEqual(pathsOf(g.wai), [p("06")])
    assert.deepEqual(pathsOf(g.hld), [p("05")])
    assert.deepEqual(pathsOf(g.unk), [p("10")])
    assert.deepEqual(pathsOf(g.res), [p("01")])
  })

  test("🔥 lists what the core's frontier lists for this effort", async () => {
    const g = groups((await render("r/a")).body)
    const index = core.buildIndex(NOTES)
    const frontier = core.frontier(index).filter((t) => t.effortKey === "r/a").map((t) => t.path)
    assert.deepEqual(pathsOf(g.fro).sort(), frontier.sort())
  })

  test("\"unblocks\" is the core's unblocks count", async () => {
    const g = groups((await render("r/a")).body)
    const unblocksCell = (path) => textOf(g.fro.find((r) => r.path === path).cells.at(-1))
    assert.equal(unblocksCell("r/a/issues/02-hub.md"), "2")
    assert.equal(unblocksCell("r/a/issues/07-cross-done.md"), "—")
    assert.match(g.fro[0].cells.at(-1), /title="1 ใบเดินได้ทันที · อีก 1 ใบยังติด blocker ตัวอื่น"/)
  })

  test("🚧 shows only the blockers that still block, marks other efforts ↗ and broken links ⚠️", async () => {
    const g = groups((await render("r/a")).body)
    const waitsOn = (path) => g.blk.find((r) => r.path === path).cells.at(-1)
    assert.deepEqual(hrefs(waitsOn("r/a/issues/03-two-ways.md")), ["r/a/issues/02-hub.md", "r/a/issues/05-claimed.md"])
    assert.deepEqual(hrefs(waitsOn("r/a/issues/08-cross-open.md")), ["r/b/issues/02-near.md"])
    assert.match(waitsOn("r/a/issues/08-cross-open.md"), /↗/)
    assert.deepEqual(hrefs(waitsOn("r/a/issues/09-dangling.md")), [])
    assert.match(waitsOn("r/a/issues/09-dangling.md"), /⚠️/)
  })

  test("a waiting ticket shows its status_note as text", async () => {
    const g = groups((await render("r/a")).body)
    assert.match(g.wai[0].cells[0], /partner reply/)
    assert.doesNotMatch(g.wai[0].cells[0], /\*\*/)
  })

  test("ready tickets on a map that isn't active are not shown as frontier", async () => {
    const { body, head } = await render("r/p")
    const g = groups(body)
    assert.equal(g.fro, undefined)
    assert.deepEqual(pathsOf(g.rdy), ["r/p/issues/01-ready.md"])
    assert.doesNotMatch(head, /🔥/)
    assert.match(head, /after the release/)
  })
})

describe("dependency graph", () => {
  test("draws the core's blocker edges inside the effort; tickets without one go to the band", async () => {
    const { body } = await render("r/a")
    const svg = svgOf(body)
    const index = core.buildIndex(NOTES)
    assert.equal((svg.match(/class="wft-edge"/g) ?? []).length, core.blockerEdges(index, "r/a").length)
    assert.deepEqual(hrefs(svg).sort(), ["r/a/issues/02-hub.md", "r/a/issues/03-two-ways.md", "r/a/issues/04-after-hub.md", "r/a/issues/05-claimed.md"])
    assert.deepEqual(isoOf(body), [
      "r/a/issues/01-done.md",
      "r/a/issues/06-waiting.md",
      "r/a/issues/07-cross-done.md",
      "r/a/issues/08-cross-open.md",
      "r/a/issues/09-dangling.md",
      "r/a/issues/10-typo.md",
    ])
    assert.match(svg, /◂02 05/, "03's label names both blockers")
  })

  test("an effort without edges has no graph section", async () => {
    const { body } = await render("r/p")
    assert.equal(svgOf(body), "")
    assert.deepEqual(isoOf(body), [])
  })
})

describe("odd values", () => {
  test("a map without a status, or with one outside the enum, gets a plain badge", async () => {
    const notes = plain([
      map("r/none/map.md", { status: null }),
      ticket("r/none/issues/01-x.md"),
      map("r/proto/map.md", { status: "constructor" }),
      ticket("r/proto/issues/01-x.md"),
    ])
    const none = await render("r/none", notes)
    assert.match(none.head, /\(ไม่มี status\)/)
    assert.doesNotMatch(none.head, /null/)
    const proto = await render("r/proto", notes)
    assert.doesNotMatch(proto.head + proto.list, /native code/)
    assert.match(proto.head, />constructor</)
  })

  test("note values are escaped before they reach the HTML", async () => {
    const evil = '<img src=x onerror="alert(1)">'
    const notes = plain([
      map("r/a/map.md", { status_note: evil }),
      ticket("r/a/issues/01-x.md", { status: "waiting", status_note: evil, type: evil }),
      ticket("r/a/issues/02-y.md", { status: evil }),
    ])
    const { head, body } = await render("r/a", notes)
    assert.doesNotMatch(head + body, /<img/)
    assert.match(body, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/)
  })

  test("graph colours come from Wayfinder Config", async () => {
    const config = { path: "Wayfinder Config.md", frontmatter: { kind: "wayfinder-config", color_resolved: "#112233", color_open: "nope" } }
    const { body } = await render("r/a", [...NOTES, config])
    assert.match(svgOf(body), /stroke="#9E9E9E"/, "a bad colour falls back to the default")
    assert.match(body, /border-color:#112233/, "01 is resolved, in the band")
  })
})

describe("selection", () => {
  test("the effort stored by Efforts is selected, with its counts in the head", async () => {
    const { head, list } = await render("r/a")
    assert.match(head, /data-href="r\/a\/map\.md"/)
    assert.equal(textOf(/<span class="wft-num">([\s\S]*?)<\/span>/.exec(head)[1]), "1/10")
    assert.equal(textOf(/<span>(<span class="wft-chip[\s\S]*?)<\/span><\/div>/.exec(head)[1]), "🔥2🚧4🖐1⏳1")
    assert.equal(list, "", "the list stays closed once an effort is selected")
  })

  test("a stored effort that no longer exists is reported, and the list opens", async () => {
    const { head, list } = await render("r/gone")
    assert.match(head, /r\/gone/)
    assert.match(list, /data-key="r\/a"/)
  })

  test("an effort without tickets says so instead of drawing empty tables", async () => {
    const { body } = await render("r/empty")
    assert.match(body, /effort นี้ยังไม่มีใบ/)
  })

  test("the list offers every effort, maps without tickets included", async () => {
    const { list } = await render(null)
    const keys = [...list.matchAll(/data-key="([^"]+)"/g)].map((m) => m[1]).sort()
    assert.deepEqual(keys, ["r/a", "r/b", "r/empty", "r/p"])
  })
})
