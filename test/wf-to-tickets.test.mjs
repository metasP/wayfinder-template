// `/to-tickets` charting a map from the cards it opened (retro of dashboard-navigation, C): `wf chart
// --destination … --active` and `wf new … --card <url>` take the effort from cards to a map whose
// tickets `/wayfinder-next` can chip, with no hand edit of the map — and `wf resolve` ticks the lines.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { git, makeVault, map, read, seed, wf } from "./vault.mjs"

const NO_SESSION = { CLAUDE_CODE_SESSION_ID: undefined }
const run = (vault, args) => wf(vault, args, { env: NO_SESSION })
const fresh = () => seed(makeVault({ notes: [] }))
const statusOf = (vault, rel) => /^status: (.*)$/m.exec(read(vault, rel))[1]
const boardOf = (vault) => read(vault, "r/new/map.md").split("## Build board\n\n")[1].split("\n\n")[0]
const lastFiles = (vault) => git(vault, "show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean)
const ISSUE = (n) => `https://github.com/o/r/issues/${n}`
const DESTINATION = "Pages find things fast:\n- a summary bar\n- folded sections"

const refused = (vault, args, code, message) => {
  const head = git(vault, "rev-parse", "HEAD")
  const r = run(vault, args)
  assert.equal(r.code, code, r.stderr)
  assert.match(r.stderr, message)
  assert.equal(git(vault, "rev-parse", "HEAD"), head, "no commit")
  assert.equal(git(vault, "status", "--porcelain"), "", "nothing written")
}

describe("wf chart --destination [--active]", () => {
  test("--active charts the map straight to active with the Destination written, in one commit", () => {
    const vault = fresh()
    const r = run(vault, ["chart", "r/new", "--title", "Nav", "--destination", DESTINATION, "--active", "--json"])
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.json.data.status, "active")
    assert.equal(statusOf(vault, "r/new/map.md"), "active")
    assert.match(read(vault, "r/new/map.md"), /## Destination\n\nPages find things fast:\n- a summary bar\n- folded sections\n\n## Notes/)
    assert.deepEqual(lastFiles(vault), ["r/new/map.md"])
    assert.deepEqual(run(vault, ["lint", "r/new", "--json"]).json.data.findings, [])
  })

  test("names the next step: a ticket per card when active, map-status when only the Destination is written", () => {
    assert.match(run(fresh(), ["chart", "r/new", "--title", "Nav", "--destination", "D", "--active"]).stdout, /wf new r\/new --type task --title "…" --card <url>/)
    const draft = run(fresh(), ["chart", "r/new", "--title", "Nav", "--destination", "D"])
    assert.match(draft.stdout, /charted r\/new at r\/new\/map\.md \(draft\)/)
    assert.match(draft.stdout, /wf map-status r\/new active/)
  })

  test("refuses --active without --destination, and a blank --destination (exit 2)", () => {
    refused(fresh(), ["chart", "r/new", "--title", "Nav", "--active"], 2, /--active goes with --destination/)
    refused(fresh(), ["chart", "r/new", "--title", "Nav", "--destination", "  \n "], 2, /--destination must not be blank/)
  })

  test("refuses a # or ## heading in --destination, which would leave the active map without one (exit 2)", () => {
    refused(fresh(), ["chart", "r/new", "--title", "Nav", "--destination", "Goal\n\n## Part\nmore", "--active"], 2, /must not hold a # or ## heading/)
    const vault = fresh()
    assert.equal(run(vault, ["chart", "r/new", "--title", "Nav", "--destination", "Goal\n### Part\n```\n# code\n```", "--active"]).code, 0)
    assert.match(run(vault, ["show", "r/new#01"]).stderr + read(vault, "r/new/map.md"), /### Part/)
  })
})

describe("wf new --card", () => {
  const charted = () => {
    const vault = fresh()
    assert.equal(run(vault, ["chart", "r/new", "--title", "Nav", "--destination", DESTINATION, "--active"]).code, 0)
    return vault
  }

  test("adds the card's ↔ NN line to a new ## Build board above ## Tickets, in the ticket's commit", () => {
    const vault = charted()
    const r = run(vault, ["new", "r/new", "--type", "T", "--title", "Summary bar", "--question", `Build ${ISSUE(79)}`, "--card", ISSUE(79), "--json"])
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.json.data.card, ISSUE(79))
    const text = read(vault, "r/new/map.md")
    assert.match(text, /## Notes\n\n## Build board\n\n- \[ \] \[#79\]\(https:\/\/github\.com\/o\/r\/issues\/79\) ↔ 01 — Summary bar\n\n## Tickets\n/)
    assert.deepEqual(lastFiles(vault), ["r/new/issues/01-summary-bar.md", "r/new/map.md"])
    assert.match(run(vault, ["new", "r/new", "--type", "T", "--title", "x", "--question", "q", "--card", ISSUE(80)]).stdout, /added its ## Build board line/)
  })

  test("the next card goes under the last line; a URL without a number is its own link text", () => {
    const vault = charted()
    for (const [title, url] of [["A", ISSUE(79)], ["B", ISSUE(80)], ["C", "https://linear.app/t/ABC"]])
      assert.equal(run(vault, ["new", "r/new", "--type", "task", "--title", title, "--question", "q", "--card", url]).code, 0)
    assert.equal(
      boardOf(vault),
      [`- [ ] [#79](${ISSUE(79)}) ↔ 01 — A`, `- [ ] [#80](${ISSUE(80)}) ↔ 02 — B`, "- [ ] [https://linear.app/t/ABC](https://linear.app/t/ABC) ↔ 03 — C"].join("\n"),
    )
  })

  test("refuses a --card that is not a URL (exit 2)", () => {
    refused(charted(), ["new", "r/new", "--type", "task", "--title", "A", "--question", "q", "--card", "#79"], 2, /--card must be the card's URL/)
  })

  test("without --card the map is not touched beyond its tickets block", () => {
    const vault = charted()
    assert.equal(run(vault, ["new", "r/new", "--type", "task", "--title", "A", "--question", "q"]).code, 0)
    assert.doesNotMatch(read(vault, "r/new/map.md"), /## Build board/)
  })

  test("end to end: chart → new --card → claim → resolve ticks the card's line, lint clean", () => {
    const vault = charted()
    assert.equal(run(vault, ["new", "r/new", "--type", "task", "--title", "A", "--question", "q", "--card", ISSUE(79)]).code, 0)
    assert.equal(run(vault, ["claim", "r/new#01", "--by", "me"]).code, 0)
    const answer = join(vault, "..", "answer.md")
    writeFileSync(answer, "## Answer\n\nDone in PR #90.\n")
    const r = run(vault, ["resolve", "r/new#01", "--gist", "done", "--answer-file", answer])
    assert.equal(r.code, 0, r.stderr)
    assert.equal(boardOf(vault), `- [x] [#79](${ISSUE(79)}) ↔ 01 — A`)
    assert.deepEqual(run(vault, ["lint", "r/new", "--json"]).json.data.findings.filter((f) => f.rule.startsWith("build-board")), [])
  })
})
