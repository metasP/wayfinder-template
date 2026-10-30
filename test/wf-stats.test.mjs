// `wf stats`: the span of a map from its wf commits, with waiting and long gaps cut (mapStats), and the verb
// through the CLI against a fixture vault whose commits carry set dates.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { appendFileSync } from "node:fs"
import { join } from "node:path"
import { mapStats } from "../template/_tools/lib/verbs/stats.mjs"
import { makeVault, map, seed, ticket, wf } from "./vault.mjs"

const MIN = 60
const H = 3600
const K = "r/e"
const move = (at, verb, nn) => ({ at, subject: `wf(${verb}): ${K}#${nn}` })
const note = (at) => ({ at, subject: "r/e#01: Answer" })
const stats = (commits, tickets = []) => mapStats(K, commits, tickets)

describe("mapStats", () => {
  test("no claim or no resolve yet: counts only, no span", () => {
    const s = stats([move(0, "claim", "01")], [{ status: "claimed" }, { status: "open" }])
    assert.deepEqual([s.tickets, s.resolved, s.claimed, s.span, s.per_ticket], [2, 0, 1, null, null])
  })

  test("one ticket claimed then resolved: the span is all worked", () => {
    const s = stats([move(0, "claim", "01"), note(20 * MIN), move(30 * MIN, "resolve", "01")], [{ status: "resolved" }])
    assert.deepEqual(s.span, { from: 0, to: 30 * MIN, wall: 30 * MIN, waiting: 0, gaps: 0, worked: 30 * MIN })
    assert.deepEqual(s.per_ticket, { n: 1, instant: 0, median: 30 * MIN, p75: 30 * MIN, max: 30 * MIN })
  })

  test("a wait with nothing else claimed is cut; claimed time on either side counts", () => {
    const s = stats([move(0, "claim", "01"), move(10 * MIN, "wait", "01"), move(3 * H, "claim", "01"), move(3 * H + 20 * MIN, "resolve", "01")])
    assert.equal(s.span.waiting, 3 * H - 10 * MIN)
    assert.equal(s.span.worked, 30 * MIN)
    assert.equal(s.per_ticket.median, 30 * MIN)
  })

  test("a wait while another ticket is claimed is not cut", () => {
    const s = stats([move(0, "claim", "01"), move(10 * MIN, "wait", "01"), move(10 * MIN, "claim", "02"), move(1 * H, "resolve", "02"), move(1 * H, "resolve", "01")])
    assert.equal(s.span.waiting, 0)
    assert.equal(s.span.worked, 1 * H)
  })

  test("a gap over 4h with no commit is cut, even inside a claim", () => {
    const s = stats([move(0, "claim", "01"), note(10 * MIN), note(10 * MIN + 5 * H), move(5 * H + 30 * MIN, "resolve", "01")])
    assert.equal(s.span.gaps, 5 * H)
    assert.equal(s.span.worked, 30 * MIN)
    assert.equal(s.per_ticket.median, 30 * MIN)
  })

  test("a gap of 4h or less stays", () => {
    const s = stats([move(0, "claim", "01"), move(4 * H, "resolve", "01")])
    assert.equal(s.span.gaps, 0)
    assert.equal(s.span.worked, 4 * H)
  })

  test("a gap over 4h inside a wait is cut once, as a gap", () => {
    const s = stats([move(0, "claim", "01"), move(10 * MIN, "wait", "01"), move(10 * MIN + 6 * H, "claim", "01"), move(6 * H + 20 * MIN, "resolve", "01")])
    assert.deepEqual([s.span.gaps, s.span.waiting, s.span.worked], [6 * H, 0, 20 * MIN])
  })

  test("a ticket claimed and resolved inside a minute is left out of the per-ticket numbers", () => {
    const s = stats([move(0, "claim", "01"), move(30, "resolve", "01"), move(MIN, "claim", "02"), move(21 * MIN, "resolve", "02")])
    assert.deepEqual(s.per_ticket, { n: 1, instant: 1, median: 20 * MIN, p75: 20 * MIN, max: 20 * MIN })
  })

  test("a release ends the claimed stretch; the next claim starts another", () => {
    const s = stats([move(0, "claim", "01"), move(10 * MIN, "release", "01"), move(1 * H, "claim", "01"), move(1 * H + 5 * MIN, "resolve", "01")])
    assert.equal(s.per_ticket.median, 15 * MIN)
    assert.equal(s.span.worked, 65 * MIN, "open time between sessions is not waiting")
  })

  test("another effort whose key starts with this one is not read", () => {
    const s = stats([move(0, "claim", "01"), { at: 1, subject: "wf(claim): r/e-build#01" }, move(10 * MIN, "resolve", "01")])
    assert.equal(s.claimed, 1)
  })

  test("a ticket waiting after its claim counts in the per-ticket numbers; one still claimed does not", () => {
    const s = stats([move(0, "claim", "01"), move(25 * MIN, "wait", "01"), move(0, "claim", "02"), move(1 * H, "claim", "03"), move(1 * H + 5 * MIN, "resolve", "03")])
    assert.deepEqual([s.per_ticket.n, s.per_ticket.max], [2, 25 * MIN])
  })

  test("median and p75 are nearest-rank", () => {
    const commits = [10, 20, 30, 40].flatMap((m, i) => [move(i * H, "claim", `0${i + 1}`), move(i * H + m * MIN, "resolve", `0${i + 1}`)])
    const p = stats(commits).per_ticket
    assert.deepEqual([p.n, p.median, p.p75, p.max], [4, 20 * MIN, 30 * MIN, 40 * MIN])
  })
})

// Commit a change to the ticket file at `iso` (author and committer date) with `subject`.
const commitAt = (vault, iso, subject) => {
  appendFileSync(join(vault, "r/e/issues/01-a.md"), `\n${subject}\n`)
  const env = { ...process.env, GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso }
  for (const args of [["add", "-A"], ["commit", "-qm", subject]]) {
    const r = spawnSync("git", args, { cwd: vault, encoding: "utf8", env })
    assert.equal(r.status, 0, r.stderr)
  }
}

describe("wf stats", () => {
  const vault = () =>
    seed(makeVault({ notes: [map("r/e/map.md"), ticket("r/e/issues/01-a.md", { title: "A", status: "resolved" }), ticket("r/e/issues/02-b.md", { title: "B" })] }))

  test("prints the span, the cuts and the per-ticket numbers", () => {
    const v = vault()
    commitAt(v, "2026-10-01T10:00:00+07:00", "wf(claim): r/e#01")
    commitAt(v, "2026-10-01T10:30:00+07:00", "wf(wait): r/e#01")
    commitAt(v, "2026-10-01T11:30:00+07:00", "wf(claim): r/e#01")
    commitAt(v, "2026-10-01T11:45:00+07:00", "wf(resolve): r/e#01")
    const r = wf(v, ["stats", "r/e", "--json"])
    assert.equal(r.code, 0, r.stderr)
    const { data } = r.json
    assert.deepEqual([data.tickets, data.resolved, data.claimed], [2, 1, 1])
    assert.deepEqual([data.span.wall, data.span.waiting, data.span.gaps, data.span.worked], [105 * MIN, 60 * MIN, 0, 45 * MIN])
    const text = wf(v, ["stats", "r/e"]).stdout
    assert.match(text, /^r\/e — 2 tickets · 1 resolved · 1 claimed through wf$/m)
    assert.match(text, /= worked\s+45m$/m)
    assert.match(text, /n=1 · median 45m/)
  })

  test("a map with no claim yet says so", () => {
    const r = wf(vault(), ["stats", "r/e"])
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stdout, /no span yet/)
  })

  test("an effort with no map is refused", () => {
    const r = wf(vault(), ["stats", "r/nope"])
    assert.notEqual(r.code, 0)
    assert.match(r.stderr, /r\/nope/)
  })
})
