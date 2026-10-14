// `wf migrate` through the CLI against small fixture vaults (spec *`wf migrate` (Q28, Q29)*, Testing
// Decisions §1): the plan is a unified diff that writes nothing; `--yes` takes tickets, maps, *Wayfinder
// Picks*, *Wayfinder Config* and the manifest to vault schema 2 in one commit; a second run plans nothing.
// The scrubbed snapshot of a real vault is wf-migrate-snapshot.test.mjs.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { CONFIG_DEFAULTS, DEFAULT_PICK_SORT } from "../template/_tools/lib/core.mjs"
import { PICKS_BODY } from "../template/_tools/lib/picks-page.mjs"
import { MANIFEST, git, makeVault, read, seed, today, wf, write } from "./vault.mjs"

const TEMPLATE = fileURLToPath(new URL("../template/", import.meta.url))

const MIGRATE_SUBJECT = "wf(migrate): vault schema 2"

// A schema-1 vault (no `vault_schema` in the manifest) from raw `{ path: text }` notes, committed.
const oldVault = (files, { manifest = { vault_schema: undefined } } = {}) =>
  seed(makeVault({ manifest, notes: Object.entries(files).map(([path, text]) => ({ path, text })) }))

const lines = (...ls) => ls.join("\n")

const MAP_V1 = lines(
  "---",
  "repo: r",
  "effort: e",
  "kind: map",
  "status: active",
  "status_since: 2026-10-01",
  "---",
  "",
  "# The effort",
  "",
  "## Destination",
  "",
  "Somewhere.",
  "",
  "## Notes",
  "",
  "Some notes.",
  "",
)

const TICKET_V1 = lines(
  "---",
  "repo: r",
  "effort: e",
  "type: task",
  "status: open",
  "status_since: 2026-10-01",
  "blockers: []",
  "---",
  "",
  "## Question",
  "",
  "What?",
  "",
)

const snapshot = (vault) => ({
  head: git(vault, "rev-parse", "HEAD"),
  status: git(vault, "status", "--porcelain", "--untracked-files=all"),
})

const lastCommit = (vault) => ({
  subject: git(vault, "log", "-1", "--format=%s"),
  files: git(vault, "show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean).sort(),
})

describe("wf migrate — plan", () => {
  test("prints a unified diff of every change and writes nothing", () => {
    const vault = oldVault({ "r/e/map.md": MAP_V1, "r/e/issues/01-first-thing.md": TICKET_V1 })
    const before = snapshot(vault)
    const r = wf(vault, ["migrate"])
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stdout, /^--- a\/r\/e\/issues\/01-first-thing\.md\n\+\+\+ b\/r\/e\/issues\/01-first-thing\.md\n@@ /m)
    assert.match(r.stdout, /^-repo: r$/m)
    assert.match(r.stdout, /^-effort: e$/m)
    assert.match(r.stdout, /^\+title: first thing$/m)
    assert.deepEqual(snapshot(vault), before)
  })
})

describe("wf migrate --yes", () => {
  test("applies the plan as one commit, and a second run plans nothing", () => {
    const vault = oldVault({ "r/e/map.md": MAP_V1, "r/e/issues/01-first-thing.md": TICKET_V1 })
    const r = wf(vault, ["migrate", "--yes"])
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(lastCommit(vault), {
      subject: MIGRATE_SUBJECT,
      files: [MANIFEST, "r/e/issues/01-first-thing.md", "r/e/map.md"],
    })
    assert.equal(git(vault, "status", "--porcelain"), "")
    assert.equal(JSON.parse(read(vault, MANIFEST)).vault_schema, 2)
    const again = wf(vault, ["migrate"])
    assert.equal(again.code, 0, again.stderr)
    assert.match(again.stdout, /^nothing to migrate/)
  })
})

// ── Tickets ───────────────────────────────────────────────────────────────

const ticketText = (fields, body = "## Question\n\nWhat?\n") =>
  ["---", ...fields, "---", "", body].join("\n")

const OPEN_FIELDS = ["type: task", "status: open", "status_since: 2026-10-01", "blockers: []"]

const migrated = (files, opts) => {
  const vault = oldVault(files, opts)
  const r = wf(vault, ["migrate", "--yes"])
  assert.equal(r.code, 0, r.stderr)
  return vault
}

describe("wf migrate — tickets", () => {
  test("drops repo/effort and keeps every other line byte for byte", () => {
    const text = ticketText([
      "# a comment",
      "repo: r",
      "sessions:",
      "  - 'one'",
      "effort: e",
      ...OPEN_FIELDS,
      "title: \"Keep: me\"",
      "assignee: someone   # trailing",
    ])
    const vault = migrated({ "r/e/map.md": MAP_V1, "r/e/issues/01-x.md": text })
    assert.equal(
      read(vault, "r/e/issues/01-x.md"),
      ticketText(["# a comment", "sessions:", "  - 'one'", ...OPEN_FIELDS, "title: \"Keep: me\"", "assignee: someone   # trailing"]),
    )
  })

  test("an old repo that isn't the path's repo becomes target_repo; a set target_repo is kept", () => {
    const vault = migrated({
      "r/e/map.md": MAP_V1,
      "r/e/issues/01-cross.md": ticketText(["repo: elsewhere", "effort: e", ...OPEN_FIELDS, "title: t"]),
      "r/e/issues/02-home.md": ticketText(["repo: r", "effort: e", ...OPEN_FIELDS, "title: t"]),
      "r/e/issues/03-kept.md": ticketText(["repo: r", "effort: e", ...OPEN_FIELDS, "title: t", "target_repo: vault"]),
      "r/e/issues/04-both.md": ticketText(["repo: api", "effort: e", ...OPEN_FIELDS, "title: t", "target_repo: web"]),
    })
    const targetOf = (rel) => /^target_repo: (.*)$/m.exec(read(vault, rel))?.[1] ?? null
    assert.equal(targetOf("r/e/issues/01-cross.md"), "elsewhere")
    assert.equal(targetOf("r/e/issues/02-home.md"), null)
    assert.equal(targetOf("r/e/issues/03-kept.md"), "vault")
    assert.equal(targetOf("r/e/issues/04-both.md"), "web")
  })

  test("a missing title comes from the map's hand-written Tickets line, else from the slug", () => {
    const map = MAP_V1 + lines(
      "",
      "Outside the list: [[05-outside]] — not this one",
      "",
      "## Tickets",
      "",
      "- [[01-gist]] — task — ✅ **resolved** — Ship the `thing` · after 02",
      "- ~~[[02-type-only]]~~ — task",
      "- [[03-status-only]] — research — ✅ resolved 2026-08-28",
      "- [[04-no-gist]]",
      "",
      "| id | type | title | status |",
      "|----|------|-------|--------|",
      "| [06](issues/06-table-row.md) | task | From the table — row | **open** |",
      "",
      "## Decisions so far",
      "",
    )
    const tickets = Object.fromEntries(
      ["01-gist", "02-type-only", "03-status-only", "04-no-gist", "05-outside", "06-table-row", "07-unlisted"].map((name) => [
        `r/e/issues/${name}.md`,
        ticketText(["repo: r", "effort: e", ...OPEN_FIELDS]),
      ]),
    )
    const vault = migrated({ "r/e/map.md": map, ...tickets })
    const titleOf = (name) => /^title: (.*)$/m.exec(read(vault, `r/e/issues/${name}.md`))[1]
    assert.equal(titleOf("01-gist"), "Ship the `thing` · after 02")
    assert.equal(titleOf("02-type-only"), "type only")
    assert.equal(titleOf("03-status-only"), "status only")
    assert.equal(titleOf("04-no-gist"), "no gist")
    assert.equal(titleOf("05-outside"), "outside")
    assert.equal(titleOf("06-table-row"), "From the table — row")
    assert.equal(titleOf("07-unlisted"), "unlisted")
  })
})

// ── Maps ──────────────────────────────────────────────────────────────────

describe("wf migrate — maps", () => {
  test("a hand-written Tickets section becomes the generated block with the old list folded under it", () => {
    const map = MAP_V1.replace("status_since: 2026-10-01\n", "status_since: 2026-10-01\ntitle: Kept title\n") + lines(
      "",
      "## Tickets (frontier view)",
      "",
      "- [[01-a]] — task — First",
      "",
      "  continued note",
      "",
      "## Decisions so far",
      "",
      "- none",
      "",
    )
    const vault = migrated({
      "r/e/map.md": map,
      "r/e/issues/01-a.md": ticketText(["repo: r", "effort: e", ...OPEN_FIELDS]),
      "r/e/issues/02-b.md": ticketText(["repo: r", "effort: e", "type: research", "status: open", "status_since: 2026-10-01", 'blockers: ["[[01-a]]"]']),
    })
    assert.equal(
      read(vault, "r/e/map.md"),
      lines(
        "---",
        "kind: map",
        "status: active",
        "status_since: 2026-10-01",
        "title: Kept title",
        "---",
        "",
        "# The effort",
        "",
        "## Destination",
        "",
        "Somewhere.",
        "",
        "## Notes",
        "",
        "Some notes.",
        "",
        "## Tickets",
        "",
        "<!-- wf:tickets -->",
        "- [[01-a]] · task · open · First",
        "- [[02-b]] · research · open · b ⛔",
        "<!-- /wf:tickets -->",
        "",
        "> [!quote]- Original list (before wf)",
        "> ## Tickets (frontier view)",
        ">",
        "> - [[01-a]] — task — First",
        ">",
        ">   continued note",
        "",
        "## Decisions so far",
        "",
        "- none",
        "",
      ),
    )
  })

  test("a missing title comes from the H1; a map without the section gets the block after ## Notes", () => {
    const vault = migrated({ "r/e/map.md": MAP_V1 + "\n## Decisions so far\n\n- x\n", "r/e/issues/01-a.md": ticketText(["repo: r", "effort: e", ...OPEN_FIELDS]) })
    const text = read(vault, "r/e/map.md")
    assert.match(text, /^title: The effort$/m)
    assert.match(text, /## Notes\n\nSome notes\.\n\n## Tickets\n\n<!-- wf:tickets -->\n- \[\[01-a\]\] · task · open · a\n<!-- \/wf:tickets -->\n\n## Decisions so far/)
    assert.doesNotMatch(text, /\[!quote\]/)
  })

  test("a ### Tickets section keeps its level; the callout title follows language:", () => {
    const map = MAP_V1 + "\n## Plan\n\n### Tickets\n\nFifteen tickets, frontier at 01.\n\n### Order\n\nlater\n"
    const vault = migrated({ "r/e/map.md": map, "Wayfinder Config.md": "---\nlanguage: th\n---\n" })
    assert.match(
      read(vault, "r/e/map.md"),
      /### Tickets\n\n<!-- wf:tickets -->\n_ยังไม่มีใบ_\n<!-- \/wf:tickets -->\n\n> \[!quote\]- รายการเดิม \(ก่อน wf\)\n> Fifteen tickets, frontier at 01\.\n\n### Order\n/,
    )
  })

  test("after --yes the vault lints with no identity-class findings and the verbs accept it", () => {
    const vault = migrated({
      "r/e/map.md": MAP_V1 + "\n## Tickets\n\n- [[01-a]] — Do a\n",
      "r/e/issues/01-a.md": ticketText(["repo: other", "effort: e", ...OPEN_FIELDS]),
    })
    const lint = wf(vault, ["lint", "--json"])
    const rules = lint.json.data.findings.map((f) => f.rule)
    assert.deepEqual(rules.filter((r) => ["legacy-field", "missing-field", "tickets-block-drift"].includes(r)), [])
    const claim = wf(vault, ["claim", "r/e#01", "--by", "me"])
    assert.equal(claim.code, 0, claim.stderr)
  })
})

// ── Wayfinder Picks · Wayfinder Config · manifest ─────────────────────────

const oldPicks = (sortLine) =>
  lines(
    "# Wayfinder Picks",
    "",
    "Old prose.",
    "",
    "```dataview",
    "TABLE WITHOUT ID file.link AS \"Ticket\"",
    "FROM \"\" AND -\"_tools\"",
    "WHERE status = \"open\"",
    ...(sortLine ? [sortLine] : []),
    "```",
    "",
  )

const picksAfter = (picks, config) => {
  const files = { "Wayfinder Picks.md": picks, ...(config ? { "Wayfinder Config.md": config } : {}) }
  return read(migrated(files), "Wayfinder Picks.md")
}

const sortBlock = (rules) => ["---", "sort:", ...rules.map((r) => `  - ${r}`), "---", ""].join("\n")

describe("wf migrate — Wayfinder Picks", () => {
  test("a DQL SORT rule that maps onto the vocabulary becomes sort:, and the body the loader view", () => {
    assert.equal(picksAfter(oldPicks("SORT file.name ASC")), sortBlock(["nn asc"]) + PICKS_BODY)
    assert.equal(
      picksAfter(oldPicks('SORT length(file.inlinks) DESC, type = "research" DESC, file.name')),
      sortBlock(["unblocks desc", "afk_first asc", "nn asc"]) + PICKS_BODY,
    )
  })

  test("a rule that doesn't map gets the default sort and the old query folded, inert", () => {
    const after = picksAfter(oldPicks("SORT status DESC, file.name ASC"), "---\nlanguage: en\n---\n")
    assert.equal(
      after,
      sortBlock(DEFAULT_PICK_SORT) +
        PICKS_BODY +
        lines(
          "",
          "> [!quote]- Original pick rule (before wf)",
          "> ```text",
          "> TABLE WITHOUT ID file.link AS \"Ticket\"",
          "> FROM \"\" AND -\"_tools\"",
          "> WHERE status = \"open\"",
          "> SORT status DESC, file.name ASC",
          "> ```",
          "",
        ),
    )
    assert.doesNotMatch(after, /^```dataview\s*$/m)
  })

  test("a Picks page on the loader keeps its body; one without sort: gets the default", () => {
    const custom = "---\nsort: [afk_first, nn asc]\n---\n# Mine\n"
    const vault = oldVault({ "Wayfinder Picks.md": custom })
    assert.doesNotMatch(wf(vault, ["migrate"]).stdout, /Wayfinder Picks/)
    assert.equal(picksAfter("# Mine\n"), sortBlock(DEFAULT_PICK_SORT) + "# Mine\n")
  })
})

describe("wf migrate — Wayfinder Config and the manifest", () => {
  test("adds every missing Config key with its default and leaves the rest as it is", () => {
    const vault = migrated({ "Wayfinder Config.md": "---\nkind: wayfinder-config\nstale_days: 7\nlabel_done: \"\"\n---\n\n# Config\n" })
    const text = read(vault, "Wayfinder Config.md")
    assert.match(text, /^---\nkind: wayfinder-config\nstale_days: 7\nlabel_done: ✅ ปิดแล้ว\nclaim_stale_days: 3\npaused_stale_days: 30\n/)
    assert.match(text, /\n---\n\n# Config\n$/)
    const r = wf(vault, ["lint", "--json"])
    assert.equal(r.code, 0, r.stderr)
    for (const key of Object.keys(CONFIG_DEFAULTS)) assert.match(text, new RegExp(`^${key}: `, "m"), key)
  })

  test("a vault at schema 2 with legacy fields is migrated without touching the manifest", () => {
    const vault = seed(makeVault({ notes: [{ path: "r/e/issues/01-a.md", text: ticketText(["repo: r", "effort: e", ...OPEN_FIELDS]) }] }))
    const manifest = read(vault, MANIFEST)
    const r = wf(vault, ["migrate", "--yes", "--json"])
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(r.json.data.files, ["r/e/issues/01-a.md"])
    assert.equal(read(vault, MANIFEST), manifest)
  })
})

describe("wf migrate — flags and output", () => {
  test("--plan is the default; --json carries the files and the diff", () => {
    const vault = oldVault({ "r/e/issues/01-a.md": ticketText(["repo: r", "effort: e", ...OPEN_FIELDS]) })
    const plain = wf(vault, ["migrate"])
    const plan = wf(vault, ["migrate", "--plan"])
    assert.equal(plan.stdout, plain.stdout)
    assert.match(plain.stdout, /\nwf: 2 files to change — apply with: wf migrate --yes\n$/)
    const json = wf(vault, ["migrate", "--json"])
    assert.deepEqual(json.json.data.files, [MANIFEST, "r/e/issues/01-a.md"])
    assert.equal(plain.stdout, `${json.json.data.diff}wf: 2 files to change — apply with: wf migrate --yes\n`)
  })

  test("--plan with --yes is a usage error, and nothing is written", () => {
    const vault = oldVault({ "r/e/issues/01-a.md": ticketText(["repo: r", "effort: e", ...OPEN_FIELDS]) })
    const before = snapshot(vault)
    const r = wf(vault, ["migrate", "--plan", "--yes"])
    assert.equal(r.code, 2)
    assert.match(r.stderr, /--plan and --yes don't go together/)
    assert.deepEqual(snapshot(vault), before)
  })

  test("other write verbs still refuse a vault older than schema 2", () => {
    const vault = oldVault({ "r/e/map.md": MAP_V1 })
    const r = wf(vault, ["chart", "r/new", "--title", "x"])
    assert.equal(r.code, 2)
    assert.match(r.stderr, /run `wf migrate`/)
  })
})

// ── The template's own seeds ──────────────────────────────────────────────

const filesUnder = (dir, rel = "") =>
  readdirSync(join(dir, rel)).flatMap((name) => {
    const path = rel ? `${rel}/${name}` : name
    return statSync(join(dir, path)).isDirectory() ? filesUnder(dir, path) : [path]
  })

// A vault seeded the way bootstrap seeds one: the seed-once notes with `__TODAY__` rendered.
const seededVault = () => {
  const vault = makeVault()
  const seeds = [...filesUnder(join(TEMPLATE, "example-repo")).map((p) => `example-repo/${p}`), "Wayfinder Picks.md", "Wayfinder Config.md"]
  for (const rel of seeds.filter((p) => p.endsWith(".md")))
    write(vault, rel, readFileSync(join(TEMPLATE, rel), "utf8").split("__TODAY__").join(today()))
  return seed(vault)
}

describe("wf migrate — the template's seeds are schema 2", () => {
  test("the Picks body migrate writes is the template seed's body", () => {
    const seedText = readFileSync(join(TEMPLATE, "Wayfinder Picks.md"), "utf8")
    assert.equal(seedText, `---\nsort: [${DEFAULT_PICK_SORT.join(", ")}]\n---\n${PICKS_BODY}`)
  })

  test("the seeds lint with zero errors and migrate plans nothing on them", () => {
    const vault = seededVault()
    const lint = wf(vault, ["lint", "--json"])
    assert.equal(lint.code, 0, lint.stdout)
    assert.deepEqual(lint.json.data.findings.filter((f) => f.severity === "error"), [])
    const plan = wf(vault, ["migrate"])
    assert.equal(plan.code, 0, plan.stderr)
    assert.equal(plan.stdout, "nothing to migrate — the vault is at vault schema 2\n")
  })
})

// ── Review cases ──────────────────────────────────────────────────────────

describe("wf migrate — edge cases", () => {
  test("a title comes from the line that lists the ticket, not one that mentions it", () => {
    const map = MAP_V1 + "\n## Tickets\n\n- [[02-b]] — Beta thing (after [[01-a]])\n- [[01-a]] — Alpha thing\n"
    const vault = migrated({
      "r/e/map.md": map,
      "r/e/issues/01-a.md": ticketText(["repo: r", "effort: e", ...OPEN_FIELDS]),
      "r/e/issues/02-b.md": ticketText(["repo: r", "effort: e", ...OPEN_FIELDS]),
    })
    assert.match(read(vault, "r/e/issues/01-a.md"), /^title: Alpha thing$/m)
    assert.match(read(vault, "r/e/issues/02-b.md"), /^title: Beta thing \(after \[\[01-a\]\]\)$/m)
  })

  test("a BOM or CRLF on Picks and Config keeps the user's frontmatter", () => {
    const vault = migrated({
      "Wayfinder Picks.md": "﻿---\ntags: [mine]\n---\n# P\n\n```dataview\nTABLE x\nSORT file.name DESC\n```\n",
      "Wayfinder Config.md": "﻿---\r\nstale_days: 7\r\n---\r\n# C\r\n",
    })
    const picks = read(vault, "Wayfinder Picks.md")
    assert.ok(picks.startsWith("﻿---\ntags: [mine]\nsort:\n  - nn desc\n---\n# Wayfinder Picks\n"), picks.slice(0, 80))
    const config = read(vault, "Wayfinder Config.md")
    assert.ok(config.startsWith("﻿---\r\nstale_days: 7\r\nclaim_stale_days: 3\r\n"), config.slice(0, 80))
    assert.ok(config.endsWith("---\r\n# C\r\n"))
    const crlf = read(migrated({ "Wayfinder Picks.md": "---\r\nx: 1\r\n---\r\n# Mine\r\n" }), "Wayfinder Picks.md")
    assert.equal(crlf, "---\r\nx: 1\r\nsort:\r\n  - unblocks desc\r\n  - nn asc\r\n---\r\n# Mine\r\n")
  })

  test("a tracker note without frontmatter stops the migration, naming the file", () => {
    const vault = oldVault({ "r/e/issues/01-notes.md": "just notes\n" })
    const r = wf(vault, ["migrate"])
    assert.equal(r.code, 2)
    assert.match(r.stderr, /r\/e\/issues\/01-notes\.md/)
  })

  test("the old heading text and live queries are folded too, inert", () => {
    const map = MAP_V1 + "\n## Tickets (7 of 12 done)\n\n```dataview\nTABLE status FROM \"r/e/issues\"\n```\n"
    const text = read(migrated({ "r/e/map.md": map }), "r/e/map.md")
    assert.match(text, /> \[!quote\]- Original list \(before wf\)\n> ## Tickets \(7 of 12 done\)\n>\n> ```text\n> TABLE status FROM "r\/e\/issues"\n> ```\n/)
    assert.doesNotMatch(text, /^> ```dataview/m)
  })

  test("a map that has the generated block keeps its sections as they are", () => {
    const map = MAP_V1 + "\n## Plan\n\n### Tickets\n\nnested prose\n\n## Tickets\n\n<!-- wf:tickets -->\nold\n<!-- /wf:tickets -->\n"
    const text = read(migrated({ "r/e/map.md": map }), "r/e/map.md")
    assert.match(text, /### Tickets\n\nnested prose\n/)
    assert.equal(text.split("<!-- wf:tickets -->").length, 2)
    assert.match(text, /<!-- wf:tickets -->\n_No tickets yet\._\n<!-- \/wf:tickets -->/)
  })

  test("a ## Tickets section wins over a ### one, and a closing # needs a space before it", () => {
    const map = MAP_V1.replace("# The effort", "# Learn C#") + "\n## Plan\n\n### Tickets\n\nnested\n\n## Tickets\n\n- [[01-a]] — A\n"
    const text = read(migrated({ "r/e/map.md": map }), "r/e/map.md")
    assert.match(text, /^title: Learn C#$/m)
    assert.match(text, /### Tickets\n\nnested\n/)
    assert.match(text, /## Tickets\n\n<!-- wf:tickets -->/)
  })

  test("the manifest gets vault_schema right after schema, the way bootstrap writes it", () => {
    const vault = migrated({}, { manifest: { vault_schema: undefined, template_sha: "abc" } })
    assert.deepEqual(Object.keys(JSON.parse(read(vault, MANIFEST))), ["schema", "vault_schema", "template_sha"])
  })
})
