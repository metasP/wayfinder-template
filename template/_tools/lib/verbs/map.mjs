// What the map verbs share (spec *Verbs*: map transitions, `bump-runs`): reading the map an effort
// argument names, refused with the command that charts it when there is none.
import { effortRefArg } from "../args.mjs"
import { noMap } from "./ticket.mjs"

/** The map of the effort `input` names (`repo/effort`, a vault path or a wikilink); `why` says why one is needed. */
export function mapArg(input, ctx, why) {
  const key = effortRefArg(input, ctx)
  const m = ctx.index.maps.get(key)
  if (!m) throw noMap(key, why)
  return m
}

/** A report with one more line of text saying what to do next. */
export const withNext = (result, next) => ({ ...result, text: `${result.text}\nnext: ${next}` })
