// The frontmatter guard's decision (spec *Frontmatter guard hook (Q15)*): given PreToolUse hook JSON,
// deny a Write or Edit that would change a ticket's or map's frontmatter, or create one.
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { formatRef, parseRef } from "./core.mjs"
import { parseNote } from "./frontmatter.mjs"
import { creationReason, denialReason } from "./guard-hints.mjs"
import { gitEnv } from "./git.mjs"

const deny = (reason) => ({
  hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
})

// The `[start, end)` character range of the frontmatter block, from the opening `---` to the end of
// the closing one; false when it is never closed; null when the note has none.
const frontmatterRange = (text) => {
  const lines = text.split("\n")
  if (!/^\uFEFF?---\s*$/.test(lines[0])) return null
  let offset = lines[0].length + 1
  for (const line of lines.slice(1)) {
    if (/^(?:---|\.\.\.)\s*$/.test(line)) return [0, offset + line.length]
    offset += line.length + 1
  }
  return false
}

// The frontmatter block as text: all of it when it is never closed, so any change to it shows.
const frontmatterText = (text) => {
  const range = frontmatterRange(text)
  if (range === false) return text
  return range ? text.slice(...range) : ""
}

const overlaps = (range, from, length) => Boolean(range) && from < range[1] && from + length > range[0]

// The real path of `path`, through its nearest existing ancestor when it doesn't exist yet (a Write
// that creates a file): the hook's own path is real, the tool's may go through a symlink.
const realPath = (path) => {
  try {
    // `.native` also canonicalises case, so `ISSUES/` on a case-insensitive disk is still `issues/`.
    return realpathSync.native(path)
  } catch {
    const parent = dirname(path)
    return parent === path ? path : join(realPath(parent), basename(path))
  }
}

// The text an Edit leaves, as the Edit tool applies it: the first occurrence, or every one.
const applyEdit = (text, { old_string: from, new_string: to, replace_all: all }) => {
  if (all) return text.split(from).join(to)
  const at = text.indexOf(from)
  return text.slice(0, at) + to + text.slice(at + from.length)
}

// Denied when `old_string` overlaps the frontmatter block, or when the result's block differs. The
// match is exact: an `old_string` the Edit tool would only match after normalising quotes passes.
const checkEdit = (text, edit) => {
  const at = text.indexOf(edit.old_string)
  if (at === -1) return null
  const after = applyEdit(text, edit)
  const touches = overlaps(frontmatterRange(text), at, edit.old_string.length)
  return touches || frontmatterText(after) !== frontmatterText(text) ? after : null
}

const isInside = (rel) => rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)

// A ticket (`<repo>/<effort>/issues/NN-slug.md`) or map (`<repo>/<effort>/map.md`) identity, or null.
const trackerIdentity = (rel) => {
  const id = isInside(rel) && rel.endsWith(".md") ? parseRef(rel.split(sep).join("/")) : null
  return id && (id.nn != null || basename(rel) === "map.md") ? id : null
}

// Named like a ticket or map, wherever it is: only such a path is worth asking git about.
const TRACKER_FILE_RE = /[\\/](?:map|issues[\\/]\d+-[^\\/]+)\.md$/

// The top of the git work tree holding `dir` and the repository's common dir, or null outside git.
const gitPlace = (dir) => {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel", "--git-common-dir"], { cwd: dir, encoding: "utf8", env: gitEnv() })
  if (r.error || r.status !== 0) return null
  const [top, common] = r.stdout.trim().split("\n")
  return { top: realPath(top), common: realPath(resolve(dir, common)) }
}

const existingDir = (path) => (existsSync(path) || dirname(path) === path ? path : existingDir(dirname(path)))

// `file` relative to the vault's directory in its work tree, when that is a linked worktree of the
// vault (they share its common dir) — wf reads the same notes from any of them. Null otherwise. The
// vault may be a subdirectory of its repository (as `locateVault` allows): the same one here.
const worktreeRelative = (file, vault) => {
  if (!TRACKER_FILE_RE.test(file)) return null
  const here = gitPlace(existingDir(dirname(file)))
  const home = here && gitPlace(vault)
  return home && here.common === home.common ? relative(join(here.top, relative(home.top, vault)), file) : null
}

// Where `file` sits in the vault — its main checkout or a worktree of it — or null outside the vault.
const vaultPath = (file, vault) => {
  const rel = relative(vault, file)
  return trackerIdentity(rel) ? rel : worktreeRelative(file, vault)
}

// The note's text, or null when it doesn't exist yet.
const readNote = (file) => {
  try {
    return readFileSync(file, "utf8")
  } catch (e) {
    if (e.code === "ENOENT") return null
    throw e
  }
}

// The text the tool would leave when it changes the frontmatter, or null when it doesn't.
const changedText = (tool, text, toolInput) => {
  if (tool === "Edit") return checkEdit(text, toolInput)
  return frontmatterText(toolInput.content) !== frontmatterText(text) ? toolInput.content : null
}

// A path as one shell word, quoted only when it needs to be (an iCloud vault sits under "Mobile Documents").
const shellWord = (path) => (/^[\w@%+=:,./-]+$/.test(path) ? path : `'${path.replace(/'/g, "'\\''")}'`)

const ALLOWING = "allowing the tool call"

const GUARDED_TOOLS = new Set(["Write", "Edit"])
// The tool_input fields each guarded tool must carry, and their types.
const TOOL_FIELDS = {
  Edit: { file_path: "string", old_string: "string", new_string: "string", replace_all: "boolean?" },
  Write: { file_path: "string", content: "string" },
}

class MalformedInput extends Error {}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

const hasType = (value, type) =>
  type.endsWith("?") ? value == null || typeof value === type.slice(0, -1) : typeof value === type

// The hook JSON, checked as far as the guard reads it; tools it doesn't guard are not inspected.
const parseInput = (stdin) => {
  let input
  try {
    input = JSON.parse(stdin)
  } catch (e) {
    throw new MalformedInput(`not JSON: ${e.message}`)
  }
  if (!isObject(input)) throw new MalformedInput("not a JSON object")
  if (typeof input.tool_name !== "string") throw new MalformedInput("tool_name is not a string")
  if (!GUARDED_TOOLS.has(input.tool_name)) return input
  if (!hasType(input.cwd, "string?")) throw new MalformedInput("cwd is not a string")
  if (!isObject(input.tool_input)) throw new MalformedInput(`${input.tool_name} without a tool_input object`)
  for (const [field, type] of Object.entries(TOOL_FIELDS[input.tool_name]))
    if (!hasType(input.tool_input[field], type))
      throw new MalformedInput(`${input.tool_name} tool_input.${field} is not a ${type.replace("?", "")}`)
  return input
}

// The decision for one guarded tool call: `{ decision }` to deny, `{}` to pass.
const decide = (input, toolsDir) => {
  const { tool_name: tool, tool_input: toolInput } = input
  const vault = realPath(resolve(toolsDir, ".."))
  const file = resolve(input.cwd ?? process.cwd(), toolInput.file_path)
  const rel = vaultPath(realPath(file), vault)
  const id = rel === null ? null : trackerIdentity(rel)
  if (!id) return {}
  const shown = rel.split(sep).join("/")
  const wf = `node ${shellWord(join(toolsDir, "wf.mjs"))}`
  const text = readNote(file)
  if (text === null) return tool === "Write" ? { decision: deny(creationReason({ id, rel: shown, wf })) } : {}
  if (frontmatterRange(text) === false) {
    const lint = `${wf} lint ${formatRef({ ...id, nn: null })}`
    return { warning: `${shown} has frontmatter that is never closed — not guarded; \`${lint}\` reports it — ${ALLOWING}` }
  }
  const after = changedText(tool, text, toolInput)
  if (after === null) return {}
  const before = parseNote(text).frontmatter
  return { decision: deny(denialReason({ id, rel: shown, before, after: parseNote(after).frontmatter, wf })) }
}

/**
 * The guard's answer to PreToolUse hook JSON (`stdin`): `{ decision }` to deny, `{}` to pass, plus a
 * `warning` when it couldn't check. It fails open: bad input or an unreadable note never blocks.
 * `toolsDir` is the `_tools/` directory the hook runs from — the vault is the directory above it.
 */
export function guard(stdin, { toolsDir }) {
  let input
  try {
    input = parseInput(stdin)
    return GUARDED_TOOLS.has(input.tool_name) ? decide(input, toolsDir) : {}
  } catch (e) {
    if (e instanceof MalformedInput) return { warning: `malformed hook input (${e.message}) — ${ALLOWING}` }
    return { warning: `cannot check ${input?.tool_input?.file_path} (${e.message}) — ${ALLOWING}` }
  }
}
