// `wf new <repo/effort> --type T --title "…" [--question "…" | stdin] [--blocker ref]… [--target-repo R]`
// — — → open (spec *Verbs*: ticket transitions). NN is the effort's highest + 1, taken under the lock
// and written with an exclusive create, so two sessions never get the same number. The note gets the
// `## Question` / `## Answer` skeleton; the placeholder follows `language:` (Q36).
import { readFileSync } from "node:fs"
import { isatty } from "node:tty"
import { formatRef, noteText, parseRef, TICKET_TYPES } from "../core.mjs"
import { usageError } from "../errors.mjs"
import { editFrontmatter } from "../edit.mjs"
import { report } from "../pipeline.mjs"
import { vaultRelative } from "../store.mjs"
import { blockerArg, blockerLink, noMap } from "./ticket.mjs"

const SLUG_MAX = 60
const STDIN = 0

// A file-name slug from the title: letters, marks and digits of any script, joined by `-`.
// A long slug is cut to SLUG_MAX characters (code points), at a word boundary when it has one.
const slugOf = (title) => {
  const words = title.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "")
  const chars = [...words]
  if (chars.length <= SLUG_MAX) return words || "ticket"
  const cut = chars.slice(0, SLUG_MAX).join("")
  const atBoundary = chars[SLUG_MAX] === "-" ? cut : cut.replace(/-[^-]*$/, "")
  return atBoundary.replace(/-+$/, "") || cut
}

const oneLine = (name, value) => {
  const text = value?.trim()
  if (!text) throw usageError(`new needs --${name} "…"`)
  if (/[\r\n]/.test(text)) throw usageError(`--${name} must be one line`)
  return text
}

const NO_QUESTION = 'new needs the question: --question "…" or on stdin'

// Whatever is piped to stdin, read to its end (never a terminal — it would wait for typing). `isatty`
// leaves fd 0 blocking; touching `process.stdin` would make a slow pipe fail with EAGAIN.
const stdinText = () => {
  if (isatty(STDIN)) return ""
  try {
    return readFileSync(STDIN, "utf8")
  } catch (e) {
    throw usageError(`cannot read the question from stdin: ${e.message} — pass --question "…"`)
  }
}

// The question: `--question`, else stdin; line endings as the skeleton's.
const questionOf = (question) => {
  const text = (question ?? stdinText()).replace(/\r\n?/g, "\n").trim()
  if (!text) throw usageError(NO_QUESTION)
  return text
}

const typeOf = (type) => {
  if (!TICKET_TYPES.includes(type)) throw usageError(`--type must be one of ${TICKET_TYPES.join(", ")}, got ${JSON.stringify(type ?? "")}`)
  return type
}

// The effort a new ticket goes in: it must have a map.
const effortOf = (input, ctx) => {
  const id = parseRef(vaultRelative(input, ctx.roots))
  if (!id || id.nn != null) throw usageError(`cannot read ${JSON.stringify(input)} as an effort — use repo/effort`)
  const key = formatRef(id)
  if (!ctx.index.maps.has(key)) throw noMap(key, "a ticket goes in an effort that has one")
  return { repo: id.repo, effort: id.effort, key }
}

// The next NN in the effort, counting every ticket file, duplicates included.
const nextNn = (index, key) => {
  const tickets = (index.efforts.get(key)?.tickets ?? []).map((t) => t.nn)
  const duplicates = index.duplicates.filter((d) => d.ref.startsWith(`${key}#`)).map((d) => Number(d.ref.split("#").pop()))
  return Math.max(0, ...tickets, ...duplicates) + 1
}

const skeleton = (fields, question, language) =>
  editFrontmatter("---\n---\n", Object.entries(fields)) +
  ["", "## Question", "", question, "", "## Answer", "", noteText("answerPlaceholder", language), ""].join("\n")

export default {
  name: "new",
  summary: "— → open: a new ticket with the next NN",
  usage: 'wf new <repo/effort> --type T --title "…" [--question "…" | stdin] [--blocker ref]… [--target-repo R] [--json]',
  flags: { type: "string", title: "string", question: "string", blocker: "strings", "target-repo": "string" },
  minPositionals: 1,
  maxPositionals: 1,
  writes: () => true,
  prepare({ flags, positionals }) {
    const targetRepo = flags["target-repo"] === undefined ? null : oneLine("target-repo", flags["target-repo"])
    const title = oneLine("title", flags.title)
    return { flags: { ...flags, type: typeOf(flags.type), title, targetRepo, question: questionOf(flags.question) }, positionals }
  },
  plan(ctx, { flags, positionals }) {
    const home = effortOf(positionals[0], ctx)
    const blockers = (flags.blocker ?? []).map((input) => blockerArg(input, ctx, home))
    const ref = formatRef({ ...home, nn: nextNn(ctx.index, home.key) })
    const path = `${home.key}/issues/${ref.split("#").pop()}-${slugOf(flags.title)}.md`
    // A new ticket has no inlinks yet, so its blockers can't close a cycle.
    const links = [...new Set(blockers.map((b) => blockerLink(home.key, b)))]
    const fields = { type: flags.type, status: "open", status_since: ctx.today, title: flags.title, blockers: links }
    const written = flags.targetRepo ? { ...fields, target_repo: flags.targetRepo } : fields
    const text = skeleton(written, flags.question, ctx.config.language)
    return { ref, edits: [{ path, text, create: true }], data: { ref, path, ...fields, target_repo: flags.targetRepo } }
  },
  report: (outcome) => report(outcome, `created ${outcome.ref} at ${outcome.data.path}`),
}
