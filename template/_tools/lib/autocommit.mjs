// The prose autocommit (spec docs/specs/ticket-store.md, *New autocommit (Q7)*): a PostToolUse hook
// on Write|Edit that commits the one edited file in the repository holding it — the vault's main
// checkout or one of its worktrees. Tracker state is committed by `wf` itself, so an event that names
// no `file_path` (Bash) is not handled, and nothing here syncs, merges or fast-forwards a branch into
// `main` (Q14).
//
// It never blocks: a failure is returned as `context` (the hook prints it as `additionalContext`,
// which the agent reads in the same turn) and appended as one line to FAILURE_LOG in the vault's
// git dir, which `doctor` reports until it is cleared. A checkout mid-merge (or similar) is told but
// not logged: nothing is lost, the edit goes in with that operation's commit.
import { appendFileSync, existsSync, readFileSync, realpathSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { runGit } from "./git.mjs"
import { commitFiles, gitDirs, operationInProgress } from "./repo.mjs"

export const FAILURE_LOG = "wf-autocommit-failures.log"
const FOOTER = "Committed automatically by the wayfinder-vault PostToolUse hook."
const LITERAL = "--literal-pathspecs"

class Failure extends Error {
  constructor(message, details = [], { log = true } = {}) {
    super(message)
    this.details = details
    this.log = log
  }
}

const realOrSame = (path) => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

const isInside = (rel) => rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)

/** The absolute path a file edit (Write, Edit, MultiEdit…) wrote, or null for an event naming none (Bash). */
function editedFile(stdinText) {
  let event
  try {
    event = JSON.parse(stdinText)
  } catch (e) {
    throw new Failure(`cannot read the hook input as JSON (${e.message})`, ["check the hook's wiring in ~/.claude/settings.json"])
  }
  const path = event?.tool_response?.filePath ?? event?.tool_input?.file_path
  if (typeof path !== "string") return null
  if (!isAbsolute(path)) throw new Failure(`the ${event.tool_name} event names a relative file_path ${path}`)
  return path
}

/** The vault repository's common git dir (real path), or null when the vault is not a git repository. */
function vaultCommonDir(vault) {
  const r = runGit(vault, ["rev-parse", "--git-common-dir"])
  return r.ok ? realOrSame(resolve(vault, r.stdout.trim())) : null
}

/**
 * Where to commit `file`: `{ root, rel }` in the checkout holding it, or null when the file is not the
 * vault's — the hook is wired globally, so an edit in any other repository (one nested in the vault
 * folder included) is none of its business.
 */
function vaultCheckoutOf(file, vault, commonDir) {
  const real = join(realOrSame(dirname(file)), basename(file))
  const r = runGit(dirname(real), ["rev-parse", "--show-toplevel", "--git-common-dir"])
  if (r.ok) {
    const [top, common] = r.stdout.trim().split("\n")
    if (commonDir === null || realOrSame(resolve(dirname(real), common)) !== commonDir) return null
    const root = realOrSame(top)
    return { root, rel: relative(root, real) }
  }
  if (!isInside(relative(realOrSame(vault), real))) return null
  if (commonDir === null)
    throw new Failure(`the vault ${vault} is not a git repository`, [`restore its .git, or start one: git -C ${vault} init`])
  throw new Failure(`git cannot see ${file} in the vault's repository`, [`git: ${r.why}`])
}

const hasConflictMarkers = (text) => /^<<<<<<< /m.test(text) && /^>>>>>>> /m.test(text)

// Mid-merge (or similar) the edit is part of that operation: committing it alone would be wrong.
function deferToOperation({ root, rel }, [, state, abort]) {
  const cont = abort.replace(/--abort$/, "--continue").replace(/^git /, `git -C ${root} `)
  throw new Failure(
    `the checkout ${root} is ${state}, so the edit is written but goes in with that operation's commit`,
    [`stage it and finish: git -C ${root} add -- ${rel} && ${cont}`],
    { log: false },
  )
}

function commitProse(target) {
  const { root, rel } = target
  if (runGit(root, [LITERAL, "check-ignore", "-q", "--", rel]).ok) return
  const status = runGit(root, [LITERAL, "status", "--porcelain", "--", rel])
  if (!status.ok) throw new Failure(`git status failed: ${status.why}`)
  if (status.stdout.trim() === "") return
  const busy = operationInProgress(gitDirs(root).gitDir)
  if (busy) deferToOperation(target, busy)
  if (existsSync(join(root, rel)) && hasConflictMarkers(readFileSync(join(root, rel), "utf8")))
    throw new Failure(`${rel} still holds merge conflict markers (<<<<<<< … >>>>>>>)`, ["resolve them, then edit the file again"])
  commitFiles(root, [rel], `chore(vault): update ${basename(rel)}\n\n${FOOTER}`)
}

const oneLine = (text) => text.replace(/\s*\n\s*/g, " · ")

// The failure as the agent reads it, and as one line of the failure log (the log's own failure is told
// to the agent, since the owner then has no record of this one).
function report(error, { file, target, vault, commonDir }) {
  const details = error.details?.length ? ` (${error.details.join("; ")})` : ""
  const commit = target && error.log !== false
    ? ` Then commit it: git -C ${target.root} add -- ${target.rel} && git -C ${target.root} commit -m "chore(vault): update ${basename(target.rel)}"`
    : ""
  const what = `${file ?? "the edit"} was not committed: ${oneLine(error.message)}${details}.`
  if (error.log === false) return { context: `wayfinder autocommit: ${what}` }
  let logged = ""
  try {
    const logDir = commonDir ?? vaultCommonDir(vault)
    if (logDir === null) throw new Error(`the vault ${vault} has no git dir`)
    appendFileSync(join(logDir, FAILURE_LOG), `${new Date().toISOString()}\t${file ?? "-"}\t${oneLine(error.message)}${details}\n`)
  } catch (e) {
    logged = ` The failure log could not be written either: ${e.message}.`
  }
  return { context: `wayfinder autocommit: ${what}${commit}${logged}` }
}

/**
 * Handle one PostToolUse event (`stdinText`, the hook's stdin) for the vault at `vault`. Returns `{}`
 * when there is nothing to say, or `{ context }` when the edit was not committed. Never throws.
 */
export function autocommit(stdinText, { vault }) {
  const facts = { file: null, target: null, vault, commonDir: null }
  try {
    facts.file = editedFile(stdinText)
    if (!facts.file) return {}
    facts.commonDir = vaultCommonDir(vault)
    facts.target = vaultCheckoutOf(facts.file, vault, facts.commonDir)
    if (!facts.target) return {}
    commitProse(facts.target)
    return {}
  } catch (e) {
    return report(e, facts)
  }
}
