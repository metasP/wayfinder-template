// The autocommit hook as a process (spec docs/specs/ticket-store.md, *New autocommit (Q7)*, Testing
// Decisions "Hooks are tested as processes"): PostToolUse hook JSON goes to stdin of the wired
// `_tools/autocommit.sh`. A prose Write/Edit is committed in the repository that holds the file; a
// failure exits 0 with `additionalContext` on stdout and a line in the failure log.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FAILURE_LOG } from "../template/_tools/lib/autocommit.mjs"
import { git, makeVault, seed, write } from "./vault.mjs"

const NOTE = "r/e/notes/idea.md"

/**
 * Run the wired `bash <vault>/_tools/autocommit.sh` (or, with `node: true`, `node <vault>/_tools/autocommit.mjs`
 * behind it) with `input` (an object, or raw text) on stdin.
 */
function hook(vault, input, { env = {}, node = false } = {}) {
  const stdin = typeof input === "string" ? input : JSON.stringify({ hook_event_name: "PostToolUse", cwd: vault, ...input })
  const [cmd, script] = node ? [process.execPath, "_tools/autocommit.mjs"] : ["bash", "_tools/autocommit.sh"]
  const r = spawnSync(cmd, [join(vault, script)], { input: stdin, encoding: "utf8", env: { ...process.env, ...env } })
  let json
  try {
    json = JSON.parse(r.stdout)
  } catch {
    json = undefined
  }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json }
}

const writeEvent = (path) => ({ tool_name: "Write", tool_input: { file_path: path, content: "…" }, tool_response: { filePath: path } })
const editEvent = (path) => ({ tool_name: "Edit", tool_input: { file_path: path, old_string: "a", new_string: "b" } })

const commitCount = (repo) => Number(git(repo, "rev-list", "--count", "HEAD"))
const filesOf = (repo, rev = "HEAD") => git(repo, "show", "--name-only", "--format=", rev).split("\n").filter(Boolean)

/** A seeded fixture vault, so the next commit in it is the hook's. */
const seededVault = () => seed(makeVault({ notes: [{ path: NOTE, text: "# Idea\n" }] }))

describe("a prose edit", () => {
  test("a Write is committed as one commit holding only that file, silently", () => {
    const vault = seededVault()
    write(vault, NOTE, "# Idea\n\nMore.\n")
    write(vault, "r/e/notes/other.md", "someone else's work\n")
    const before = commitCount(vault)

    const r = hook(vault, writeEvent(join(vault, NOTE)))

    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.stdout, "")
    assert.equal(commitCount(vault), before + 1)
    assert.deepEqual(filesOf(vault), [NOTE])
    assert.match(git(vault, "log", "-1", "--format=%s"), /^chore\(vault\): update idea\.md$/)
  })
})

describe("what the hook leaves alone", () => {
  test("an Edit in a vault worktree is committed on the worktree's branch, and main does not move", () => {
    const vault = seededVault()
    // As the template's `.gitignore` does: session worktrees live under the vault and are ignored.
    write(vault, ".gitignore", ".claude/\n")
    git(vault, "add", ".gitignore")
    git(vault, "commit", "-qm", "ignore")
    const tree = join(vault, ".claude/worktrees/s1")
    git(vault, "worktree", "add", "-q", "-b", "claude/s1", tree)
    // The main checkout's own branch: `git init` names it `main` or `master` depending on the machine.
    const mainHead = git(vault, "rev-parse", "HEAD")
    write(tree, NOTE, "# Idea\n\nFrom the worktree.\n")

    const r = hook(vault, editEvent(join(tree, NOTE)))

    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.stdout, "")
    assert.deepEqual(filesOf(tree, "claude/s1"), [NOTE])
    assert.equal(git(vault, "rev-parse", "HEAD"), mainHead)
    assert.equal(git(vault, "status", "--porcelain"), "")
  })

  test("a Bash event is not handled, even with the vault dirty", () => {
    const vault = seededVault()
    write(vault, NOTE, "# Idea\n\nBy sed.\n")
    const before = commitCount(vault)

    const r = hook(vault, { tool_name: "Bash", tool_input: { command: `sed -i '' s/a/b/ ${NOTE}` } })

    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.stdout, "")
    assert.equal(commitCount(vault), before)
  })

  test("an edit in another repository is none of its business", () => {
    const vault = seededVault()
    const other = seed(makeVault({ notes: [{ path: "src/a.md", text: "a\n" }] }))
    write(other, "src/a.md", "b\n")
    const before = commitCount(other)

    const r = hook(vault, editEvent(join(other, "src/a.md")))

    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.stdout, "")
    assert.equal(commitCount(other), before)
  })

  test("a MultiEdit, or any other event naming a file_path, is committed like an Edit", () => {
    const vault = seededVault()
    write(vault, NOTE, "# Idea\n\nMany.\n")
    const before = commitCount(vault)

    const r = hook(vault, { tool_name: "MultiEdit", tool_input: { file_path: join(vault, NOTE), edits: [] } })

    assert.equal(r.stdout, "")
    assert.equal(commitCount(vault), before + 1)
  })

  test("an edit in a separate repository nested inside the vault folder is not the vault's", () => {
    const vault = seededVault()
    const nested = join(vault, "proj")
    write(vault, "proj/a.md", "a\n")
    git(nested, "init", "-q")

    const r = hook(vault, editEvent(join(nested, "a.md")))

    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.stdout, "")
    assert.deepEqual(failureLog(vault), [])
  })

  test("a tracked file deleted after its edit is committed as a deletion", () => {
    const vault = seededVault()
    rmSync(join(vault, NOTE))

    const r = hook(vault, editEvent(join(vault, NOTE)))

    assert.equal(r.stdout, "")
    assert.match(git(vault, "show", "--name-status", "--format=", "HEAD"), new RegExp(`^D\\s+${NOTE}$`))
  })

  test("an edit that changed nothing, or an ignored file, commits nothing and says nothing", () => {
    const vault = seededVault()
    write(vault, ".gitignore", "scratch/\n")
    git(vault, "add", ".gitignore")
    git(vault, "commit", "-qm", "ignore")
    write(vault, "scratch/tmp.md", "x\n")
    const before = commitCount(vault)

    for (const path of [NOTE, "scratch/tmp.md"]) {
      const r = hook(vault, editEvent(join(vault, path)))
      assert.equal(r.code, 0, r.stderr)
      assert.equal(r.stdout, "", path)
    }
    assert.equal(commitCount(vault), before)
  })
})

/** The failure log's lines, in the vault's git dir. */
const failureLog = (vault) => {
  try {
    return readFileSync(join(vault, ".git", FAILURE_LOG), "utf8").split("\n").filter(Boolean)
  } catch {
    return []
  }
}

/** A failure: exit 0, hook JSON whose additionalContext matches `reason`, nothing committed. */
function assertFailed(r, vault, reason, before) {
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json?.hookSpecificOutput?.hookEventName, "PostToolUse", r.stdout)
  assert.match(r.json.hookSpecificOutput.additionalContext, /^wayfinder autocommit: /)
  assert.match(r.json.hookSpecificOutput.additionalContext, reason)
  if (before !== undefined) assert.equal(commitCount(vault), before)
}

describe("a failure is told to the agent and logged", () => {
  test("a held index.lock: additionalContext names it and how to commit, and the log gains a line", () => {
    const vault = seededVault()
    write(vault, NOTE, "# Idea\n\nMore.\n")
    writeFileSync(join(vault, ".git/index.lock"), "")
    const before = commitCount(vault)

    const r = hook(vault, editEvent(join(vault, NOTE)))

    assertFailed(r, vault, /index\.lock/, before)
    assert.match(r.json.hookSpecificOutput.additionalContext, new RegExp(`git -C \\S+ add -- ${NOTE}`))
    const lines = failureLog(vault)
    assert.equal(lines.length, 1)
    assert.match(lines[0], new RegExp(`^\\d{4}-\\d\\d-\\d\\dT\\S+\\t\\S+${NOTE}\\t.*index\\.lock`))
  })

  test("a commit refused by a git hook is told, and each failure adds its own log line", () => {
    const vault = seededVault()
    write(vault, ".git/hooks/pre-commit", "#!/bin/sh\necho no commits today >&2\nexit 1\n")
    chmodSync(join(vault, ".git/hooks/pre-commit"), 0o755)
    const before = commitCount(vault)

    write(vault, NOTE, "# Idea\n\nOne.\n")
    assertFailed(hook(vault, editEvent(join(vault, NOTE))), vault, /no commits today/, before)
    write(vault, NOTE, "# Idea\n\nTwo.\n")
    assertFailed(hook(vault, editEvent(join(vault, NOTE))), vault, /no commits today/, before)
    assert.equal(failureLog(vault).length, 2)
  })

  // Nothing is lost mid-merge — the edit goes in with the merge commit — so the agent is told, and the
  // owner's log is not filled with every edit of a conflict resolution.
  test("a worktree mid-merge is told that the edit rides with the merge, and nothing is logged", () => {
    const vault = seededVault()
    write(vault, ".gitignore", ".claude/\n")
    git(vault, "add", ".gitignore")
    git(vault, "commit", "-qm", "ignore")
    const tree = join(vault, ".claude/worktrees/s1")
    git(vault, "worktree", "add", "-q", "-b", "claude/s1", tree)
    writeFileSync(join(vault, ".git/worktrees/s1/MERGE_HEAD"), `${git(vault, "rev-parse", "HEAD")}\n`)
    write(tree, NOTE, "# Idea\n\nResolved.\n")
    const before = commitCount(tree)

    const r = hook(vault, editEvent(join(tree, NOTE)))

    assertFailed(r, tree, new RegExp(`${tree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\S* is mid-merge.*merge --continue`), before)
    assert.doesNotMatch(r.json.hookSpecificOutput.additionalContext, /main checkout|nothing was written/)
    assert.deepEqual(failureLog(vault), [])
  })

  test("mid-merge, an edit to an unchanged file says nothing", () => {
    const vault = seededVault()
    writeFileSync(join(vault, ".git/MERGE_HEAD"), `${git(vault, "rev-parse", "HEAD")}\n`)

    const r = hook(vault, editEvent(join(vault, NOTE)))

    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.stdout, "")
  })

  test("a file still holding conflict markers is not committed", () => {
    const vault = seededVault()
    write(vault, NOTE, "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> other\n")
    const before = commitCount(vault)

    assertFailed(hook(vault, editEvent(join(vault, NOTE))), vault, /conflict markers/, before)
  })

  // Through the node entry: the wired shell script falls back to the standard install path when the
  // vault has no `.git` (the next test covers what it says then).
  test("a vault that is not a git repository is told, and that the log could not be written", () => {
    const vault = makeVault({ notes: [{ path: NOTE, text: "# Idea\n" }] })
    rmSync(join(vault, ".git"), { recursive: true, force: true })

    const r = hook(vault, editEvent(join(vault, NOTE)), { node: true })

    assertFailed(r, vault, /not a git repository.*failure log could not be written/)
  })

  test("hook input that is not JSON is told", () => {
    const vault = seededVault()
    assertFailed(hook(vault, "not json"), vault, /cannot read the hook input/)
    assert.equal(failureLog(vault).length, 1)
  })

  test("a partial install (the hook's lib missing) is told, not left to die on stderr", () => {
    const vault = seededVault()
    rmSync(join(vault, "_tools/lib/autocommit.mjs"))

    assertFailed(hook(vault, editEvent(join(vault, NOTE))), vault, /cannot load.*lib\/autocommit\.mjs.*bootstrap/)
  })

  test("an unrendered VAULT line with no vault at the fallback path is told as valid hook JSON", () => {
    const vault = seededVault()
    const src = readFileSync(join(vault, "_tools/autocommit.sh"), "utf8").replace(/^VAULT=.*$/m, 'VAULT="__VAULT__"')
    write(vault, "_tools/autocommit.sh", src)
    const home = mkdtempSync(join(tmpdir(), 'home "quoted"\t\\ '))

    const r = hook(vault, editEvent(join(vault, NOTE)), { env: { HOME: home } })

    assertFailed(r, vault, /autocommit\.mjs is missing/)
    assert.ok(r.json.hookSpecificOutput.additionalContext.includes(home.replace("\t", " ")))
  })
})
