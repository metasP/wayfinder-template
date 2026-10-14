// The write pipeline every write verb runs through (spec *What every write verb does, in order*):
//   1. take the lock · 2. re-read the notes · 3. check invariants (the verb's `plan`) · 4. write each
//   touched file atomically · 5. regenerate the `## Tickets` block of every effort whose rendering
//   changed · 6. commit only the touched files as `wf(<verb>): <ref>` · 7. release the lock ·
//   8. lint the touched efforts; findings are warnings and never fail a verb that succeeded.
//
// A write verb is a read verb's shape plus `writes(args) → boolean`, `plan(ctx, args) → { ref,
// edits: [{ path, text }], data }` (runs under the lock; throws to refuse) and optionally
// `report(outcome, args) → { data, text, exitCode?, message?, warnings? }`.
import { buildIndex, formatRef, isoDate, lint, parseRef, renderTicketsBlock } from "./core.mjs"
import { withTicketsBlock } from "./edit.mjs"
import { WfError } from "./errors.mjs"
import { parseNote } from "./frontmatter.mjs"
import { writeFiles } from "./io.mjs"
import { takeLock } from "./lock.mjs"
import { assertCommittable, commitFiles, gitDirs, indexEntries, restoreIndex } from "./repo.mjs"
import { checkSchema, isTrackerNote, locateVault, noteOf, readText, readVault } from "./store.mjs"

/** The `repo/effort` a ref or vault path belongs to, or null (`Wayfinder Picks`). */
export const effortKeyOf = (ref) => {
  const id = parseRef(ref)
  return id ? formatRef({ repo: id.repo, effort: id.effort }) : null
}

// Parse what a verb is about to write: wf never writes frontmatter it couldn't read back.
const parsedEdit = ({ path, text }) => {
  const parsed = parseNote(text)
  if (parsed.errors.length) throw new Error(`wf would write unreadable frontmatter to ${path}: ${parsed.errors[0].message}`)
  return { path, text, parsed }
}

// The notes as they will be once `edits` land.
const notesAfter = (notes, edits) => {
  const edited = new Set(edits.map((e) => e.path))
  const written = edits.filter((e) => isTrackerNote(e.path)).map((e) => noteOf(e.path, e.parsed))
  return [...notes.filter((n) => !edited.has(n.path)), ...written]
}

// Step 5: the verb's edits plus a fresh block for every map whose rendering changed.
const withBlocks = (vault, edits, before, after, language) => {
  const texts = new Map(edits.map((e) => [e.path, e.text]))
  for (const m of after.maps.values()) {
    const rendered = renderTicketsBlock(after, m.key, language)
    if (rendered === renderTicketsBlock(before, m.key, language)) continue
    texts.set(m.path, withTicketsBlock(texts.get(m.path) ?? readText(vault, m.path), rendered, m.path))
  }
  return [...texts].map(([path, text]) => ({ path, text }))
}

const touchedEfforts = (paths, ref) => new Set([...paths, ref].map(effortKeyOf).filter(Boolean))

// Steps 4 and 6: if the commit fails, the files and their index entries go back as they were.
const writeAndCommit = (vault, edits, message) => {
  const paths = edits.map((e) => e.path)
  const staged = indexEntries(vault, paths)
  const { undo } = writeFiles(vault, edits)
  try {
    return commitFiles(vault, paths, message)
  } catch (e) {
    restoreIndex(vault, paths, staged)
    undo()
    throw e
  }
}

// Steps 2–6, under the lock (step 1 and 7 are runWrite's).
const transact = (verb, args, { vault, checkout, gitDir }) => {
  checkSchema(vault)
  assertCommittable(vault, gitDir)
  const { notes, config, sort } = readVault(vault)
  const today = isoDate(new Date())
  const before = buildIndex(notes)
  const ctx = { vault, roots: [vault, checkout], index: before, config, sort, today, textOf: (path) => readText(vault, path) }
  const plan = verb.plan(ctx, args)
  const planned = plan.edits.map(parsedEdit)
  const rendered = buildIndex(notesAfter(notes, planned))
  const edits = withBlocks(vault, planned, before, rendered, config.language)
    .filter((e) => e.text !== readText(vault, e.path))
    .map(parsedEdit)
  // The state lint sees: the verb's edits and the regenerated blocks, as they are about to land.
  const after = buildIndex(notesAfter(notes, edits))
  const files = edits.map((e) => e.path)
  const commit = edits.length ? writeAndCommit(vault, edits, `wf(${verb.name}): ${plan.ref}`) : null
  return { ...plan, files, commit, index: after, config, sort, today }
}

// Step 8, after the lock is released: the touched efforts' findings, as warnings.
const lintTouched = (outcome) => {
  const efforts = touchedEfforts(outcome.files, outcome.ref)
  return lint(outcome.index, outcome).filter((f) => efforts.has(effortKeyOf(f.ref)))
}

const findingLine = (f) => `lint ${f.severity} ${f.rule} ${f.ref}: ${f.message}${f.fix ? ` (fix: ${f.fix})` : ""}`

/** The default report: the plan's `data` plus what was written, the commit and the lint findings. */
export function report(outcome, text) {
  const done = outcome.commit ? `${text} (commit ${outcome.commit.slice(0, 7)})` : `${text} (nothing to write)`
  return {
    data: { ...outcome.data, files: outcome.files, commit: outcome.commit, lint: outcome.lint },
    text: done,
    warnings: outcome.lint.map(findingLine),
  }
}

/** Run a write verb end to end. Returns the verb's report plus the pipeline's own warnings. */
export function runWrite(verb, args, { toolsDir }) {
  const { vault, checkout } = locateVault(toolsDir)
  checkSchema(vault)
  const { gitDir, commonDir } = gitDirs(vault)
  const lock = takeLock(commonDir, vault)
  let outcome
  try {
    outcome = transact(verb, args, { vault, checkout, gitDir })
  } catch (e) {
    if (!(e instanceof WfError) || !lock.warnings.length) throw e
    throw new WfError(e.code, e.message, { details: e.details, warnings: [...lock.warnings, ...e.warnings] })
  } finally {
    lock.release()
  }
  const result = verb.report({ ...outcome, lint: lintTouched(outcome) }, args)
  return { ...result, warnings: [...lock.warnings, ...(result.warnings ?? [])] }
}
