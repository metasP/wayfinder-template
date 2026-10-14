// The git side of the write verbs (spec *Locking and commits*): wf writes and commits in the vault's
// main checkout, refuses one that is mid-merge, mid-rebase or similar, commits only the files a verb
// touched, and retries while another git holds `index.lock`.
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { usageError } from "./errors.mjs"
import { runGit } from "./git.mjs"
import { SANDBOX_HINT, sleep } from "./io.mjs"

// Backoff while git reports `index.lock` (another git is running): ≈3 s in all.
export const INDEX_LOCK_RETRY_MS = Object.freeze([50, 100, 200, 400, 800, 1600])

// What a checkout's git dir holds while an operation is half done.
const IN_PROGRESS = Object.freeze([
  ["MERGE_HEAD", "mid-merge", "git merge --abort"],
  ["rebase-merge", "mid-rebase", "git rebase --abort"],
  ["rebase-apply", "mid-rebase or mid-am", "git rebase --abort"],
  ["CHERRY_PICK_HEAD", "mid-cherry-pick", "git cherry-pick --abort"],
  ["REVERT_HEAD", "mid-revert", "git revert --abort"],
])

// Vault paths are file names, never patterns: `03-*.md` names one file.
const LITERAL = Object.freeze(["--literal-pathspecs"])

const REFUSED_RE = /Permission denied|Operation not permitted|Read-only file system/

const gitFailure = (what, r, vault) =>
  REFUSED_RE.test(r.why)
    ? usageError(`${what} failed: ${r.why} — ${SANDBOX_HINT}`, { details: [`vault: ${vault}`] })
    : usageError(`${what} failed: ${r.why}`)

const gitOrFail = (vault, args, what) => {
  const r = runGit(vault, args)
  if (!r.ok) throw gitFailure(what, r, vault)
  return r.stdout.trim()
}

/** The main checkout's own git dir and the repository's common dir (where the lock lives), absolute. */
export function gitDirs(vault) {
  const [gitDir, commonDir] = gitOrFail(vault, ["rev-parse", "--git-dir", "--git-common-dir"], "git rev-parse").split("\n")
  return { gitDir: resolve(vault, gitDir), commonDir: resolve(vault, commonDir) }
}

/**
 * Refuse to write a checkout git can't take a commit in: one mid-merge, mid-rebase or similar, or a
 * repository with no committer identity. Nothing has been written when this throws.
 */
export function assertCommittable(vault, gitDir) {
  const busy = IN_PROGRESS.find(([marker]) => existsSync(join(gitDir, marker)))
  if (busy) {
    const [, state, abort] = busy
    throw usageError(`the vault's main checkout ${vault} is ${state} — nothing was written`, {
      details: [`finish it, or undo it with: git -C ${vault} ${abort.replace(/^git /, "")}`],
    })
  }
  const ident = runGit(vault, ["var", "GIT_COMMITTER_IDENT"])
  if (!ident.ok)
    throw usageError(`git has no committer identity in ${vault} — nothing was written`, {
      details: [`set one: git -C ${vault} config user.name "…" && git -C ${vault} config user.email "…"`],
    })
}

// git, retried while another git process holds `index.lock`.
const gitRetrying = (vault, args, what) => {
  for (let attempt = 0; ; attempt++) {
    const r = runGit(vault, args)
    if (r.ok) return r.stdout.trim()
    if (!/index\.lock/.test(r.why) || attempt >= INDEX_LOCK_RETRY_MS.length) throw gitFailure(what, r, vault)
    sleep(INDEX_LOCK_RETRY_MS[attempt])
  }
}

/**
 * Commit exactly `paths` (vault-relative) with `message`; anything else staged stays staged and out
 * of the commit. Returns the new commit's sha.
 */
export function commitFiles(vault, paths, message) {
  gitRetrying(vault, [...LITERAL, "add", "--", ...paths], "git add")
  gitRetrying(vault, [...LITERAL, "commit", "-q", "--only", "-m", message, "--", ...paths], "git commit")
  return gitOrFail(vault, ["rev-parse", "HEAD"], "git rev-parse HEAD")
}

/** The index entries of `paths` (`git ls-files -s` lines), to put back if a commit fails. */
export function indexEntries(vault, paths) {
  return gitOrFail(vault, [...LITERAL, "ls-files", "-s", "--", ...paths], "git ls-files")
}

/**
 * Put the index entries of `paths` back as `indexEntries` saw them, staged hunks included (best
 * effort: this runs while another failure is already being reported).
 */
export function restoreIndex(vault, paths, entries) {
  runGit(vault, [...LITERAL, "update-index", "--force-remove", "--", ...paths])
  if (entries) runGit(vault, ["update-index", "--index-info"], { input: `${entries}\n` })
}

/**
 * The branch checked out in `cwd` when `cwd` is a linked git worktree (its git dir differs from its
 * common dir), else null. A main checkout's branch (`main`, `develop`) names no session, so it is
 * never returned (spec *`claimed_by` value*).
 */
export function linkedWorktreeBranch(cwd) {
  const top = runGit(cwd, ["rev-parse", "--show-toplevel"])
  if (!top.ok) return null
  const root = top.stdout.trim()
  const dirs = runGit(root, ["rev-parse", "--git-dir", "--git-common-dir"])
  if (!dirs.ok) return null
  const [gitDir, commonDir] = dirs.stdout.trim().split("\n")
  if (resolve(root, gitDir) === resolve(root, commonDir)) return null
  const branch = runGit(root, ["symbolic-ref", "--short", "-q", "HEAD"])
  return branch.ok && branch.stdout.trim() ? branch.stdout.trim() : null
}
