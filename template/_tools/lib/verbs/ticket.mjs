// What the ticket verbs share (spec *Verbs*: ticket transitions): reading the ticket a ref names, the
// transition-table check, and the invariants `claim` adds — each refusal states the invariant and the
// command that fixes it.
import { findTransition, openBlockers, TICKET_STATUSES, TICKET_TRANSITIONS } from "../core.mjs"
import { invariantError } from "../errors.mjs"
import { editFrontmatter } from "../edit.mjs"

// The command that gets a ticket out of `status` when `verb` refuses it there.
const FIX_FROM = {
  open: (t, verb) => (verb === "release" ? "nothing to release; wf frontier lists open tickets" : `wf claim ${t.ref}`),
  claimed: (t) => `wf release ${t.ref}`,
  waiting: (t) => `wf release ${t.ref}`,
  resolved: (t) => `wf new ${t.effortKey} --type ${t.type ?? "<type>"} --title <title> (a resolved ticket stays resolved; open a follow-up)`,
}

const describe = (t) => {
  if (t.status === "claimed") return `claimed by ${t.claimedBy ?? "nobody"}`
  if (t.status === "waiting") return `waiting (${t.statusNote ?? "no note"})`
  return String(t.status)
}

/** Refuse `verb` on ticket `t` unless the transition table allows it from `t.status`. */
export function assertTransition(t, verb) {
  if (findTransition("ticket", verb, t.status)) return
  if (!TICKET_STATUSES.includes(t.status))
    throw invariantError(`${t.ref} has status ${JSON.stringify(t.status)}, which is not a ticket status`, { fix: `wf lint ${t.effortKey}` })
  const from = TICKET_TRANSITIONS.find((row) => row.verb === verb && !row.flag).from
  throw invariantError(`${t.ref} is ${describe(t)} — ${verb} needs a ticket that is ${from.join(" or ")}`, {
    fix: FIX_FROM[t.status](t, verb),
  })
}

/** Refuse a ticket whose blockers aren't all resolved (a blocker that resolves nowhere blocks). */
export function assertUnblocked(index, t) {
  const open = openBlockers(index, t)
  if (!open.length) return
  const named = t.blockers.map((ref, i) => [ref, t.rawBlockers[i]]).filter(([ref]) => open.includes(ref))
  const what = named.map(([ref, raw]) => (ref ? `${ref} (${index.tickets.get(ref).status})` : `${raw} (resolves to no ticket)`))
  const firstOpen = named.find(([ref]) => ref)?.[0]
  const fix = named.some(([ref]) => !ref)
    ? [`wf lint ${t.effortKey} (fix the blocker link)`]
    : [`wf claim ${firstOpen} (work the blocker first)`, `wf block ${t.ref} ${firstOpen} --remove`]
  throw invariantError(`${t.ref} is blocked by ${what.join(", ")} — a blocked ticket can't be claimed`, { fix })
}

/** Refuse a ticket whose effort has no map, or a map that isn't `active`. */
export function assertMapActive(index, t) {
  const m = index.efforts.get(t.effortKey)?.map
  if (!m) throw invariantError(`${t.effortKey} has no map — tickets are claimed on an active map`, { fix: `wf chart ${t.effortKey} --title <title>` })
  if (m.status !== "active")
    throw invariantError(`map ${m.key} is ${m.status}, not active — tickets are claimed on an active map`, {
      fix: `wf map-status ${m.key} active`,
    })
}

/** The plan for a frontmatter-only ticket transition: the new text and the fields it set. */
export function transition(ctx, t, changes, data) {
  const text = editFrontmatter(ctx.textOf(t.path), changes)
  return { ref: t.ref, edits: [{ path: t.path, text }], data: { ref: t.ref, ...data } }
}
