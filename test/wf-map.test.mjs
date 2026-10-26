// `wf chart` / `map-status` / `bump-runs` through the CLI against fixture vaults (spec *Verbs*: map
// transitions and `bump-runs`; Q25, Q36; Testing Decisions §1): the happy paths, every refused invariant
// (exit 1 with the fixing command), the `--json` shapes, and concurrent `bump-runs`.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { chmodSync, existsSync } from "node:fs"
import { join } from "node:path"
import { git, makeVault, map, onOneDay, read, seed, ticket, wf, wfAsync, write } from "./vault.mjs"

const NO_SESSION = { CLAUDE_CODE_SESSION_ID: undefined }
const run = (vault, args) => wf(vault, args, { env: NO_SESSION })
const runAsync = (vault, args) => wfAsync(vault, args, { env: NO_SESSION })

const DESTINATION = "# The map\n\n## Destination\n\nSomewhere real.\n\n## Notes\n\nnone\n"
const vaultWith = (notes, opts = {}) => seed(makeVault({ notes, ...opts }))
const effort = (mapFields = {}, tickets = [], body = DESTINATION) => [{ ...map("r/e/map.md", mapFields), body }, ...tickets]

const frontmatterOf = (vault, rel) => read(vault, rel).split("---\n")[1]
const lastCommit = (vault) => ({
  subject: git(vault, "log", "-1", "--format=%s"),
  files: git(vault, "show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean),
})

// A refused verb: the exit code, the message, the fix line (exit 1), and nothing written or committed.
const refused = (vault, args, code, message, fix) => {
  const head = git(vault, "rev-parse", "HEAD")
  const r = run(vault, args)
  assert.equal(r.code, code, r.stderr)
  assert.match(r.stderr, message)
  if (fix) assert.match(r.stderr, new RegExp(`^  fix: ${fix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"))
  assert.equal(git(vault, "rev-parse", "HEAD"), head, "no commit")
  assert.equal(git(vault, "status", "--porcelain"), "", "nothing written")
  return r
}

describe("wf chart", () => {
  test("creates map.md in draft with the section skeleton, the tickets block and a commit", () => {
    const vault = vaultWith(effort())
    const { r, day } = onOneDay((day) => ({ r: run(vault, ["chart", "r/new", "--title", "A new effort", "--json"]), day }))
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(r.json.data, {
      ref: "r/new",
      path: "r/new/map.md",
      title: "A new effort",
      status: "draft",
      status_since: day,
      created: day,
      files: ["r/new/map.md"],
      commit: r.json.data.commit,
      lint: [],
    })
    assert.equal(
      read(vault, "r/new/map.md"),
      [
        "---",
        "kind: map",
        "title: A new effort",
        "status: draft",
        `status_since: ${day}`,
        `created: ${day}`,
        "---",
        "",
        "# A new effort",
        "",
        "## Destination",
        "",
        "(where this effort ends — written before the map goes active)",
        "",
        "## Notes",
        "",
        "## Tickets",
        "",
        "<!-- wf:tickets -->",
        "_No tickets yet._",
        "<!-- /wf:tickets -->",
        "",
        "## Decisions so far",
        "",
        "## Not yet specified",
        "",
        "## Out of scope",
        "",
      ].join("\n"),
    )
    assert.deepEqual(lastCommit(vault), { subject: "wf(chart): r/new", files: ["r/new/map.md"] })
  })

  test("the text output names the map and the next step", () => {
    const r = run(vaultWith(effort()), ["chart", "r/new", "--title", "T"])
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stdout, /^charted r\/new at r\/new\/map\.md \(draft\)/)
    assert.match(r.stdout, /wf map-status r\/new active/)
  })

  test("the output passes wf lint with no errors", () => {
    const vault = vaultWith(effort())
    assert.equal(run(vault, ["chart", "r/new", "--title", "T"]).code, 0)
    const lint = run(vault, ["lint", "r/new", "--json"])
    assert.equal(lint.code, 0, lint.stdout)
    assert.deepEqual(lint.json.data.findings.filter((f) => f.severity === "error"), [])
  })

  test("text written into the note follows language: (headings stay English)", () => {
    const vault = vaultWith(effort(), { config: { language: "th" } })
    assert.equal(run(vault, ["chart", "r/new", "--title", "งานใหม่"]).code, 0)
    const text = read(vault, "r/new/map.md")
    assert.match(text, /^# งานใหม่$/m)
    assert.match(text, /## Destination\n\n\(ปลายทางของ effort นี้ — เขียนก่อน map เป็น active\)\n/)
    assert.match(text, /<!-- wf:tickets -->\n_ยังไม่มีใบ_\n<!-- \/wf:tickets -->/)
  })

  test("tickets already in the effort land in the generated block", () => {
    const vault = vaultWith([ticket("r/new/issues/01-a.md", { title: "A" })])
    assert.equal(run(vault, ["chart", "r/new", "--title", "T"]).code, 0)
    assert.match(read(vault, "r/new/map.md"), /<!-- wf:tickets -->\n- \[\[01-a\]\] · task · open · A\n<!-- \/wf:tickets -->/)
  })

  test("refuses an effort that already has a map (exit 1)", () => {
    refused(vaultWith(effort()), ["chart", "r/e", "--title", "T"], 1, /r\/e already has a map \(r\/e\/map\.md, active\)/, "wf map-status r/e <status> (to move the map that exists)")
  })

  test("refuses a map.md that isn't a map (exit 1)", () => {
    const vault = vaultWith([{ path: "r/odd/map.md", text: "# not a map\n" }])
    refused(vault, ["chart", "r/odd", "--title", "T"], 1, /r\/odd\/map\.md already exists/, "move r/odd/map.md aside, then rerun")
  })

  test("usage errors (exit 2): no --title, a ticket ref, a multi-line title", () => {
    const vault = vaultWith(effort())
    refused(vault, ["chart", "r/new"], 2, /chart needs --title/)
    refused(vault, ["chart", "r/e#01", "--title", "T"], 2, /cannot read "r\/e#01" as an effort — use repo\/effort/)
    refused(vault, ["chart", "r/new", "--title", "a\nb"], 2, /--title must be one line/)
  })
})

describe("wf map-status", () => {
  test("draft → active with a Destination: restamps status_since and clears status_note", () => {
    const vault = vaultWith(effort({ status: "draft", status_note: "grill first" }))
    const { r, day } = onOneDay((day) => ({ r: run(vault, ["map-status", "r/e", "active", "--json"]), day }))
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.json.data.ref, "r/e")
    assert.equal(r.json.data.from, "draft")
    assert.equal(r.json.data.status, "active")
    assert.equal(r.json.data.status_since, day)
    assert.equal(r.json.data.status_note, null)
    const fm = frontmatterOf(vault, "r/e/map.md")
    assert.match(fm, /^status: active$/m)
    assert.match(fm, new RegExp(`^status_since: ${day}$`, "m"))
    assert.doesNotMatch(fm, /status_note/)
    assert.deepEqual(lastCommit(vault), { subject: "wf(map-status): r/e", files: ["r/e/map.md"] })
  })

  test("active → paused --note replaces the note", () => {
    const vault = vaultWith(effort({ status_note: "old" }))
    const r = run(vault, ["map-status", "r/e", "paused", "--note", "waiting on budget"])
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stdout, /^map r\/e: active → paused/)
    const fm = frontmatterOf(vault, "r/e/map.md")
    assert.match(fm, /^status: paused$/m)
    assert.match(fm, /^status_note: waiting on budget$/m)
    assert.doesNotMatch(fm, /old/)
  })

  test("→ dropped --superseded-by records the map that replaces it", () => {
    const vault = vaultWith([...effort(), map("r/next/map.md")])
    const r = run(vault, ["map-status", "r/e", "dropped", "--note", "folded into next", "--superseded-by", "r/next", "--json"])
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.json.data.superseded_by, "[[r/next/map]]")
    const fm = frontmatterOf(vault, "r/e/map.md")
    assert.match(fm, /^status: dropped$/m)
    assert.match(fm, /^status_note: folded into next$/m)
    assert.match(fm, /^superseded_by: "\[\[r\/next\/map\]\]"$/m)
  })

  test("→ paused --superseded-by too; a later transition without it clears the key", () => {
    const vault = vaultWith([...effort(), map("r/next/map.md")])
    assert.equal(run(vault, ["map-status", "r/e", "paused", "--note", "parked", "--superseded-by", "[[r/next/map]]"]).code, 0)
    assert.match(frontmatterOf(vault, "r/e/map.md"), /^superseded_by: "\[\[r\/next\/map\]\]"$/m)
    assert.equal(run(vault, ["map-status", "r/e", "dropped", "--note", "gone"]).code, 0)
    assert.doesNotMatch(frontmatterOf(vault, "r/e/map.md"), /superseded_by/)
  })

  test("the map can be named as a vault path, a wikilink or an absolute path", () => {
    const vault = vaultWith(effort({ status: "paused", status_note: "x" }))
    assert.equal(run(vault, ["map-status", "r/e/map.md", "active"]).code, 0)
    assert.equal(run(vault, ["map-status", "[[r/e/map]]", "paused", "--note", "y"]).code, 0)
    const r = run(vault, ["map-status", join(vault, "r/e/map.md"), "active", "--json"])
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.json.data.ref, "r/e")
  })

  test("a CRLF map keeps its line endings, and its Destination counts", () => {
    const text = "---\r\nkind: map\r\ntitle: T\r\nstatus: draft\r\nstatus_since: 2026-01-01\r\n---\r\n\r\n## Destination\r\n\r\nThere.\r\n"
    const vault = vaultWith([{ path: "r/e/map.md", text }])
    assert.equal(run(vault, ["map-status", "r/e", "active"]).code, 0)
    const after = read(vault, "r/e/map.md")
    assert.match(after, /^status: active\r$/m)
    assert.doesNotMatch(after, /[^\r]\n/)
  })

  test("done straight from draft, when nothing is pending", () => {
    const vault = vaultWith(effort({ status: "draft" }))
    assert.equal(run(vault, ["map-status", "r/e", "done"]).code, 0)
    assert.match(frontmatterOf(vault, "r/e/map.md"), /^status: done$/m)
  })

  test("leaving dropped clears superseded_by along with the note", () => {
    const vault = vaultWith([...effort({ status: "dropped", status_note: "gone", superseded_by: "r/next" }), map("r/next/map.md")])
    assert.equal(run(vault, ["map-status", "r/e", "active"]).code, 0)
    const fm = frontmatterOf(vault, "r/e/map.md")
    assert.doesNotMatch(fm, /superseded_by|status_note/)
  })

  test("→ done with every ticket resolved prints the /retro reminder", () => {
    const vault = vaultWith(effort({}, [ticket("r/e/issues/01-a.md", { status: "resolved" })]))
    const r = run(vault, ["map-status", "r/e", "done", "--json"])
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.json.data.reminder, /\/retro/)
    const text = run(vaultWith(effort({}, [ticket("r/e/issues/01-a.md", { status: "resolved" })])), ["map-status", "r/e", "done"])
    assert.match(text.stdout, /^map r\/e: active → done/)
    assert.match(text.stdout, /run \/retro/)
    assert.match(text.stdout, /start a side session with the prompt "\/retro every session that touched r\/e\/"/)
    assert.match(frontmatterOf(vault, "r/e/map.md"), /^status: done$/m)
  })

  test("--note on active or done replaces the note too", () => {
    const vault = vaultWith(effort({ status: "paused", status_note: "old" }))
    assert.equal(run(vault, ["map-status", "r/e", "active", "--note", "back on it"]).code, 0)
    assert.match(frontmatterOf(vault, "r/e/map.md"), /^status_note: back on it$/m)
  })

  test("every transition restamps status_since and clears or replaces status_note", () => {
    const FROM = { active: "paused", paused: "active", dropped: "active", done: "active" }
    for (const [to, from] of Object.entries(FROM)) {
      for (const note of [undefined, "fresh"]) {
        if (note === undefined && (to === "paused" || to === "dropped")) continue
        const vault = vaultWith(effort({ status: from, status_note: "stale", status_since: "2026-01-01" }))
        const args = ["map-status", "r/e", to, ...(note ? ["--note", note] : [])]
        const day = onOneDay((day) => (assert.equal(run(vault, args).code, 0, `${from} → ${to}`), day))
        const fm = frontmatterOf(vault, "r/e/map.md")
        assert.match(fm, new RegExp(`^status_since: ${day}$`, "m"), `${from} → ${to}`)
        assert.doesNotMatch(fm, /stale/, `${from} → ${to}`)
        if (note) assert.match(fm, /^status_note: fresh$/m, `${from} → ${to} --note`)
        else assert.doesNotMatch(fm, /status_note/, `${from} → ${to}`)
      }
    }
  })

  test("unknown keys and key order survive byte-for-byte", () => {
    const text = "---\nkind: map\nzeta: keep me # yes\ntitle: T\nstatus: draft\nstatus_since: 2026-01-01\nruns: 3\n---\n\n## Destination\n\nThere.\n"
    const vault = vaultWith([{ path: "r/e/map.md", text }])
    const day = onOneDay((day) => (run(vault, ["map-status", "r/e", "active"]), day))
    assert.equal(
      read(vault, "r/e/map.md").split("\n## Tickets")[0],
      `---\nkind: map\nzeta: keep me # yes\ntitle: T\nstatus: active\nstatus_since: ${day}\nruns: 3\n---\n\n## Destination\n\nThere.\n`,
    )
  })
})

describe("wf map-status refuses", () => {
  test("active without a Destination, or with only the chart placeholder (exit 1)", () => {
    const fix = "write ## Destination in r/e/map.md, then rerun"
    refused(vaultWith(effort({ status: "draft" }, [], "# M\n\n## Notes\n\nx\n")), ["map-status", "r/e", "active"], 1, /r\/e has no ## Destination — a map goes active with one/, fix)
    refused(vaultWith(effort({ status: "draft" }, [], "# M\n\n## Destination\n\n\n## Notes\n")), ["map-status", "r/e", "active"], 1, /r\/e has no ## Destination/, fix)
    const charted = vaultWith(effort())
    assert.equal(run(charted, ["chart", "r/new", "--title", "T"]).code, 0)
    const placeholder = "write ## Destination in r/new/map.md, then rerun"
    refused(charted, ["map-status", "r/new", "active"], 1, /r\/new has no ## Destination/, placeholder)
  })

  test("the placeholder of any language counts as no Destination", () => {
    const vault = vaultWith(effort(), { config: { language: "th" } })
    assert.equal(run(vault, ["chart", "r/new", "--title", "T"]).code, 0)
    write(vault, "Wayfinder Config.md", "---\nkind: wayfinder-config\nlanguage: en\n---\n")
    git(vault, "commit", "-qam", "back to English")
    refused(vault, ["map-status", "r/new", "active"], 1, /r\/new has no ## Destination/)
  })

  test("done with a pending ticket (exit 1), naming every pending ticket", () => {
    const vault = vaultWith(
      effort({}, [
        ticket("r/e/issues/01-a.md", { status: "resolved" }),
        ticket("r/e/issues/02-b.md", { status: "claimed", claimed_by: "me" }),
        ticket("r/e/issues/03-c.md"),
      ]),
    )
    refused(vault, ["map-status", "r/e", "done"], 1, /r\/e has 2 pending tickets: r\/e#02 \(claimed\), r\/e#03 \(open\) — a map is done when none is open, claimed or waiting/, 'wf resolve r/e#02 --gist "…"')
  })

  test("done with an open ticket suggests resolving it out of scope", () => {
    const vault = vaultWith(effort({}, [ticket("r/e/issues/01-a.md", { status: "waiting", status_note: "x" }), ticket("r/e/issues/02-b.md")]))
    refused(vault, ["map-status", "r/e", "done"], 1, /2 pending tickets/, 'wf resolve r/e#01 --gist "…"')
    refused(vaultWith(effort({}, [ticket("r/e/issues/02-b.md")])), ["map-status", "r/e", "done"], 1, /1 pending ticket:/, 'wf resolve r/e#02 --out-of-scope --gist "…" (past the destination)')
  })

  test("a map already in the target status (exit 1)", () => {
    refused(vaultWith(effort()), ["map-status", "r/e", "active"], 1, /map r\/e is already active/, "nothing to do; wf lint r/e shows what the map needs")
    refused(vaultWith(effort({ status: "paused", status_note: "x" })), ["map-status", "r/e", "paused", "--note", "y"], 1, /map r\/e is already paused/)
    refused(vaultWith(effort({ status: "dropped", status_note: "x" })), ["map-status", "r/e", "dropped", "--note", "y"], 1, /map r\/e is already dropped/)
    refused(vaultWith(effort({ status: "done" })), ["map-status", "r/e", "done"], 1, /map r\/e is already done/)
  })

  test("done with a lint error in the effort (exit 1), and --force closes it anyway", () => {
    const unanswered = { ...ticket("r/e/issues/01-a.md", { status: "resolved" }), body: "## Answer\n\n(filled in at resolve)\n" }
    const vault = vaultWith(effort({}, [unanswered]))
    refused(vault, ["map-status", "r/e", "done"], 1, /r\/e has 1 lint error: r\/e#01 resolved-without-answer — a map is done when wf lint shows none/, "wf lint r/e")
    assert.equal(run(vault, ["map-status", "r/e", "done", "--force"]).code, 0)
    assert.match(frontmatterOf(vault, "r/e/map.md"), /^status: done$/m)
  })

  test("another effort's lint error doesn't stop done", () => {
    const other = [map("r/o/map.md"), { ...ticket("r/o/issues/01-a.md", { status: "resolved" }), body: "## Answer\n\n\n" }]
    const vault = vaultWith([...effort({}, [ticket("r/e/issues/01-a.md", { status: "resolved" })]), ...other])
    assert.equal(run(vault, ["map-status", "r/e", "done"]).code, 0)
  })

  test("a map whose status isn't a map status (exit 1)", () => {
    refused(vaultWith(effort({ status: "actve" })), ["map-status", "r/e", "done"], 1, /map r\/e has status "actve", which is not a map status/, "wf lint r/e")
  })

  test("an effort without a map (exit 1)", () => {
    refused(vaultWith(effort()), ["map-status", "r/none", "active"], 1, /r\/none has no map/, "wf chart r/none --title <title>")
  })

  test("--superseded-by naming no map (exit 1)", () => {
    refused(vaultWith(effort()), ["map-status", "r/e", "dropped", "--note", "x", "--superseded-by", "r/gone"], 1, /r\/gone has no map — --superseded-by names the map that replaces this one/, "wf chart r/gone --title <title>")
    refused(vaultWith(effort()), ["map-status", "r/e", "dropped", "--note", "x", "--superseded-by", "r/e"], 1, /r\/e can't supersede itself/)
  })

  test("usage errors (exit 2): no --note for paused/dropped, a bad status, --superseded-by off dropped", () => {
    const vault = vaultWith(effort())
    refused(vault, ["map-status", "r/e", "paused"], 2, /map-status paused needs --note "…"/)
    refused(vault, ["map-status", "r/e", "dropped"], 2, /map-status dropped needs --note "…"/)
    refused(vault, ["map-status", "r/e", "draft"], 2, /status must be one of active, paused, dropped, done, got "draft"/)
    refused(vault, ["map-status", "r/e", "done", "--superseded-by", "r/e"], 2, /--superseded-by goes with paused or dropped/)
    refused(vault, ["map-status", "r/e", "active", "--force"], 2, /--force goes with done/)
    refused(vault, ["map-status", "r/e", "dropped", "--note", "x", "--superseded-by", "r/e#01"], 2, /cannot read "r\/e#01" as an effort/)
    refused(vault, ["map-status", "r/e"], 2, /missing argument/)
    refused(vault, ["map-status", "r/e", "paused", "--note", "a\nb"], 2, /--note must be one line/)
  })
})

describe("wf bump-runs", () => {
  test("allocates runs+1 on a map without runs, and commits", () => {
    const vault = vaultWith(effort())
    const r = run(vault, ["bump-runs", "r/e", "--json"])
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.json.data.ref, "r/e")
    assert.deepEqual([r.json.data.from, r.json.data.to, r.json.data.runs], [1, 1, 1])
    assert.match(frontmatterOf(vault, "r/e/map.md"), /^runs: 1$/m)
    assert.deepEqual(lastCommit(vault), { subject: "wf(bump-runs): r/e", files: ["r/e/map.md"] })
  })

  test("--count k allocates runs+1 … runs+k and prints the range", () => {
    const vault = vaultWith(effort({ runs: 4 }))
    const r = run(vault, ["bump-runs", "r/e", "--count", "3"])
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stdout, /^r\/e runs 5–7/)
    assert.match(frontmatterOf(vault, "r/e/map.md"), /^runs: 7$/m)
  })

  test("leaves status, status_since and status_note alone", () => {
    const vault = vaultWith(effort({ status: "paused", status_note: "keep", runs: 2 }))
    const before = frontmatterOf(vault, "r/e/map.md")
    assert.equal(run(vault, ["bump-runs", "r/e"]).code, 0)
    assert.equal(frontmatterOf(vault, "r/e/map.md"), before.replace("runs: 2", "runs: 3"))
  })

  test("two bump-runs at once allocate disjoint ranges", async () => {
    const vault = vaultWith(effort({ runs: 10 }))
    const results = await Promise.all([runAsync(vault, ["bump-runs", "r/e", "--count", "2", "--json"]), runAsync(vault, ["bump-runs", "r/e", "--count", "3", "--json"])])
    for (const r of results) assert.equal(r.code, 0, r.stderr)
    const ranges = results.map((r) => [r.json.data.from, r.json.data.to]).sort((a, b) => a[0] - b[0])
    const allocated = ranges.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, i) => from + i))
    assert.deepEqual(allocated, [11, 12, 13, 14, 15])
    assert.match(frontmatterOf(vault, "r/e/map.md"), /^runs: 15$/m)
    assert.equal(git(vault, "status", "--porcelain"), "")
    assert.equal(git(vault, "rev-list", "--count", "HEAD"), "3")
  })

  test("a quoted runs counts; an empty one is 0", () => {
    const quoted = vaultWith(effort({ runs: "5" }))
    assert.match(run(quoted, ["bump-runs", "r/e"]).stdout, /^r\/e run 6/)
    assert.match(frontmatterOf(quoted, "r/e/map.md"), /^runs: 6$/m)
    const empty = vaultWith([{ path: "r/e/map.md", text: "---\nkind: map\ntitle: T\nstatus: active\nstatus_since: 2026-01-01\nruns:\n---\n" }])
    assert.match(run(empty, ["bump-runs", "r/e"]).stdout, /^r\/e run 1/)
  })

  test("refuses a runs value that isn't a whole number (exit 1)", () => {
    refused(vaultWith(effort({ runs: "lots" })), ["bump-runs", "r/e"], 1, /map r\/e has runs: "lots", which is not a whole number/, "wf lint r/e")
  })

  test("refuses an effort without a map (exit 1)", () => {
    refused(vaultWith(effort()), ["bump-runs", "r/none"], 1, /r\/none has no map/, "wf chart r/none --title <title>")
  })

  test("usage errors (exit 2): a --count that isn't a positive whole number", () => {
    const vault = vaultWith(effort())
    for (const count of ["0", "-1", "1.5", "two"]) refused(vault, ["bump-runs", "r/e", "--count", count], 2, /--count must be a whole number ≥ 1/)
    refused(vaultWith(effort({ runs: 3 })), ["bump-runs", "r/e", "--count", String(Number.MAX_SAFE_INTEGER)], 2, /takes runs past/)
  })
})

test("chart rolls back the new map when the commit fails", () => {
  const vault = vaultWith(effort())
  write(vault, ".git/hooks/pre-commit", "#!/bin/sh\nexit 1\n")
  chmodSync(join(vault, ".git/hooks/pre-commit"), 0o755)
  const r = run(vault, ["chart", "r/new", "--title", "T"])
  assert.equal(r.code, 2, r.stderr)
  assert.equal(existsSync(join(vault, "r/new/map.md")), false)
  assert.equal(git(vault, "status", "--porcelain"), "")
})
