// The vault README (`template/README.md`) against the `wf` CLI (spec docs/specs/ticket-store.md, *README
// (Q33)*; issue #26): § Wayfinding operations is a verb table plus concepts, every `wf` command it spells
// out parses against the real verb, no prose protocol survives that `wf` replaced (the NN reservation race,
// the stub protocol, hand-written status), and its frontmatter examples pass `wf lint` in a fixture vault.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { MAP_TRANSITIONS, TICKET_TRANSITIONS } from "../template/_tools/lib/core.mjs"
import { makeVault, map, ticket, wf } from "./vault.mjs"
import { assertCommandsParse, verbs, wfCommands } from "./wf-doc.mjs"

const README = readFileSync(new URL("../template/README.md", import.meta.url), "utf8")

// The text from `## <heading>` to the next `## ` heading.
const section = (heading) => {
  const start = README.indexOf(`\n## ${heading}\n`)
  assert.ok(start >= 0, `the README has no ## ${heading}`)
  const end = README.indexOf("\n## ", start + 1)
  return README.slice(start, end === -1 ? undefined : end)
}

const FENCE_RE = /```[\s\S]*?```/g
const prose = README.replace(FENCE_RE, "")
const headings = [...prose.matchAll(/^#{2,4} (.+)$/gm)].map(([, text]) => text.trim())

// A table row's cells, or null for a line that isn't one.
const cells = (line) => (/^\|.*\|$/.test(line.trim()) ? line.trim().slice(1, -1).split(" | ").map((c) => c.trim()) : null)

// The rows of § Wayfinding operations whose first cell names a `wf <verb>` command.
const verbRows = section("Wayfinding operations")
  .split("\n")
  .map(cells)
  .filter((row) => row && /^`wf [a-z-]+/.test(row[0]))

// The README's fenced ```markdown examples that open with frontmatter.
const examples = [...README.matchAll(/```markdown\n(---\n[\s\S]*?)```/g)].map(([, text]) => text)

describe("vault README", () => {
  test("keeps the headings /wayfinder, doctor and bootstrap look for", () => {
    for (const heading of ["Wayfinding operations", "Spec & ticket operations"]) assert.ok(headings.includes(heading), heading)
  })

  test("every wf command it spells out parses against the real verb", () => {
    assertCommandsParse(wfCommands(README))
  })

  test("§ Wayfinding operations has a verb table row for every wf verb", () => {
    for (const name of verbs.keys())
      assert.ok(
        verbRows.some((row) => row[0].startsWith(`\`wf ${name} `) || row[0] === `\`wf ${name}\``),
        `no verb table row for wf ${name}`,
      )
    for (const row of verbRows) assert.equal(row.length, 3, `${row[0]}: a verb row is verb · transition · guarantee`)
  })

  // One row per transition: the verb's own row (picked by its flag, or for map-status by its target)
  // says `from → to` the way the CLI's transition table has it.
  test("each transition verb's row states the transition the CLI enforces", () => {
    const rowOf = ({ verb, flag, to }) =>
      verbRows.find((row) => {
        if (!row[0].startsWith(`\`wf ${verb} `)) return false
        if (verb === "map-status") return row[0].includes(` ${to}`)
        return row[0].includes(" --out-of-scope") === (flag === "--out-of-scope")
      })
    const word = (status) => new RegExp(`\\b${status}\\b`)
    for (const transition of [...TICKET_TRANSITIONS, ...MAP_TRANSITIONS]) {
      const { verb, flag, from, to } = transition
      const name = `wf ${verb}${flag ? ` ${flag}` : ""} → ${to}`
      const row = rowOf(transition)
      assert.ok(row, `no verb table row for ${name}`)
      const [before, after, ...rest] = row[1].split("→")
      assert.ok(after !== undefined && !rest.length, `${name}: the transition cell is not "from → to": ${row[1]}`)
      assert.match(after, word(to), `${name}: the row moves to something else: ${row[1]}`)
      if (!from) assert.match(before, /—/, `${name}: a create starts from —: ${row[1]}`)
      else if (verb !== "map-status") // map-status moves from any other status
        for (const status of from) assert.match(before, word(status), `${name}: the row doesn't move from ${status}: ${row[1]}`)
    }
  })

  test("the NN reservation race, the stub protocol and the worktree-to-main sync are gone", () => {
    assert.doesNotMatch(README, /การจองเลข|ไม่ atomic|\bstub\b|highest \+ 1|ls -lT|ls issues/i)
    assert.doesNotMatch(README, /หยดลง|ff-only|worktree ของ vault/)
  })

  test("every § reference names a heading that exists", () => {
    for (const [ref] of README.matchAll(/§ [^\n]+/g)) {
      const target = ref.slice(2)
      // The heading's whole text, then the end of the reference (not a longer word that starts the same).
      assert.ok(
        headings.some((h) => target.startsWith(h) && /^(?:$|[\s)|·,.])/.test(target.slice(h.length))),
        `${JSON.stringify(ref.slice(0, 60))} points at no heading of the README`,
      )
    }
  })

  // Q3: `wf` is the only way to change tracker state in frontmatter. A `key: value` code span in prose
  // reads as an instruction to type that line into a note's frontmatter.
  test("no prose tells an agent to write tracker frontmatter by hand", () => {
    const keys = "kind|title|type|status|status_since|status_note|blockers|claimed_by|wait_until|target_repo|runs|blocked_by|superseded_by"
    const spans = [...prose.matchAll(new RegExp(`\`(?:${keys}): [^\`]*\``, "g"))].map(([span]) => span)
    assert.deepEqual(spans, [], "frontmatter lines written as instructions")
    // "set `status` to …" / "`status` = …" / "edit `blockers` …", in Thai or English.
    const setKey = new RegExp(`(?:แก้|ตั้ง|ใส่|เปลี่ยน|เติม|\\b(?:set|edit|change|add)\\b)\\s*\`(?:${keys})\`|\`(?:${keys})\`\\s*(?:=|เป็น\\s*\`)`, "i")
    assert.doesNotMatch(prose, setKey, "prose that sets a frontmatter key by hand")
    assert.doesNotMatch(prose, /ห้ามลืม|wire `blockers`/)
  })

  test("its map and ticket frontmatter examples are schema 2 and pass wf lint", () => {
    const mapExample = examples.find((text) => /^kind: map$/m.test(text))
    const ticketExample = examples.find((text) => /^type: /m.test(text))
    assert.ok(mapExample && ticketExample, "the README has no map or ticket frontmatter example")

    const blocker = ticketExample.match(/"\[\[(\d+-[^\]]+)\]\]"/)?.[1]
    const blockedBy = mapExample.match(/^blocked_by: "\[\[([^\]]+)\]\]"/m)?.[1]
    assert.ok(blocker && blockedBy, "the examples lost their blockers / blocked_by links")

    const vault = makeVault({
      notes: [
        { path: "example-repo/getting-started/map.md", text: mapExample },
        { path: "example-repo/getting-started/issues/03-ignored-build-step.md", text: ticketExample },
        ticket(`example-repo/getting-started/issues/${blocker}.md`),
        map(`${blockedBy.replace(/\/issues\/.*$/, "/map")}.md`),
        ticket(`${blockedBy}.md`),
      ],
    })
    const lint = wf(vault, ["lint", "--json"])
    assert.equal(lint.code, 0, lint.stderr)
    // Clock- and body-dependent warnings (stale, overdue, the ## Tickets block) aren't about the schema.
    const schemaFindings = lint.json.data.findings.filter(
      (f) => f.severity === "error" || ["legacy-field", "unknown-key"].includes(f.rule),
    )
    assert.deepEqual(schemaFindings, [])
  })
})
