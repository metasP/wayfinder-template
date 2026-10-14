// The store's read side (spec *Modules* §2): the only module that touches the filesystem or git.
// It finds the vault's main checkout, checks the vault schema version, and reads every map and ticket
// into the core's input — `{ path, frontmatter, ticketsBlock? }` — plus *Wayfinder Config* and the
// *Wayfinder Picks* `sort:` key.
import { spawnSync } from "node:child_process"
import { readdirSync, readFileSync, realpathSync } from "node:fs"
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path"
import { parseRef, SCHEMA_VERSION, ticketsBlockOf } from "./core.mjs"
import { parseNote } from "./frontmatter.mjs"
import { usageError } from "./errors.mjs"

export const MANIFEST = ".wayfinder-template.json"
export const CONFIG_NOTE = "Wayfinder Config.md"
export const PICKS_NOTE = "Wayfinder Picks.md"
// A manifest written before `wf` existed has no `vault_schema`: that vault is at version 1.
const LEGACY_VAULT_SCHEMA = 1

// Variables that point git at another repository (set inside hooks or `git rebase -x`). wf finds
// the vault from its own path, so they are dropped.
const GIT_LOCATION_VARS = ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY"]
export const gitEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !GIT_LOCATION_VARS.includes(k)))

const git = (cwd, args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: gitEnv() })
  if (r.error || r.status !== 0) {
    const why = r.error ? `git is not runnable (${r.error.message})` : r.stderr.trim()
    throw usageError(`cannot read the vault at ${cwd} as a git repository: ${why}`)
  }
  return r.stdout
}

const realTop = (dir) => realpathSync(git(dir, ["rev-parse", "--show-toplevel"]).trim())

// Whether `path` is the top of a work tree (a bare repository or a git dir is not).
const isWorkTree = (path) => {
  try {
    return realTop(path) === realpathSync(path)
  } catch {
    return false
  }
}

// The main worktree, seen from a linked one: the first entry of `git worktree list --porcelain`. Git
// can't tell where the main worktree of a `--separate-git-dir` repository is (it lists the git dir),
// so an entry that isn't a work tree is refused rather than read.
const mainWorktree = (checkout) => {
  const [first] = git(checkout, ["worktree", "list", "--porcelain"]).split("\n\n")
  const path = first.split("\n")[0].replace(/^worktree /, "")
  if (/^bare$/m.test(first) || !isWorkTree(path))
    throw usageError(`cannot find the vault's main checkout: git lists ${path}, which is not a work tree — run wf from the main checkout`)
  return realpathSync(path)
}

/**
 * Where wf runs: `checkout` is the directory that holds `_tools/`; `vault` is the same directory in
 * the main worktree (spec *Locking and commits*: wf always operates on the main checkout). A linked
 * worktree is one whose git dir differs from its common dir.
 */
export function locateVault(toolsDir) {
  const checkout = realpathSync(resolve(toolsDir, ".."))
  const [top, gitDir, commonDir] = git(checkout, ["rev-parse", "--show-toplevel", "--git-dir", "--git-common-dir"])
    .trim()
    .split("\n")
  const isLinked = resolve(checkout, gitDir) !== resolve(checkout, commonDir)
  const realTopDir = realpathSync(top)
  const mainTop = isLinked ? mainWorktree(checkout) : realTopDir
  return { vault: join(mainTop, relative(realTopDir, checkout)), checkout }
}

const isInside = (rel) => rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)

// The real path when it exists — the roots are real paths, the input may go through a symlink.
const realOrSame = (path) => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/**
 * A ref argument as a vault path: an absolute path under one of `roots` (the main checkout, or the
 * checkout wf runs from) becomes vault-relative; anything else is returned as given, minus a trailing `/`.
 */
export function vaultRelative(input, roots) {
  const raw = input.trim().replace(/\/+$/, "")
  if (!isAbsolute(raw)) return raw
  const candidates = [raw, realOrSame(raw)]
  // The deepest root first: a worktree may sit inside the main checkout (`.worktrees/x`).
  const deepestFirst = [...roots].sort((x, y) => y.length - x.length)
  const rel = deepestFirst.flatMap((root) => candidates.map((p) => relative(root, p))).find(isInside)
  if (rel === undefined) throw usageError(`${input} is not inside the vault ${roots[0]}`)
  return rel.split(sep).join("/")
}

const readManifest = (vault) => {
  let text
  try {
    text = readFileSync(join(vault, MANIFEST), "utf8")
  } catch {
    throw usageError(`no ${MANIFEST} in ${vault} — this vault was not installed from the template (run bootstrap)`)
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    throw usageError(`${join(vault, MANIFEST)} is not valid JSON: ${e.message}`)
  }
}

/** The vault schema version recorded in the manifest (a field separate from the manifest's own `schema`). */
export function vaultSchema(vault) {
  const version = readManifest(vault).vault_schema ?? LEGACY_VAULT_SCHEMA
  if (!Number.isInteger(version) || version < 1) throw usageError(`${MANIFEST}: vault_schema must be a positive integer`)
  return version
}

/**
 * Refuse a vault this `wf` can't read: newer than it supports always, older unless the verb reads
 * legacy vaults (`lint`, so its legacy-field findings stay visible).
 */
export function checkSchema(vault, { allowOlder = false } = {}) {
  const version = vaultSchema(vault)
  if (version > SCHEMA_VERSION)
    throw usageError(`vault schema ${version} is newer than this wf supports (${SCHEMA_VERSION}) — update the template`)
  if (version < SCHEMA_VERSION && !allowOlder)
    throw usageError(`vault schema ${version} is older than ${SCHEMA_VERSION} — run \`wf migrate\``)
  return version
}

const entriesOf = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    throw usageError(`cannot read ${dir}: ${e.message}`)
  }
}

// Vault-relative paths of every `.md` file, skipping dot entries at any depth and `_` dirs at the root.
const markdownFiles = (vault, rel = "") =>
  entriesOf(join(vault, rel)).flatMap((entry) => {
    const path = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.name.startsWith(".") || (!rel && entry.name.startsWith("_"))) return []
    if (entry.isDirectory()) return markdownFiles(vault, path)
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : []
  })

const isTrackerNote = (path) => {
  const id = parseRef(path)
  return Boolean(id) && (id.nn != null || basename(path) === "map.md")
}

// A note's parsed text, or null when it doesn't exist. Any other read failure is an environment error.
const readNote = (vault, path) => {
  try {
    return parseNote(readFileSync(join(vault, path), "utf8"))
  } catch (e) {
    if (e.code === "ENOENT") return null
    throw usageError(`cannot read ${join(vault, path)}: ${e.message}`)
  }
}

// A missing Config or Picks note is fine: every key has a default.
const NO_NOTE = Object.freeze({ frontmatter: {}, body: "", errors: [] })

/**
 * Read the vault: `{ notes, config, sort }`. Maps carry `ticketsBlock` (null without markers).
 * Any frontmatter outside the YAML subset → exit 2, every offending `file:line` listed.
 */
export function readVault(vault) {
  const errors = []
  const collect = (path, parsed) => {
    for (const e of parsed.errors) errors.push(`${path}:${e.line}: ${e.message}`)
    return parsed
  }
  const notes = markdownFiles(vault)
    .filter(isTrackerNote)
    .sort()
    .map((path) => {
      const { frontmatter, body } = collect(path, readNote(vault, path) ?? NO_NOTE)
      return basename(path) === "map.md" ? { path, frontmatter, ticketsBlock: ticketsBlockOf(body) } : { path, frontmatter }
    })
  const config = collect(CONFIG_NOTE, readNote(vault, CONFIG_NOTE) ?? NO_NOTE).frontmatter
  const picks = collect(PICKS_NOTE, readNote(vault, PICKS_NOTE) ?? NO_NOTE).frontmatter
  if (errors.length) throw usageError(`frontmatter outside the YAML subset in ${vault}`, { details: errors })
  return { notes, config, sort: picks.sort ?? undefined }
}
