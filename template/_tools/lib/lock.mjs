// The vault lock (spec *Locking and commits*): `mkdir` of a directory inside the vault's git dir,
// which is atomic, so exactly one `wf` holds it. A lock older than LOCK_STALE_MS is left over from a
// crashed `wf` and is broken with a warning; a live one is waited on for LOCK_WAIT_MS, then wf exits 2
// naming it. The lock holds an `owner` token, so a wf only ever removes a lock it made.
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { usageError } from "./errors.mjs"
import { sleep, writeError } from "./io.mjs"

export const LOCK_NAME = "wf.lock"
export const LOCK_STALE_MS = 30_000
export const LOCK_WAIT_MS = 10_000
const LOCK_POLL_MS = 50

// A lock's age in ms, or null when it is gone.
const ageOf = (dir) => {
  try {
    return Date.now() - statSync(dir).mtimeMs
  } catch (e) {
    if (e.code === "ENOENT") return null
    throw e
  }
}

const ownerOf = (dir) => {
  try {
    return readFileSync(join(dir, "owner"), "utf8")
  } catch {
    return null
  }
}

const tryCreate = (lock, token, vault) => {
  try {
    mkdirSync(lock)
  } catch (e) {
    if (e.code === "EEXIST") return false
    throw writeError(e, lock, vault)
  }
  try {
    writeFileSync(join(lock, "owner"), token)
    return true
  } catch (e) {
    rmSync(lock, { recursive: true, force: true })
    throw writeError(e, lock, vault)
  }
}

// Move a stale lock aside, then delete it. Between seeing it stale and moving it, another wf may
// have broken it and made a fresh one; moving that one aside shows up as a fresh age, and it is put
// back. (Narrow, not closed: the put-back fails when a third wf has made a lock meanwhile, and the
// owner whose lock went missing then finds it gone on release.)
const breakStale = (lock, vault) => {
  const aside = `${lock}.stale-${process.pid}-${Date.now()}`
  try {
    renameSync(lock, aside)
  } catch (e) {
    if (e.code === "ENOENT") return
    throw writeError(e, lock, vault)
  }
  const age = ageOf(aside)
  if (age !== null && age <= LOCK_STALE_MS) {
    try {
      renameSync(aside, lock)
      return
    } catch {
      // A newer lock took the place; this one is lost either way.
    }
  }
  rmSync(aside, { recursive: true, force: true })
}

/**
 * Take the lock in `gitDir`. Returns `{ path, warnings, release() }`. Waits up to LOCK_WAIT_MS for a
 * live lock; breaks one older than LOCK_STALE_MS. `release()` removes the lock only while it is
 * still this wf's.
 */
export function takeLock(gitDir, vault) {
  const lock = join(gitDir, LOCK_NAME)
  const token = `pid ${process.pid} at ${new Date().toISOString()} ${Math.random().toString(36).slice(2)}\n`
  const warnings = []
  const deadline = Date.now() + LOCK_WAIT_MS
  while (!tryCreate(lock, token, vault)) {
    const age = ageOf(lock)
    if (age !== null && age > LOCK_STALE_MS) {
      warnings.push(`broke a stale vault lock ${lock} (${Math.round(age / 1000)} s old, stale after ${LOCK_STALE_MS / 1000} s)`)
      breakStale(lock, vault)
      continue
    }
    if (Date.now() >= deadline)
      throw usageError(`the vault lock ${lock} is held by another wf (waited ${LOCK_WAIT_MS / 1000} s)`, {
        details: [`if no wf is running, it is left over: it is broken once it is ${LOCK_STALE_MS / 1000} s old, or remove it with rm -r ${lock}`],
      })
    sleep(LOCK_POLL_MS)
  }
  const release = () => {
    if (ownerOf(lock) === token) rmSync(lock, { recursive: true, force: true })
  }
  return { path: lock, warnings, release }
}
