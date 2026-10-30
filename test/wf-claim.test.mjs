// `wf claim` / `release` / `wait` through the CLI against fixture vaults (spec *Verbs*: ticket
// transitions; *`claimed_by` value*; Testing Decisions §1): the happy paths, every refused invariant
// (exit 1 with the fixing command), and who a claim is stamped with.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { realpathSync } from "node:fs"
import { join } from "node:path"
import { git, makeVault, map, onOneDay, read, seed, ticket, wf } from "./vault.mjs"

// No session id leaks in from the shell that runs the tests; a test that wants one injects it.
const NO_SESSION = { CLAUDE_CODE_SESSION_ID: undefined }
const run = (vault, args, opts = {}) => wf(vault, args, { ...opts, env: { ...NO_SESSION, ...opts.env } })

const vaultWith = (notes) => seed(makeVault({ notes }))
const oneTicket = (fields = {}, mapFields = {}) =>
  vaultWith([map("r/e/map.md", mapFields), ticket("r/e/issues/01-a.md", { title: "A", ...fields })])

const frontmatterOf = (vault, rel) => read(vault, rel).split("---\n")[1]

describe("wf claim", () => {
  test("claims an open ticket: status, status_since and claimed_by", () => {
    const vault = oneTicket()
    const { r, day } = onOneDay((day) => ({ r: run(vault, ["claim", "r/e#01", "--by", "alice", "--json"]), day }))
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.json.ok, true)
    assert.equal(r.json.data.ref, "r/e#01")
    assert.equal(r.json.data.claimed_by, "alice")
    const fm = frontmatterOf(vault, "r/e/issues/01-a.md")
    assert.match(fm, /^status: claimed$/m)
    assert.match(fm, new RegExp(`^status_since: ${day}$`, "m"))
    assert.match(fm, /^claimed_by: alice$/m)
  })
})

// An invariant refusal: exit 1, the invariant on stderr, the fixing command under it, nothing written.
const refused = (vault, args, invariant, fix) => {
  const head = git(vault, "rev-parse", "HEAD")
  const before = read(vault, "r/e/issues/01-a.md")
  const r = run(vault, args)
  assert.equal(r.code, 1, r.stderr)
  assert.match(r.stderr, invariant)
  assert.match(r.stderr, new RegExp(`^  fix: ${fix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m"))
  assert.equal(read(vault, "r/e/issues/01-a.md"), before)
  assert.equal(git(vault, "rev-parse", "HEAD"), head, "no commit")
  const json = run(vault, [...args, "--json"]).json
  assert.equal(json.ok, false)
  assert.equal(json.error.code, 1)
  assert.ok(json.error.details.includes(`fix: ${fix}`), json.error.details.join("\n"))
}

describe("wf claim refuses", () => {
  test("a ticket that is already claimed", () => {
    refused(oneTicket({ status: "claimed", claimed_by: "bob" }), ["claim", "r/e#01", "--by", "alice"], /r\/e#01 is claimed by bob — claim needs a ticket that is open/, "wf release r/e#01")
  })

  test("a waiting ticket", () => {
    refused(oneTicket({ status: "waiting", status_note: "vendor reply" }), ["claim", "r/e#01", "--by", "a"], /r\/e#01 is waiting \(vendor reply\)/, "wf release r/e#01")
  })

  test("a resolved ticket", () => {
    refused(oneTicket({ status: "resolved" }), ["claim", "r/e#01", "--by", "a"], /r\/e#01 is resolved/, "wf new r/e --type task --title <title> (a resolved ticket stays resolved; open a follow-up)")
  })

  test("a ticket with an unknown status", () => {
    refused(oneTicket({ status: "doing" }), ["claim", "r/e#01", "--by", "a"], /r\/e#01 has status "doing", which is not a ticket status/, "wf lint r/e")
  })

  test("a blocked ticket, naming the open blocker", () => {
    const vault = vaultWith([
      map("r/e/map.md"),
      ticket("r/e/issues/01-a.md", { blockers: ["[[02-gate]]"] }),
      ticket("r/e/issues/02-gate.md"),
    ])
    refused(vault, ["claim", "r/e#01", "--by", "a"], /r\/e#01 is blocked by r\/e#02 \(open\) — a blocked ticket can't be claimed/, "wf claim r/e#02 (work the blocker first)")
  })

  test("a ticket whose blocker resolves to nothing (fail closed)", () => {
    const vault = vaultWith([map("r/e/map.md"), ticket("r/e/issues/01-a.md", { blockers: ["[[09-gone]]"] })])
    refused(vault, ["claim", "r/e#01", "--by", "a"], /blocked by \[\[09-gone\]\] \(resolves to no ticket\)/, "wf lint r/e (fix the blocker link)")
  })

  test("a ticket on a map that isn't active", () => {
    refused(oneTicket({}, { status: "paused", status_note: "later" }), ["claim", "r/e#01", "--by", "a"], /map r\/e is paused, not active/, "wf map-status r/e active")
  })

  test("a ticket in an effort without a map", () => {
    const vault = vaultWith([map("r/other/map.md"), ticket("r/e/issues/01-a.md")])
    refused(vault, ["claim", "r/e#01", "--by", "a"], /r\/e has no map/, "wf chart r/e --title <title>")
  })

  test("a resolved blocker doesn't block", () => {
    const vault = vaultWith([
      map("r/e/map.md"),
      ticket("r/e/issues/01-a.md", { blockers: ["[[02-gate]]"] }),
      ticket("r/e/issues/02-gate.md", { status: "resolved" }),
    ])
    assert.equal(run(vault, ["claim", "r/e#01", "--by", "a"]).code, 0)
  })
})

describe("wf claim arguments", () => {
  const cases = [
    [["claim"], /missing argument — usage: wf claim <ref>/],
    [["claim", "r/e#01", "r/e#02", "--by", "a"], /unexpected argument "r\/e#02"/],
    [["claim", "r/e", "--by", "a"], /cannot read "r\/e" as a ticket ref/],
    [["claim", "[[01-a]]", "--by", "a"], /cannot read "\[\[01-a\]\]" as a ticket ref/],
    [["claim", "r/e#07", "--by", "a"], /no ticket r\/e#07 in the vault/],
    [["claim", "r/e#01", "--by"], /--by needs a value/],
  ]
  for (const [args, message] of cases)
    test(`wf ${args.join(" ")} exits 2`, () => {
      const r = run(oneTicket(), args)
      assert.equal(r.code, 2)
      assert.match(r.stderr, message)
    })

  test("a ticket can be named by vault path, absolute path or full-path wikilink", () => {
    for (const ref of ["r/e/issues/01-a.md", "[[r/e/issues/01-a]]"]) {
      const vault = oneTicket()
      assert.equal(run(vault, ["claim", ref, "--by", "a", "--json"]).json.data.ref, "r/e#01")
    }
    const vault = oneTicket()
    assert.equal(run(vault, ["claim", join(vault, "r/e/issues/01-a.md"), "--by", "a", "--json"]).json.data.ref, "r/e#01")
  })
})

describe("claimed_by", () => {
  test("--by wins over everything", () => {
    const vault = oneTicket()
    run(vault, ["claim", "r/e#01", "--by", "alice"], { env: { CLAUDE_CODE_SESSION_ID: "0123456789abcdef" } })
    assert.match(frontmatterOf(vault, "r/e/issues/01-a.md"), /^claimed_by: alice$/m)
  })

  test("from a main checkout, the session id is used, never the branch", () => {
    const vault = oneTicket()
    const r = run(vault, ["claim", "r/e#01", "--json"], { env: { CLAUDE_CODE_SESSION_ID: "0123456789abcdef" } })
    assert.equal(r.json.data.claimed_by, "session:01234567")
    assert.match(frontmatterOf(vault, "r/e/issues/01-a.md"), /^claimed_by: session:01234567$/m)
  })

  test("from a linked worktree, its branch wins over the session id", () => {
    const vault = oneTicket()
    const repo = seed(makeVault())
    git(repo, "commit", "-q", "--allow-empty", "-m", "base")
    const worktree = join(repo, ".worktrees/s")
    git(repo, "worktree", "add", "-q", "-b", "claude/fix-thing", worktree)
    const r = run(vault, ["claim", "r/e#01", "--json"], { cwd: worktree, env: { CLAUDE_CODE_SESSION_ID: "0123456789abcdef" } })
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.json.data.claimed_by, "claude/fix-thing")
  })

  test("a linked worktree on a detached HEAD falls through to the session id", () => {
    const vault = oneTicket()
    const repo = seed(makeVault())
    git(repo, "commit", "-q", "--allow-empty", "-m", "base")
    const worktree = join(repo, ".worktrees/d")
    git(repo, "worktree", "add", "-q", "--detach", worktree)
    const r = run(vault, ["claim", "r/e#01", "--json"], { cwd: worktree, env: { CLAUDE_CODE_SESSION_ID: "fedcba9876543210" } })
    assert.equal(r.json.data.claimed_by, "session:fedcba98")
  })

  test("with no --by, no linked worktree and no session id, exit 2 asks for --by", () => {
    const vault = oneTicket()
    const r = run(vault, ["claim", "r/e#01"])
    assert.equal(r.code, 2)
    assert.match(r.stderr, /cannot tell who is claiming — pass `--by <name>`/)
    assert.match(frontmatterOf(vault, "r/e/issues/01-a.md"), /^status: "open"$/m, "the fixture writes values quoted")
  })

  test("a name with a Unicode line separator stays on one line and reads back", () => {
    const vault = oneTicket()
    assert.equal(run(vault, ["claim", "r/e#01", "--by", "a\u2028b"]).code, 0)
    assert.match(frontmatterOf(vault, "r/e/issues/01-a.md"), /^claimed_by: "a\\u2028b"$/m)
    assert.equal(run(vault, ["lint", "--json"]).json.data.findings.filter((f) => f.severity === "error").length, 0)
  })

  test("a name that YAML would misread is written quoted and read back as given", () => {
    const vault = oneTicket()
    run(vault, ["claim", "r/e#01", "--by", "true"])
    assert.match(frontmatterOf(vault, "r/e/issues/01-a.md"), /^claimed_by: "true"$/m)
    const lint = run(vault, ["lint", "--json"]).json.data.findings
    assert.deepEqual(lint.filter((f) => f.severity === "error"), [])
  })
})

describe("wf release", () => {
  for (const [from, fields] of [
    ["claimed", { status: "claimed", claimed_by: "bob" }],
    ["waiting", { status: "waiting", claimed_by: "bob", status_note: "vendor", wait_until: "2099-01-01" }],
  ])
    test(`${from} → open, clearing claimed_by, status_note and wait_until`, () => {
      const vault = oneTicket(fields)
      const { r, day } = onOneDay((day) => ({ r: run(vault, ["release", "r/e#01", "--json"]), day }))
      assert.equal(r.code, 0, r.stderr)
      assert.deepEqual([r.json.data.ref, r.json.data.status], ["r/e#01", "open"])
      const fm = frontmatterOf(vault, "r/e/issues/01-a.md")
      assert.match(fm, /^status: open$/m)
      assert.match(fm, new RegExp(`^status_since: ${day}$`, "m"))
      assert.doesNotMatch(fm, /claimed_by|status_note|wait_until/)
    })

  test("releasing works on a map that isn't active", () => {
    assert.equal(run(oneTicket({ status: "claimed", claimed_by: "b" }, { status: "paused", status_note: "x" }), ["release", "r/e#01"]).code, 0)
  })

  test("refuses an open ticket", () => {
    refused(oneTicket(), ["release", "r/e#01"], /r\/e#01 is open — release needs a ticket that is claimed or waiting/, "nothing to release; wf frontier lists open tickets")
  })

  test("refuses a resolved ticket", () => {
    refused(oneTicket({ status: "resolved" }), ["release", "r/e#01"], /r\/e#01 is resolved/, "wf new r/e --type task --title <title> (a resolved ticket stays resolved; open a follow-up)")
  })
})

describe("wf wait", () => {
  for (const from of ["open", "claimed"])
    test(`${from} → waiting with a note and an until date`, () => {
      const vault = oneTicket(from === "claimed" ? { status: "claimed", claimed_by: "bob" } : {})
      const r = run(vault, ["wait", "r/e#01", "--note", "vendor: reply #2", "--until", "2099-01-31", "--json"])
      assert.equal(r.code, 0, r.stderr)
      assert.deepEqual(
        [r.json.data.status, r.json.data.status_note, r.json.data.wait_until],
        ["waiting", "vendor: reply #2", "2099-01-31"],
      )
      const fm = frontmatterOf(vault, "r/e/issues/01-a.md")
      assert.match(fm, /^status: waiting$/m)
      assert.match(fm, /^status_note: "vendor: reply #2"$/m)
      assert.match(fm, /^wait_until: 2099-01-31$/m)
      assert.equal(/claimed_by: "bob"/.test(fm), from === "claimed", "a claim stays with whoever waits")
      assert.deepEqual(run(vault, ["lint", "--json"]).json.data.findings.filter((f) => f.ref === "r/e#01"), [])
    })

  test("without --until no wait_until is written, and a stale one is dropped", () => {
    const vault = oneTicket({ wait_until: "2020-01-01" })
    assert.equal(run(vault, ["wait", "r/e#01", "--note", "n"]).code, 0)
    assert.doesNotMatch(frontmatterOf(vault, "r/e/issues/01-a.md"), /wait_until/)
  })

  test("refuses a ticket already waiting, or resolved", () => {
    refused(oneTicket({ status: "waiting", status_note: "x" }), ["wait", "r/e#01", "--note", "n"], /r\/e#01 is waiting \(x\) — wait needs a ticket that is open or claimed/, "wf release r/e#01")
    refused(oneTicket({ status: "resolved" }), ["wait", "r/e#01", "--note", "n"], /r\/e#01 is resolved/, "wf new r/e --type task --title <title> (a resolved ticket stays resolved; open a follow-up)")
  })

  const usage = [
    [["wait", "r/e#01"], /wait needs --note/],
    [["wait", "r/e#01", "--note", "   "], /wait needs --note/],
    [["wait", "r/e#01", "--note", "n", "--until", "next week"], /--until must be a date YYYY-MM-DD, got "next week"/],
    [["wait", "r/e#01", "--note", "n", "--until", "2026-02-30"], /--until must be a date YYYY-MM-DD, got "2026-02-30"/],
  ]
  for (const [args, message] of usage)
    test(`wf ${args.join(" ")} exits 2`, () => {
      const vault = oneTicket()
      const r = run(vault, args)
      assert.equal(r.code, 2)
      assert.match(r.stderr, message)
      assert.match(frontmatterOf(vault, "r/e/issues/01-a.md"), /^status: "open"$/m)
    })
})

describe("claim commit trailers", () => {
  const body = (vault) => git(vault, "log", "-1", "--format=%b", "HEAD").trim()

  test("record the full session id and the directory, even when the worktree names another effort", () => {
    const vault = oneTicket()
    const repo = seed(makeVault())
    git(repo, "commit", "-q", "--allow-empty", "-m", "base")
    const worktree = join(repo, ".worktrees/other-effort-07-abc123")
    git(repo, "worktree", "add", "-q", "-b", "claude/other-effort-07-abc123", worktree)
    const r = run(vault, ["claim", "r/e#01", "--json"], { cwd: worktree, env: { CLAUDE_CODE_SESSION_ID: "0123456789abcdef" } })
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.json.data.claimed_by, "claude/other-effort-07-abc123")
    assert.equal(git(vault, "log", "-1", "--format=%s", "HEAD"), "wf(claim): r/e#01")
    assert.equal(body(vault), `Session: 0123456789abcdef\nCwd: ${realpathSync(worktree)}`)
    assert.equal(git(vault, "log", "-1", "--format=%(trailers:key=Session,valueonly)", "HEAD").trim(), "0123456789abcdef")
  })

  test("without a session id there is no Session trailer, only Cwd", () => {
    const vault = oneTicket()
    run(vault, ["claim", "r/e#01", "--by", "alice"], { cwd: vault })
    assert.equal(body(vault), `Cwd: ${realpathSync(vault)}`)
  })

  test("other verbs commit the bare subject", () => {
    const vault = oneTicket({ status: "claimed", claimed_by: "bob" })
    run(vault, ["release", "r/e#01"])
    assert.equal(body(vault), "")
  })
})
