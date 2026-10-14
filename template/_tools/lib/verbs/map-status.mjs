// `wf map-status <repo/effort> active|paused|dropped|done [--note "…"] [--superseded-by <repo/effort>]`
// (spec *Verbs*: map transitions; Q25). `active` needs a real `## Destination` (not empty, not chart's
// placeholder); `paused` and `dropped` need `--note`; `done` needs no open, claimed or waiting ticket
// and reminds to run `/retro`. Every transition restamps `status_since` and replaces `status_note`
// with `--note` or clears it. `--superseded-by` (paused or dropped only) writes `superseded_by` as a
// wikilink to the replacing map; any transition without it clears the key.
import { effortRefArg, oneLineFlag } from "../args.mjs"
import { isPending, MAP_FIELDS, MAP_STATUSES, MAP_TRANSITIONS, NOTE_TEXT, findTransition } from "../core.mjs"
import { editFrontmatter, sectionText } from "../edit.mjs"
import { invariantError, usageError } from "../errors.mjs"
import { report } from "../pipeline.mjs"
import { mapArg, withNext } from "./map.mjs"
import { noMap } from "./ticket.mjs"

const TARGETS = [...new Set(MAP_TRANSITIONS.filter((row) => row.verb === "map-status").map((row) => row.to))]
const NEEDS_NOTE = MAP_FIELDS.status_note.required
const PLACEHOLDERS = new Set(Object.values(NOTE_TEXT.destinationPlaceholder))
const RETRO = "run /retro — it writes the map's ## Retro"
const SUPERSEDABLE = ["paused", "dropped"]

const targetArg = (to) => {
  if (!TARGETS.includes(to)) throw usageError(`status must be one of ${TARGETS.join(", ")}, got ${JSON.stringify(to)}`)
  return to
}

const noteArg = (note, to) => {
  if (note !== undefined) return oneLineFlag("map-status", "note", note)
  if (NEEDS_NOTE.includes(to)) throw usageError(`map-status ${to} needs --note "…" saying why`)
  return null
}

const assertTransition = (m, to) => {
  if (!MAP_STATUSES.includes(m.status))
    throw invariantError(`map ${m.key} has status ${JSON.stringify(m.status)}, which is not a map status`, { fix: `wf lint ${m.key}` })
  if (!findTransition("map", "map-status", m.status, { to }))
    throw invariantError(`map ${m.key} is already ${to}`, { fix: `nothing to do; wf lint ${m.key} shows what the map needs` })
}

const assertDestination = (m, text) => {
  const destination = sectionText(text, "Destination")?.trim()
  if (destination && !PLACEHOLDERS.has(destination)) return
  throw invariantError(`${m.key} has no ## Destination — a map goes active with one`, {
    fix: `write ## Destination in ${m.path}, then rerun`,
  })
}

// The command that settles a pending ticket, best first.
const settle = (t) =>
  t.status === "open"
    ? [`wf resolve ${t.ref} --out-of-scope --gist "…" (past the destination)`, `wf claim ${t.ref}`]
    : [`wf resolve ${t.ref} --gist "…"`]

const assertNothingPending = (index, m) => {
  const pending = index.efforts.get(m.key).tickets.filter((t) => isPending(index, t))
  if (!pending.length) return
  const count = `${pending.length} pending ticket${pending.length === 1 ? "" : "s"}`
  const refs = pending.map((t) => `${t.ref} (${t.status})`).join(", ")
  throw invariantError(`${m.key} has ${count}: ${refs} — a map is done when none is open, claimed or waiting`, {
    fix: settle(pending[0]),
  })
}

// The map that replaces this one — another effort's — as the wikilink `superseded_by` holds.
const successorArg = (input, ctx, m, to) => {
  if (input === undefined) return null
  const key = effortRefArg(input, ctx)
  if (key === m.key)
    throw invariantError(`${m.key} can't supersede itself`, { fix: `wf map-status ${m.key} ${to} --note "…" (without --superseded-by)` })
  const successor = ctx.index.maps.get(key)
  if (!successor) throw noMap(key, "--superseded-by names the map that replaces this one")
  return `[[${successor.path.replace(/\.md$/, "")}]]`
}

export default {
  name: "map-status",
  summary: "move a map to active, paused, dropped or done",
  usage: 'wf map-status <repo/effort> active|paused|dropped|done [--note "…"] [--superseded-by <repo/effort>] [--json]',
  flags: { note: "string", "superseded-by": "string" },
  minPositionals: 2,
  maxPositionals: 2,
  writes: () => true,
  prepare({ flags, positionals }) {
    const to = targetArg(positionals[1])
    if (flags["superseded-by"] !== undefined && !SUPERSEDABLE.includes(to))
      throw usageError(`--superseded-by goes with ${SUPERSEDABLE.join(" or ")}`)
    return { flags: { ...flags, note: noteArg(flags.note, to) }, positionals, to }
  },
  plan(ctx, { flags, positionals, to }) {
    const m = mapArg(positionals[0], ctx, "map-status moves a map that exists")
    assertTransition(m, to)
    if (to === "active") assertDestination(m, ctx.textOf(m.path))
    if (to === "done") assertNothingPending(ctx.index, m)
    const supersededBy = successorArg(flags["superseded-by"], ctx, m, to)
    const fields = { status: to, status_since: ctx.today, status_note: flags.note, superseded_by: supersededBy }
    const text = editFrontmatter(ctx.textOf(m.path), Object.entries(fields))
    const data = { ref: m.key, from: m.status, ...fields, reminder: to === "done" ? RETRO : null }
    return { ref: m.key, edits: [{ path: m.path, text }], data }
  },
  report(outcome) {
    const { ref, from, status, status_note: note, reminder } = outcome.data
    const result = report(outcome, `map ${ref}: ${from} → ${status}${note ? ` (${note})` : ""}`)
    return reminder ? withNext(result, reminder) : result
  },
}
