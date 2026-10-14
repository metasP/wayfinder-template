// File writes for the write verbs (spec *What every write verb does*, step 4): each file is written
// atomically (a temporary file in the same directory, then rename), and a verb's writes land together
// or not at all. A write the OS refuses (`EPERM`/`EACCES`/`EROFS`) is an environment error that says
// the vault is probably outside the sandbox's writable paths.
import { linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { usageError } from "./errors.mjs"

const REFUSED = new Set(["EPERM", "EACCES", "EROFS"])
export const SANDBOX_HINT = "the vault is probably outside the sandbox's writable paths — the owner adds it there (Claude Code: /sandbox)"

/** A filesystem failure while writing `path` as a WfError (exit 2), with the sandbox hint when refused. */
export function writeError(e, path, vault) {
  if (e.code === "EEXIST") return usageError(`cannot create ${path}: it appeared while wf held the lock (written outside wf) — rerun`)
  if (REFUSED.has(e.code)) return usageError(`cannot write ${path}: ${e.code} — ${SANDBOX_HINT}`, { details: [`vault: ${vault}`] })
  return usageError(`cannot write ${path}: ${e.message}`)
}

/** Block the thread for `ms` (wf is synchronous end to end). */
export function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// The current text of a vault file, or null when it doesn't exist yet.
const textOrNull = (path) => {
  try {
    return readFileSync(path, "utf8")
  } catch (e) {
    if (e.code === "ENOENT") return null
    throw e
  }
}

// The rename gives the file a new inode: a symlinked note becomes a regular file, with the default mode.
// `create` links instead of renaming, which fails with EEXIST rather than replace a file; on a
// filesystem without hard links it falls back to an exclusive (`wx`) write.
const writeAtomic = (path, text, { create = false } = {}) => {
  const tmp = join(dirname(path), `.${basename(path)}.wf-${process.pid}.tmp`)
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(tmp, text)
    if (create) createExclusive(tmp, path, text)
    else renameSync(tmp, path)
  } finally {
    rmSync(tmp, { force: true })
  }
}

const createExclusive = (tmp, path, text) => {
  try {
    linkSync(tmp, path)
  } catch (e) {
    if (e.code === "EEXIST") throw e
    writeFileSync(path, text, { flag: "wx" })
  }
}

const restore = (path, text) => (text === null ? rmSync(path, { force: true }) : writeAtomic(path, text))

/**
 * Write `edits` (`[{ path, text, create? }]`, vault-relative) atomically; a `create` edit refuses to
 * replace an existing file. Returns `undo()`, which puts every
 * file back as it was. If one write fails, the ones before it are undone and the error is thrown.
 */
export function writeFiles(vault, edits) {
  const done = []
  const undo = () => done.reverse().forEach(({ path, before }) => restore(path, before))
  for (const { path: rel, text, create } of edits) {
    const path = join(vault, rel)
    try {
      const before = textOrNull(path)
      writeAtomic(path, text, { create })
      done.push({ path, before })
    } catch (e) {
      undo()
      throw writeError(e, path, vault)
    }
  }
  return { undo }
}
