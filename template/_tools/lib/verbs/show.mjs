// `wf show <ref>` — one ticket and the map lines that bear on it, read-only (spec *Verbs*). It prints the
// ticket file as it is, then its map's `## Destination` and `## Notes` in full and every other map line that
// links the ticket (`## Decisions so far`, `## Not yet specified` …) — so an agent needn't read the whole map.
// The derived `## Tickets` block is left out. A line links the ticket when one of its wikilinks names its file.
import { join } from "node:path"
import { parseNote } from "../frontmatter.mjs"
import { formatRef, parseRef } from "../core.mjs"
import { ticketArg } from "../args.mjs"
import { contentOf, linesOf, sectionText } from "../edit.mjs"

const FULL_SECTIONS = ["Destination", "Notes"]
const SKIPPED_SECTIONS = new Set([...FULL_SECTIONS, "Tickets"])
const HEADING_RE = /^##\s+(.+?)\s*$/
const LINK_RE = /\[\[[^\]]+\]\]/g

const linksTicket = (line, t) => {
  const home = { repo: t.repo, effort: t.effort }
  return (line.match(LINK_RE) ?? []).some((link) => {
    const id = parseRef(link, { home })
    return id?.nn != null && formatRef(id) === t.ref && id.slug === t.slug
  })
}

// `{ section, line }` for each map line outside the full and skipped sections that links `t`.
const mentionsOf = (body, t) => {
  let section = null
  const found = []
  for (const line of linesOf(body).map(contentOf)) {
    const heading = HEADING_RE.exec(line)
    if (heading) section = heading[1]
    else if (!SKIPPED_SECTIONS.has(section) && linksTicket(line, t)) found.push({ section, line })
  }
  return found
}

const trimmed = (text) => (text == null ? null : text.trim())

const mapPart = (ctx, t) => {
  const m = ctx.index.maps.get(t.effortKey)
  const text = m && ctx.textOf(m.path)
  if (!text) return null
  const { body } = parseNote(text)
  return {
    key: m.key,
    path: m.path,
    status: m.status,
    destination: trimmed(sectionText(body, "Destination")),
    notes: trimmed(sectionText(body, "Notes")),
    mentions: mentionsOf(body, t),
  }
}

const textOf = (data, ticketText, vault) => {
  const out = [`# ${data.ref} — ${join(vault, data.path)}`, "", ticketText.trimEnd()]
  const m = data.map
  if (!m) return [...out, "", `(no map for ${data.ref})`].join("\n")
  out.push("", `# map ${m.key} (${m.status ?? "no status"}) — ${join(vault, m.path)}`)
  for (const [heading, text] of [["Destination", m.destination], ["Notes", m.notes]])
    out.push("", `## ${heading}`, "", text || "(empty)")
  const bySection = new Map()
  for (const x of m.mentions) {
    const section = x.section ?? "(before any section)"
    bySection.set(section, [...(bySection.get(section) ?? []), x])
  }
  for (const [section, lines] of bySection) out.push("", `## ${section} — lines that link ${data.ref}`, "", ...lines.map((x) => x.line))
  return out.join("\n")
}

export default {
  name: "show",
  summary: "a ticket, plus its map's Destination, Notes and the lines that link it",
  usage: "wf show <ref> [--json]",
  flags: {},
  minPositionals: 1,
  maxPositionals: 1,
  run(ctx, { positionals }) {
    const t = ticketArg(positionals[0], ctx)
    const ticketText = ctx.textOf(t.path) ?? ""
    const { frontmatter, body } = parseNote(ticketText)
    const data = { ref: t.ref, path: t.path, frontmatter, body, map: mapPart(ctx, t) }
    return { data, text: textOf(data, ticketText, ctx.vault) }
  },
}
