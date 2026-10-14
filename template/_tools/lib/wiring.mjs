// What bootstrap wires into a user's Claude Code install for `wf` (spec docs/specs/ticket-store.md,
// *`bootstrap` and release (Q20, Q21)*), as pure functions over the files' contents — bootstrap reads,
// prints the plan, and writes. Each function returns its input unchanged when it is already wired, so a
// second run is a no-op.
//   · `~/.claude/settings.json` — the frontmatter guard on PreToolUse `Write|Edit`, the autocommit on
//     PostToolUse `Write|Edit` only (no Bash matcher, no `|| true`), and a permission allow rule for
//     exactly the `node <absolute path to wf>` prefix. Every other key is left as it is; `PATH` is never
//     touched.
//   · `~/.claude/CLAUDE.md` — the agent-instruction block, between markers so a rerun replaces it in place.
//     The block 0.4.x wrote (no markers) is found by its heading and replaced, not duplicated.
import { join } from "node:path"

const MATCHER = "Write|Edit"
const HOOK_TIMEOUT = 15

/** A path as one shell word: as it is when it needs no quoting, else single-quoted. */
export const shellWord = (path) => (/^[\w@%+=:,./-]+$/.test(path) ? path : `'${path.replace(/'/g, "'\\''")}'`)

const toolPath = (vault, name) => join(vault, "_tools", name)

/** How agents run wf: `node <absolute path to wf>`, the prefix the allow rule names. */
export const wfCommand = (vault) => `node ${shellWord(toolPath(vault, "wf.mjs"))}`

/** The permission allow rule for exactly the `wfCommand` prefix. */
export const wfAllowRule = (vault) => `Bash(${wfCommand(vault)}:*)`

// The hooks bootstrap owns, per event: the scripts that identify an entry as ours, and the entry it wires.
const HOOKS = [
  {
    event: "PreToolUse",
    scripts: ["frontmatter-guard.mjs"],
    entry: (vault) => ({ type: "command", command: `node ${shellWord(toolPath(vault, "frontmatter-guard.mjs"))}`, timeout: HOOK_TIMEOUT }),
  },
  {
    event: "PostToolUse",
    scripts: ["autocommit.sh", "autocommit.mjs"],
    entry: (vault) => ({
      type: "command",
      command: shellWord(toolPath(vault, "autocommit.sh")),
      timeout: HOOK_TIMEOUT,
      statusMessage: "Committing wayfinder-vault...",
    }),
  },
]

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Whether `command` runs one of `scripts` of one of `vaults`: the path as a whole word, bare or quoted,
// so `/x/vault` does not match `/y/x/vault` or `/x/vault2`.
const runsScript = (command, vaults, scripts) =>
  typeof command === "string" &&
  vaults.some((vault) =>
    scripts.some((script) => {
      const path = toolPath(vault, script)
      return new RegExp(`(?:^|[\\s"'])(?:${escapeRe(path)}|${escapeRe(shellWord(path))})(?=$|[\\s"';|&])`).test(command)
    }))

/**
 * One event's blocks with exactly one wired entry of ours, on `Write|Edit`. An entry already there
 * (same command, on a `Write|Edit` block) is kept as it is, timeout and all; otherwise the first entry of
 * ours on a `Write|Edit` block is replaced in place, or the entry is appended. Every other entry of ours
 * is removed — the Bash matcher, a duplicate — and a block left empty by that goes too.
 * Returns `{ blocks, changes }`; `changes` are `{ event, matcher, action: add|replace|remove, command }`.
 */
const wireEvent = (blocks, { event, scripts, entry }, vault, vaults) => {
  const wanted = entry(vault)
  const ours = (h) => runsScript(h?.command, vaults, scripts)
  const isWanted = (block, h) => block?.matcher === MATCHER && h?.command === wanted.command
  const keptAt = blocks.findIndex((b) => (b?.hooks ?? []).some((h) => isWanted(b, h)))
  const replaceAt = keptAt === -1 ? blocks.findIndex((b) => b?.matcher === MATCHER && (b.hooks ?? []).some(ours)) : -1
  const changes = []
  let placed = keptAt !== -1
  const next = []
  for (const [i, block] of blocks.entries()) {
    const hooks = Array.isArray(block?.hooks) ? block.hooks : null
    if (!hooks || !hooks.some(ours)) {
      next.push(block)
      continue
    }
    const kept = []
    for (const h of hooks) {
      if (!ours(h)) kept.push(h)
      else if (!placed && i === replaceAt) {
        kept.push(wanted)
        placed = true
        changes.push({ event, matcher: block.matcher, action: "replace", from: h.command, command: wanted.command })
      } else if (i === keptAt && isWanted(block, h) && !kept.some((k) => isWanted(block, k))) kept.push(h)
      else changes.push({ event, matcher: block.matcher ?? "", action: "remove", command: h.command })
    }
    if (kept.length) next.push({ ...block, hooks: kept })
  }
  if (!placed) {
    const at = next.findIndex((b) => b?.matcher === MATCHER && Array.isArray(b.hooks))
    if (at === -1) next.push({ matcher: MATCHER, hooks: [wanted] })
    else next[at] = { ...next[at], hooks: [...next[at].hooks, wanted] }
    changes.push({ event, matcher: MATCHER, action: "add", command: wanted.command })
  }
  return { blocks: changes.length ? next : blocks, changes }
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

/**
 * Why `wireSettings` can't rewire `settings` without losing what is there, or null when it can: every
 * part it rewrites must already have the shape Claude Code reads (`hooks` an object of arrays of blocks,
 * each block's `hooks` an array; `permissions` an object, its `allow` an array).
 */
export function settingsShapeError(settings) {
  if (settings == null) return null
  if (!isObject(settings)) return "is not a JSON object"
  if (settings.hooks !== undefined) {
    if (!isObject(settings.hooks)) return "`hooks` is not an object"
    for (const { event } of HOOKS) {
      const blocks = settings.hooks[event]
      if (blocks === undefined) continue
      if (!Array.isArray(blocks)) return `\`hooks.${event}\` is not an array`
      const bad = blocks.findIndex((b) => !isObject(b) || (b.hooks !== undefined && !Array.isArray(b.hooks)))
      if (bad !== -1) return `\`hooks.${event}[${bad}]\` is not a block with a \`hooks\` array`
    }
  }
  if (settings.permissions !== undefined) {
    if (!isObject(settings.permissions)) return "`permissions` is not an object"
    if (settings.permissions.allow !== undefined && !Array.isArray(settings.permissions.allow))
      return "`permissions.allow` is not an array"
  }
  return null
}

/**
 * `settings` (parsed `~/.claude/settings.json`, or null) wired for the vault at `vault`. Call
 * `settingsShapeError` first: a part with another shape is replaced, not merged. `vaults` are every
 * path the vault has been wired under before (its path as given, an older recorded path) — entries that
 * run their scripts are ours too. Returns `{ settings, changes }`; `settings` is the input itself when
 * `changes` is empty. Changes: hook changes as `wireEvent` gives them, and `{ action: "allow", rule }`.
 */
export function wireSettings(settings, { vault, vaults = [] }) {
  const base = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {}
  const known = [...new Set([vault, ...vaults.filter(Boolean)])]
  const changes = []
  let hooks = base.hooks && typeof base.hooks === "object" ? base.hooks : {}
  for (const spec of HOOKS) {
    const current = Array.isArray(hooks[spec.event]) ? hooks[spec.event] : []
    const wired = wireEvent(current, spec, vault, known)
    if (wired.changes.length) {
      hooks = { ...hooks, [spec.event]: wired.blocks }
      changes.push(...wired.changes)
    }
  }
  const permissions = base.permissions && typeof base.permissions === "object" ? base.permissions : {}
  const allow = Array.isArray(permissions.allow) ? permissions.allow : []
  const rule = wfAllowRule(vault)
  const withRule = allow.includes(rule) ? null : { ...permissions, allow: [...allow, rule] }
  if (withRule) changes.push({ action: "allow", rule })
  if (!changes.length) return { settings, changes }
  return { settings: { ...base, hooks, ...(withRule ? { permissions: withRule } : {}) }, changes }
}

// ── The CLAUDE.md block ───────────────────────────────────────────────────────

const BEGIN_PREFIX = "<!-- wayfinder-template:begin"
export const BLOCK_BEGIN = `${BEGIN_PREFIX} — written by the wayfinder-template bootstrap; rerun it to update this block, edits inside are replaced -->`
export const BLOCK_END = "<!-- wayfinder-template:end -->"
// Headings of the blocks bootstrap wrote before the markers: found and replaced, never duplicated.
const LEGACY_HEADINGS = [
  "## Wayfinder maps live in the vault, never in a repo",
  "## Wayfinder maps, specs, and build tickets live in the vault",
]

/** The agent-instruction block for the vault at `vault`, markers included, ending in a newline. */
export const wfBlock = (vault) => {
  const wf = wfCommand(vault)
  return `${BLOCK_BEGIN}
## Wayfinder maps live in the vault, never in a repo

The tracker for \`/wayfinder\` is the vault at **\`${vault}\`**, whatever repo the
session runs in — in place of \`.scratch/\`, GitHub issues, or a repo's
\`docs/agents/issue-tracker.md\`. Before any tracker operation, read its \`README.md\`:

- **§ Wayfinding operations** — maps and tickets: chart, claim, resolve, frontier.
- **§ Spec & ticket operations** — what the build skills after it (\`/to-spec\`,
  \`/to-tickets\`, \`/implement\`, \`/implement-spec\`) do to the vault. Specs and build
  tickets live where the work repo's own tracker config says, not in the vault; the
  map keeps a \`## Build board\` that points at them.

Those sections own the layout, frontmatter, and operations, and win where a skill's
own text disagrees.

- **Tracker state changes go through \`wf\`**, run by absolute path:
  \`${wf} <verb>\`
  It charts a map, creates, claims, releases, resolves or blocks a ticket, and sets a
  map's status; \`${wf} help\` lists the verbs. \`wf\` commits its own
  writes. Never change a ticket's or map's frontmatter with Write/Edit — the frontmatter
  guard hook denies it.
- **Prose is written with Write/Edit** — a map's or ticket's body below its frontmatter.
  The autocommit hook commits each such edit.
- **One copy, one place** — no sync or mirror between a repo and the vault. A map found
  under a repo's \`docs/plan/wayfinder/\` has drifted: move it into the vault, and only
  when no other session is working that map.
${BLOCK_END}
`
}

const isHeading = (line) => /^#{1,6}\s/.test(line)
// Markers are matched by their stable prefix, whatever words follow it and whatever the line ending.
const isBegin = (line) => line.startsWith(BEGIN_PREFIX)
const isEnd = (line) => line.trimEnd() === BLOCK_END
// The last line of the block 0.4.x wrote: a legacy section ends there, so text after it stays.
const LEGACY_LAST_LINE = /committing to it\.\s*$/

// The line spans `[start, end)` that hold a block: between the markers (inclusive), else a legacy
// heading's section — to the line after its known last line, or to the next heading of any level (the
// old blocks had no sub-headings), trailing blank lines left outside. A BEGIN without an END is no span.
const blockSpans = (lines) => {
  const spans = []
  for (let i = 0; i < lines.length; i++) {
    if (!isBegin(lines[i])) continue
    const end = lines.findIndex((line, j) => j > i && isEnd(line))
    if (end === -1) break
    spans.push([i, end + 1])
    i = end
  }
  if (spans.length) return spans
  for (let i = 0; i < lines.length; i++) {
    if (!LEGACY_HEADINGS.includes(lines[i].trimEnd())) continue
    let end = i + 1
    while (end < lines.length && !isHeading(lines[end])) {
      end++
      if (LEGACY_LAST_LINE.test(lines[end - 1])) break
    }
    while (end > i + 1 && lines[end - 1].trim() === "") end--
    spans.push([i, end])
    i = end - 1
  }
  return spans
}

/**
 * `text` (the CLAUDE.md, "" when none) with the block for `vault`: the first block found is replaced in
 * place and any other removed; with none, the block is appended. Returns `{ text, status }`, status
 * `current` (unchanged), `replaced` or `added`.
 */
export function withWfBlock(text, vault) {
  // A CRLF file keeps CRLF: `lines` keep their `\r`, so the block's lines get one too.
  const cr = /\r\n/.test(text) ? "\r" : ""
  const block = wfBlock(vault).replace(/\n$/, "").split("\n").map((line) => line + cr)
  const lines = text.split("\n")
  const spans = blockSpans(lines)
  if (!spans.length) {
    const head = text.trimEnd()
    const eol = `${cr}\n`
    return { text: `${head}${head ? eol + eol : ""}${block.join("\n")}\n`, status: "added" }
  }
  const out = []
  let from = 0
  for (const [n, [start, end]] of spans.entries()) {
    out.push(...lines.slice(from, start), ...(n === 0 ? block : []))
    from = end
  }
  out.push(...lines.slice(from))
  const next = out.join("\n")
  return next === text ? { text, status: "current" } : { text: next, status: "replaced" }
}
