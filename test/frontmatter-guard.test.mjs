// The frontmatter guard hook as a process (spec docs/specs/ticket-store.md, *Frontmatter guard hook
// (Q15)*, Testing Decisions "Hooks are tested as processes"): PreToolUse hook JSON goes to stdin; a
// denial prints the decision JSON naming the `wf` verb, a pass prints nothing and exits 0.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { git, makeVault, map, noteText, ticket } from "./vault.mjs"

const TICKET = "r/e/issues/03-pick.md"
const MAP = "r/e/map.md"
const ticketNote = (fields = {}, body = "## Question\n\nWhy?\n") => {
  const { path, frontmatter } = ticket(TICKET, fields)
  return { path, frontmatter, body }
}
const vaultWith = (...notes) => makeVault({ notes: [map(MAP), ...notes] })

/** Run `node <vault>/_tools/frontmatter-guard.mjs` with `input` (an object, or raw text) on stdin. */
function guard(vault, input) {
  const stdin = typeof input === "string" ? input : JSON.stringify({ hook_event_name: "PreToolUse", cwd: vault, ...input })
  const r = spawnSync(process.execPath, [join(vault, "_tools/frontmatter-guard.mjs")], { input: stdin, encoding: "utf8" })
  let json
  try {
    json = JSON.parse(r.stdout)
  } catch {
    json = undefined
  }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json }
}

const edit = (vault, rel, old_string, new_string, extra = {}) => ({
  tool_name: "Edit",
  tool_input: { file_path: join(vault, rel), old_string, new_string, ...extra },
})

function assertDenied(r, reason) {
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json?.hookSpecificOutput?.hookEventName, "PreToolUse", r.stdout)
  assert.equal(r.json.hookSpecificOutput.permissionDecision, "deny")
  assert.match(r.json.hookSpecificOutput.permissionDecisionReason, reason)
}

// A pass is no opinion: nothing on stdout, so the normal permission flow continues.
function assertPassed(r) {
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.stdout, "")
}

describe("Edit", () => {
  test("an Edit of the status line is denied and names wf claim with the ticket's ref", () => {
    const vault = vaultWith(ticketNote())
    const r = guard(vault, edit(vault, TICKET, 'status: "open"', 'status: "claimed"'))
    assertDenied(r, /node \S+\/_tools\/wf\.mjs claim r\/e#03/)
  })

  // [what, the ticket's fields, old_string, new_string, the verb the reason must name]
  const TICKET_CASES = [
    ["status claimed → open", { status: "claimed", claimed_by: "me" }, 'status: "claimed"', 'status: "open"', /wf\.mjs release r\/e#03/],
    ["status open → waiting", {}, 'status: "open"', 'status: "waiting"', /wf\.mjs wait r\/e#03 --note/],
    ["status claimed → resolved", { status: "claimed", claimed_by: "me" }, 'status: "claimed"', 'status: "resolved"', /wf\.mjs resolve r\/e#03 --gist/],
    ["status open → resolved", {}, 'status: "open"', 'status: "resolved"', /wf\.mjs resolve r\/e#03 --out-of-scope --gist/],
    ["status to a value no verb reaches", {}, 'status: "open"', 'status: "done"', /from `open`: .*wf\.mjs claim r\/e#03.*wf\.mjs wait r\/e#03/],
    ["status_since alone", {}, "status_since: ", "status_since: 2020-01-01 #", /`status_since`.*wf\.mjs claim r\/e#03/],
    ["blockers", {}, "blockers: []", 'blockers: ["[[01-a]]"]', /wf\.mjs block r\/e#03 <blocker-ref>/],
    ["claimed_by", { status: "claimed", claimed_by: "me" }, 'claimed_by: "me"', 'claimed_by: "you"', /wf\.mjs claim r\/e#03 --by/],
    ["status_note", { status: "waiting", status_note: "x" }, 'status_note: "x"', 'status_note: "y"', /wf\.mjs wait r\/e#03 --note/],
    ["wait_until", { status: "waiting", status_note: "x" }, 'status_note: "x"', 'status_note: "x"\nwait_until: 2030-01-01', /--until YYYY-MM-DD/],
    ["title", {}, 'title: "03-pick"', 'title: "better"', /`title` is written once by `node \S+wf\.mjs new`/],
    ["a key outside the schema", {}, "blockers: []", "blockers: []\nowner: me", /`owner` is not a tracker field.*wf\.mjs lint r\/e/],
    ["only the delimiter", {}, "---\n\n## Question", "---\n## Question", /only through wf.*wf\.mjs help/],
  ]
  for (const [what, fields, from, to, reason] of TICKET_CASES) {
    test(`a ticket Edit of ${what} is denied naming the verb`, () => {
      const vault = vaultWith(ticketNote(fields))
      assertDenied(guard(vault, edit(vault, TICKET, from, to)), reason)
    })
  }

  const MAP_CASES = [
    ["status → paused", {}, 'status: "active"', 'status: "paused"', /wf\.mjs map-status r\/e paused --note/],
    ["status → done", {}, 'status: "active"', 'status: "done"', /wf\.mjs map-status r\/e done`/],
    ["runs", { runs: 2 }, "runs: 2", "runs: 3", /wf\.mjs bump-runs r\/e/],
    ["superseded_by", {}, 'status: "active"', 'status: "active"\nsuperseded_by: "r/f"', /--superseded-by <repo\/effort>/],
    ["repos, which no verb writes", { repos: ["r"] }, 'repos: ["r"]', 'repos: ["r", "s"]', /No wf verb writes `repos`/],
  ]
  for (const [what, fields, from, to, reason] of MAP_CASES) {
    test(`a map Edit of ${what} is denied naming the verb`, () => {
      const vault = makeVault({ notes: [map(MAP, fields)] })
      assertDenied(guard(vault, edit(vault, MAP, from, to)), reason)
    })
  }

  test("an Edit that gives a ticket without frontmatter some is denied", () => {
    const vault = vaultWith({ path: TICKET, text: "## Question\n\nWhy?\n" })
    const r = guard(vault, edit(vault, TICKET, "## Question", '---\nstatus: "claimed"\n---\n## Question'))
    assertDenied(r, /wf\.mjs/)
  })

  test("a replace_all Edit that reaches the frontmatter is denied", () => {
    const vault = vaultWith(ticketNote({}, "## Question\n\nStill open?\n"))
    const r = guard(vault, edit(vault, TICKET, "open", "claimed", { replace_all: true }))
    assertDenied(r, /wf\.mjs claim r\/e#03/)
  })

  test("a vault path with a space is quoted in the command", () => {
    const vault = `${vaultWith(ticketNote())} with space`
    renameSync(vault.replace(/ with space$/, ""), vault)
    const r = guard(vault, edit(vault, TICKET, 'status: "open"', 'status: "claimed"'))
    assertDenied(r, /`node '[^']+ with space\/_tools\/wf\.mjs' claim r\/e#03`/)
  })

  test("a prose Edit below the frontmatter passes", () => {
    const vault = vaultWith(ticketNote())
    assertPassed(guard(vault, edit(vault, TICKET, "Why?", "Why not?")))
  })
})

const write = (vault, rel, content) => ({ tool_name: "Write", tool_input: { file_path: join(vault, rel), content } })

describe("Write", () => {
  test("a Write that changes the frontmatter is denied naming the verb", () => {
    const note = ticketNote()
    const vault = vaultWith(note)
    const content = noteText({ ...note.frontmatter, status: "claimed", claimed_by: "me" }, note.body)
    assertDenied(guard(vault, write(vault, TICKET, content)), /wf\.mjs claim r\/e#03/)
  })

  test("a Write that changes only the body passes", () => {
    const note = ticketNote()
    const vault = vaultWith(note)
    assertPassed(guard(vault, write(vault, TICKET, noteText(note.frontmatter, "## Question\n\nRewritten.\n"))))
  })

  test("a Write that creates a ticket is denied naming wf new", () => {
    const vault = vaultWith()
    const r = guard(vault, write(vault, "r/e/issues/07-next.md", noteText(ticket("x").frontmatter)))
    assertDenied(r, /would create a ticket.*wf\.mjs new r\/e --type research\|prototype\|grilling\|task --title/)
  })

  test("a Write that creates a map is denied naming wf chart", () => {
    const vault = makeVault()
    const r = guard(vault, write(vault, "r/new/map.md", noteText(map("x").frontmatter)))
    assertDenied(r, /would create a map.*wf\.mjs chart r\/new --title/)
  })
})

describe("scope: only ticket and map files in the vault are guarded", () => {
  const STATUS_EDIT = ['status: "open"', 'status: "claimed"']

  test("a ticket-shaped file outside the vault passes", () => {
    const vault = vaultWith(ticketNote())
    const elsewhere = makeVault({ notes: [ticketNote()] })
    // `elsewhere` holds its own copy of the hook; run this vault's hook on the other vault's file.
    assertPassed(guard(vault, edit(elsewhere, TICKET, ...STATUS_EDIT)))
  })

  const NOT_TRACKER = [
    ["a plain note in an effort", "r/e/notes.md"],
    ["Wayfinder Config", "Wayfinder Config.md"],
    ["a note under _tools", "_tools/r/e/issues/01-x.md"],
    ["a note under a dot dir", ".trash/r/e/map.md"],
    ["a file named like an effort", "r/e"],
  ]
  for (const [what, rel] of NOT_TRACKER) {
    test(`a frontmatter Edit of ${what} passes`, () => {
      const vault = makeVault({ notes: [{ path: rel, text: noteText(ticket(rel).frontmatter) }] })
      assertPassed(guard(vault, edit(vault, rel, ...STATUS_EDIT)))
    })
  }

  test("an Edit of a ticket that doesn't exist passes (the Edit tool reports it)", () => {
    const vault = vaultWith()
    assertPassed(guard(vault, edit(vault, TICKET, ...STATUS_EDIT)))
  })

  test("other tools pass", () => {
    const vault = vaultWith(ticketNote())
    assertPassed(guard(vault, { tool_name: "Bash", tool_input: { command: `sed -i '' s/open/claimed/ ${TICKET}` } }))
    assertPassed(guard(vault, { tool_name: "Read", tool_input: { file_path: join(vault, TICKET) } }))
  })

  test("a relative file_path is read against the hook's cwd", () => {
    const vault = vaultWith(ticketNote())
    const r = guard(vault, { tool_name: "Edit", tool_input: { file_path: TICKET, old_string: STATUS_EDIT[0], new_string: STATUS_EDIT[1] } })
    assertDenied(r, /wf\.mjs claim r\/e#03/)
  })
})

describe("malformed hook input fails open and says so on stderr", () => {
  const MALFORMED = [
    ["not JSON", "{nope"],
    ["empty stdin", ""],
    ["a JSON array", "[]"],
    ["null", "null"],
    ["no tool_input", { tool_name: "Edit" }],
    ["a file_path that isn't a string", { tool_name: "Edit", tool_input: { file_path: 3, old_string: "a", new_string: "b" } }],
    ["an Edit without old_string", { tool_name: "Edit", tool_input: { file_path: TICKET, new_string: "b" } }],
    ["a Write without content", { tool_name: "Write", tool_input: { file_path: TICKET } }],
  ]
  for (const [what, input] of MALFORMED) {
    test(what, () => {
      const vault = vaultWith(ticketNote())
      const r = guard(vault, input)
      assertPassed(r)
      assert.match(r.stderr, /^frontmatter-guard: malformed hook input \(.+\) — allowing the tool call\n$/)
    })
  }

  test("a guarded note that can't be read fails open too", { skip: process.getuid?.() === 0 && "root reads anything" }, () => {
    const vault = vaultWith(ticketNote())
    chmodSync(join(vault, TICKET), 0o000)
    const r = guard(vault, edit(vault, TICKET, 'status: "open"', 'status: "claimed"'))
    assertPassed(r)
    assert.match(r.stderr, /^frontmatter-guard: cannot check .*03-pick\.md \(.*EACCES.*\) — allowing the tool call\n$/)
  })
})

describe("vault worktrees are the vault", () => {
  // A vault with its notes committed, and a linked worktree of it at `where` (relative to the vault).
  const withWorktree = (where) => {
    const vault = vaultWith(ticketNote())
    git(vault, "add", "-A")
    git(vault, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init")
    const worktree = join(vault, where)
    git(vault, "worktree", "add", "-q", "-b", `wt-${Math.random().toString(36).slice(2)}`, worktree)
    return { vault, worktree }
  }

  test("a frontmatter Edit in a worktree beside the vault is denied", () => {
    const { vault, worktree } = withWorktree(`../${basename(mkdtempSync(join(tmpdir(), "wf-wt-")))}/wt`)
    assertDenied(guard(vault, edit(worktree, TICKET, 'status: "open"', 'status: "claimed"')), /wf\.mjs claim r\/e#03/)
  })

  test("a frontmatter Edit in a worktree inside the vault is denied", () => {
    const { vault, worktree } = withWorktree(".claude/worktrees/x")
    assertDenied(guard(vault, edit(worktree, TICKET, 'status: "open"', 'status: "claimed"')), /wf\.mjs claim r\/e#03/)
  })

  test("a prose Edit in a vault worktree passes", () => {
    const { vault, worktree } = withWorktree(".claude/worktrees/x")
    assertPassed(guard(vault, edit(worktree, TICKET, "Why?", "Why not?")))
  })
})

describe("a vault that is a subdirectory of a larger repository", () => {
  // `<outer>/vault` is the vault; `<outer>` is the git repository, with a linked worktree beside it.
  const nested = () => {
    const outer = mkdtempSync(join(tmpdir(), "wf-outer-"))
    const vault = join(outer, "vault")
    renameSync(vaultWith(ticketNote()), vault)
    rmSync(join(vault, ".git"), { recursive: true })
    const stray = { path: "docs/proj/issues/01-foo.md", frontmatter: { status: "open" } }
    mkdirSync(join(outer, "docs/proj/issues"), { recursive: true })
    writeFileSync(join(outer, stray.path), noteText(stray.frontmatter))
    git(outer, "init", "-q")
    git(outer, "add", "-A")
    git(outer, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init")
    const worktree = join(mkdtempSync(join(tmpdir(), "wf-wt-")), "wt")
    git(outer, "worktree", "add", "-q", "-b", "wt", worktree)
    return { outer, vault, worktree, stray }
  }

  test("a tracker-shaped file outside the vault directory passes, in the checkout and in a worktree", () => {
    const { outer, vault, worktree, stray } = nested()
    assertPassed(guard(vault, edit(outer, stray.path, 'status: "open"', 'status: "claimed"')))
    assertPassed(guard(vault, edit(worktree, stray.path, 'status: "open"', 'status: "claimed"')))
  })

  test("a ticket of the vault in a worktree is denied with its vault ref", () => {
    const { vault, worktree } = nested()
    const r = guard(vault, edit(join(worktree, "vault"), TICKET, 'status: "open"', 'status: "claimed"'))
    assertDenied(r, /wf\.mjs claim r\/e#03`/)
  })
})

describe("notes the guard can't read as frontmatter plus body", () => {
  test("a note whose frontmatter is never closed passes with a warning (wf lint reports it)", () => {
    const vault = vaultWith({ path: TICKET, text: '---\nstatus: "open"\n\n## Question\n' })
    const r = guard(vault, edit(vault, TICKET, "## Question", "---\n\n## Question"))
    assertPassed(r)
    assert.match(r.stderr, /^frontmatter-guard: r\/e\/issues\/03-pick\.md has frontmatter that is never closed .*wf\.mjs lint r\/e/)
  })

  test("a Write that keeps CRLF frontmatter and changes only the body passes", () => {
    const fm = '---\r\ntype: "task"\r\nstatus: "open"\r\n---\r\n'
    const vault = vaultWith({ path: TICKET, text: `${fm}\r\nOld.\r\n` })
    assertPassed(guard(vault, write(vault, TICKET, `${fm}\r\nNew.\r\n`)))
  })

  test("a Write that drops the frontmatter is denied and says so", () => {
    const vault = vaultWith(ticketNote())
    assertDenied(guard(vault, write(vault, TICKET, "## Question\n")), /This would remove the whole frontmatter.*wf\.mjs help/)
  })

  test("an Edit that drops the status line is denied and says no verb removes it", () => {
    const vault = vaultWith(ticketNote())
    assertDenied(guard(vault, edit(vault, TICKET, 'status: "open"\n', "")), /No verb removes `status`.*wf\.mjs claim r\/e#03/)
  })

  test("replace_all: null reads as absent", () => {
    const vault = vaultWith(ticketNote())
    const r = guard(vault, edit(vault, TICKET, 'status: "open"', 'status: "claimed"', { replace_all: null }))
    assertDenied(r, /wf\.mjs claim r\/e#03/)
  })
})
