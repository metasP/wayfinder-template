// The core's shape is its contract: one ES module with no imports and no I/O, so Obsidian can load
// it with `import(app.vault.adapter.getResourcePath(...))` (spec, *Loading the core in Obsidian*).
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import * as plain from "../template/_tools/lib/core.mjs"
import { PROTOTYPE_NOTES, TODAY } from "./fixture.mjs"

const CORE_URL = new URL("../template/_tools/lib/core.mjs", import.meta.url)
const SOURCE = readFileSync(CORE_URL, "utf8")

// Everything a consumer reads, as plain data, so two module instances can be compared.
const observe = (core) => {
  const idx = core.buildIndex(PROTOTYPE_NOTES)
  return {
    exports: Object.keys(core).sort(),
    frontier: core.frontier(idx).map((t) => t.ref),
    blocked: [...idx.tickets.values()].filter((t) => core.isBlocked(idx, t)).map((t) => t.ref),
    stale: core.staleClaims(idx, { today: TODAY }).map((s) => [s.ticket.ref, s.days]),
    staleMaps: core.staleMaps(idx, { today: TODAY }).map((s) => [s.map.key, s.reason, s.days]),
    block: core.renderTicketsBlock(idx, "repoA/eff1", "en"),
  }
}

test("a resource-URL import (fresh instance, like getResourcePath's ?mtime) gives identical results", async () => {
  const viaUrl = await import(`${CORE_URL.href}?mtime=${Date.now()}`)
  assert.notEqual(viaUrl, plain, "the query string must load a separate instance")
  assert.deepEqual(observe(viaUrl), observe(plain))
})

test("the core loads from a URL with no base to resolve imports against (data: URL)", async () => {
  const viaData = await import(`data:text/javascript;base64,${Buffer.from(SOURCE).toString("base64")}`)
  assert.deepEqual(observe(viaData), observe(plain))
})

test("the source has no import/require and touches no I/O or ambient globals", () => {
  const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const forbidden = [
    /^\s*import[\s{*"']/m,
    /\bimport\s*\(/,
    /\bimport\.meta\b/,
    /\brequire\s*\(/,
    /\bexport\s[^\n]*\bfrom\s*["']/,
    /\b(process|globalThis|window|document|global|self|fetch|console|Deno|Bun|app|dv)\b/,
    /\b(Buffer|Intl|navigator|localStorage|sessionStorage|setTimeout|setInterval|XMLHttpRequest)\b/,
    /\bDate\.now\b|\bnew Date\s*\(/,
    /\bMath\.random\b/,
  ]
  for (const re of forbidden) assert.doesNotMatch(code, re)
})
