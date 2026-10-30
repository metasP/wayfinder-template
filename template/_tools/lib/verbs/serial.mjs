// `wf serial <repo/effort> on|off` (spec *Verbs*: other verbs). `on` writes `serial: true` on the map,
// `off` removes the key: a serial map's tickets are worked one at a time, so `wf claim` refuses a
// second claimed ticket in it. Any map status; nothing else in the map changes.
import { invariantError, usageError } from "../errors.mjs"
import { editFrontmatter } from "../edit.mjs"
import { report } from "../pipeline.mjs"
import { mapArg } from "./map.mjs"

const SWITCH = { on: true, off: false }

const switchArg = (value) => {
  if (Object.hasOwn(SWITCH, value)) return SWITCH[value]
  throw usageError(`serial takes on or off, got ${JSON.stringify(value)}`)
}

export default {
  name: "serial",
  summary: "mark a map serial (one claimed ticket at a time) or clear it",
  usage: "wf serial <repo/effort> on|off [--json]",
  minPositionals: 2,
  maxPositionals: 2,
  writes: () => true,
  prepare: (args) => ({ ...args, serial: switchArg(args.positionals[1]) }),
  plan(ctx, { positionals, serial }) {
    const m = mapArg(positionals[0], ctx, "serial is set on the map")
    // `off` clears any `serial:` line, a value lint calls invalid included.
    const already = serial ? m.serial : !Object.hasOwn(m.frontmatter, "serial")
    if (already)
      throw invariantError(`map ${m.key} is already ${serial ? "serial" : "not serial"}`, { fix: "nothing to do" })
    const text = editFrontmatter(ctx.textOf(m.path), [["serial", serial ? true : null]])
    return { ref: m.key, edits: [{ path: m.path, text }], data: { ref: m.key, serial } }
  },
  report: (outcome) => report(outcome, `map ${outcome.ref}: serial ${outcome.data.serial ? "on" : "off"}`),
}
