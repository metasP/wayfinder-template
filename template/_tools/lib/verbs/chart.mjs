// `wf chart <repo/effort> --title "…" [--serial]` — — → draft (spec *Verbs*: map transitions; Q25). Creates
// `map.md` with the standard section skeleton and the generated `## Tickets` block. Headings stay
// English; the Destination placeholder and the empty-block line follow `language:` (Q36). `map-status
// active` treats the placeholder as no Destination. `--serial` writes `serial: true`, as `wf serial … on`
// does on a map that exists. `--destination "…"` writes `## Destination` (lines kept); with it,
// `--active` charts the map straight to active — what `/to-tickets` does when it charts a map from cards
// whose spec already holds the destination (retro of dashboard-navigation, C).
import { effortRefArg, oneLineFlag } from "../args.mjs"
import { BLOCK_CLOSE, BLOCK_OPEN, noteText, renderTicketsBlock } from "../core.mjs"
import { editFrontmatter } from "../edit.mjs"
import { invariantError, usageError } from "../errors.mjs"
import { report } from "../pipeline.mjs"
import { withNext } from "./map.mjs"

// The map's body under its frontmatter, sections in the order the vault README gives them.
const body = (title, destination, rendered, language) => [
  "",
  `# ${title}`,
  "",
  "## Destination",
  "",
  destination ?? noteText("destinationPlaceholder", language),
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

// The Destination's text, line endings as the skeleton's; null without the flag. Blank is refused —
// a map without a real Destination never goes active.
const destinationArg = (destination) => {
  if (destination === undefined) return null
  const text = String(destination).replace(/\r\n?/g, "\n").trim()
  if (!text) throw usageError("--destination must not be blank")
  return text
}

const prepare = ({ flags, positionals }) => {
  const destination = destinationArg(flags.destination)
  if (flags.active && destination === null) throw usageError('--active goes with --destination "…" — a map goes active with one')
  return { positionals, flags: { ...flags, title: oneLineFlag("chart", "title", flags.title), destination } }
}

const nextStep = (data) =>
  data.status === "active"
    ? `wf new ${data.ref} --type task --title "…" --card <url> (one per card)`
    : data.destination
      ? `wf map-status ${data.ref} active`
      : `write ## Destination, then wf map-status ${data.ref} active`

export default {
  name: "chart",
  summary: "— → draft (or active, with --destination and --active): a new map with the section skeleton",
  usage: 'wf chart <repo/effort> --title "…" [--destination "…" [--active]] [--serial] [--json]',
  flags: { title: "string", destination: "string", active: "boolean", serial: "boolean" },
  minPositionals: 1,
  maxPositionals: 1,
  writes: () => true,
  prepare,
  plan(ctx, { flags, positionals }) {
    const key = effortRefArg(positionals[0], ctx)
    const path = `${key}/map.md`
    assertNoMap(ctx, key, path)
    const language = ctx.config.language
    const status = flags.active ? "active" : "draft"
    const fields = { kind: "map", title: flags.title, status, status_since: ctx.today, created: ctx.today }
    if (flags.serial) fields.serial = true
    const rendered = renderTicketsBlock(ctx.index, key, language)
    const text = editFrontmatter("---\n---\n", Object.entries(fields)) + body(flags.title, flags.destination, rendered, language).join("\n")
    const data = {
      ref: key, path, title: flags.title, status, status_since: ctx.today, created: ctx.today,
      ...(flags.serial && { serial: true }),
      ...(flags.destination !== null && { destination: true }),
    }
    return { ref: key, edits: [{ path, text, create: true }], data }
  },
  report: (outcome) =>
    withNext(report(outcome, `charted ${outcome.ref} at ${outcome.data.path} (${outcome.data.status})`), nextStep(outcome.data)),
}
