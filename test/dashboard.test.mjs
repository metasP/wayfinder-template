// The Dashboard's own `dataviewjs` blocks, run unchanged through the Dataview stand-in over the same notes
// a fixture vault holds on disk (spec *Dashboard lint panel*, *Modules* §4). Every section must come from
// the core through the shared loader, so the lint panel and the frontier agree with `wf lint` and
// `wf frontier` on that vault.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as core from "../template/_tools/lib/core.mjs"
import { DASHBOARD_SECTIONS, stubOf } from "../template/_tools/lib/page-views.mjs"
import { fakeDataview, LOADER, TEMPLATE, viewSource } from "./dataview.mjs"
import { pageLogic } from "./page-logic.mjs"
import { makeVault, map, ticket, ticketsBlock, today, wf } from "./vault.mjs"

const PAGE = readFileSync(join(TEMPLATE, "Wayfinder Dashboard.md"), "utf8")
const VIEW = viewSource("dashboard")

// Each `dataviewjs` block with the `## ` heading it sits under.
const sections = [...PAGE.matchAll(/^## (.*)$|^```dataviewjs[ \t]*\r?\n([\s\S]*?)^```/gm)].reduce(
  (acc, m) => (m[1] != null ? { ...acc, heading: m[1] } : { ...acc, blocks: [...acc.blocks, { heading: acc.heading, src: m[2] }] }),
  { heading: null, blocks: [] },
).blocks

const section = (prefix) => {
  const found = sections.filter((s) => s.heading?.startsWith(prefix))
  assert.equal(found.length, 1, `one dataviewjs block under a "## ${prefix}" heading`)
  return found[0].src
}

// JSON round trip: drop undefined keys, so the in-memory frontmatter equals what the files parse to.
const plain = (notes) => notes.map((n) => ({ ...n, frontmatter: JSON.parse(JSON.stringify(n.frontmatter)) }))

const scenario = ({ sort = ["nn desc"] } = {}) => {
  const ticketsA = [
    ticket("r/a/issues/01-done.md", { status: "resolved", status_since: "2026-10-01" }),
    ticket("r/a/issues/02-ready.md", { blockers: ["[[01-done]]"] }),
    ticket("r/a/issues/03-blocked.md", { blockers: ["[[04-claimed]]", "[[01-done]]"] }),
    ticket("r/a/issues/04-claimed.md", { status: "claimed", claimed_by: "session:x" }),
    ticket("r/a/issues/05-waiting.md", { status: "waiting", status_note: "partner reply" }),
    ticket("r/a/issues/06-ready.md", { type: "research" }),
    ticket("r/a/issues/07-dangling.md", { blockers: ["[[99-missing]]"] }),
  ]
  const mapA = map("r/a/map.md")
  const block = core.renderTicketsBlock(core.buildIndex([mapA, ...ticketsA]), "r/a", "en")
  const notes = plain([
    { ...mapA, body: `# a\n\n${ticketsBlock(block)}` },
    ...ticketsA,
    map("r/p/map.md", { status: "paused", status_note: "after the release" }),
    ticket("r/p/issues/01-later.md"),
    map("r/d/map.md", { status: "draft", status_note: "no destination yet" }),
    ticket("r/d/issues/01-early.md"),
    map("r/x/map.md", { status: "done" }),
    ticket("r/x/issues/01-leftover.md"),
    ticket("r/x/issues/02-closed.md", { status: "resolved", status_since: "2026-10-05" }),
    map("r/z/map.md", { status: "dropped" }),
    ticket("r/z/issues/01-gone.md"),
    ticket("r/z/issues/02-gone.md", { status: "waiting", status_note: "never" }),
    ticket("r/z/issues/03-closed.md", { status: "resolved" }),
  ])
  const config = { kind: "wayfinder-config", language: "en" }
  const vaultNotes = [
    ...notes,
    { path: "Wayfinder Config.md", frontmatter: config },
    { path: "Wayfinder Picks.md", frontmatter: { sort } },
  ]
  return { vault: makeVault({ notes, config, picks: { sort } }), notes: vaultNotes }
}

const render = async (notes, src, options = {}) => {
  const dv = fakeDataview({ notes, ...options })
  await dv.run(src)
  return dv.out
}

// `wf` and the loader each read the clock: retry once if it crossed midnight between them.
const sameDay = async (run) => {
  for (let attempt = 0; ; attempt++) {
    const day = today()
    const result = await run()
    if (today() === day || attempt > 0) return result
  }
}

const pathOf = (cell) => cell?.link ?? cell
const onlyTable = (out) => {
  assert.equal(out.length, 1, JSON.stringify(out))
  assert.equal(out[0].kind, "table")
  return out[0]
}
const firstColumn = (out) => onlyTable(out).rows.map((r) => pathOf(r[0]))

describe("Dashboard structure", () => {
  test("has no DQL blocks: every section is a one-line stub naming its own section of the dashboard view", () => {
    assert.doesNotMatch(PAGE, /^```dataview[ \t]*$/m)
    assert.ok(sections.length >= 9, `${sections.length} dataviewjs blocks`)
    const stubs = sections.map((s) => stubOf(s.src))
    for (const [i, s] of sections.entries()) assert.equal(stubs[i]?.view, "dashboard", s.heading)
    assert.deepEqual(stubs.map((st) => st.block), [...DASHBOARD_SECTIONS], "every section once, in page order")
  })

  test("the dashboard view reads the core through the shared loader and keeps no frontier or blocked logic of its own", () => {
    assert.ok(VIEW.includes(JSON.stringify(LOADER)))
    assert.deepEqual(pageLogic(VIEW), [])
    assert.doesNotMatch(VIEW, /\.blockers\b|rawBlockers|isBlocked|status\s*[!=]==\s*"(open|claimed|waiting|resolved)"/)
    assert.doesNotMatch(VIEW, /\.filter\([^)]*frontier/)
    assert.doesNotMatch(VIEW, /\[\s*"(open|ready|blocked|claimed|waiting)"/, "a status list of its own")
  })

  test("a stub naming no section says so instead of rendering nothing", async () => {
    for (const src of ['await dv.view("_tools/views/dashboard", { block: "nope" })', 'await dv.view("_tools/views/dashboard")']) {
      const dv = fakeDataview()
      await dv.run(src)
      assert.equal(dv.out.length, 1)
      assert.match(dv.out[0].text, /ไม่รู้จักบล็อก/)
    }
  })

  test("the view's sections are the ones doctor holds the page to", async () => {
    const dv = fakeDataview()
    await dv.run('await dv.view("_tools/views/dashboard", { block: "toString" })')
    assert.equal(/กับหนึ่งใน (.*)$/.exec(dv.out[0].text)?.[1], DASHBOARD_SECTIONS.join(" · "))
  })

  test("the summary bar is the first block on the page, and the lint panel the first section after it", () => {
    assert.equal(stubOf(sections[0].src).block, "summary")
    assert.match(sections[1].heading, /lint/i)
  })

  test("each section's explanation sits in a collapsed callout under its heading", () => {
    for (const heading of PAGE.match(/^## .*$/gm).filter((h) => !/Decisions|หยิบอันไหนต่อ/.test(h))) {
      const after = PAGE.slice(PAGE.indexOf(heading) + heading.length).replace(/^\s+/, "")
      assert.match(after, /^> \[!info\]- /, heading)
    }
  })
})

// The fold a section block drew (`<details data-fold>`) and the bar a summary block drew.
const foldOf = (dv) => dv.dv.container.created.find((el) => el.tagName === "details")
const barCounts = (dv) =>
  Object.fromEntries([...dv.dv.container.innerHTML.matchAll(/data-jump="([a-z]+)" data-count="(\d+)"/g)].map((m) => [m[1], Number(m[2])]))
const stub = (block) => `await dv.view("_tools/views/dashboard", { block: "${block}" })`

describe("summary bar and folds", () => {
  test("has one entry per section whose count is the number of rows that section renders", async () => {
    const { notes } = scenario({ sort: ["nn desc", "nnn asc"] })
    const bar = fakeDataview({ notes })
    await bar.run(stub("summary"))
    const counts = barCounts(bar)
    assert.deepEqual(Object.keys(counts), DASHBOARD_SECTIONS.filter((s) => s !== "summary"))
    for (const block of Object.keys(counts)) {
      const dv = fakeDataview({ notes })
      await dv.run(stub(block))
      const table = dv.out.find((o) => o.kind === "table")
      assert.equal(counts[block], table?.rows.length ?? 0, block)
    }
    assert.ok(counts.frontier > 0 && counts.lint > 0)
  })

  test("splits lint into errors and warnings, errors marked red, zero counts dimmed", async () => {
    const s = scenario({ sort: ["nn desc", "nnn asc"] })
    const lint = fakeDataview({ notes: s.notes })
    await lint.run(stub("lint"))
    const [, errors, warnings] = /\*\*(\d+) error · (\d+) warn\*\*/.exec(lint.out.find((o) => o.kind === "paragraph").text)
    assert.ok(Number(errors) > 0 && Number(warnings) > 0)
    const dv = fakeDataview({ notes: s.notes })
    await dv.run(stub("summary"))
    const html = dv.dv.container.innerHTML
    assert.match(html, new RegExp(`<span class="is-err">🔴 ${errors}</span> · 🟡 ${warnings}<`))
    for (const [id, count] of Object.entries(barCounts(dv)))
      assert.equal(new RegExp(`class="is-zero" data-jump="${id}"`).test(html), count === 0, id)
    const quiet = fakeDataview({ notes: plain([map("r/a/map.md")]) })
    await quiet.run(stub("summary"))
    assert.match(quiet.dv.container.innerHTML, /class="is-zero" data-jump="frontier" data-count="0"/)
    assert.doesNotMatch(quiet.dv.container.innerHTML, /class="is-err"/)
  })

  test("a click on an entry opens that section's fold and remembers it", async () => {
    const { notes } = scenario()
    const storage = new Map()
    const dv = fakeDataview({ notes, storage })
    await dv.run(stub("summary"))
    const paused = dv.dv.container.querySelectorAll("[data-jump]").find((el) => el.dataset.jump === "paused")
    await dv.inPage(async () => paused.fire("click"))
    const again = fakeDataview({ notes, storage })
    await again.run(stub("paused"))
    assert.equal(foldOf(again).open, true)
  })

  test("before the owner touches anything: content opens, empty closes, paused and decisions stay closed", async () => {
    const { notes } = scenario()
    const opened = async (block) => {
      const dv = fakeDataview({ notes })
      await dv.run(stub(block))
      return foldOf(dv).open
    }
    assert.equal(await opened("frontier"), true)
    assert.equal(await opened("stranded"), true)
    assert.equal(await opened("paused"), false)
    assert.equal(await opened("decisions"), false)
    const empty = fakeDataview({ notes: plain([map("r/a/map.md")]) })
    await empty.run(stub("frontier"))
    assert.equal(foldOf(empty).open, false)
  })

  test("a fold's summary line carries its count, and a toggle survives the next redraw in that vault only", async () => {
    const { notes } = scenario()
    const storage = new Map()
    const first = fakeDataview({ notes, storage })
    await first.run(stub("frontier"))
    const fold = foldOf(first)
    assert.equal(fold.dataset.fold, "frontier")
    assert.equal(fold.created.find((el) => el.tagName === "summary").textContent, "2 รายการ")
    await first.inPage(async () =>
      first.dv.container.fire("click", { target: { closest: () => ({ parentElement: fold }) } }),
    )
    const redraw = fakeDataview({ notes, storage })
    await redraw.run(stub("frontier"))
    assert.equal(foldOf(redraw).open, false)
    const otherVault = fakeDataview({ notes, storage, vaultName: "other" })
    await otherVault.run(stub("frontier"))
    assert.equal(foldOf(otherVault).open, true)
  })
})

describe("lint panel", () => {
  const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  const fixOf = (cell) => (cell === "—" ? null : cell.replace(/^`|`$/g, ""))

  test("shows wf lint's findings for the same notes, errors first, with the fix as code", async () => {
    const s = scenario({ sort: ["nn desc", "nnn asc"] })
    const { r, out } = await sameDay(async () => ({
      r: wf(s.vault, ["lint", "--json"]),
      out: await render(s.notes, section("🩺")),
    }))
    const findings = r.json.data.findings
    assert.ok(findings.some((f) => f.severity === "error") && findings.some((f) => f.severity === "warn"))
    const tables = out.filter((o) => o.kind === "table")
    assert.equal(tables.length, 1)
    const { headers, rows } = tables[0]
    assert.deepEqual(headers, ["Severity", "Note", "Rule", "Message", "Fix"])
    assert.deepEqual(
      rows.map((row) => ({ rule: row[2], message: unescape(row[3]), fix: fixOf(row[4]) })),
      findings.map((f) => ({ rule: f.rule, message: f.message, fix: f.fix })),
    )
    rows.forEach((row, i) => assert.match(row[0], new RegExp(findings[i].severity)))
  })

  test("links each finding to its note", async () => {
    const s = scenario({ sort: ["nnn asc"] })
    const out = await render(s.notes, section("🩺"))
    const rows = out.find((o) => o.kind === "table").rows
    const byRule = Object.fromEntries(rows.map((r) => [r[2], pathOf(r[1])]))
    assert.equal(byRule["unknown-sort-key"], "Wayfinder Picks.md")
    assert.equal(byRule["dangling-blocker"], "r/a/issues/07-dangling.md")
  })

  test("says which map bodies it couldn't read, since drift went unchecked for them", async () => {
    const { notes } = scenario()
    const out = await render(notes, section("🩺"), { failLoad: (path) => path === "r/p/map.md" })
    assert.equal(out[0].kind, "paragraph")
    assert.match(out[0].text, /1 .*r\/p\/map\.md/)
    const drift = out.find((o) => o.kind === "table").rows.filter((r) => r[2] === "tickets-block-drift")
    assert.ok(drift.every((r) => pathOf(r[1]) !== "r/p/map.md"))
  })

  test("a clean vault collapses to one line", async () => {
    const notes = plain([map("r/a/map.md"), ticket("r/a/issues/01-a.md", { title: "A" })])
    const idx = core.buildIndex(notes)
    const block = core.renderTicketsBlock(idx, "r/a", "en")
    notes[0] = { ...notes[0], body: ticketsBlock(block) }
    const out = await render(notes, section("🩺"))
    assert.deepEqual(out, [{ kind: "paragraph", text: "✅ lint clean" }])
  })
})

describe("sections", () => {
  test("🔥 Frontier lists wf frontier's tickets in its order (Picks sort applied)", async () => {
    const s = scenario()
    const r = wf(s.vault, ["frontier", "--json"])
    const frontier = r.json.data.tickets.map((t) => t.path)
    assert.deepEqual(frontier, ["r/a/issues/06-ready.md", "r/a/issues/02-ready.md"])
    assert.deepEqual(firstColumn(await render(s.notes, section("🔥"))), frontier)
  })

  test("🚧 Blocked lists open tickets on active maps with what still blocks them", async () => {
    const out = await render(scenario().notes, section("🚧"))
    const { rows } = onlyTable(out)
    assert.deepEqual(rows.map((r) => pathOf(r[0])), ["r/a/issues/03-blocked.md", "r/a/issues/07-dangling.md"])
    assert.deepEqual(rows[0][2].map(pathOf), ["r/a/issues/04-claimed.md"])
    assert.equal(rows[1][2].length, 1)
    assert.equal(typeof rows[1][2][0], "string", "a dangling blocker has no note to link (lint shows the raw link)")
  })

  test("⏳ waiting and 🖐 claimed list only tickets on active maps", async () => {
    const { notes } = scenario()
    assert.deepEqual(firstColumn(await render(notes, section("⏳"))), ["r/a/issues/05-waiting.md"])
    assert.deepEqual(firstColumn(await render(notes, section("🖐"))), ["r/a/issues/04-claimed.md"])
  })

  test("unresolved tickets on done, paused and draft maps get their own sections", async () => {
    const { notes } = scenario()
    assert.deepEqual(firstColumn(await render(notes, section("⚠️"))), ["r/x/issues/01-leftover.md"])
    const paused = onlyTable(await render(notes, section("⏸")))
    assert.deepEqual(paused.rows.map((r) => [pathOf(r[0]), r[2]]), [["r/p/issues/01-later.md", "after the release"]])
    const draft = onlyTable(await render(notes, section("✏️")))
    assert.deepEqual(draft.rows.map((r) => [pathOf(r[0]), r[2]]), [["r/d/issues/01-early.md", "no destination yet"]])
  })

  test("🗑 dropped maps only count their unresolved tickets", async () => {
    const { rows } = onlyTable(await render(scenario().notes, section("🗑")))
    assert.deepEqual(rows.map((r) => [pathOf(r[0]), r[1]]), [["r/z/map.md", 2]])
  })

  test("✅ Decisions lists resolved tickets outside dropped maps, newest first", async () => {
    const { notes } = scenario()
    assert.deepEqual(firstColumn(await render(notes, section("✅"))), ["r/x/issues/02-closed.md", "r/a/issues/01-done.md"])
  })
})
