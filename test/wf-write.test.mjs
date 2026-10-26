// The write pipeline through `wf` against fixture vaults (spec *What every write verb does*, *Locking
// and commits*, *Generated `## Tickets` block*; Testing Decisions §1): commits, the regenerated block,
// byte-for-byte preservation, the main checkout, the lock, concurrency and a vault wf can't write.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { chmodSync, existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { git, makeVault, map, onOneDay, read, seed, ticket, ticketsBlock, wf, wfAsync, write } from "./vault.mjs"

const NO_SESSION = { CLAUDE_CODE_SESSION_ID: undefined }
const run = (vault, args, opts = {}) => wf(vault, args, { ...opts, env: { ...NO_SESSION, ...opts.env } })
const runAsync = (vault, args, opts = {}) => wfAsync(vault, args, { ...opts, env: { ...NO_SESSION, ...opts.env } })

const MAP_BODY = (block) => `# The map\n\n## Destination\n\nSomewhere.\n\n## Notes\n\nnone\n\n${block}`
const twoTickets = () =>
  seed(
    makeVault({
      notes: [
        { ...map("r/e/map.md"), body: MAP_BODY(ticketsBlock("- [[01-a]] · task · open · A\n- [[02-b]] · task · open · B ⛔")) },
        ticket("r/e/issues/01-a.md", { title: "A" }),
        ticket("r/e/issues/02-b.md", { title: "B", blockers: ["[[01-a]]"] }),
      ],
    }),
  )

const lastCommit = (vault) => ({
  subject: git(vault, "log", "-1", "--format=%s"),
  files: git(vault, "show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean),
})
const commitCount = (vault) => Number(git(vault, "rev-list", "--count", "HEAD"))
const blockOf = (vault) => read(vault, "r/e/map.md").split("<!-- wf:tickets -->\n")[1].split("\n<!-- /wf:tickets -->")[0]

describe("commits", () => {
  test("one commit per verb, wf(<verb>): ref, holding only the touched files", () => {
    const vault = twoTickets()
    write(vault, "elsewhere.md", "staged by someone else\n")
    git(vault, "add", "elsewhere.md")
    write(vault, "r/e/issues/02-b.md", `${read(vault, "r/e/issues/02-b.md")}\nan unsaved prose edit\n`)
    const start = commitCount(vault)

    assert.equal(run(vault, ["claim", "r/e#01", "--by", "a"]).code, 0)
    assert.deepEqual(lastCommit(vault), { subject: "wf(claim): r/e#01", files: ["r/e/issues/01-a.md", "r/e/map.md"] })
    assert.equal(run(vault, ["wait", "r/e#01", "--note", "n", "--by", "a"]).code, 0)
    assert.deepEqual(lastCommit(vault).subject, "wf(wait): r/e#01")
    assert.equal(run(vault, ["release", "r/e#01", "--by", "a"]).code, 0)
    assert.deepEqual(lastCommit(vault).subject, "wf(release): r/e#01")
    assert.equal(commitCount(vault), start + 3)

    assert.match(git(vault, "status", "--porcelain"), /^A  elsewhere\.md$/m, "someone else's staged file stays staged")
    assert.match(git(vault, "status", "--porcelain"), /^ M r\/e\/issues\/02-b\.md$/m, "an untouched dirty file stays dirty")
  })

  test("--json reports the commit and the files", () => {
    const vault = twoTickets()
    const r = run(vault, ["claim", "r/e#01", "--by", "a", "--json"])
    assert.equal(r.json.data.commit, git(vault, "rev-parse", "HEAD"))
    assert.deepEqual(r.json.data.files, ["r/e/issues/01-a.md", "r/e/map.md"])
    assert.match(run(twoTickets(), ["claim", "r/e#01", "--by", "a"]).stdout, /^claimed r\/e#01 as a \(commit [0-9a-f]{7}\)$/m)
  })
})

describe("the generated ## Tickets block", () => {
  test("is regenerated when the rendering changes", () => {
    const vault = twoTickets()
    run(vault, ["claim", "r/e#01", "--by", "a"])
    assert.equal(blockOf(vault), "- [[01-a]] · task · claimed · A\n- [[02-b]] · task · open · B ⛔")
    run(vault, ["wait", "r/e#01", "--note", "n", "--by", "a"])
    assert.equal(blockOf(vault), "- [[01-a]] · task · waiting · A\n- [[02-b]] · task · open · B ⛔")
    assert.ok(read(vault, "r/e/map.md").startsWith("---\n"), "the map's frontmatter is untouched")
    assert.match(read(vault, "r/e/map.md"), /## Notes\n\nnone\n\n## Tickets\n\n<!-- wf:tickets -->/)
  })

  test("a map without one gets it after ## Notes", () => {
    const vault = seed(
      makeVault({
        notes: [
          { ...map("r/e/map.md"), body: "# M\n\n## Notes\n\nn\n\n## Decisions so far\n\n- x\n" },
          ticket("r/e/issues/01-a.md", { title: "A" }),
        ],
      }),
    )
    run(vault, ["claim", "r/e#01", "--by", "a"])
    assert.ok(
      read(vault, "r/e/map.md").endsWith(
        "# M\n\n## Notes\n\nn\n\n## Tickets\n\n<!-- wf:tickets -->\n- [[01-a]] · task · claimed · A\n<!-- /wf:tickets -->\n\n## Decisions so far\n\n- x\n",
      ),
      read(vault, "r/e/map.md"),
    )
  })

  test("a heading inside fenced code is not a section", () => {
    const body = "# M\n\n## Notes\n\n```sh\n# a shell comment\n## also code\n```\n\n## Decisions so far\n"
    const vault = seed(makeVault({ notes: [{ ...map("r/e/map.md"), body }, ticket("r/e/issues/01-a.md", { title: "A" })] }))
    run(vault, ["claim", "r/e#01", "--by", "a"])
    assert.ok(
      read(vault, "r/e/map.md").endsWith(
        "```\n\n## Tickets\n\n<!-- wf:tickets -->\n- [[01-a]] · task · claimed · A\n<!-- /wf:tickets -->\n\n## Decisions so far\n",
      ),
      read(vault, "r/e/map.md"),
    )
  })

  test("a marker quoted in the map's prose or code is text, not the block", () => {
    const body = "# M\n\nwf owns `<!-- wf:tickets -->`.\n\n```md\n<!-- wf:tickets -->\n```\n\n## Tickets\n\n- hand-written\n"
    const vault = seed(makeVault({ notes: [{ ...map("r/e/map.md"), body }, ticket("r/e/issues/01-a.md", { title: "A" })] }))
    const r = run(vault, ["claim", "r/e#01", "--by", "a"])
    assert.equal(r.code, 0, r.stderr)
    assert.ok(
      read(vault, "r/e/map.md").endsWith(
        "## Tickets\n\n<!-- wf:tickets -->\n- [[01-a]] · task · claimed · A\n<!-- /wf:tickets -->\n\n- hand-written\n",
      ),
      read(vault, "r/e/map.md"),
    )
    assert.match(read(vault, "r/e/map.md"), /wf owns `<!-- wf:tickets -->`\.\n\n```md\n<!-- wf:tickets -->\n```\n/)
  })

  test("an unterminated block marker exits 2 and nothing is written", () => {
    const vault = seed(makeVault({ notes: [{ ...map("r/e/map.md"), body: "## Tickets\n\n<!-- wf:tickets -->\n- old\n" }, ticket("r/e/issues/01-a.md")] }))
    const before = read(vault, "r/e/issues/01-a.md")
    const r = run(vault, ["claim", "r/e#01", "--by", "a"])
    assert.equal(r.code, 2)
    assert.match(r.stderr, /r\/e\/map\.md has <!-- wf:tickets --> without <!-- \/wf:tickets -->/)
    assert.equal(read(vault, "r/e/issues/01-a.md"), before)
  })

  test("wf lint --fix repairs drift without touching status fields", () => {
    const vault = twoTickets()
    // Status changed in Obsidian by hand: the block now lies.
    write(vault, "r/e/issues/01-a.md", read(vault, "r/e/issues/01-a.md").replace('status: "open"', 'status: "resolved"'))
    write(vault, "r/e/map.md", read(vault, "r/e/map.md").replace("· B ⛔", "· B (hand edit)"))
    git(vault, "commit", "-qam", "hand edits")
    const ticketBefore = read(vault, "r/e/issues/01-a.md")
    const drift = run(vault, ["lint", "--json"]).json.data.findings.filter((f) => f.rule === "tickets-block-drift")
    assert.equal(drift.length, 1)

    const r = run(vault, ["lint", "--fix", "--json"])
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(r.json.data.fixed, ["r/e"])
    assert.deepEqual(r.json.data.findings.filter((f) => f.rule === "tickets-block-drift"), [])
    assert.equal(blockOf(vault), "- [[01-a]] · task · resolved · A\n- [[02-b]] · task · open · B")
    assert.equal(read(vault, "r/e/issues/01-a.md"), ticketBefore)
    assert.deepEqual(lastCommit(vault), { subject: "wf(lint): r/e", files: ["r/e/map.md"] })

    const again = run(vault, ["lint", "--fix", "--json"])
    assert.deepEqual([again.code, again.json.data.fixed, again.json.data.commit], [0, [], null])
    assert.equal(lastCommit(vault).subject, "wf(lint): r/e", "nothing to fix, no commit")
  })

  test("wf lint --fix on named efforts only fixes those", () => {
    const vault = seed(
      makeVault({
        notes: [map("r/a/map.md"), ticket("r/a/issues/01-x.md"), map("r/b/map.md"), ticket("r/b/issues/01-y.md")],
      }),
    )
    const r = run(vault, ["lint", "r/b", "--fix", "--json"])
    assert.deepEqual(r.json.data.fixed, ["r/b"])
    assert.ok(read(vault, "r/b/map.md").includes("<!-- wf:tickets -->"))
    assert.ok(!read(vault, "r/a/map.md").includes("<!-- wf:tickets -->"))
  })
})

describe("byte-for-byte preservation", () => {
  test("unknown keys, comments, quoting and key order survive claim → wait → release", () => {
    const original = [
      "---",
      "# owner's comment",
      "title: 'It''s A'",
      "owner: me   # unknown key",
      "type: task",
      `status: "open"`,
      "blockers:",
      "  - \"[[r/x/issues/01-elsewhere]]\"",
      `status_since: 2026-01-01`,
      "zeta: [1, 2]",
      "---",
      "",
      "## Question",
      "",
      "status: open (this is prose, not frontmatter)",
      "",
    ].join("\n")
    const vault = seed(
      makeVault({
        notes: [
          map("r/e/map.md"),
          map("r/x/map.md"),
          ticket("r/x/issues/01-elsewhere.md", { status: "resolved" }),
          { path: "r/e/issues/01-a.md", text: original },
        ],
      }),
    )
    const at = (day, lines) => original.replace("status_since: 2026-01-01", `status_since: ${day}`).replace(`status: "open"`, lines)
    onOneDay((day) => {
      assert.equal(run(vault, ["claim", "r/e#01", "--by", "alice"]).code, 0)
      assert.equal(read(vault, "r/e/issues/01-a.md"), at(day, "status: claimed").replace("zeta: [1, 2]\n", "zeta: [1, 2]\nclaimed_by: alice\n"))
      assert.equal(run(vault, ["wait", "r/e#01", "--note", "reply", "--until", "2099-01-01", "--by", "alice"]).code, 0)
      assert.equal(
        read(vault, "r/e/issues/01-a.md"),
        at(day, "status: waiting").replace("zeta: [1, 2]\n", "zeta: [1, 2]\nclaimed_by: alice\nstatus_note: reply\nwait_until: 2099-01-01\n"),
      )
      assert.equal(run(vault, ["release", "r/e#01", "--by", "alice"]).code, 0)
      assert.equal(read(vault, "r/e/issues/01-a.md"), at(day, "status: open"))
    })
  })

  test("CRLF line endings and a BOM are kept", () => {
    const text = `﻿---\r\ntype: task\r\nstatus: open\r\nstatus_since: 2026-01-01\r\ntitle: A\r\nblockers: []\r\n---\r\nbody\r\n`
    const vault = seed(makeVault({ notes: [map("r/e/map.md"), { path: "r/e/issues/01-a.md", text }] }))
    onOneDay((day) => {
      run(vault, ["claim", "r/e#01", "--by", "a"])
      assert.equal(
        read(vault, "r/e/issues/01-a.md"),
        `﻿---\r\ntype: task\r\nstatus: claimed\r\nstatus_since: ${day}\r\ntitle: A\r\nblockers: []\r\nclaimed_by: a\r\n---\r\nbody\r\n`,
      )
    })
  })
})

describe("the main checkout", () => {
  test("run from a vault worktree, wf writes and commits in the main checkout", () => {
    const vault = twoTickets()
    const worktree = join(vault, ".worktrees/side")
    git(vault, "worktree", "add", "-q", "-b", "side", worktree)
    const r = run(vault, ["claim", "r/e#01", "--by", "a"], { cwd: worktree, script: join(worktree, "_tools/wf.mjs") })
    assert.equal(r.code, 0, r.stderr)
    assert.match(read(vault, "r/e/issues/01-a.md"), /^status: claimed$/m)
    assert.equal(git(vault, "log", "-1", "--format=%s", "HEAD"), "wf(claim): r/e#01")
    assert.match(read(worktree, "r/e/issues/01-a.md"), /^status: "open"$/m)
    assert.equal(git(worktree, "log", "-1", "--format=%s"), "seed")
  })

  test("a main checkout mid-merge exits 2 and nothing is written", () => {
    const vault = twoTickets()
    const branch = git(vault, "branch", "--show-current")
    git(vault, "checkout", "-qb", "other")
    write(vault, "notes.md", "theirs\n")
    git(vault, "add", "notes.md")
    git(vault, "commit", "-qm", "theirs")
    git(vault, "checkout", "-q", branch)
    write(vault, "notes.md", "ours\n")
    git(vault, "add", "notes.md")
    git(vault, "commit", "-qm", "ours")
    const head = git(vault, "rev-parse", "HEAD")
    assert.throws(() => git(vault, "merge", "-q", "other"))
    const before = read(vault, "r/e/issues/01-a.md")

    const r = run(vault, ["claim", "r/e#01", "--by", "a"])
    assert.equal(r.code, 2)
    assert.match(r.stderr, /is mid-merge — nothing was written/)
    assert.match(r.stderr, /merge --abort/)
    assert.equal(read(vault, "r/e/issues/01-a.md"), before)
    assert.equal(git(vault, "rev-parse", "HEAD"), head)
  })

  test("a vault older than the supported schema refuses to write", () => {
    const vault = seed(makeVault({ manifest: { vault_schema: 1 }, notes: [map("r/e/map.md"), ticket("r/e/issues/01-a.md")] }))
    for (const args of [["claim", "r/e#01", "--by", "a"], ["lint", "--fix"]]) {
      const r = run(vault, args)
      assert.equal(r.code, 2)
      assert.match(r.stderr, /vault schema 1 is older than 2 — run `wf migrate`/)
    }
  })
})

describe("concurrency and the lock", () => {
  const LOCK = (vault) => join(vault, ".git/wf.lock")

  test("two wf claim on one ticket at once: exactly one succeeds", async () => {
    const vault = twoTickets()
    const results = await Promise.all(["alice", "bob"].map((by) => runAsync(vault, ["claim", "r/e#01", "--by", by])))
    assert.deepEqual(results.map((r) => r.code).sort(), [0, 1], results.map((r) => r.stderr).join("\n"))
    const winner = ["alice", "bob"][results.findIndex((r) => r.code === 0)]
    assert.match(read(vault, "r/e/issues/01-a.md"), new RegExp(`^claimed_by: ${winner}$`, "m"))
    assert.match(results.find((r) => r.code === 1).stderr, new RegExp(`is claimed by ${winner}`))
    assert.equal(git(vault, "log", "--format=%s").split("\n").filter((s) => s.startsWith("wf(claim)")).length, 1)
    assert.ok(!existsSync(LOCK(vault)), "the lock is released")
  })

  test("a stale lock is broken with a warning", () => {
    const vault = twoTickets()
    mkdirSync(LOCK(vault))
    const old = new Date(Date.now() - 60_000)
    utimesSync(LOCK(vault), old, old)
    const r = run(vault, ["claim", "r/e#01", "--by", "a"])
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stderr, /^wf: warning: broke a stale vault lock .*wf\.lock \(60 s old, stale after 30 s\)$/m)
    assert.ok(!existsSync(LOCK(vault)))
  })

  test("a stale lock broken before a refusal is still reported", () => {
    const vault = twoTickets()
    mkdirSync(LOCK(vault))
    const old = new Date(Date.now() - 60_000)
    utimesSync(LOCK(vault), old, old)
    const r = run(vault, ["claim", "r/e#02", "--by", "a"])
    assert.equal(r.code, 1)
    assert.match(r.stderr, /^wf: warning: broke a stale vault lock /m)
    assert.match(r.stderr, /^wf: r\/e#02 is blocked by/m)
  })

  test("a held lock times out with exit 2 naming it", () => {
    const vault = twoTickets()
    mkdirSync(LOCK(vault))
    const before = read(vault, "r/e/issues/01-a.md")
    const started = Date.now()
    const r = run(vault, ["claim", "r/e#01", "--by", "a", "--json"])
    assert.ok(Date.now() - started >= 10_000, "waits the full 10 s")
    assert.equal(r.code, 2)
    assert.match(r.json.error.message, /^the vault lock .*\.git\/wf\.lock is held by another wf \(waited 10 s\)$/)
    assert.equal(read(vault, "r/e/issues/01-a.md"), before)
    assert.ok(existsSync(LOCK(vault)), "someone else's lock is left alone")
  })

  test("git's index.lock is waited out", async () => {
    const vault = twoTickets()
    writeFileSync(join(vault, ".git/index.lock"), "")
    const pending = runAsync(vault, ["claim", "r/e#01", "--by", "a"])
    setTimeout(() => rmSync(join(vault, ".git/index.lock")), 300)
    const r = await pending
    assert.equal(r.code, 0, r.stderr)
    assert.equal(lastCommit(vault).subject, "wf(claim): r/e#01")
  })
})

describe("lint after every verb", () => {
  test("a clean vault stays clean: no warnings after claim, wait and release", () => {
    const vault = twoTickets()
    for (const args of [["claim", "r/e#01", "--by", "a"], ["wait", "r/e#01", "--note", "n", "--by", "a"], ["release", "r/e#01", "--by", "a"]]) {
      const r = run(vault, [...args, "--json"])
      assert.equal(r.code, 0, r.stderr)
      assert.deepEqual(r.json.data.lint, [], args[0])
      assert.equal(r.stderr, "", args[0])
    }
  })


  test("findings on the touched effort are warnings, never a failure", () => {
    const vault = seed(
      makeVault({
        notes: [
          map("r/e/map.md"),
          ticket("r/e/issues/01-a.md", { title: "A" }),
          ticket("r/e/issues/02-dangling.md", { blockers: ["[[09-gone]]"] }),
          map("r/other/map.md"),
          ticket("r/other/issues/01-x.md", { blockers: ["[[09-gone]]"] }),
        ],
      }),
    )
    const r = run(vault, ["claim", "r/e#01", "--by", "a", "--json"])
    assert.equal(r.code, 0)
    assert.equal(r.json.ok, true)
    const rules = r.json.data.lint.map((f) => `${f.ref} ${f.rule}`)
    assert.ok(rules.includes("r/e#02 dangling-blocker"), rules.join("\n"))
    assert.ok(!rules.some((x) => x.startsWith("r/other")), "only the touched effort is linted")
    assert.match(r.stderr, /^wf: warning: lint error dangling-blocker r\/e#02: /m)
  })
})

describe("a commit that fails", () => {
  test("leaves files and the index as they were, staged hunks included", () => {
    const vault = twoTickets()
    write(vault, ".git/hooks/pre-commit", "#!/bin/sh\necho hook says no >&2\nexit 1\n")
    chmodSync(join(vault, ".git/hooks/pre-commit"), 0o755)
    write(vault, "r/e/issues/01-a.md", `${read(vault, "r/e/issues/01-a.md")}staged prose\n`)
    git(vault, "add", "r/e/issues/01-a.md")
    write(vault, "r/e/issues/01-a.md", `${read(vault, "r/e/issues/01-a.md")}unstaged prose\n`)
    const [before, status, staged] = [read(vault, "r/e/issues/01-a.md"), git(vault, "status", "--porcelain"), git(vault, "diff", "--cached")]

    const r = run(vault, ["claim", "r/e#01", "--by", "a"])
    assert.equal(r.code, 2)
    assert.match(r.stderr, /git commit failed: hook says no/)
    assert.equal(read(vault, "r/e/issues/01-a.md"), before)
    assert.equal(git(vault, "status", "--porcelain"), status)
    assert.equal(git(vault, "diff", "--cached"), staged)
    assert.ok(!existsSync(join(vault, ".git/wf.lock")))
  })

  test("the first commit of a vault with no history works", () => {
    const vault = makeVault({ notes: [map("r/e/map.md"), ticket("r/e/issues/01-a.md")] })
    const r = run(vault, ["claim", "r/e#01", "--by", "a"])
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(lastCommit(vault), { subject: "wf(claim): r/e#01", files: ["r/e/issues/01-a.md", "r/e/map.md"] })
  })
})

describe("a vault wf can't write", { skip: process.getuid?.() === 0 }, () => {
  const SANDBOX = /outside the sandbox's writable paths/

  test("a read-only ticket directory exits 2 with the sandbox hint, nothing written", () => {
    const vault = twoTickets()
    const dir = join(vault, "r/e/issues")
    chmodSync(dir, 0o555)
    try {
      const before = read(vault, "r/e/issues/01-a.md")
      const r = run(vault, ["claim", "r/e#01", "--by", "a"])
      assert.equal(r.code, 2)
      assert.match(r.stderr, /^wf: cannot write .*01-a\.md: EACCES — /m)
      assert.match(r.stderr, SANDBOX)
      assert.equal(read(vault, "r/e/issues/01-a.md"), before)
      assert.equal(lastCommit(vault).subject, "seed")
    } finally {
      chmodSync(dir, 0o755)
    }
  })

  test("a git dir wf can't take the lock in exits 2 with the sandbox hint", () => {
    const vault = twoTickets()
    chmodSync(join(vault, ".git"), 0o555)
    try {
      const r = run(vault, ["claim", "r/e#01", "--by", "a"])
      assert.equal(r.code, 2)
      assert.match(r.stderr, /wf\.lock: EACCES/)
      assert.match(r.stderr, SANDBOX)
    } finally {
      chmodSync(join(vault, ".git"), 0o755)
    }
  })

  test("a write that fails half way leaves every file as it was", () => {
    const vault = twoTickets()
    const before = read(vault, "r/e/issues/01-a.md")
    // The ticket is written first; the map's directory refuses the second write.
    chmodSync(join(vault, "r/e"), 0o555)
    try {
      const r = run(vault, ["claim", "r/e#01", "--by", "a"])
      assert.equal(r.code, 2)
      assert.match(r.stderr, /map\.md: EACCES/)
      assert.equal(read(vault, "r/e/issues/01-a.md"), before)
    } finally {
      chmodSync(join(vault, "r/e"), 0o755)
    }
  })
})
