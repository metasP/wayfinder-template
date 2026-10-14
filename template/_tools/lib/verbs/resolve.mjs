// `wf resolve <ref> --gist "…"` — claimed/waiting → resolved, and `--out-of-scope`: open/claimed →
// resolved (spec *Verbs*: ticket transitions; Q24). The ticket needs a real `## Answer` (not empty, not
// the skeleton's placeholder in any language). The map is re-read under the lock and gets one line,
// `- [[NN-slug]]: <gist>`, under *Decisions so far* (or *Out of scope*), so a concurrent resolve's
// line is never overwritten. The claim, wait note and wait date are cleared.
import { ticketArg } from "../args.mjs"
import { NOTE_TEXT } from "../core.mjs"
import { appendToSection, editFrontmatter, sectionText } from "../edit.mjs"
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

const assertAnswered = (t, text) => {
  const answer = sectionText(text, "Answer")?.trim()
  if (answer && !PLACEHOLDERS.has(answer)) return
  throw invariantError(`${t.ref} has no answer — resolve needs a non-empty ## Answer that isn't the placeholder`, {
    fix: `write the answer under ## Answer in ${t.path}, then rerun`,
  })
}

export default {
  name: "resolve",
  summary: "claimed/waiting → resolved, the decision added to the map (--out-of-scope: open/claimed)",
  usage: 'wf resolve <ref> --gist "…" [--out-of-scope] [--json]',
  flags: { gist: "string", "out-of-scope": "boolean" },
  minPositionals: 1,
  maxPositionals: 1,
  writes: () => true,
  prepare: (args) => ({ ...args, flags: { ...args.flags, gist: gistArg(args.flags.gist) } }),
  plan(ctx, { flags, positionals }) {
    const outOfScope = flags["out-of-scope"] === true
    const t = ticketArg(positionals[0], ctx)
    assertTransition(t, "resolve", { flag: outOfScope ? OUT_OF_SCOPE : undefined })
    const text = ctx.textOf(t.path)
    if (!outOfScope) assertAnswered(t, text)
    const changes = [["status", "resolved"], ["status_since", ctx.today], ["claimed_by", null], ["status_note", null], ["wait_until", null]]
    const m = ctx.index.maps.get(t.effortKey)
    if (!m) throw noMap(t.effortKey, "the decision goes in the map")
    const section = outOfScope ? "Out of scope" : "Decisions so far"
    const edits = [
      { path: t.path, text: editFrontmatter(text, changes) },
      { path: m.path, text: appendToSection(ctx.textOf(m.path), section, `- [[${t.name}]]: ${flags.gist}`) },
    ]
    const data = { ref: t.ref, status: "resolved", status_since: ctx.today, out_of_scope: outOfScope, gist: flags.gist, section }
    return { ref: t.ref, edits, data }
  },
  report: (outcome) => report(outcome, `resolved ${outcome.ref} — ${outcome.data.section}: ${outcome.data.gist}`),
}
