// `wf lint` through the CLI against a fixture vault (spec *Verbs*: lint; Testing Decisions §1). The
// findings must be exactly the core's `lint()` over the same notes, filtered by the named efforts.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import * as core from "../template/_tools/lib/core.mjs"
import { makeVault, map, onOneDay, ticket, ticketsBlock, wf } from "./vault.mjs"

// Two efforts with findings of both severities, a map whose block matches the rendering, and a
// Picks typo. `notes` is what the core sees; the vault holds the same notes as files.
const scenario = () => {
  const healthy = [map("r/a/map.md"), ticket("r/a/issues/01-ok.md", { title: "OK" })]
  const block = core.renderTicketsBlock(core.buildIndex(healthy), "r/a", "en")
  const files = [
    { ...healthy[0], body: `# a\n\n${ticketsBlock(block)}` },
    healthy[1],
    ticket("r/a/issues/02-stale.md", { status: "claimed", status_since: "2020-01-01", claimed_by: "session:x" }),
    map("r/b/map.md"),
    ticket("r/b/issues/01-dangling.md", { blockers: ["[[09-missing]]"] }),
    ticket("r/b/issues/02-no-title.md", { title: undefined }),
  ].map((n) => ({ ...n, frontmatter: JSON.parse(JSON.stringify(n.frontmatter)) }))
  const notes = files.map(({ path, frontmatter, body }) =>
    path.endsWith("map.md") ? { path, frontmatter, ticketsBlock: body ? `\n${block}\n` : null } : { path, frontmatter },
  )
  const sort = ["unblocks desc", "nnn asc"]
  const config = { kind: "wayfinder-config", claim_stale_days: 3, language: "en" }
  return { vault: makeVault({ notes: files, picks: { sort }, config }), notes, sort, config }
}

const expected = ({ notes, sort, config }, today) => core.lint(core.buildIndex(notes), { today, config, sort })

// `wf lint …args --json` and the core's findings for the same day.
const lintBoth = (s, args) =>
  onOneDay((day) => ({ r: wf(s.vault, ["lint", ...args, "--json"]), all: expected(s, day) }))

describe("wf lint", () => {
  test("--json reports exactly the core's findings for the whole vault", () => {
    const { r, all: findings } = lintBoth(scenario(), [])
    assert.ok(findings.some((f) => f.severity === "error") && findings.some((f) => f.severity === "warn"))
    assert.ok(findings.some((f) => f.ref === "Wayfinder Picks"))
    const errors = findings.filter((f) => f.severity === "error").length
    assert.deepEqual(r.json, {
      ok: false,
      error: { code: 1, message: `lint found ${errors} errors`, details: [] },
      data: {
        findings,
        errors,
        warnings: findings.filter((f) => f.severity === "warn").length,
      },
    })
    assert.equal(r.code, 1, "error findings exit 1")
  })

  test("named efforts keep only their own findings", () => {
    const s = scenario()
    const ofEffort = (all, key) => all.filter((f) => f.ref === key || f.ref.startsWith(`${key}#`))
    const one = lintBoth(s, ["r/a"])
    assert.deepEqual(one.r.json.data.findings, ofEffort(one.all, "r/a"))
    const two = lintBoth(s, ["r/b/map.md", "[[r/a/map]]"])
    const both = [...ofEffort(two.all, "r/b"), ...ofEffort(two.all, "r/a")]
    assert.deepEqual(two.r.json.data.findings, two.all.filter((f) => both.includes(f)))
  })

  test("an effort that isn't in the vault is a usage error", () => {
    const r = wf(scenario().vault, ["lint", "r/nope"])
    assert.equal(r.code, 2)
    assert.match(r.stderr, /no effort r\/nope in the vault/)
  })

  test("prints one line per finding with its fix, then a count", () => {
    const vault = makeVault({
      notes: [
        { ...map("r/e/map.md"), body: ticketsBlock("- [[01-a]] · task · waiting · 01-a") },
        ticket("r/e/issues/01-a.md", { status: "waiting" }),
      ],
    })
    const r = wf(vault, ["lint"])
    assert.equal(r.code, 1)
    assert.equal(
      r.stdout,
      [
        "error  waiting-without-note  r/e#01  waiting without status_note — release it, then wait again with --note <note>",
        "       fix: wf release r/e#01",
        "1 error, 0 warnings",
        "",
      ].join("\n"),
    )
  })

  test("--json of a vault with only warnings is ok", () => {
    const r = wf(makeVault({ notes: [map("r/e/map.md"), ticket("r/e/issues/01-a.md")] }), ["lint", "--json"])
    assert.equal(r.code, 0)
    assert.equal(r.json.ok, true)
    assert.equal(r.json.error, null)
  })

  test("a file in issues/ without an NN- name reaches lint through the store", () => {
    const vault = makeVault({
      notes: [
        { ...map("r/e/map.md"), body: ticketsBlock("- [[01-a]] · task · open · 01-a") },
        ticket("r/e/issues/01-a.md"),
        ticket("r/e/issues/A-wizard.md", { status: "resolved" }),
      ],
    })
    const r = wf(vault, ["lint"])
    assert.equal(r.code, 0, r.stdout)
    assert.match(r.stdout, /^warn {2}unindexed-ticket {2}r\/e {2}r\/e\/issues\/A-wizard\.md is not read as a ticket/m)
  })

  test("a flood of one rule's warnings folds into one line; errors print last; --rule and --json keep all", () => {
    const keys = Object.fromEntries(Array.from({ length: core.WARN_FOLD_AT }, (_, i) => [`k${i}`, "x"]))
    const vault = makeVault({
      notes: [
        { ...map("r/e/map.md"), body: ticketsBlock("- [[01-a]] · task · waiting · 01-a") },
        ticket("r/e/issues/01-a.md", { status: "waiting", ...keys }),
      ],
    })
    const r = wf(vault, ["lint"])
    assert.equal(r.code, 1)
    assert.equal(
      r.stdout,
      [
        `warn   ${"unknown-key".padEnd("waiting-without-note".length)}  ${core.WARN_FOLD_AT} warnings in 1 effort — all of them: wf lint --rule unknown-key`,
        "error  waiting-without-note  r/e#01  waiting without status_note — release it, then wait again with --note <note>",
        "       fix: wf release r/e#01",
        `1 error, ${core.WARN_FOLD_AT} warnings`,
        "",
      ].join("\n"),
    )
    const all = wf(vault, ["lint", "--rule", "unknown-key"])
    assert.equal(all.code, 0)
    assert.equal(all.stdout.match(/^warn {2}unknown-key {2}r\/e#01 {2}unknown frontmatter key k\d$/gm).length, core.WARN_FOLD_AT)
    assert.equal(wf(vault, ["lint", "--json"]).json.data.findings.length, core.WARN_FOLD_AT + 1)
  })

  test("a vault with only warnings exits 0; a clean vault says so", () => {
    const warnOnly = makeVault({ notes: [map("r/e/map.md"), ticket("r/e/issues/01-a.md")] })
    const w = wf(warnOnly, ["lint"])
    assert.equal(w.code, 0)
    assert.match(w.stdout, /^warn {2}tickets-block-drift {2}r\/e {2}no generated ## Tickets block$/m)
    assert.match(w.stdout, /0 errors, 1 warning\n$/)

    const clean = makeVault({
      notes: [{ ...map("r/e/map.md"), body: ticketsBlock("- [[01-a]] · task · open · 01-a") }, ticket("r/e/issues/01-a.md")],
    })
    const c = wf(clean, ["lint"])
    assert.equal(c.code, 0, c.stdout)
    assert.equal(c.stdout, "lint clean\n")
  })
})

const BODY_RULES = new Set(["resolved-without-answer", "superseded-asset-linked", "issue-asset-name-clash"])

describe("wf lint reads bodies and assets", () => {
  test("an asset on disk, its superseded_by and the links to it reach the body rules", () => {
    const vault = makeVault({
      notes: [
        { ...map("r/e/map.md"), body: "## Sources of truth\n\n- [[02-spec]]\n" },
        { ...ticket("r/e/issues/01-a.md", { status: "resolved" }), body: "## Answer\n\n(filled in at resolve)\n" },
        { path: "r/e/assets/02-spec.md", frontmatter: { superseded_by: "[[r/e/assets/03-spec]]" }, body: "old\n" },
        { path: "r/e/assets/journey/01-a.md", frontmatter: {}, body: "" },
        // An asset's frontmatter is the author's: outside the YAML subset, it can't stop the read.
        { path: "r/e/assets/odd.md", text: "---\nk: {a: 1\n---\nsee [[02-spec]]\n" },
      ],
    })
    const r = wf(vault, ["lint", "r/e", "--json"])
    assert.equal(r.code, 1, r.stderr)
    assert.deepEqual(
      r.json.data.findings.filter((f) => BODY_RULES.has(f.rule)).map((f) => [f.rule, f.ref, f.message.split(" ")[0]]),
      [
        ["resolved-without-answer", "r/e#01", "resolved,"],
        ["superseded-asset-linked", "r/e", "r/e/assets/odd.md"],
        ["superseded-asset-linked", "r/e", "r/e/map.md"],
        ["issue-asset-name-clash", "r/e#01", "r/e/issues/01-a.md"],
      ],
    )
  })
})
