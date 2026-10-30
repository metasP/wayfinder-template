// `wf` as a CLI against fixture vaults (spec *Verbs* all-verbs rules, *Frontmatter schema* rules,
// Testing Decisions §1): usage errors, the YAML subset, the vault schema version, and which
// checkout `wf` reads.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { MANIFEST, RECENT, git, makeVault, map, ticket, wf, write } from "./vault.mjs"

const smallVault = (opts = {}) =>
  makeVault({ notes: [map("r/e/map.md"), ticket("r/e/issues/01-a.md")], ...opts })

describe("usage errors exit 2", () => {
  const cases = [
    [[], /no verb given/],
    [["fly"], /unknown verb "fly"/],
    [["frontier", "--nope"], /unknown flag --nope/],
    [["frontier", "--repo"], /--repo needs a value/],
    [["frontier", "--repo", "--from", "r/e"], /--repo needs a value/],
    [["frontier", "--json=yes"], /--json takes no value/],
    [["frontier", "extra"], /unexpected argument "extra"/],
    [["frontier", "--from", "not a ref"], /cannot read "not a ref" as a ref/],
    [["frontier", "--from", "[[01-a]]"], /cannot read "\[\[01-a\]\]" as a ref/],
    [["lint", "/elsewhere/r/e/map.md"], /is not inside the vault/],
    [["frontier", "--from", "r/e#99"], /no ticket r\/e#99 in the vault/],
    [["frontier", "--", "--json"], /unexpected argument "--json"/],
  ]
  for (const [args, message] of cases) {
    test(`wf ${args.join(" ") || "(nothing)"}`, () => {
      const r = wf(smallVault(), args)
      assert.equal(r.code, 2)
      assert.equal(r.stdout, "")
      assert.match(r.stderr, /^wf: /)
      assert.match(r.stderr, message)
    })
  }

  test("--json puts the error in the envelope on stdout", () => {
    const r = wf(smallVault(), ["frontier", "--bogus", "--json"])
    assert.equal(r.code, 2)
    assert.deepEqual(r.json, { ok: false, data: null, error: { code: 2, message: "unknown flag --bogus", details: [] } })
  })

  test("--help prints the usage and exits 0", () => {
    const top = wf(smallVault(), ["--help"])
    assert.equal(top.code, 0)
    assert.match(top.stdout, /wf frontier \[--repo R\] \[--from repo\/effort\] \[--json\]/)
    assert.match(top.stdout, /wf lint \[repo\/effort…\] \[--rule <rule>\] \[--fix\] \[--json\]/)
    assert.match(top.stdout, /wf claim <ref> \[--by name\] \[--json\]/)
    assert.match(top.stdout, /wf release <ref> \[--by name\] \[--force\] \[--json\]/)
    assert.match(top.stdout, /wf wait <ref> --note "…" \[--until YYYY-MM-DD\] \[--by name\] \[--force\] \[--json\]/)
    assert.match(top.stdout, /wf new <repo\/effort> --type T --title "…" \[--question "…" \| stdin\] \[--blocker ref\]… \[--target-repo R\] \[--json\]/)
    assert.match(top.stdout, /wf resolve <ref> --gist "…" \[--answer-file <file>\] \[--out-of-scope\] \[--json\]/)
    assert.match(top.stdout, /wf block <ref> <blocker-ref> \[--remove\] \[--json\]/)
    assert.match(top.stdout, /wf chart <repo\/effort> --title "…" \[--json\]/)
    assert.match(top.stdout, /wf map-status <repo\/effort> active\|paused\|dropped\|done \[--note "…"\] \[--superseded-by <repo\/effort>\] \[--force\] \[--json\]/)
    assert.match(top.stdout, /wf bump-runs <repo\/effort> \[--count k\] \[--json\]/)
    const verb = wf(smallVault(), ["lint", "--help"])
    assert.equal(verb.code, 0)
    assert.match(verb.stdout, /^usage: wf lint/)
  })
})

describe("frontmatter outside the YAML subset exits 2 naming file:line", () => {
  const OUTSIDE = [
    ["nested map", "title: t\nmeta:\n  owner: me\n", 4],
    ["anchor", "title: &t hello\n", 2],
    ["alias", "title: *t\n", 2],
    ["tag", "title: !str hello\n", 2],
    ["block scalar", "title: |\n  two\n  lines\n", 2],
    ["multi-line plain scalar", "title: first\n  second\n", 3],
    ["unquoted wikilink (a nested list)", "blockers: [[01-a]]\n", 2],
    ["nested block list", "blockers:\n  - - x\n", 3],
    ["map in a list", "blockers:\n  - key: v\n", 3],
    ["flow map", "title: {a: 1}\n", 2],
    ["unterminated quote", 'title: "open\n', 2],
    ["duplicate key", "title: a\ntitle: b\n", 3],
    ["unclosed frontmatter", null, 1],
  ]
  for (const [name, yaml, line] of OUTSIDE) {
    test(name, () => {
      const text = yaml === null ? "---\ntitle: t\n" : `---\n${yaml}---\n`
      const vault = smallVault()
      write(vault, "r/e/issues/02-bad.md", text)
      for (const verb of ["frontier", "lint"]) {
        const r = wf(vault, [verb])
        assert.equal(r.code, 2, `${verb}: ${r.stdout}`)
        assert.match(r.stderr, new RegExp(`^  r/e/issues/02-bad\\.md:${line}: `, "m"))
      }
    })
  }

  test("every offending file is listed, Config and Picks included", () => {
    const vault = smallVault()
    write(vault, "r/e/issues/02-bad.md", "---\ntitle: &x a\n---\n")
    write(vault, "r/e/map.md", "---\nkind: map\nnested:\n  a: b\n---\n")
    write(vault, "Wayfinder Config.md", "---\nstale_days: |\n  14\n---\n")
    write(vault, "Wayfinder Picks.md", "---\nsort: [[nn, asc]]\n---\n")
    const r = wf(vault, ["lint", "--json"])
    assert.equal(r.code, 2)
    assert.deepEqual(
      r.json.error.details.map((d) => d.split(": ")[0]),
      ["r/e/issues/02-bad.md:2", "r/e/map.md:4", "Wayfinder Config.md:2", "Wayfinder Picks.md:2"],
    )
  })
})

describe("frontmatter inside the subset", () => {
  const readTicket = (fm) => {
    const vault = smallVault()
    write(vault, "r/e/issues/02-x.md", `---\ntype: task\nstatus: open\nstatus_since: ${RECENT}\nblockers: []\n${fm}---\n`)
    return vault
  }
  const frontierRow = (vault, ref) => wf(vault, ["frontier", "--json"]).json.data.tickets.find((t) => t.ref === ref)

  test("numeric-looking text keeps its spelling; list items are always strings", () => {
    const vault = readTicket("title: 007\ntarget_repo: 1.50\n")
    assert.deepEqual([frontierRow(vault, "r/e#02").title, frontierRow(vault, "r/e#02").target_repo], ["007", "1.50"])
    assert.equal(frontierRow(readTicket("title: Infinity\n"), "r/e#02").title, "Infinity")
    const listed = smallVault()
    write(listed, "r/e/issues/02-x.md", `---\ntype: task\nstatus: open\nstatus_since: ${RECENT}\ntitle: x\nblockers:\n  - 08\n---\n`)
    const dangling = wf(listed, ["lint", "--json"]).json.data.findings.find((f) => f.rule === "dangling-blocker")
    assert.match(dangling.message, /blocker "08" resolves to no ticket/)
  })

  test("a literal tab inside double quotes is kept", () => {
    assert.equal(frontierRow(readTicket('title: "a\tb"\n'), "r/e#02").title, "a\tb")
  })

  test("keys with spaces, dots or __proto__ are read as plain keys (lint flags them unknown)", () => {
    const vault = readTicket("title: t\nOwner Name: me\nsee.also: x\n__proto__:\n  - y\n")
    const unknown = wf(vault, ["lint", "--json"]).json.data.findings.filter((f) => f.rule === "unknown-key")
    assert.deepEqual(unknown.map((f) => f.message).sort(), [
      "unknown frontmatter key Owner Name",
      "unknown frontmatter key __proto__",
      "unknown frontmatter key see.also",
    ])
  })

  test("a scalar Picks sort: is one rule", () => {
    const vault = makeVault({
      notes: [map("r/e/map.md"), ticket("r/e/issues/01-a.md"), ticket("r/e/issues/02-b.md")],
      picks: { sort: "nn desc" },
    })
    assert.deepEqual(wf(vault, ["frontier", "--json"]).json.data.tickets.map((t) => t.ref), ["r/e#02", "r/e#01"])
  })

  test("block and flow lists, quotes, comments and plain scalars all read as the core expects", () => {
    const vault = makeVault({
      notes: [
        {
          path: "r/e/map.md",
          text: [
            "---",
            "# a comment",
            "kind: map",
            "title: 'It''s a map'   # trailing comment",
            "status: active",
            `status_since: ${RECENT}`,
            "runs: 3",
            "repos:",
            "- r",
            "- other",
            "---",
            "",
            "## Tickets",
            "",
            "<!-- wf:tickets -->",
            "- [[01-gate]] · task · open · Gate: the first",
            "- [[02-after]] · research · open · after ⛔",
            "<!-- /wf:tickets -->",
            "",
          ].join("\r\n"),
        },
        {
          path: "r/e/issues/01-gate.md",
          text: `﻿---\ntype: task\nstatus: open\nstatus_since: "${RECENT}"\ntitle: "Gate: the first"\nblockers: []\n---\n`,
        },
        {
          path: "r/e/issues/02-after.md",
          text: `---\ntype: research\nstatus: open\nstatus_since: ${RECENT}\ntitle: after\nblockers:\n  - "[[01-gate]]"\n---\n`,
        },
      ],
    })
    const lint = wf(vault, ["lint"])
    assert.equal(lint.code, 0, lint.stdout + lint.stderr)
    assert.equal(lint.stdout, "lint clean\n")
    assert.deepEqual(wf(vault, ["frontier", "--json"]).json.data.tickets.map((t) => [t.ref, t.title]), [["r/e#01", "Gate: the first"]])
  })

  test("a note without frontmatter is read as empty, and lint reports what it lacks", () => {
    const vault = smallVault()
    write(vault, "r/e/issues/02-bare.md", "# just a body\n")
    const r = wf(vault, ["lint", "--json"])
    assert.ok(r.json.data.findings.some((f) => f.ref === "r/e#02" && f.rule === "missing-field"))
  })
})

describe("the vault schema version", () => {
  const legacyVault = () =>
    makeVault({
      manifest: { vault_schema: undefined },
      notes: [map("r/e/map.md", { repo: "r", effort: "e" }), ticket("r/e/issues/01-a.md", { repo: "r", effort: "e" })],
    })

  test("an older vault refuses frontier with 'run `wf migrate`'", () => {
    const r = wf(legacyVault(), ["frontier"])
    assert.equal(r.code, 2)
    assert.match(r.stderr, /vault schema 1 is older than 2 — run `wf migrate`/)
  })

  test("lint still reads an older vault, so its legacy-field findings show", () => {
    const r = wf(legacyVault(), ["lint", "--json"])
    assert.equal(r.json.ok, true)
    assert.deepEqual(
      r.json.data.findings.filter((f) => f.rule === "legacy-field").map((f) => [f.ref, f.fix]),
      [["r/e", "wf migrate --yes"], ["r/e", "wf migrate --yes"], ["r/e#01", "wf migrate --yes"], ["r/e#01", "wf migrate --yes"]],
    )
  })

  test("a newer vault is refused by every verb", () => {
    for (const verb of ["frontier", "lint"]) {
      const r = wf(smallVault({ manifest: { vault_schema: 3 } }), [verb])
      assert.equal(r.code, 2)
      assert.match(r.stderr, /vault schema 3 is newer than this wf supports \(2\)/)
    }
  })

  test("a vault without a manifest, or with a broken one, is an environment error", () => {
    const none = wf(smallVault({ manifest: null }), ["lint"])
    assert.equal(none.code, 2)
    assert.match(none.stderr, new RegExp(`no \\${MANIFEST} in .* — this vault was not installed from the template`))

    const broken = smallVault()
    writeFileSync(join(broken, MANIFEST), "{ nope")
    assert.match(wf(broken, ["lint"]).stderr, /is not valid JSON/)
    assert.match(wf(smallVault({ manifest: { vault_schema: "2" } }), ["lint"]).stderr, /vault_schema must be a positive integer/)
  })
})

describe("which checkout wf reads", () => {
  test("a vault that isn't a git repository is an environment error", () => {
    const vault = smallVault()
    rmSync(join(vault, ".git"), { recursive: true, force: true })
    const r = wf(vault, ["frontier"], { env: { GIT_CEILING_DIRECTORIES: dirname(vault) } })
    assert.equal(r.code, 2)
    assert.match(r.stderr, /cannot read the vault at .* as a git repository/)
  })

  test("run from a linked vault worktree, wf reads the main checkout", () => {
    const vault = smallVault()
    git(vault, "add", "-A")
    git(vault, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "seed")
    const worktree = join(vault, ".worktrees/side")
    git(vault, "worktree", "add", "-q", worktree)
    // Only the main checkout has ticket 02; the worktree still has the seeded state.
    write(vault, "r/e/issues/02-main-only.md", `---\ntype: task\nstatus: open\nstatus_since: ${RECENT}\ntitle: m\nblockers: []\n---\n`)
    const r = wf(vault, ["frontier", "--json"], { cwd: worktree, script: join(worktree, "_tools/wf.mjs") })
    assert.equal(r.code, 0, r.stdout)
    assert.deepEqual(r.json.data.tickets.map((t) => t.ref), ["r/e#01", "r/e#02"])
  })

  const commitAll = (dir) => {
    git(dir, "add", "-A")
    git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "seed")
  }
  const mainOnly = (vault) =>
    write(vault, "r/e/issues/02-main-only.md", `---\ntype: task\nstatus: open\nstatus_since: ${RECENT}\ntitle: m\nblockers: []\n---\n`)

  test("with the git dir outside the vault (--separate-git-dir) wf reads the main checkout, and refuses to guess from a worktree", () => {
    const vault = smallVault()
    rmSync(join(vault, ".git"), { recursive: true, force: true })
    git(vault, "init", "-q", "--separate-git-dir", join(mkdtempSync(join(tmpdir(), "wf-gitdir-")), "repo.git"))
    commitAll(vault)
    const worktree = join(mkdtempSync(join(tmpdir(), "wf-wt-")), "side")
    git(vault, "worktree", "add", "-q", worktree)
    mainOnly(vault)
    assert.deepEqual(wf(vault, ["frontier", "--json"]).json.data.tickets.map((t) => t.ref), ["r/e#01", "r/e#02"])
    const fromWorktree = wf(vault, ["frontier"], { cwd: worktree, script: join(worktree, "_tools/wf.mjs") })
    assert.equal(fromWorktree.code, 2)
    assert.match(fromWorktree.stderr, /cannot find the vault's main checkout: git lists .*repo\.git, which is not a work tree/)
  })

  test("an absolute path in the worktree wf runs from names the same effort", () => {
    const vault = smallVault()
    commitAll(vault)
    const worktree = join(vault, ".worktrees/side")
    git(vault, "worktree", "add", "-q", worktree)
    const r = wf(vault, ["lint", join(worktree, "r/e/map.md"), "--json"], { script: join(worktree, "_tools/wf.mjs") })
    assert.equal(r.json.error, null)
  })

  test("an inherited GIT_DIR doesn't point wf at another repository", () => {
    const vault = smallVault()
    const other = mkdtempSync(join(tmpdir(), "wf-other-"))
    git(other, "init", "-q")
    const r = wf(vault, ["frontier", "--json"], { env: { GIT_DIR: join(other, ".git"), GIT_WORK_TREE: other } })
    assert.deepEqual(r.json.data.tickets.map((t) => t.ref), ["r/e#01"])
  })

  test("an unreadable directory is an environment error, not a crash", { skip: process.getuid?.() === 0 }, () => {
    const vault = smallVault()
    write(vault, "r/locked/map.md", "---\nkind: map\n---\n")
    chmodSync(join(vault, "r/locked"), 0o000)
    try {
      const r = wf(vault, ["lint"])
      assert.equal(r.code, 2)
      assert.match(r.stderr, /^wf: cannot read .*r\/locked/)
      assert.doesNotMatch(r.stderr, /internal error/)
    } finally {
      chmodSync(join(vault, "r/locked"), 0o755)
    }
  })
})
