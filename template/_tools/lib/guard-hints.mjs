// The frontmatter guard's denial text (spec *Frontmatter guard hook (Q15)*): for each frontmatter key a
// Write or Edit would change, the `wf` verb that changes it (Q16: one verb per transition), spelled as
// the command to run (Q21: `node <vault>/_tools/wf.mjs …`).
import { MAP_FIELDS, MAP_TRANSITIONS, TICKET_FIELDS, TICKET_TRANSITIONS, TICKET_TYPES, formatRef } from "./core.mjs"

const KINDS = {
  ticket: { fields: TICKET_FIELDS, transitions: TICKET_TRANSITIONS },
  map: { fields: MAP_FIELDS, transitions: MAP_TRANSITIONS },
}

// Keys a status transition writes on its own: when `status` changes too, its hint covers them.
const SET_BY_TRANSITION = new Set(["status_since", "status_note", "claimed_by", "wait_until", "superseded_by"])

const code = (text) => `\`${text}\``
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// The keys whose value differs, schema keys first in schema order, then any others in note order.
const changedKeys = (fields, before, after) => {
  const keys = [...new Set([...Object.keys(fields), ...Object.keys(before), ...Object.keys(after)])]
  return keys.filter((key) => !sameValue(before[key], after[key]))
}

// A transition row as the command that performs it, arguments the verb requires included.
const transitionCommand = (kind, row, ref) => {
  if (kind === "map") {
    const needsNote = MAP_FIELDS.status_note.required.includes(row.to)
    return `map-status ${ref} ${row.to}${needsNote ? ' --note "…"' : ""}`
  }
  const args = { wait: ' --note "…"', resolve: ' --gist "…"' }[row.verb] ?? ""
  return `${row.verb} ${ref}${row.flag ? ` ${row.flag}` : ""}${args}`
}

// Every transition that leaves `status`; all of them when the status is not one the verbs know.
const transitionsFrom = (transitions, status) => {
  const moves = transitions.filter((row) => row.from !== null)
  const from = moves.filter((row) => row.from.includes(status))
  return from.length ? from : moves
}

const listTransitions = (ctx, status) =>
  transitionsFrom(ctx.transitions, status)
    .map((row) => code(ctx.wf(transitionCommand(ctx.kind, row, ctx.ref))))
    .join(" · ")

const statusHint = (ctx, before, after) => {
  const reaching = ctx.transitions.filter((row) => row.from !== null && row.to === after.status)
  const row = reaching.find((r) => r.from.includes(before.status)) ?? reaching[0]
  if (after.status === undefined)
    return `no verb removes ${code("status")} — keep the frontmatter as it is; from ${code(String(before.status))}: ${listTransitions(ctx, before.status)}`
  if (row) return `to change ${code("status")}, run ${code(ctx.wf(transitionCommand(ctx.kind, row, ctx.ref)))}`
  return `no verb sets ${code("status")} to ${code(String(after.status))} — from ${code(String(before.status))}: ${listTransitions(ctx, before.status)}`
}

const statusSinceHint = (ctx, before) =>
  `${code("status_since")} is stamped by the verb that changes ${code("status")} — from ${code(String(before.status))}: ${listTransitions(ctx, before.status)}`

const writtenOnce = (key, creator) => (ctx) =>
  `${code(key)} is written once by ${code(ctx.wf(creator))} when the note is created; no verb changes it`

const noVerb = (key) => (ctx) =>
  `no wf verb writes ${code(key)} — leave it as it is, or ask the owner; ${code(ctx.wf(`lint ${ctx.effort}`))} checks it`

const TICKET_HINTS = {
  type: writtenOnce("type", "new"),
  title: writtenOnce("title", "new"),
  target_repo: writtenOnce("target_repo", "new"),
  blockers: (ctx) => `to change ${code("blockers")}, run ${code(ctx.wf(`block ${ctx.ref} <blocker-ref>`))} (add ${code("--remove")} to drop one)`,
  claimed_by: (ctx) =>
    `${code("claimed_by")} is stamped by ${code(ctx.wf(`claim ${ctx.ref} --by <name>`))} and cleared by ${code(ctx.wf(`release ${ctx.ref}`))}`,
  status_note: (ctx) =>
    `${code("status_note")} is set by ${code(ctx.wf(`wait ${ctx.ref} --note "…"`))} and cleared by ${code(ctx.wf(`release ${ctx.ref}`))} or ${code("resolve")}`,
  wait_until: (ctx) => `${code("wait_until")} is set by ${code(ctx.wf(`wait ${ctx.ref} --note "…" --until YYYY-MM-DD`))}`,
}

const MAP_HINTS = {
  kind: writtenOnce("kind", "chart"),
  title: writtenOnce("title", "chart"),
  created: writtenOnce("created", "chart"),
  status_note: (ctx) => `${code("status_note")} is set by ${code(ctx.wf(`map-status ${ctx.ref} paused|dropped --note "…"`))}`,
  runs: (ctx) => `to change ${code("runs")}, run ${code(ctx.wf(`bump-runs ${ctx.ref}`))}`,
  superseded_by: (ctx) =>
    `${code("superseded_by")} is set by ${code(ctx.wf(`map-status ${ctx.ref} paused|dropped --note "…" --superseded-by <repo/effort>`))}`,
  repos: noVerb("repos"),
  blocked_by: noVerb("blocked_by"),
  base_branch: noVerb("base_branch"),
}

const KEY_HINTS = { ticket: TICKET_HINTS, map: MAP_HINTS }

const keyHint = (ctx, key, before, after) => {
  if (key === "status") return statusHint(ctx, before, after)
  if (key === "status_since") return statusSinceHint(ctx, before)
  const hint = KEY_HINTS[ctx.kind][key]
  if (hint) return hint(ctx)
  return `${code(key)} is not a tracker field — ${code(ctx.wf(`lint ${ctx.effort}`))} reports it; leave the frontmatter to wf`
}

/**
 * Why a change to the frontmatter of the note `id` (a ticket or map identity) is denied, naming the
 * verb for each changed key. `before` / `after` are the parsed frontmatter; `wf` is the command prefix.
 */
export function denialReason({ id, rel, before, after, wf }) {
  const kind = id.nn == null ? "map" : "ticket"
  const ref = formatRef(id)
  const ctx = { kind, ref, effort: formatRef({ ...id, nn: null }), wf: (args) => `${wf} ${args}`, ...KINDS[kind] }
  const changed = changedKeys(ctx.fields, before, after)
  const shown = changed.includes("status") ? changed.filter((key) => !SET_BY_TRANSITION.has(key)) : changed
  const isRemoved = Object.keys(before).length > 0 && Object.keys(after).length === 0
  const hints = isRemoved
    ? [`this would remove the whole frontmatter — keep it as it is; ${code(ctx.wf("help"))} lists the verbs`]
    : shown.map((key) => keyHint(ctx, key, before, after))
  if (!hints.length) hints.push(`${code(ctx.wf("help"))} lists the verbs`)
  const what = kind === "ticket" ? `ticket ${ref}` : `the map of ${ref}`
  const said = hints.join("; ")
  return `${rel} is ${what}: its frontmatter is tracker state, changed only through wf. ${said[0].toUpperCase()}${said.slice(1)}. Edit only the body below the closing ${code("---")}.`
}

/** A ticket's or map's creation is denied: `wf new` or `wf chart` creates it. */
export function creationReason({ id, rel, wf }) {
  const effort = formatRef({ ...id, nn: null })
  const command =
    id.nn == null
      ? `${wf} chart ${effort} --title "…"`
      : `${wf} new ${effort} --type ${TICKET_TYPES.join("|")} --title "…"`
  const what = id.nn == null ? "a map" : "a ticket (wf picks its number)"
  return `${rel} would create ${what}: tracker notes are created only through wf. Run ${code(command)}, then edit the body.`
}
