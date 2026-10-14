// Every lint rule through the core's `lint()`: pure, in-memory `notes`, one note set that triggers
// the rule and one that doesn't (spec docs/specs/ticket-store.md, *Lint rules*, Testing Decisions §2).
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import * as core from "../template/_tools/lib/core.mjs"
import { TODAY, map, ticket } from "./fixture.mjs"

const lint = (notes, opts = {}) => core.lint(core.buildIndex(notes), { today: TODAY, ...opts })
const ofRule = (findings, rule) => findings.filter((f) => f.rule === rule)

// One active map with one open ticket: the smallest vault that is lint clean.
const clean = () => [map("r/e/map.md"), ticket("r/e/issues/01-a.md")]

describe("lint", () => {
  test("a healthy vault has no findings", () => {
    assert.deepEqual(lint(clean()), [])
  })

  test("invalid enum value is an error naming the field and the allowed values", () => {
    const [f, ...rest] = lint([map("r/e/map.md"), ticket("r/e/issues/01-a.md", { type: "chore" })])
    assert.deepEqual(rest, [])
    assert.equal(f.severity, "error")
    assert.equal(f.rule, "invalid-value")
    assert.equal(f.ref, "r/e#01")
    assert.match(f.message, /type.*"chore".*research \| prototype \| grilling \| task/)
    assert.equal(f.fix, null)
  })
})

describe("schema rules (error)", () => {
  test("a malformed date or a list where a scalar belongs is an invalid value", () => {
    const findings = lint([
      map("r/e/map.md", { runs: "three" }),
      ticket("r/e/issues/01-a.md", { status_since: "last week", title: ["a", "b"] }),
    ])
    assert.deepEqual(
      ofRule(findings, "invalid-value").map((f) => [f.ref, f.message.split(" ")[0]]),
      [["r/e", "runs"], ["r/e#01", "status_since"], ["r/e#01", "title"]],
    )
    assert.deepEqual(lint([map("r/e/map.md", { runs: 3 }), ...clean().slice(1)]), [])
  })

  test("missing required field — per kind, and per status where the schema says so", () => {
    const { title: _t, ...noTitle } = ticket("r/e/issues/01-a.md").frontmatter
    const findings = lint([
      map("r/e/map.md", { status: "paused" }),
      { path: "r/e/issues/01-a.md", frontmatter: noTitle },
      ticket("r/e/issues/02-b.md", { status: "claimed", blockers: null }),
    ])
    assert.deepEqual(
      ofRule(findings, "missing-field").map((f) => [f.severity, f.ref, f.message]),
      [
        ["error", "r/e", "status_note is required when status is paused"],
        ["error", "r/e#01", "title is required"],
        ["error", "r/e#02", "blockers is required"],
        ["error", "r/e#02", "claimed_by is required when status is claimed"],
      ],
    )
    assert.deepEqual(ofRule(lint(clean()), "missing-field"), [])
  })

  test("blockers: [] is present, not missing", () => {
    assert.deepEqual(lint([map("r/e/map.md"), ticket("r/e/issues/01-a.md", { blockers: [] })]), [])
  })

  test("a map.md without kind: map in an effort that has tickets is missing kind", () => {
    const findings = lint([{ path: "r/e/map.md", frontmatter: { title: "m" } }, ticket("r/e/issues/01-a.md")])
    assert.deepEqual(
      ofRule(findings, "missing-field").map((f) => [f.ref, f.message]),
      [["r/e", "kind: map is required — r/e/map.md is not read as a map"]],
    )
    // Outside an effort that has tickets, any `…/x/map.md` may be an ordinary note.
    assert.deepEqual(lint([...clean(), { path: "r/notes/map.md", frontmatter: {} }]), [])
  })

  test("waiting without status_note has its own rule, fixed by release", () => {
    const findings = lint([map("r/e/map.md"), ticket("r/e/issues/01-a.md", { status: "waiting" })])
    assert.deepEqual(findings, [
      {
        severity: "error",
        rule: "waiting-without-note",
        ref: "r/e#01",
        message: "waiting without status_note — release it, then wait again with --note <note>",
        fix: "wf release r/e#01",
      },
    ])
    const ok = [map("r/e/map.md"), ticket("r/e/issues/01-a.md", { status: "waiting", status_note: "owner" })]
    assert.deepEqual(lint(ok), [])
  })

  test("YAML outside the subset: a nested map, or a list holding a list or map", () => {
    const findings = lint([
      map("r/e/map.md", { repos: [["x"]] }),
      ticket("r/e/issues/01-a.md", { extra: { nested: 1 } }),
    ])
    assert.deepEqual(
      ofRule(findings, "yaml-subset").map((f) => [f.severity, f.ref, f.message]),
      [
        ["error", "r/e", "repos is outside the YAML subset (flat scalars and lists of strings)"],
        ["error", "r/e#01", "extra is outside the YAML subset (flat scalars and lists of strings)"],
      ],
    )
  })

  test("Date and Luxon values are scalars, not nested maps", () => {
    const luxon = { toISODate: () => "2026-10-10" }
    const notes = [map("r/e/map.md", { status_since: luxon }), ticket("r/e/issues/01-a.md", { status_since: new Date(Date.UTC(2026, 9, 10)) })]
    assert.deepEqual(lint(notes), [])
  })
})

describe("key rules (warn)", () => {
  test("a file in issues/ whose name doesn't start with NN- is reported, not silently dropped", () => {
    const stray = (path) => ({ path, frontmatter: { type: "task", status: "resolved", title: "x" } })
    const findings = lint([...clean(), stray("r/e/issues/A-wizard.md"), stray("r/e/issues/05a-split.md")])
    assert.deepEqual(
      ofRule(findings, "unindexed-ticket").map((f) => [f.severity, f.ref, f.message, f.fix]),
      [
        ["warn", "r/e", "r/e/issues/05a-split.md is not read as a ticket — rename it NN-slug.md to index it", null],
        ["warn", "r/e", "r/e/issues/A-wizard.md is not read as a ticket — rename it NN-slug.md to index it", null],
      ],
    )
    // Only `.md` files directly in an effort's `issues/` are tickets; anything else is an ordinary note.
    assert.deepEqual(lint([...clean(), stray("r/e/issues/img/a.md"), stray("_tpl/e/issues/a.md"), stray("r/e/notes.md")]), [])
  })

  test("an unknown frontmatter key is a warn", () => {
    const findings = lint([map("r/e/map.md", { colour: "red" }), ticket("r/e/issues/01-a.md", { priority: 1 })])
    assert.deepEqual(
      findings.map((f) => [f.severity, f.rule, f.ref, f.message, f.fix]),
      [
        ["warn", "unknown-key", "r/e", "unknown frontmatter key colour", null],
        ["warn", "unknown-key", "r/e#01", "unknown frontmatter key priority", null],
      ],
    )
  })

  test("legacy repo/effort fields say to run wf migrate, and aren't also unknown keys", () => {
    const hint = "identity comes from the path; preview with wf migrate"
    const findings = lint([map("r/e/map.md", { repo: "r" }), ticket("r/e/issues/01-a.md", { repo: "r", effort: "e" })])
    assert.deepEqual(
      findings.map((f) => [f.severity, f.rule, f.ref, f.message, f.fix]),
      [
        ["warn", "legacy-field", "r/e", `legacy field repo — ${hint}`, "wf migrate --yes"],
        ["warn", "legacy-field", "r/e#01", `legacy field effort — ${hint}`, "wf migrate --yes"],
        ["warn", "legacy-field", "r/e#01", `legacy field repo — ${hint}`, "wf migrate --yes"],
      ],
    )
  })
})

describe("blocker and identity rules (error)", () => {
  test("a ticket blocker that doesn't resolve is dangling, fixed by removing the edge", () => {
    const findings = lint([map("r/e/map.md"), ticket("r/e/issues/01-a.md", { blockers: ["[[99-missing]]"] })])
    assert.deepEqual(findings, [
      {
        severity: "error",
        rule: "dangling-blocker",
        ref: "r/e#01",
        message: 'blocker "[[99-missing]]" resolves to no ticket',
        fix: 'wf block r/e#01 "[[99-missing]]" --remove',
      },
    ])
    assert.deepEqual(lint([map("r/e/map.md"), ticket("r/e/issues/01-a.md"), ticket("r/e/issues/02-b.md", { blockers: ["[[01-a]]"] })]), [])
  })

  test("a map blocked_by that doesn't resolve is dangling too (no verb edits blocked_by)", () => {
    const findings = lint([map("r/e/map.md", { blocked_by: "[[r/gone/map]]" }), ticket("r/e/issues/01-a.md")])
    assert.deepEqual(
      findings.map((f) => [f.severity, f.rule, f.ref, f.message, f.fix]),
      [["error", "dangling-blocker", "r/e", 'blocked_by "[[r/gone/map]]" resolves to no map or ticket', null]],
    )
  })

  test("a blocker cycle is reported once, at its first ref, naming the whole loop", () => {
    const findings = lint([
      map("r/e/map.md"),
      ticket("r/e/issues/01-a.md", { blockers: ["[[03-c]]"] }),
      ticket("r/e/issues/02-b.md", { blockers: ["[[01-a]]"] }),
      ticket("r/e/issues/03-c.md", { blockers: ["[[02-b]]"] }),
      ticket("r/e/issues/04-d.md", { blockers: ["[[04-d]]"] }),
      ticket("r/e/issues/05-e.md", { blockers: ["[[01-a]]"] }),
    ])
    assert.deepEqual(
      ofRule(findings, "blocker-cycle").map((f) => [f.severity, f.ref, f.message, f.fix]),
      [
        ["error", "r/e#01", "blocker cycle r/e#01 → r/e#03 → r/e#02 → r/e#01", "wf block r/e#01 r/e#03 --remove"],
        ["error", "r/e#04", "blocker cycle r/e#04 → r/e#04", "wf block r/e#04 r/e#04 --remove"],
      ],
    )
  })

  test("a duplicate NN in an effort names the extra file", () => {
    const findings = lint([map("r/e/map.md"), ticket("r/e/issues/01-a.md"), ticket("r/e/issues/01-b.md")])
    assert.deepEqual(
      findings.map((f) => [f.severity, f.rule, f.ref, f.message, f.fix]),
      [["error", "duplicate-nn", "r/e#01", "r/e/issues/01-b.md reuses NN 01 (kept r/e/issues/01-a.md)", null]],
    )
  })
})

const summary = (findings) => findings.map((f) => [f.severity, f.rule, f.ref, f.message, f.fix])

describe("map state rules", () => {
  test("a done map with pending tickets is an error, fixed by reopening the map", () => {
    const findings = lint([
      map("r/e/map.md", { status: "done", status_since: "2026-10-12" }),
      ticket("r/e/issues/01-a.md"),
      ticket("r/e/issues/02-b.md", { status: "resolved" }),
    ])
    assert.deepEqual(summary(findings), [
      ["error", "done-map-pending", "r/e", "done, but 1 ticket is still pending: r/e#01", "wf map-status r/e active"],
    ])
    const allResolved = [map("r/e/map.md", { status: "done", status_since: "2026-10-12" }), ticket("r/e/issues/01-a.md", { status: "resolved" })]
    assert.deepEqual(lint(allResolved), [])
  })

  test("a paused, dropped or done map whose tickets moved after status_since is lying", () => {
    const moved = (status) => [
      map("r/e/map.md", { status, status_since: "2026-10-05", status_note: "n" }),
      ticket("r/e/issues/01-a.md", { status: "resolved", status_since: "2026-10-09" }),
      ticket("r/e/issues/02-b.md", { status: "resolved", status_since: "2026-10-11" }),
    ]
    for (const status of ["paused", "dropped", "done"]) {
      assert.deepEqual(summary(lint(moved(status))), [
        ["warn", "lying-map-status", "r/e", `${status} since 2026-10-05, but r/e#02 moved on 2026-10-11`, "wf map-status r/e active"],
      ])
    }
    const still = [
      map("r/e/map.md", { status: "paused", status_since: "2026-10-12", status_note: "n" }),
      ticket("r/e/issues/01-a.md"),
    ]
    assert.deepEqual(lint(still), [])
  })

  test("an active map idle for more than stale_days is a warn, unless every pending ticket is waiting", () => {
    const idle = [map("r/e/map.md", { status_since: "2026-09-01" }), ticket("r/e/issues/01-a.md", { status_since: "2026-09-01" })]
    assert.deepEqual(summary(lint(idle)), [
      ["warn", "idle-map", "r/e", "active, but nothing moved for 43 days (stale_days 14)", 'wf map-status r/e paused --note <note>'],
    ])
    assert.deepEqual(lint(idle, { config: { stale_days: 60 } }), [])
    const waiting = [
      map("r/e/map.md", { status_since: "2026-09-01" }),
      ticket("r/e/issues/01-a.md", { status: "waiting", status_since: "2026-09-01", status_note: "owner" }),
    ]
    assert.deepEqual(lint(waiting), [])
  })

  test("a map paused for more than paused_stale_days is a warn", () => {
    const paused = [
      map("r/e/map.md", { status: "paused", status_since: "2026-08-01", status_note: "later" }),
      ticket("r/e/issues/01-a.md", { status_since: "2026-07-01" }),
    ]
    assert.deepEqual(summary(lint(paused)), [
      ["warn", "stale-paused-map", "r/e", "paused for 74 days (paused_stale_days 30) — resume or drop it", 'wf map-status r/e dropped --note <note>'],
    ])
    assert.deepEqual(lint(paused, { config: { paused_stale_days: 90 } }), [])
  })

  test("an active map whose tickets are all resolved should be done", () => {
    const finished = [map("r/e/map.md"), ticket("r/e/issues/01-a.md", { status: "resolved" })]
    assert.deepEqual(summary(lint(finished)), [
      ["warn", "map-finished", "r/e", "active with no pending tickets → done", "wf map-status r/e done"],
    ])
    // A map with no tickets yet isn't finished — it hasn't started.
    assert.deepEqual(lint([map("r/e/map.md")]), [])
  })

  test("a map blocked_by that cleared or can never clear is a warn; one still waiting is not", () => {
    const blockedOn = (status, owner) => [
      map("r/a/map.md", { blocked_by: "[[r/b/issues/01-x]]", status_since: "2026-09-01" }),
      ticket("r/a/issues/01-a.md", { status_since: "2026-09-01" }),
      map("r/b/map.md", { status: owner, status_note: "n" }),
      ticket("r/b/issues/01-x.md", { status }),
    ]
    assert.deepEqual(summary(lint(blockedOn("resolved", "active"))), [
      ["warn", "map-blocked-by", "r/a", "blocked_by r/b#01 has cleared — remove blocked_by", null],
      ["warn", "map-finished", "r/b", "active with no pending tickets → done", "wf map-status r/b done"],
    ])
    assert.deepEqual(summary(ofRule(lint(blockedOn("open", "paused")), "map-blocked-by")), [
      ["warn", "map-blocked-by", "r/a", "blocked_by r/b#01 sits in a paused or dropped map and can't clear", null],
    ])
    assert.deepEqual(ofRule(lint(blockedOn("open", "active")), "map-blocked-by"), [])
  })
})

describe("ticket time rules (warn)", () => {
  test("a claim older than claim_stale_days is stale, fixed by release", () => {
    const claimed = [
      map("r/e/map.md", { status_since: "2026-10-13" }),
      ticket("r/e/issues/01-a.md", { status: "claimed", status_since: "2026-10-01", claimed_by: "session:ab12" }),
    ]
    assert.deepEqual(summary(lint(claimed)), [
      ["warn", "stale-claim", "r/e#01", "claimed by session:ab12 for 13 days (claim_stale_days 3)", "wf release r/e#01"],
    ])
    assert.deepEqual(lint(claimed, { config: { claim_stale_days: 20 } }), [])
  })

  test("a waiting ticket past wait_until is overdue", () => {
    const waiting = (until) => [
      map("r/e/map.md"),
      ticket("r/e/issues/01-a.md", { status: "waiting", status_note: "owner", wait_until: until }),
    ]
    assert.deepEqual(summary(lint(waiting("2026-10-12"))), [
      ["warn", "overdue-wait", "r/e#01", "wait_until 2026-10-12 passed 2 days ago", "wf release r/e#01"],
    ])
    assert.deepEqual(lint(waiting("2026-10-14")), [])
  })
})

describe("## Tickets block drift (warn)", () => {
  const withBlock = (ticketsBlock, status = "open") => [
    { ...map("r/e/map.md"), ticketsBlock },
    ticket("r/e/issues/01-a.md", { status, title: "First" }),
  ]

  test("a block equal to the rendering is clean, ignoring outer whitespace and CRLF", () => {
    assert.deepEqual(lint(withBlock("- [[01-a]] · task · open · First")), [])
    assert.deepEqual(lint(withBlock("\r\n- [[01-a]] · task · open · First\r\n")), [])
  })

  test("a block that differs from the rendering is drift, fixed by wf lint --fix", () => {
    assert.deepEqual(summary(lint(withBlock("- [[01-a]] · task · open · First", "claimed"))).filter((f) => f[1] === "tickets-block-drift"), [
      ["warn", "tickets-block-drift", "r/e", "## Tickets block differs from the rendering", "wf lint --fix r/e"],
    ])
  })

  test("markers missing (null) is drift; a block the caller didn't read (absent) isn't checked", () => {
    assert.deepEqual(summary(lint(withBlock(null))), [
      ["warn", "tickets-block-drift", "r/e", "no generated ## Tickets block", "wf lint --fix r/e"],
    ])
    assert.deepEqual(lint([map("r/e/map.md"), ticket("r/e/issues/01-a.md")]), [])
  })

  test("the rendering follows config.language", () => {
    const empty = [{ ...map("r/e/map.md"), ticketsBlock: "_No tickets yet._" }]
    assert.deepEqual(lint(empty), [])
    assert.deepEqual(ofRule(lint(empty, { config: { language: "th" } }), "tickets-block-drift").length, 1)
  })
})

describe("pick sort (error)", () => {
  test("an unknown Picks sort key is an error on Wayfinder Picks", () => {
    assert.deepEqual(summary(lint(clean(), { sort: ["unblocks desc", "priority asc"] })), [
      ["error", "unknown-sort-key", "Wayfinder Picks", 'unknown sort rule "priority asc" — keys: unblocks, afk_first, same_effort, nn', null],
    ])
    assert.deepEqual(lint(clean(), { sort: ["afk_first", "nn desc"] }), [])
    assert.deepEqual(lint(clean(), { sort: undefined }), [])
  })
})

describe("finding order", () => {
  const mixed = [
    map("r/b/map.md", { status_since: "2026-09-01" }),
    ticket("r/b/issues/01-x.md", { status_since: "2026-09-01", priority: 2 }),
    map("r/a/map.md"),
    ticket("r/a/issues/02-b.md", { status: "claimed", status_since: "2026-10-01", claimed_by: "s" }),
    ticket("r/a/issues/01-a.md", { type: "chore", blockers: ["[[09-gone]]"] }),
  ]

  test("errors before warns, then by ref, then rule", () => {
    assert.deepEqual(
      lint(mixed).map((f) => [f.severity, f.ref, f.rule]),
      [
        ["error", "r/a#01", "dangling-blocker"],
        ["error", "r/a#01", "invalid-value"],
        ["warn", "r/a#02", "stale-claim"],
        ["warn", "r/b", "idle-map"],
        ["warn", "r/b#01", "unknown-key"],
      ],
    )
  })

  test("the same notes in any order give the same findings", () => {
    assert.deepEqual(lint([...mixed].reverse()), lint(mixed))
  })

  test("lint refuses to guess today", () => {
    assert.throws(() => core.lint(core.buildIndex(mixed), {}), /today/)
  })
})

describe("review edge cases", () => {
  test("overlapping cycles are one strongly connected group, reported once with every member", () => {
    const findings = lint([
      map("r/e/map.md"),
      ticket("r/e/issues/01-a.md", { blockers: ["[[02-b]]"] }),
      ticket("r/e/issues/02-b.md", { blockers: ["[[01-a]]", "[[03-c]]"] }),
      ticket("r/e/issues/03-c.md", { blockers: ["[[02-b]]"] }),
    ])
    assert.deepEqual(summary(ofRule(findings, "blocker-cycle")), [
      [
        "error",
        "blocker-cycle",
        "r/e#01",
        "blocker cycle r/e#01 → r/e#02 → r/e#01 (cycle group: r/e#01, r/e#02, r/e#03)",
        "wf block r/e#01 r/e#02 --remove",
      ],
    ])
  })

  test("malformed blockers are reported once, by the shape rule", () => {
    const nested = lint([map("r/e/map.md"), ticket("r/e/issues/01-a.md", { blockers: [["01-x"]] })])
    assert.deepEqual(nested.map((f) => f.rule), ["yaml-subset"])
    const listBlockedBy = lint([map("r/e/map.md", { blocked_by: ["[[r/x/map]]"] }), ticket("r/e/issues/01-a.md")])
    assert.deepEqual(listBlockedBy.map((f) => f.rule), ["invalid-value"])
  })

  test("a dangling blocker that isn't a wikilink has no fix command", () => {
    const [f] = lint([map("r/e/map.md"), ticket("r/e/issues/01-a.md", { blockers: ["01-x"] })])
    assert.deepEqual([f.rule, f.fix], ["dangling-blocker", null])
  })

  test("fix commands carry no placeholder that would pass validation if run verbatim", () => {
    const findings = lint([
      map("r/e/map.md", { status_since: "2026-09-01" }),
      ticket("r/e/issues/01-a.md", { status: "waiting", status_since: "2026-09-01" }),
      ticket("r/e/issues/02-b.md", { status_since: "2026-09-01" }),
      map("r/p/map.md", { status: "paused", status_since: "2026-07-01", status_note: "n" }),
    ])
    const fixes = findings.map((f) => f.fix).filter(Boolean)
    assert.ok(fixes.length >= 3)
    for (const fix of fixes) {
      assert.doesNotMatch(fix, /&&|"…"/, fix)
      assert.match(fix, /^wf [a-z-]+( |$)/, fix)
    }
  })

  test("every fix verb is a transition the schema allows from the note's current status", () => {
    const notes = [
      map("r/a/map.md", { status: "done", status_since: "2026-10-12" }),
      ticket("r/a/issues/01-a.md"),
      map("r/b/map.md", { status_since: "2026-09-01" }),
      ticket("r/b/issues/01-a.md", { status: "claimed", status_since: "2026-09-01", claimed_by: "s" }),
      ticket("r/b/issues/02-b.md", { status: "waiting", status_since: "2026-09-01" }),
      ticket("r/b/issues/03-c.md", { status: "waiting", status_note: "n", wait_until: "2026-10-01", status_since: "2026-09-01" }),
      map("r/c/map.md", { status: "paused", status_since: "2026-07-01", status_note: "n" }),
      ticket("r/c/issues/01-a.md", { status: "resolved", status_since: "2026-08-01" }),
      map("r/d/map.md"),
      ticket("r/d/issues/01-a.md", { status: "resolved" }),
    ]
    const index = core.buildIndex(notes)
    const findings = core.lint(index, { today: TODAY })
    const checked = findings.filter((f) => /^wf (release|map-status) /.test(f.fix ?? ""))
    assert.ok(checked.length >= 6, `checked ${checked.length}`)
    for (const f of checked) {
      const [, verb, ref, to] = f.fix.split(" ")
      const isMap = verb === "map-status"
      const note = isMap ? index.maps.get(ref) : index.tickets.get(ref)
      assert.ok(core.findTransition(isMap ? "map" : "ticket", verb, note.status, { to: isMap ? to : undefined }), f.fix)
    }
  })

  test("a ticket with an unknown status doesn't make its map look finished", () => {
    const findings = lint([map("r/e/map.md"), ticket("r/e/issues/01-a.md", { status: null })])
    assert.deepEqual(findings.map((f) => f.rule), ["missing-field"])
  })

  test('blocked_by: "" is no blocker at all', () => {
    assert.deepEqual(lint([map("r/e/map.md", { blocked_by: "" }), ticket("r/e/issues/01-a.md")]), [])
  })

  test("a nested value under an unknown key is reported once, as yaml-subset", () => {
    const findings = lint([map("r/e/map.md"), ticket("r/e/issues/01-a.md", { extra: { nested: 1 } })])
    assert.deepEqual(findings.map((f) => f.rule), ["yaml-subset"])
  })

  test("a title with trailing spaces doesn't make the block drift forever", () => {
    const notes = [{ ...map("r/e/map.md"), ticketsBlock: "- [[01-a]] · task · open · First" }, ticket("r/e/issues/01-a.md", { title: "First  " })]
    assert.deepEqual(lint(notes), [])
  })

  test("legacy fields are fixed by applying the migration", () => {
    const [f] = lint([map("r/e/map.md"), ticket("r/e/issues/01-a.md", { repo: "r" })])
    assert.deepEqual([f.rule, f.fix], ["legacy-field", "wf migrate --yes"])
    assert.match(f.message, /preview with wf migrate/)
  })

  test("a ticket that moved on the map's own status_since day isn't lying", () => {
    for (const status of ["paused", "dropped", "done"]) {
      const notes = [
        map("r/e/map.md", { status, status_since: "2026-10-10", status_note: "n" }),
        ticket("r/e/issues/01-a.md", { status: "resolved", status_since: "2026-10-10" }),
      ]
      assert.deepEqual(lint(notes), [], status)
    }
  })

  test("a done map with a pending ticket that moved later is one error, not also lying", () => {
    const notes = [map("r/e/map.md", { status: "done", status_since: "2026-10-05" }), ticket("r/e/issues/01-a.md", { status_since: "2026-10-12" })]
    assert.deepEqual(lint(notes).map((f) => f.rule), ["done-map-pending"])
  })
})
