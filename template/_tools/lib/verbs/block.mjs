// `wf block <ref> <blocker-ref> [--remove]` — adds or removes one blocker edge (spec *Verbs*: other
// verbs). The link is a bare `[[NN-slug]]` within an effort and a full-path wikilink across efforts.
// An edge that would close a cycle is refused, naming the cycle; adding an edge that is there, or
// removing one that isn't, writes nothing.
import { ticketArg, ticketRefArg } from "../args.mjs"
import { blockerPath, formatRef, parseRef } from "../core.mjs"
import { invariantError } from "../errors.mjs"
import { report } from "../pipeline.mjs"
import { blockerArg, blockerLink, transition } from "./ticket.mjs"

const rawText = (raw) => String(raw).trim()

// A ref argument as a ticket ref, or null when it doesn't read as one (a dangling link spelled oddly).
const refOrNull = (input, ctx, t) => {
  try {
    return ticketRefArg(input, ctx, { home: t })
  } catch {
    return null
  }
}

// Whether blocker `i` of `t` is the edge to `target` (a ref, or null): it resolves there; it dangles
// and its link names that ticket's NN; or it is spelled exactly like the argument.
const isEdgeTo = (t, i, target, input) => {
  const raw = rawText(t.rawBlockers[i])
  const resolvesThere = target !== null && t.blockers[i] === target
  const id = t.blockers[i] == null ? parseRef(raw, { home: t }) : null
  const danglesThere = target !== null && id?.nn != null && formatRef(id) === target
  return resolvesThere || danglesThere || raw === input.trim()
}

const added = (ctx, t, input) => {
  const b = blockerArg(input, ctx, t)
  if (b.ref === t.ref) throw invariantError(`${t.ref} can't block itself`, { fix: `wf block ${t.ref} <another ticket>` })
  if (t.blockers.includes(b.ref)) return { blockers: t.rawBlockers.map(rawText), blocker: b.ref, changed: false }
  const chain = blockerPath(ctx.index, b.ref, t.ref)
  if (chain)
    throw invariantError(`${t.ref} blocked by ${b.ref} would close the cycle ${[t.ref, ...chain].join(" → ")}`, {
      fix: `wf block ${chain[0]} ${chain[1]} --remove (cut the chain first)`,
    })
  return { blockers: [...t.rawBlockers.map(rawText), blockerLink(t.effortKey, b)], blocker: b.ref, changed: true }
}

const removed = (ctx, t, input) => {
  const target = refOrNull(input, ctx, t)
  const blockers = t.rawBlockers.filter((_, i) => !isEdgeTo(t, i, target, input)).map(rawText)
  const changed = blockers.length !== t.rawBlockers.length
  // Nothing matched and the argument isn't a ref: say why it can't be read.
  if (!changed && target === null) ticketRefArg(input, ctx, { home: t })
  return { blockers, blocker: target ?? input.trim(), changed }
}

export default {
  name: "block",
  summary: "add (or --remove) one blocker edge; cycles are refused",
  usage: "wf block <ref> <blocker-ref> [--remove] [--json]",
  flags: { remove: "boolean" },
  minPositionals: 2,
  maxPositionals: 2,
  writes: () => true,
  plan(ctx, { flags, positionals }) {
    const t = ticketArg(positionals[0], ctx)
    const edge = (flags.remove ? removed : added)(ctx, t, positionals[1])
    const data = { blocker: edge.blocker, removed: flags.remove === true, blockers: edge.blockers }
    if (!edge.changed) return { ref: t.ref, edits: [], data: { ref: t.ref, ...data } }
    return transition(ctx, t, [["blockers", edge.blockers]], data)
  },
  report: (outcome) => {
    const { blocker, removed: isRemoval } = outcome.data
    const what = outcome.commit
      ? isRemoval ? "is no longer blocked by" : "is blocked by"
      : isRemoval ? "was not blocked by" : "is already blocked by"
    return report(outcome, `${outcome.ref} ${what} ${blocker}`)
  },
}
