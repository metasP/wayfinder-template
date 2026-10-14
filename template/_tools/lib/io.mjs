// File writes for the write verbs (spec *What every write verb does*, step 4): each file is written
// atomically (a temporary file in the same directory, then rename), and a verb's writes land together
// or not at all. A write the OS refuses (`EPERM`/`EACCES`/`EROFS`) is an environment error that says
// the vault is probably outside the sandbox's writable paths.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { usageError } from "./errors.mjs"

const REFUSED = new Set(["EPERM", "EACCES", "EROFS"])
export const SANDBOX_HINT = "the vault is probably outside the sandbox's writable paths — the owner adds it there (Claude Code: /sandbox)"

/** A filesystem failure while writing `path` as a WfError (exit 2), with the sandbox hint when refused. */
export function writeError(e, path, vault) {
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
const writeAtomic = (path, text) => {
  const tmp = join(dirname(path), `.${basename(path)}.wf-${process.pid}.tmp`)
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(tmp, text)
    renameSync(tmp, path)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
}

const restore = (path, text) => (text === null ? rmSync(path, { force: true }) : writeAtomic(path, text))

/**
 * Write `edits` (`[{ path, text }]`, vault-relative) atomically. Returns `undo()`, which puts every
 * file back as it was. If one write fails, the ones before it are undone and the error is thrown.
 */
export function writeFiles(vault, edits) {
  const done = []
  const undo = () => done.reverse().forEach(({ path, before }) => restore(path, before))
  for (const { path: rel, text } of edits) {
    const path = join(vault, rel)
    try {
      const before = textOrNull(path)
      writeAtomic(path, text)
      done.push({ path, before })
    } catch (e) {
      undo()
      throw writeError(e, path, vault)
    }
  }
  return { undo }
}
