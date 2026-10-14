// `wf migrate` against a scrubbed snapshot of a real vault (spec Testing Decisions §3): a golden plan
// diff, `--plan` changing nothing, the state after `--yes`, the frontier against the old pages' rule, and
// a second run planning nothing.
//
// The snapshot (test/fixtures/migrate-snapshot/) is made by test/scrub-vault.mjs from a real vault; the
// raw vault is never committed. To rebuild it and the golden diff:
//   node test/scrub-vault.mjs <vault> test/fixtures/migrate-snapshot
//   UPDATE_GOLDEN=1 node --test test/wf-migrate-snapshot.test.mjs
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { cpSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { BLOCK_OPEN, CONFIG_DEFAULTS, formatRef, parseRef } from "../template/_tools/lib/core.mjs"
import { parseNote } from "../template/_tools/lib/frontmatter.mjs"
import { leaksIn } from "./scrub-vault.mjs"
import { git, makeVault, read, seed, wf } from "./vault.mjs"

const SNAPSHOT = fileURLToPath(new URL("./fixtures/migrate-snapshot/", import.meta.url))
const GOLDEN = fileURLToPath(new URL("./fixtures/migrate-snapshot.plan.diff", import.meta.url))
// The tickets whose old `repo` names another repo, plus the one that already says `target_repo`.
const CROSS_REPO_TICKETS = 34
const IDENTITY_RULES = new Set(["legacy-field", "missing-field", "tickets-block-drift"])
const HAND_TICKETS_RE = /^#{2,3}\s+Tickets\b/m

const filesUnder = (dir, rel = "") =>
  readdirSync(join(dir, rel)).flatMap((name) => {
    const path = rel ? `${rel}/${name}` : name
    return statSync(join(dir, path)).isDirectory() ? filesUnder(dir, path) : [path]
  })

const SNAPSHOT_FILES = filesUnder(SNAPSHOT).sort()
const isTicketPath = (path) => parseRef(path)?.nn != null
const isMapPath = (path) => path.endsWith("/map.md")

// The snapshot's notes before migration: `{ path, frontmatter, body }`.
const before = SNAPSHOT_FILES.filter((p) => isTicketPath(p) || isMapPath(p)).map((path) => ({
  path,
  ...parseNote(readFileSync(join(SNAPSHOT, path), "utf8")),
}))
const refOf = (path) => formatRef(parseRef(path))

const snapshotVault = () => {
  const vault = makeVault({ manifest: null })
  cpSync(SNAPSHOT, vault, { recursive: true })
  return seed(vault)
}

const migratedVault = () => {
  const vault = snapshotVault()
  const r = wf(vault, ["migrate", "--yes"])
  assert.equal(r.code, 0, r.stderr)
  return vault
}

const asList = (value) => (value == null ? [] : Array.isArray(value) ? value : [value])

/**
 * The frontier as the 0.4.x pages computed it: open tickets whose map — found at the frontmatter's
 * `repo + "/" + effort + "/map"` — is active, and whose every blocker resolves to a resolved ticket.
 */
const oldFrontier = (notes) => {
  const byPath = new Map(notes.map((n) => [n.path, n.frontmatter]))
  const isResolved = (dir, raw) => {
    const target = /^\[\[([^\]|#]+)/.exec(String(raw).trim())?.[1]
    if (!target) return false
    const path = target.includes("/") ? `${target}.md` : `${dir}/${target}.md`
    return byPath.get(path)?.status === "resolved"
  }
  return notes
    .filter((n) => isTicketPath(n.path) && n.frontmatter.status === "open")
    .filter((n) => {
      const fm = n.frontmatter
      if (byPath.get(`${fm.repo}/${fm.effort}/map.md`)?.status !== "active") return false
      const dir = n.path.slice(0, n.path.lastIndexOf("/"))
      return asList(fm.blockers).every((b) => isResolved(dir, b))
    })
    .map((n) => refOf(n.path))
}

describe("wf migrate — the scrubbed snapshot", () => {
  test("the snapshot is neutral: no word outside the scrubbed vocabulary", () => {
    const notes = Object.fromEntries(SNAPSHOT_FILES.filter((p) => p.endsWith(".md")).map((p) => [p, readFileSync(join(SNAPSHOT, p), "utf8")]))
    assert.deepEqual(leaksIn(notes, []), [])
    for (const path of SNAPSHOT_FILES.filter((p) => !p.startsWith("Wayfinder ") && !p.startsWith(".")))
      assert.match(path, /^repo-[a-z]+\/effort-\d+\/(map\.md|issues\/\d+-slug-\d+\.md)$/)
  })

  test("--plan prints the golden diff and changes nothing on disk", () => {
    const vault = snapshotVault()
    const head = git(vault, "rev-parse", "HEAD")
    const r = wf(vault, ["migrate", "--plan"])
    assert.equal(r.code, 0, r.stderr)
    if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, r.stdout)
    assert.equal(r.stdout, readFileSync(GOLDEN, "utf8"))
    assert.equal(git(vault, "rev-parse", "HEAD"), head)
    assert.equal(git(vault, "status", "--porcelain", "--untracked-files=all"), "")
  })

  test("after --yes: no identity-class findings, target_repo on exactly the cross-repo tickets", () => {
    const vault = migratedVault()
    const lint = wf(vault, ["lint", "--json"])
    assert.deepEqual(lint.json.data.findings.filter((f) => IDENTITY_RULES.has(f.rule)), [])
    const expected = before
      .filter((n) => isTicketPath(n.path))
      .filter((n) => (n.frontmatter.repo != null && n.frontmatter.repo !== parseRef(n.path).repo) || n.frontmatter.target_repo != null)
      .map((n) => n.path)
    const actual = before.filter((n) => isTicketPath(n.path) && parseNote(read(vault, n.path)).frontmatter.target_repo != null).map((n) => n.path)
    assert.deepEqual(actual, expected)
    assert.equal(actual.length, CROSS_REPO_TICKETS)
  })

  test("after --yes: every map has its generated block, and a hand-written list folded under it", () => {
    const vault = migratedVault()
    for (const m of before.filter((n) => isMapPath(n.path))) {
      const text = read(vault, m.path)
      assert.ok(text.includes(BLOCK_OPEN), `${m.path} has the generated block`)
      const wasHandWritten = HAND_TICKETS_RE.test(m.body) && !m.body.includes(BLOCK_OPEN)
      assert.equal(text.includes("> [!quote]- รายการเดิม (ก่อน wf)"), wasHandWritten, `${m.path} folds its original list`)
    }
  })

  test("after --yes: Picks has sort: and the loader body, Config has every key", () => {
    const vault = migratedVault()
    const picks = parseNote(read(vault, "Wayfinder Picks.md"))
    assert.deepEqual(picks.frontmatter.sort, ["nn asc"])
    assert.doesNotMatch(picks.body, /^```dataview\s*$/m)
    assert.match(picks.body, /^await dv\.view\("_tools\/views\/picks"\)$/m)
    const config = parseNote(read(vault, "Wayfinder Config.md")).frontmatter
    for (const key of Object.keys(CONFIG_DEFAULTS)) assert.ok(config[key] != null, key)
  })

  test("the frontier after migration equals the old rule's wherever the old pages agreed", () => {
    const vault = migratedVault()
    const agreed = new Set(
      before
        .filter((n) => isTicketPath(n.path))
        .filter((n) => n.frontmatter.repo === parseRef(n.path).repo && n.frontmatter.effort === parseRef(n.path).effort)
        .map((n) => refOf(n.path)),
    )
    const now = wf(vault, ["frontier", "--json"]).json.data.tickets.map((t) => t.ref)
    const old = oldFrontier(before)
    assert.deepEqual(now.filter((r) => agreed.has(r)).sort(), old.filter((r) => agreed.has(r)).sort())
    assert.ok(now.length > 0, "the snapshot has a frontier")
    // Where they disagreed, the old pages lost workable tickets (their map was looked up under the wrong repo).
    assert.ok(now.some((r) => !agreed.has(r) && !old.includes(r)), "a ticket the old pages lost is back")
  })

  test("a second run plans nothing", () => {
    const vault = migratedVault()
    const r = wf(vault, ["migrate"])
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.stdout, "nothing to migrate — the vault is at vault schema 2\n")
  })
})
