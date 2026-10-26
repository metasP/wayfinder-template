// `wf chart <repo/effort> --title "…" [--serial]` — — → draft (spec *Verbs*: map transitions; Q25). Creates
// `map.md` with the standard section skeleton and the generated `## Tickets` block. Headings stay
// English; the Destination placeholder and the empty-block line follow `language:` (Q36). `map-status
// active` treats the placeholder as no Destination. `--serial` writes `serial: true`, as `wf serial … on`
// does on a map that exists.
import { effortRefArg, oneLineFlag } from "../args.mjs"
import { BLOCK_CLOSE, BLOCK_OPEN, noteText, renderTicketsBlock } from "../core.mjs"
import { editFrontmatter } from "../edit.mjs"
import { invariantError } from "../errors.mjs"
import { report } from "../pipeline.mjs"
import { withNext } from "./map.mjs"

// The map's body under its frontmatter, sections in the order the vault README gives them.
const body = (title, rendered, language) => [
  "",
  `# ${title}`,
  "",
  "## Destination",
  "",
  noteText("destinationPlaceholder", language),
  "",
  "## Notes",
  "",
  "## Tickets",
  "",
  BLOCK_OPEN,
  rendered,
  BLOCK_CLOSE,
  "",
  "## Decisions so far",
  "",
  "## Not yet specified",
  "",
  "## Out of scope",
  "",
]

// A map is charted once; a `map.md` that isn't a map is someone's file, never overwritten.
const assertNoMap = (ctx, key, path) => {
  const m = ctx.index.maps.get(key)
  if (m)
    throw invariantError(`${key} already has a map (${m.path}, ${m.status}) — chart creates a new one`, {
      fix: `wf map-status ${key} <status> (to move the map that exists)`,
    })
  if (ctx.textOf(path) !== null)
    throw invariantError(`${path} already exists and is not a map (no kind: map) — chart won't overwrite it`, {
      fix: `move ${path} aside, then rerun`,
    })
}

export default {
  name: "chart",
  summary: "— → draft: a new map with the section skeleton",
  usage: 'wf chart <repo/effort> --title "…" [--serial] [--json]',
  flags: { title: "string", serial: "boolean" },
  minPositionals: 1,
  maxPositionals: 1,
  writes: () => true,
  prepare: (args) => ({ ...args, flags: { ...args.flags, title: oneLineFlag("chart", "title", args.flags.title) } }),
  plan(ctx, { flags, positionals }) {
    const key = effortRefArg(positionals[0], ctx)
    const path = `${key}/map.md`
    assertNoMap(ctx, key, path)
    const language = ctx.config.language
    const fields = { kind: "map", title: flags.title, status: "draft", status_since: ctx.today, created: ctx.today }
    if (flags.serial) fields.serial = true
    const rendered = renderTicketsBlock(ctx.index, key, language)
    const text = editFrontmatter("---\n---\n", Object.entries(fields)) + body(flags.title, rendered, language).join("\n")
    const data = { ref: key, path, title: flags.title, status: "draft", status_since: ctx.today, created: ctx.today, ...(flags.serial && { serial: true }) }
    return { ref: key, edits: [{ path, text, create: true }], data }
  },
  report: (outcome) =>
    withNext(
      report(outcome, `charted ${outcome.ref} at ${outcome.data.path} (draft)`),
      `write ## Destination, then wf map-status ${outcome.ref} active`,
    ),
}
