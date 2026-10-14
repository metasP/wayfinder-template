// The *Wayfinder Efforts* page, run unchanged through the Dataview stand-in over fixture notes (spec
// *Modules* §4, user stories 26–27): its groups and its ⚠️ cases come from core queries through the
// shared loader, the HTML presentation stays on the page, and the ticket count still opens
// *Wayfinder Effort Tickets* with that effort selected.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isoDate } from "../template/_tools/lib/core.mjs"
import { stubOf } from "../template/_tools/lib/page-views.mjs"
import { dataviewjsBlocks, fakeDataview, LOADER, TEMPLATE, viewSource } from "./dataview.mjs"
import { map, ticket } from "./fixture.mjs"
import { pageLogic } from "./page-logic.mjs"

const PAGE = readFileSync(join(TEMPLATE, "Wayfinder Efforts.md"), "utf8")
const BLOCKS = dataviewjsBlocks(PAGE)

// Fixture dates count back from the real clock: the loader reads today from it.
const ago = (days) => isoDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000))
const plain = (notes) => notes.map((n) => ({ ...n, frontmatter: JSON.parse(JSON.stringify(n.frontmatter)) }))

const NOTES = plain([
  // Moving: two ready (03's blocker sits in another effort, resolved), one blocked, one claimed, one waiting.
  map("r/a/map.md", { status_since: ago(30) }),
  ticket("r/a/issues/01-done.md", { status: "resolved", status_since: ago(2) }),
  ticket("r/a/issues/02-ready.md", { status_since: ago(5) }),
  ticket("r/a/issues/03-cross.md", { blockers: ["[[r/b/issues/01-far]]"], status_since: ago(5) }),
  ticket("r/a/issues/04-blocked.md", { blockers: ["[[05-claimed]]"], status_since: ago(5) }),
  ticket("r/a/issues/05-claimed.md", { status: "claimed", claimed_by: "session:x", status_since: ago(5) }),
  ticket("r/a/issues/06-waiting.md", { status: "waiting", status_note: "partner", status_since: ago(5) }),
  // Moving too, but less recently.
  map("r/b/map.md", { status_since: ago(9) }),
  ticket("r/b/issues/01-far.md", { status: "resolved", status_since: ago(9) }),
  ticket("r/b/issues/02-next.md", { status_since: ago(9) }),
  // Every ⚠️ case.
  map("r/cleared/map.md", { blocked_by: "[[r/b/issues/01-far]]", status_since: ago(1) }),
  ticket("r/cleared/issues/01-x.md", { status_since: ago(1) }),
  map("r/dead/map.md", { status: "paused", blocked_by: "[[r/frozen/issues/01-x]]", status_since: ago(1) }),
  ticket("r/dead/issues/01-x.md", { status_since: ago(1) }),
  map("r/dangling/map.md", { blocked_by: "[[r/nowhere/issues/01-x]]", status_since: ago(1) }),
  ticket("r/dangling/issues/01-x.md", { status_since: ago(1) }),
  map("r/finished/map.md", { status_since: ago(1) }),
  ticket("r/finished/issues/01-x.md", { status: "resolved", status_since: ago(1) }),
  map("r/idle/map.md", { status_since: ago(40) }),
  ticket("r/idle/issues/01-x.md", { status_since: ago(20) }),
  map("r/old-pause/map.md", { status: "paused", status_since: ago(45) }),
  ticket("r/old-pause/issues/01-x.md", { status_since: ago(50) }),
  // Folded away.
  map("r/frozen/map.md", { status: "paused", status_note: "after the release", status_since: ago(3) }),
  ticket("r/frozen/issues/01-x.md", { status_since: ago(3) }),
  map("r/sketch/map.md", { status: "draft", status_since: ago(2) }),
  ticket("r/sketch/issues/01-x.md", { status_since: ago(2) }),
  map("r/shipped/map.md", { status: "done", status_since: ago(4) }),
  ticket("r/shipped/issues/01-x.md", { status: "resolved", status_since: ago(4) }),
  map("r/gone/map.md", { status: "dropped", status_note: "not needed", status_since: ago(6) }),
  ticket("r/gone/issues/01-x.md", { status_since: ago(6) }),
  // A map without tickets isn't listed.
  map("r/empty/map.md", { status_since: ago(1) }),
])

const render = async (notes = NOTES, options = {}) => {
  const dv = fakeDataview({ notes, ...options })
  for (const src of BLOCKS) await dv.run(src)
  assert.deepEqual(dv.out, [], "nothing but the page's own HTML (no loader error)")
  return { dv, html: dv.dv.container.innerHTML }
}

// The page's sections, cut at its group headings and `<details>` boxes.
const section = (html, title) => {
  const at = html.indexOf(title)
  assert.ok(at >= 0, `no "${title}" group`)
  const rest = html.slice(at + title.length)
  const end = rest.search(/<div class="wfe-grp|<details>/)
  return end < 0 ? rest : rest.slice(0, end)
}
const rows = (html, cls) => html.split(`<div class="${cls}">`).slice(1)
const mapPathOf = (row) => /data-href="([^"]+)"/.exec(row)?.[1]
const textOf = (html) => html.replace(/<[^>]+>/g, "")
const chipsOf = (row) => textOf(/<span>(<span class="wfe-chip[\s\S]*?)<\/span><span class="wfe-when">/.exec(row)?.[1] ?? "")
const folded = (html) =>
  [...html.matchAll(/<details><summary>([^<]*)<\/summary>([\s\S]*?)<\/details>/g)].map((m) => ({
    summary: m[1],
    maps: rows(m[2], "wfe-frow").map(mapPathOf),
  }))

describe("Efforts structure", () => {
  test("its one block is a stub; the view goes through the shared loader and keeps no read-model code of its own", () => {
    assert.equal(BLOCKS.length, 1)
    assert.deepEqual(stubOf(BLOCKS[0]), { view: "efforts", block: null })
    const view = viewSource("efforts")
    assert.ok(view.includes(`dv.view(${JSON.stringify(LOADER)}`))
    assert.deepEqual(pageLogic(view), [])
  })
})

describe("Efforts groups", () => {
  test("🔥 lists moving efforts, most recent first, with chips counted by the core", async () => {
    const { html } = await render()
    const active = rows(section(html, "🔥 กำลังเดิน"), "wfe-row")
    assert.deepEqual(active.map(mapPathOf), ["r/a/map.md", "r/b/map.md"])
    // 03 is ready: its blocker is resolved in another effort (judged by its real status).
    assert.equal(chipsOf(active[0]), "🔥2🚧1🖐1⏳1")
    assert.equal(chipsOf(active[1]), "🔥1")
    assert.match(active[0], />1\/6</, "resolved/total")
  })

  test("⚠️ holds every map whose status doesn't match what happens, with the action to take", async () => {
    const { html } = await render()
    const warn = rows(section(html, "⚠️ สถานะไม่ตรงพฤติกรรม"), "wfe-wrow").map((r) => [
      mapPathOf(r),
      textOf(/<span class="wfe-act">([\s\S]*?)<\/span>/.exec(r)[1]),
    ])
    assert.deepEqual(
      warn.sort((a, b) => a[0].localeCompare(b[0])),
      [
        ["r/cleared/map.md", "กลับมาทำได้"],
        ["r/dangling/map.md", "แก้ลิงก์"],
        ["r/dead/map.md", "โซ่ตัน"],
        ["r/finished/map.md", "→ done"],
        ["r/idle/map.md", "→ paused"],
        ["r/old-pause/map.md", "→ dropped"],
      ],
    )
  })

  test("the stale thresholds come from Wayfinder Config", async () => {
    const notes = [...NOTES, { path: "Wayfinder Config.md", frontmatter: { kind: "wayfinder-config", stale_days: 7 } }]
    const { html } = await render(notes)
    assert.deepEqual(rows(section(html, "🔥 กำลังเดิน"), "wfe-row").map(mapPathOf), ["r/a/map.md"])
    const warned = rows(section(html, "⚠️ สถานะไม่ตรงพฤติกรรม"), "wfe-wrow").map(mapPathOf)
    assert.ok(warned.includes("r/b/map.md"), "9 days idle > stale_days 7")
  })

  test("paused, draft, done and dropped maps are folded away under their labels", async () => {
    const { html } = await render()
    assert.deepEqual(folded(html), [
      { summary: "⏸ พักไว้ — 1 effort · 1 ใบ", maps: ["r/frozen/map.md"] },
      { summary: "✏️ ยังไม่ได้ชาร์ต — 1 effort · 1 ใบ", maps: ["r/sketch/map.md"] },
      { summary: "✅ ปิดแล้ว — 1 effort · 1 ใบ", maps: ["r/shipped/map.md"] },
      { summary: "🗑 ทิ้งแล้ว — 1 effort · 1 ใบ", maps: ["r/gone/map.md"] },
    ])
    assert.match(html, /after the release/)
  })

  test("colours and labels come from Wayfinder Config, a bad value falls back to the default", async () => {
    const config = { kind: "wayfinder-config", color_resolved: "#112233", color_open: "grey", label_paused: "on hold" }
    const { html } = await render([...NOTES, { path: "Wayfinder Config.md", frontmatter: config }])
    assert.match(html, /background:#112233/)
    assert.match(html, /background:#9E9E9E/)
    assert.match(html, /<summary>on hold — /)
  })
})

describe("odd map values", () => {
  test("a map without a status, or with one outside the enum, is a ⚠️ to fix — never active or folded", async () => {
    const notes = plain([
      map("r/a/map.md", { status_since: ago(1) }),
      ticket("r/a/issues/01-x.md", { status_since: ago(1) }),
      map("r/none/map.md", { status: null, status_since: ago(1) }),
      ticket("r/none/issues/01-x.md", { status_since: ago(1) }),
      map("r/proto/map.md", { status: "constructor", status_since: ago(1) }),
      ticket("r/proto/issues/01-x.md", { status_since: ago(1) }),
    ])
    const { html } = await render(notes)
    assert.deepEqual(rows(section(html, "🔥 กำลังเดิน"), "wfe-row").map(mapPathOf), ["r/a/map.md"])
    const warn = rows(section(html, "⚠️ สถานะไม่ตรงพฤติกรรม"), "wfe-wrow")
    assert.deepEqual(warn.map(mapPathOf).sort(), ["r/none/map.md", "r/proto/map.md"])
    assert.ok(warn.every((r) => /แก้ status/.test(r)))
    assert.deepEqual(folded(html), [])
  })

  test("note values are escaped before they reach the HTML", async () => {
    const evil = '<img src=x onerror="alert(1)">'
    const notes = plain([
      map("r/a/map.md", { status: "paused", status_note: evil, status_since: ago(1) }),
      ticket("r/a/issues/01-x.md", { status_since: ago(1) }),
      map("r/b/map.md", { blocked_by: `[[${evil}]]`, status_since: ago(1) }),
      ticket("r/b/issues/01-x.md", { status_since: ago(1) }),
    ])
    const { html } = await render(notes)
    assert.doesNotMatch(html, /<img/)
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/)
  })
})

describe("ticket count → Effort Tickets", () => {
  test("clicking an effort's count stores it for this vault and opens Effort Tickets", async () => {
    const { dv } = await render()
    const counts = dv.dv.container.querySelectorAll("[data-go]")
    // Moving and folded efforts show a count to click (⚠️ rows show the action instead).
    assert.ok(["r/a", "r/frozen"].every((key) => counts.some((el) => el.dataset.go === key)))
    await dv.inPage(() => counts.find((el) => el.dataset.go === "r/b").fire("click"))
    assert.equal(dv.storage.get("wayfinder-effort-tickets:selected:test-vault"), "r/b")
    assert.deepEqual(dv.opened, ["Wayfinder Effort Tickets"])
    assert.deepEqual(dv.events, ["wayfinder-effort-select"])
  })
})
