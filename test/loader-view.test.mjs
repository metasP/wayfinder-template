// The shared loader view (`_tools/views/wf-core.js`), run through a Dataview stand-in: it loads the core
// from `app.vault.adapter.getResourcePath`, adapts `dv.pages()` into the core's notes, and hands the page
// `{ core, index, config, sort, today, link }` (spec, *Loading the core in Obsidian*).
import { test } from "node:test"
import assert from "node:assert/strict"
import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { LOADER_VIEW, PAGE_VIEWS } from "../template/_tools/lib/page-views.mjs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fakeDataview, LOADER, TEMPLATE } from "./dataview.mjs"
import { map, PROTOTYPE_NOTES, refs, ticket, TODAY } from "./fixture.mjs"

// A page block that keeps what the loader handed it.
const capture = (options = "") => `
  globalThis.__wf = null
  await dv.view(${JSON.stringify(LOADER)}, { ${options} render: (wf) => { globalThis.__wf = wf } })
`

const load = async (notes, options) => {
  const dv = fakeDataview({ notes })
  await dv.run(capture(options))
  const wf = globalThis.__wf
  delete globalThis.__wf
  return { wf, out: dv.out }
}

test("hands the page the core and an index of the vault's notes", async () => {
  const { wf } = await load(PROTOTYPE_NOTES, `today: "${TODAY}",`)
  assert.deepEqual(refs(wf.core.frontier(wf.index)), ["repoA/eff1#02", "repoA/eff1#05"])
  assert.equal(wf.today, TODAY)
})

test("defaults today to the local calendar day", async () => {
  const { wf } = await load(PROTOTYPE_NOTES)
  assert.equal(wf.today, wf.core.isoDate(new Date()))
})

test("reads Wayfinder Config as config and Wayfinder Picks sort: as sort", async () => {
  const notes = [
    ...PROTOTYPE_NOTES,
    { path: "Wayfinder Config.md", frontmatter: { kind: "wayfinder-config", stale_days: 5, language: "th" } },
    { path: "Wayfinder Picks.md", frontmatter: { sort: ["nn desc"] } },
  ]
  const { wf } = await load(notes)
  assert.deepEqual(wf.config, { kind: "wayfinder-config", stale_days: 5, language: "th" })
  assert.deepEqual(wf.sort, ["nn desc"])
})

test("without Config or Picks notes, config is empty and sort is undefined", async () => {
  const { wf } = await load(PROTOTYPE_NOTES)
  assert.deepEqual(wf.config, {})
  assert.equal(wf.sort, undefined)
})

test("skips notes under a root _ folder and dot folders, like the store", async () => {
  const notes = [
    map("repoA/eff1/map.md"),
    ticket("repoA/eff1/issues/01-real.md"),
    ticket("_tools/eff1/issues/01-tool.md"),
    ticket("repoA/.trash/issues/01-gone.md"),
  ]
  const { wf } = await load(notes)
  assert.deepEqual([...wf.index.tickets.keys()], ["repoA/eff1#01"])
})

const BLOCK = "\n- [[01-a]] · task · open · 01-a\n"

test("maps carry the text between the wf:tickets markers only when bodies are asked for", async () => {
  const notes = [
    map("r/e/map.md", { status: "active" }),
    { ...map("r/f/map.md"), body: `## Tickets\n<!-- wf:tickets -->${BLOCK}<!-- /wf:tickets -->\n` },
    ticket("r/e/issues/01-a.md"),
  ]
  notes[0].body = "## Tickets\n\n(hand-written)\n"
  const without = await load(notes)
  assert.equal(without.wf.index.maps.get("r/f").ticketsBlock, undefined)

  const { wf } = await load(notes, "bodies: true,")
  assert.equal(wf.index.maps.get("r/f").ticketsBlock, BLOCK)
  assert.equal(wf.index.maps.get("r/e").ticketsBlock, null)
})

test("a map body that can't be read is left unread, so drift isn't checked for it", async () => {
  const notes = [map("r/e/map.md"), ticket("r/e/issues/01-a.md")]
  const dv = fakeDataview({ notes, failLoad: (path) => path === "r/e/map.md" })
  await dv.run(capture("bodies: true,"))
  const wf = globalThis.__wf
  delete globalThis.__wf
  assert.equal(wf.index.maps.get("r/e").ticketsBlock, undefined)
  assert.equal(wf.core.lint(wf.index, { today: TODAY }).filter((f) => f.rule === "tickets-block-drift").length, 0)
})

test("link(ref) links tickets, maps and Wayfinder Picks to their notes; anything else stays text", async () => {
  const { wf } = await load(PROTOTYPE_NOTES)
  assert.deepEqual(wf.link("repoA/eff1#02"), { link: "repoA/eff1/issues/02-ready.md", display: undefined })
  assert.deepEqual(wf.link("repoA/eff1"), { link: "repoA/eff1/map.md", display: "repoA/eff1" })
  assert.deepEqual(wf.link("Wayfinder Picks"), { link: "Wayfinder Picks.md", display: undefined })
  assert.equal(wf.link("repoZ/nope#01"), "repoZ/nope#01")
})

// ── Failure: the loader's own message, never a bare stack trace ─────────────

const vaultWithCore = (source) => {
  const vault = mkdtempSync(join(tmpdir(), "wf-loader-"))
  cpSync(join(TEMPLATE, "_tools/views"), join(vault, "_tools/views"), { recursive: true })
  if (source != null) {
    cpSync(join(TEMPLATE, "_tools/lib"), join(vault, "_tools/lib"), { recursive: true })
    writeFileSync(join(vault, "_tools/lib/core.mjs"), source)
  }
  return vault
}

const renderWith = async (vault) => {
  const dv = fakeDataview({ notes: PROTOTYPE_NOTES, vault })
  let rendered = false
  globalThis.__render = () => (rendered = true)
  await dv.run(`await dv.view(${JSON.stringify(LOADER)}, { render: () => globalThis.__render() })`)
  delete globalThis.__render
  return { out: dv.out, rendered }
}

const assertCoreMessage = (out) => {
  assert.equal(out.length, 1)
  assert.match(out[0].text, /_tools\/lib\/core\.mjs/)
  assert.match(out[0].text, /doctor/)
}

test("a core with a syntax error renders a message naming the core file and doctor", async () => {
  const { out, rendered } = await renderWith(vaultWithCore("export const x = (\n"))
  assert.equal(rendered, false)
  assertCoreMessage(out)
})

test("a missing core renders the same message", async () => {
  const { out, rendered } = await renderWith(vaultWithCore(null))
  assert.equal(rendered, false)
  assertCoreMessage(out)
})

test("a core without the read model's exports renders the same message", async () => {
  const { out } = await renderWith(vaultWithCore("export const SCHEMA_VERSION = 2\n"))
  assertCoreMessage(out)
})

test("a page block that throws renders a message instead of failing silently", async () => {
  const dv = fakeDataview({ notes: PROTOTYPE_NOTES })
  await dv.run(`await dv.view(${JSON.stringify(LOADER)}, { render: () => { throw new Error("boom") } })`)
  assert.equal(dv.out.length, 1)
  assert.match(dv.out[0].text, /boom/)
})

test("a failure while reading the notes renders the block-failed message", async () => {
  const dv = fakeDataview({ notes: PROTOTYPE_NOTES })
  await dv.run(`
    dv.pages = () => { throw new Error("index not ready") }
    await dv.view(${JSON.stringify(LOADER)}, { render: () => {} })
  `)
  assert.equal(dv.out.length, 1)
  assert.match(dv.out[0].text, /index not ready/)
})

test("map bodies that can't be read are listed in unread, so the page can say drift went unchecked", async () => {
  const notes = [map("r/e/map.md"), map("r/f/map.md"), ticket("r/e/issues/01-a.md")]
  const dv = fakeDataview({ notes, failLoad: (path) => path === "r/e/map.md" })
  await dv.run(capture("bodies: true,"))
  const wf = globalThis.__wf
  delete globalThis.__wf
  assert.deepEqual(wf.unread, ["r/e/map.md"])
})

test("text(value) escapes what markdown would read as HTML", async () => {
  const { wf } = await load(PROTOTYPE_NOTES)
  assert.equal(wf.text("wait for <partner> & co"), "wait for &lt;partner&gt; &amp; co")
  assert.equal(wf.text(null), "—")
})

test("every view returns its promise to Dataview: its text never contains the word Dataview wraps", () => {
  // Dataview wraps a view containing `await` in an IIFE and drops the promise; without it, the
  // view's promise is awaited, so the page block runs after the view has rendered.
  const views = readdirSync(join(TEMPLATE, "_tools/views")).filter((f) => f.endsWith(".js"))
  assert.deepEqual(views.sort(), [LOADER_VIEW, ...Object.values(PAGE_VIEWS)].map((v) => `${v}.js`).sort())
  for (const file of views) {
    const source = readFileSync(join(TEMPLATE, "_tools/views", file), "utf8")
    assert.equal(source.includes("await"), false, file)
    assert.doesNotMatch(source, /\brequire\s*\(|file:\/\//, file)
  }
})
