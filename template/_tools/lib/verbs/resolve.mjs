// `wf resolve <ref> --gist "…"` — claimed/waiting → resolved, and `--out-of-scope`: open/claimed →
// resolved (spec *Verbs*: ticket transitions; Q24). The ticket needs a real `## Answer` (not empty, not
// the skeleton's placeholder in any language). The map is re-read under the lock and gets one line,
// `- [[NN-slug]]: <gist>`, under *Decisions so far* (or *Out of scope*), so a concurrent resolve's
// line is never overwritten. The claim, wait note and wait date are cleared. `--answer-file` writes the
// ticket's `## Answer` in the main checkout from a file first, in the same commit — the way a session in a
// vault worktree resolves, since wf reads only the main checkout (the file may be the worktree's copy of
// the ticket: its `## Answer` section is taken).
import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { ticketArg } from "../args.mjs"
import { NOTE_TEXT } from "../core.mjs"
import { appendToSection, editFrontmatter, replaceSection, sectionText } from "../edit.mjs"
import { invariantError, usageError } from "../errors.mjs"
import { report } from "../pipeline.mjs"
import { assertTransition, noMap } from "./ticket.mjs"

const OUT_OF_SCOPE = "--out-of-scope"
const PLACEHOLDERS = new Set(Object.values(NOTE_TEXT.answerPlaceholder))

const gistArg = (gist) => {
  const text = gist?.trim()
  if (!text) throw usageError('resolve needs --gist "…": the one-line decision the map records')
  if (/[\r\n]/.test(text)) throw usageError("--gist must be one line")
  return text
}

// The answer a file holds: its `## Answer` section when it has one, else all of it.
const answerFileArg = (path) => {
  if (path === undefined) return undefined
  let text
  try {
    text = readFileSync(resolvePath(path), "utf8").replace(/\r\n?/g, "\n")
  } catch (e) {
    throw usageError(`cannot read --answer-file ${path}: ${e.message}`)
  }
  const answer = (sectionText(text, "Answer") ?? text).trim()
  if (!answer || PLACEHOLDERS.has(answer)) throw usageError(`--answer-file ${path} holds no answer (empty, or the placeholder)`)
  return answer
}

const assertAnswered = (t, text) => {
  const answer = sectionText(text, "Answer")?.trim()
  if (answer && !PLACEHOLDERS.has(answer)) return
  throw invariantError(`${t.ref} has no answer — resolve needs a non-empty ## Answer that isn't the placeholder`, {
    fix: `write the answer under ## Answer in ${t.path} (or into a file: --answer-file <file>), then rerun`,
  })
}

export default {
  name: "resolve",
  summary: "claimed/waiting → resolved, the decision added to the map (--out-of-scope: open/claimed)",
  usage: 'wf resolve <ref> --gist "…" [--answer-file <file>] [--out-of-scope] [--json]',
  flags: { gist: "string", "answer-file": "string", "out-of-scope": "boolean" },
  minPositionals: 1,
  maxPositionals: 1,
  writes: () => true,
  prepare: (args) => {
    const gist = gistArg(args.flags.gist)
    return { ...args, flags: { ...args.flags, gist }, answer: answerFileArg(args.flags["answer-file"]) }
  },
  plan(ctx, { flags, positionals, answer }) {
    const outOfScope = flags["out-of-scope"] === true
    const t = ticketArg(positionals[0], ctx)
    assertTransition(t, "resolve", { flag: outOfScope ? OUT_OF_SCOPE : undefined })
    const text = answer === undefined ? ctx.textOf(t.path) : replaceSection(ctx.textOf(t.path), "Answer", answer)
    if (!outOfScope) assertAnswered(t, text)
    const changes = [["status", "resolved"], ["status_since", ctx.today], ["claimed_by", null], ["status_note", null], ["wait_until", null]]
    const m = ctx.index.maps.get(t.effortKey)
    if (!m) throw noMap(t.effortKey, "the decision goes in the map")
    const section = outOfScope ? "Out of scope" : "Decisions so far"
    const edits = [
      { path: t.path, text: editFrontmatter(text, changes) },
      { path: m.path, text: appendToSection(ctx.textOf(m.path), section, `- [[${t.name}]]: ${flags.gist}`) },
    ]
    const data = { ref: t.ref, status: "resolved", status_since: ctx.today, out_of_scope: outOfScope, gist: flags.gist, section, answer_written: answer !== undefined }
    return { ref: t.ref, edits, data }
  },
  report: (outcome) => report(outcome, `resolved ${outcome.ref} — ${outcome.data.section}: ${outcome.data.gist}`),
}
