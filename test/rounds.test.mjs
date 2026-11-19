// Which tickets can run side by side: `touches:` globs overlapping, and the rounds `wf frontier` deals
// the frontier into (lib/rounds.mjs).
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { globsOverlap, planRounds } from "../template/_tools/lib/rounds.mjs"

describe("globsOverlap", () => {
  const cases = [
    ["same file", "a/b.md", "a/b.md", true],
    ["different files", "a/b.md", "a/c.md", false],
    ["a directory holds the file", "a", "a/b.md", true],
    ["trailing slash and ./ are noise", "./a/", "a/b.md", true],
    ["a glob matching the file", "test/*.mjs", "test/a.mjs", true],
    ["a glob missing the file", "test/*.mjs", "README.md", false],
    ["* stays inside one directory", "test/*.mjs", "test/sub/a.mjs", false],
    ["** crosses directories", "test/**", "test/sub/a.mjs", true],
    ["**/ matches no directory too", "skills/**/SKILL.md", "skills/SKILL.md", true],
    ["braces list alternatives", "skills/{a,b}/x.md", "skills/b/x.md", true],
    ["braces miss the others", "skills/{a,b}/x.md", "skills/c/x.md", false],
    ["a directory holding a glob's base", "test", "test/*.mjs", true],
    ["a ** glob reaches into a directory", "**/*.md", "docs", true],
    ["two globs on separate trees", "template/**", "skills/**", false],
    ["two globs where one tree holds the other", "template/**", "template/_tools/*.mjs", true],
    ["a glob with no literal base overlaps any glob", "*.md", "skills/**", true],
    ["braces may hold a /", "src/{a,b/c}.md", "src/b/c.md", true],
    ["braces may nest", "src/{a,{b,c}}.md", "src/c.md", true],
    ["nested braces still miss the others", "src/{a,{b,c}}.md", "src/d.md", false],
    ["an unbalanced brace is read conservatively", "src/{a.md", "src/x.md", true],
    ["an unterminated class is read conservatively, not a crash", "src/a[.md", "src/a.md", true],
    ["a glob naming a directory covers its files", "src/*", "src/a/b.md", true],
    ["a braced directory covers its files", "src/{a,b}", "src/a/c.md", true],
    ["case differs, same file on macOS", "SRC/a.md", "src/a.md", true],
    ["regex characters in a name are literal", "a+b.md", "aab.md", false],
  ]
  for (const [name, a, b, expected] of cases) {
    test(`${name}: ${a} ~ ${b}`, () => {
      assert.equal(globsOverlap(a, b), expected)
      assert.equal(globsOverlap(b, a), expected, "symmetric")
    })
  }
})

const t = (nn, fields = {}) => ({
  ref: `r/e#${String(nn).padStart(2, "0")}`,
  repo: "r",
  effortKey: "r/e",
  type: "task",
  targetRepo: null,
  touches: null,
  ...fields,
})

const roundsOf = (tickets, opts) => {
  const plan = planRounds(tickets, opts)
  return tickets.map((x) => plan.get(x.ref).round)
}

describe("planRounds", () => {
  test("tickets touching separate files share round 1", () => {
    assert.deepEqual(roundsOf([t(1, { touches: ["a.md"] }), t(2, { touches: ["b.md"] }), t(3, { touches: ["c/**"] })]), [1, 1, 1])
  })

  test("a ticket overlapping one already placed waits for the next round, naming it", () => {
    const tickets = [t(1, { touches: ["a.md"] }), t(2, { touches: ["a.md", "b.md"] }), t(3, { touches: ["b.md"] })]
    const plan = planRounds(tickets)
    assert.deepEqual(roundsOf(tickets), [1, 2, 1])
    assert.deepEqual(plan.get("r/e#02").collidesWith, ["r/e#01"])
    assert.deepEqual(plan.get("r/e#03").collidesWith, ["r/e#02"])
    assert.deepEqual(plan.get("r/e#01").collidesWith, [])
  })

  test("first fit: a later ticket fills an earlier round when it can", () => {
    const tickets = [t(1, { touches: ["a"] }), t(2, { touches: ["a"] }), t(3, { touches: ["a"] }), t(4, { touches: ["b"] })]
    assert.deepEqual(roundsOf(tickets), [1, 2, 3, 1])
  })

  test("a code ticket without touches: takes its whole repo", () => {
    const tickets = [t(1), t(2, { touches: ["b.md"] }), t(3, { targetRepo: "lib", touches: ["b.md"] })]
    assert.deepEqual(roundsOf(tickets), [1, 2, 1])
  })

  test("a research or grilling ticket without touches: writes only its answer and collides with nothing", () => {
    const tickets = [t(1), t(2, { type: "research" }), t(3, { type: "grilling" })]
    assert.deepEqual(roundsOf(tickets), [1, 1, 1])
  })

  test("touches: [] touches nothing, even on a task", () => {
    assert.deepEqual(roundsOf([t(1), t(2, { touches: [] })]), [1, 1])
  })

  test("tickets in different repos never collide", () => {
    assert.deepEqual(roundsOf([t(1), t(2, { repo: "other", effortKey: "other/e" })]), [1, 1])
  })

  test("a claimed ticket holds its files: an overlapping ticket starts in round 2", () => {
    const claimed = t(9, { touches: ["a.md"] })
    const tickets = [t(1, { touches: ["a.md"] }), t(2, { touches: ["b.md"] })]
    const plan = planRounds(tickets, { inFlight: [claimed] })
    assert.deepEqual(roundsOf(tickets, { inFlight: [claimed] }), [2, 1])
    assert.deepEqual(plan.get("r/e#01").collidesWith, ["r/e#09"])
  })

  test("a serial map's tickets each get their own round, after any claimed one", () => {
    const isSerial = (key) => key === "r/e"
    const tickets = [t(1, { touches: ["a"] }), t(2, { touches: ["b"] }), t(3, { touches: ["c"], repo: "x", effortKey: "x/e" })]
    assert.deepEqual(roundsOf(tickets, { isSerial }), [1, 2, 1])
    assert.deepEqual(roundsOf(tickets, { isSerial, inFlight: [t(9, { touches: ["z"] })] }), [2, 3, 1])
  })
})
