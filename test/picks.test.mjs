// The *Wayfinder Picks* seed page, run unchanged through the Dataview stand-in (spec *Pick order is data*,
// user story 30): its frontmatter carries the pick rule as `sort:`, and its one block renders the core's
// frontier in that order — the order `wf frontier` prints for the same notes.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseNote } from "../template/_tools/lib/frontmatter.mjs"
import { dataviewjsBlocks, fakeDataview, LOADER, TEMPLATE } from "./dataview.mjs"
import { pageLogic } from "./page-logic.mjs"
import { makeVault, map, ticket, wf } from "./vault.mjs"

const PAGE = readFileSync(join(TEMPLATE, "Wayfinder Picks.md"), "utf8")
const { frontmatter: SEED } = parseNote(PAGE)
const BLOCKS = dataviewjsBlocks(PAGE)

// Three ready tickets: 01 unblocks two, 03 unblocks one, 04 none (02 and 05 wait on them).
const NOTES = [
  map("r/a/map.md"),
  ticket("r/a/issues/01-hub.md"),
  ticket("r/a/issues/02-after-hub.md", { blockers: ["[[01-hub]]", "[[03-side]]"] }),
  ticket("r/a/issues/03-side.md", { type: "research" }),
  ticket("r/a/issues/04-leaf.md"),
  ticket("r/a/issues/05-after-hub.md", { blockers: ["[[01-hub]]"] }),
].map((n) => ({ ...n, frontmatter: JSON.parse(JSON.stringify(n.frontmatter)) }))

const render = async (sort) => {
  const notes = sort === undefined ? NOTES : [...NOTES, { path: "Wayfinder Picks.md", frontmatter: { sort } }]
  const dv = fakeDataview({ notes })
  await dv.run(BLOCKS[0])
  const tables = dv.out.filter((o) => o.kind === "table")
  assert.equal(tables.length, 1, JSON.stringify(dv.out))
  return tables[0].rows.map((r) => r[0]?.link ?? r[0])
}

const wfOrder = (sort) => {
  const vault = makeVault({ notes: NOTES, picks: sort === undefined ? undefined : { sort } })
  return wf(vault, ["frontier", "--json"]).json.data.tickets.map((t) => t.path)
}

describe("Picks page", () => {
  test("the seed carries the default pick rule as sort: in its frontmatter", () => {
    assert.deepEqual(SEED.sort, ["unblocks desc", "nn asc"])
  })

  test("has one block, through the shared loader, and no DQL of its own", () => {
    assert.doesNotMatch(PAGE, /^```dataview[ \t]*$/m)
    assert.equal(BLOCKS.length, 1)
    assert.ok(BLOCKS[0].includes(`dv.view(${JSON.stringify(LOADER)}`))
    assert.doesNotMatch(BLOCKS[0], /inlinks|buildIndex/)
    assert.deepEqual(pageLogic(BLOCKS[0]), [])
  })

  test("lists the frontier in the seed's order, the same as wf frontier", async () => {
    const order = await render(SEED.sort)
    assert.deepEqual(order, ["r/a/issues/01-hub.md", "r/a/issues/03-side.md", "r/a/issues/04-leaf.md"])
    assert.deepEqual(order, wfOrder(SEED.sort))
  })

  test("changing sort: in the frontmatter changes the order, on the page and in wf frontier", async () => {
    for (const sort of [["nn desc"], ["afk_first", "nn desc"]]) {
      const order = await render(sort)
      assert.deepEqual(order, wfOrder(sort), String(sort))
    }
    assert.deepEqual(await render(["nn desc"]), ["r/a/issues/04-leaf.md", "r/a/issues/03-side.md", "r/a/issues/01-hub.md"])
    assert.deepEqual(await render(["afk_first", "nn desc"]), [
      "r/a/issues/03-side.md",
      "r/a/issues/04-leaf.md",
      "r/a/issues/01-hub.md",
    ])
  })

  test("says which rule it sorts by, and which unknown keys it skipped", async () => {
    const dv = fakeDataview({ notes: [...NOTES, { path: "Wayfinder Picks.md", frontmatter: { sort: ["nn desc", "nnn asc"] } }] })
    await dv.run(BLOCKS[0])
    assert.match(dv.out[0].text, /`nn desc`/)
    assert.match(dv.out[0].text, /⚠️.*`nnn asc`/)
  })

  test("an empty frontier says so instead of drawing an empty table", async () => {
    const dv = fakeDataview({ notes: [map("r/a/map.md")] })
    await dv.run(BLOCKS[0])
    assert.deepEqual(dv.out.map((o) => o.kind), ["paragraph", "paragraph"])
    assert.match(dv.out[1].text, /ไม่มีใบที่หยิบได้/)
  })

  test("without a sort: key the default rule applies", async () => {
    assert.deepEqual(await render(undefined), ["r/a/issues/01-hub.md", "r/a/issues/03-side.md", "r/a/issues/04-leaf.md"])
  })
})
