// `touches:` through the CLI: `wf new --touches`, `wf touches`, and the frontier rounds they feed.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { makeVault, map, read, seed, ticket, wf } from "./vault.mjs"

const NO_SESSION = { CLAUDE_CODE_SESSION_ID: undefined }
const run = (vault, args) => wf(vault, args, { env: NO_SESSION })
const MAP_BODY = "# The map\n\n## Destination\n\nSomewhere.\n\n## Notes\n\nnone\n\n## Decisions so far\n\n## Out of scope\n\n"
const vaultWith = (tickets = []) => seed(makeVault({ notes: [{ ...map("r/e/map.md"), body: MAP_BODY }, ...tickets] }))
const frontmatterOf = (vault, rel) => read(vault, rel).split("---\n")[1]

describe("wf new --touches", () => {
  test("writes each glob as a touches: list item, quoting what YAML would misread", () => {
    const vault = vaultWith()
    const r = run(vault, ["new", "r/e", "--type", "task", "--title", "A", "--question", "q", "--touches", "skills/**", "--touches", "*.md", "--json"])
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(r.json.data.touches, ["skills/**", "*.md"])
    assert.match(frontmatterOf(vault, "r/e/issues/01-a.md"), /^touches:\n {2}- skills\/\*\*\n {2}- "\*\.md"\n/m)
    const shown = run(vault, ["frontier", "--json"]).json.data.tickets[0]
    assert.deepEqual(shown.touches, ["skills/**", "*.md"])
  })

  test("without --touches there is no touches: key", () => {
    const vault = vaultWith()
    assert.equal(run(vault, ["new", "r/e", "--type", "task", "--title", "A", "--question", "q"]).code, 0)
    assert.doesNotMatch(frontmatterOf(vault, "r/e/issues/01-a.md"), /touches/)
  })

  test("refuses an absolute path or one climbing out with ..", () => {
    const vault = vaultWith()
    for (const bad of ["/etc/x", "a/../b", " "]) {
      const r = run(vault, ["new", "r/e", "--type", "task", "--title", "A", "--question", "q", "--touches", bad])
      assert.equal(r.code, 2, `${bad}: ${r.stderr}`)
    }
  })
})

describe("wf touches", () => {
  const base = () => vaultWith([ticket("r/e/issues/01-a.md"), ticket("r/e/issues/02-b.md", { touches: ["b.md"] })])

  test("sets the globs, replacing what was there, and frontier deals by them", () => {
    const vault = base()
    assert.deepEqual(
      run(vault, ["frontier", "--json"]).json.data.tickets.map((t) => t.round),
      [1, 2],
      "a task without touches takes the whole repo",
    )
    const r = run(vault, ["touches", "r/e#01", "a.md", "docs/**", "--json"])
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(r.json.data.touches, ["a.md", "docs/**"])
    assert.match(frontmatterOf(vault, "r/e/issues/01-a.md"), /^touches:\n {2}- a\.md\n {2}- docs\/\*\*\n/m)
    assert.deepEqual(run(vault, ["frontier", "--json"]).json.data.tickets.map((t) => t.round), [1, 1])
  })

  test("--none writes touches: []; --clear removes the key; the same value writes nothing", () => {
    const vault = base()
    assert.equal(run(vault, ["touches", "r/e#01", "--none"]).code, 0)
    assert.match(frontmatterOf(vault, "r/e/issues/01-a.md"), /^touches: \[\]$/m)
    const again = run(vault, ["touches", "r/e#01", "--none"])
    assert.match(again.stdout, /nothing to write/)
    assert.equal(run(vault, ["touches", "r/e#02", "--clear"]).code, 0)
    assert.doesNotMatch(frontmatterOf(vault, "r/e/issues/02-b.md"), /touches/)
  })

  test("takes exactly one of globs, --none or --clear", () => {
    const vault = base()
    for (const args of [["r/e#01"], ["r/e#01", "a.md", "--none"], ["r/e#01", "--none", "--clear"]]) {
      const r = run(vault, ["touches", ...args])
      assert.equal(r.code, 2, `${args.join(" ")}: ${r.stderr}`)
      assert.match(r.stderr, /exactly one/)
    }
  })

  test("lint takes a touches: list as valid", () => {
    const vault = base()
    run(vault, ["touches", "r/e#01", "a.md"])
    const r = run(vault, ["lint", "r/e", "--json"])
    assert.equal(r.code, 0, r.stdout + r.stderr)
  })
})
