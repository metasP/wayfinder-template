// `wayfinder-next` against the `wf` CLI (spec docs/specs/ticket-store.md, user story 23; issue #25): the
// skill ranks from `wf frontier` and allocates run numbers with `wf bump-runs`, every `wf` command it
// spells out parses against the verb it names, and the output fields it reads exist — so a renamed verb,
// flag or field turns this red, not a chip run.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { git, makeVault, map, read, seed, ticket, wf } from "./vault.mjs"
import { assertCommandsParse, wfCommands } from "./wf-doc.mjs"

const SKILL = readFileSync(new URL("../skills/wayfinder-next/SKILL.md", import.meta.url), "utf8")
const commands = wfCommands(SKILL)

describe("wayfinder-next skill", () => {
  test("runs wf frontier --json and wf bump-runs by absolute path", () => {
    assert.match(SKILL, /node __VAULT__\/_tools\/wf\.mjs frontier --from \S+ --json/)
    assert.match(SKILL, /node __VAULT__\/_tools\/wf\.mjs bump-runs \S+ --count \S+ --json/)
  })

  test("every wf command it spells out parses against the real verb", () => {
    assertCommandsParse(commands)
  })

  // The desktop harness dropped spawn_task; an "offer" start shows a Do it here button that turned a
  // planning session into a build session, and an app-picked worktree name hid the session from a retro.
  test("starts sessions with start_session user_asked, on a branch named after the ticket", () => {
    assert.doesNotMatch(SKILL, /spawn_task/, "the skill still names spawn_task")
    assert.match(SKILL, /mcp__ccd_session__start_session/)
    assert.match(SKILL, /`initiation`: \*\*`"user_asked"`\*\*/)
    assert.match(SKILL, /`branch_name`: \*\*`<effort>-<NN>`\*\*/)
    assert.match(SKILL, /## This session never works the ticket/)
    assert.match(SKILL, /never runs `wf claim`/)
  })

  test("leaves runs to bump-runs and ranking to frontier", () => {
    assert.doesNotMatch(SKILL, /\bruns:/, "the skill still edits runs: itself")
    assert.doesNotMatch(SKILL, /urgen|unblocks the most|lowest[- ]number|tie-break|parallel-safe/i, "the skill still ranks")
  })

  // Issue #36: the fog ticket is commissioned with `wf new`, which takes NN under the lock and writes the
  // file — the guard refuses a hand-made create, and a guessed NN can collide.
  test("commissions a fog ticket with wf new, never a reserved NN or a hand-made file", () => {
    assert.match(SKILL, /node __VAULT__\/_tools\/wf\.mjs new \S+ --type \S+ --title "[^"`]*" --question "[^"`]*" --json/)
    assert.match(SKILL, /\*\*NN\*\* is the number after `#` in `data\.ref`/, "the chip's NN is not the one wf new printed")
    assert.doesNotMatch(SKILL, /reserv/i, "the skill still reserves an NN")
    assert.doesNotMatch(SKILL, /highest(?: existing NN)? \+ 1/, "the skill still computes NN = highest + 1")
    assert.doesNotMatch(SKILL, /แตกเป็น issues\/|สร้างไฟล์[^\n]*issues\//, "the skill still tells a session to create a ticket file")
    for (const [sentence] of SKILL.matchAll(/[^.\n]*\b(?:creat|writ)\w*\b[^.\n]*issues\/[^.\n]*/gi))
      assert.match(sentence, /\bnever\b/i, `the skill still tells a session to create a ticket file: ${sentence}`)
  })

  test("the chip prompt template has no fog-specific line", () => {
    const [start, end] = [SKILL.indexOf("## Chip prompt template"), SKILL.indexOf("## Notes")]
    assert.ok(start >= 0 && end > start, "the chip prompt template section moved")
    const template = SKILL.slice(start, end)
    assert.doesNotMatch(template, /fog|has no file yet|ยังไม่มีไฟล์/)
  })

  test("a map with every ticket resolved gets exactly one ticket file, written and committed by wf new", () => {
    const vault = seed(
      makeVault({
        notes: [
          map("r/e/map.md"),
          ticket("r/e/issues/01-one.md", { status: "resolved" }),
          ticket("r/e/issues/02-two.md", { status: "resolved" }),
        ],
      }),
    )
    const issues = () => readdirSync(join(vault, "r/e/issues")).sort()
    const before = issues()
    const frontier = wf(vault, ["frontier", "--from", "r/e", "--json"])
    assert.equal(frontier.code, 0, frontier.stderr)
    assert.deepEqual(frontier.json.data.tickets, [], "an all-resolved map has no frontier row")

    // The skill's own `wf new` line, its placeholders filled in as the agent would.
    const line = commands.find((c) => c.verb === "new" && c.argv.length)?.text
    assert.ok(line, "the skill spells out no wf new command")
    const filled = line
      .replace("<repo/effort>", "r/e")
      .replace("<type>", "grilling")
      .replace('"<title>"', '"Pick the payment step"')
      .replace("<question>", "Which payment step goes first?")
    const argv = filled.match(/"[^"]*"|\S+/g).slice(1).map((arg) => arg.replace(/^"(.*)"$/, "$1"))
    const created = wf(vault, argv)
    assert.equal(created.code, 0, created.stderr)

    const nn = created.json.data.ref.split("#").pop()
    assert.equal(nn, "03")
    assert.deepEqual(issues(), [...before, created.json.data.path.split("/").pop()].sort(), "wf new wrote exactly one ticket file")
    assert.match(created.json.data.path, /^r\/e\/issues\/03-/)
    const note = read(vault, created.json.data.path)
    assert.match(note, /^type: "?grilling"?$/m)
    // The short title is read from the bold line under `## Question`.
    assert.match(note, /## Question\n\n\*\*Which payment step goes first\?\*\*\n/)
    assert.equal(git(vault, "status", "--porcelain"), "", "wf committed its own write; nothing was written by hand")
  })

  test("the output fields it reads are the ones wf prints", () => {
    const vault = makeVault({
      notes: [map("r/e/map.md"), ticket("r/e/issues/01-one.md", { target_repo: "lib" }), ticket("r/e/issues/02-two.md")],
    })
    const frontier = wf(vault, ["frontier", "--from", "r/e", "--json"])
    assert.equal(frontier.code, 0, frontier.stderr)
    for (const key of ["ref", "repo", "effort", "nn", "type", "title", "target_repo"])
      assert.ok(key in frontier.json.data.tickets[0], `frontier rows have no ${key}`)

    const bump = wf(vault, ["bump-runs", "r/e", "--count", "2", "--json"])
    assert.equal(bump.code, 0, bump.stderr)
    assert.deepEqual(
      { ref: bump.json.data.ref, from: bump.json.data.from, to: bump.json.data.to, runs: bump.json.data.runs },
      { ref: "r/e", from: 1, to: 2, runs: 2 },
    )

    const refused = wf(vault, ["bump-runs", "r/nowhere", "--json"])
    assert.equal(refused.code, 1)
    assert.match(refused.json.error.details.join("\n"), /^fix: /m, "an invariant refusal carries its fix in error.details")
  })
})
