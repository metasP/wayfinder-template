// The doc tests' view of the `wf` CLI: the verbs `wf help` lists, and every `wf <verb>` a markdown doc
// spells out — so a doc that names a verb, flag or argument count the CLI doesn't have turns a test red,
// and prose (Thai or English) never does. COMMAND_RULE is the rule; every failure message repeats it.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseArgs } from "../template/_tools/lib/args.mjs"

const TOOLS = new URL("../template/_tools/", import.meta.url)
const VERBS_DIR = new URL("lib/verbs/", TOOLS)

export const COMMAND_RULE = [
  "How the doc tests read `wf` in markdown:",
  "  · a command line is only inside a ``` fence: `node <path>/wf.mjs <verb> …` anywhere on a line, or `wf <verb> …` at the start of a line (after indentation or `$ `);",
  "    it runs to the end of the line, or to two spaces or ` # ` — put a note after those;",
  '  · "…", <…> and ‹…› are one argument each, spaces and all;',
  "  · anything else (prose, a `wf <verb> …` in backticks) is a mention: only the verb name is checked.",
  "If the line is prose, don't start it with wf <verb>; if it is a command, give it the arguments and flags `wf help` shows.",
].join("\n")

// The verbs are what `wf help` lists (wf.mjs's VERBS), not whatever sits in lib/verbs/: a verb module
// nobody registered isn't a verb. Each name's module gives its flags and arity.
const helpUsages = JSON.parse(
  execFileSync(process.execPath, [fileURLToPath(new URL("wf.mjs", TOOLS)), "help", "--json"], { encoding: "utf8" }),
).data.verbs
const modules = (await Promise.all(readdirSync(VERBS_DIR).map((f) => import(new URL(f, VERBS_DIR).href))))
  .map((m) => m.default)
  .filter((v) => v?.name)
export const verbs = new Map(
  helpUsages.map((usage) => {
    const name = usage.match(/^wf ([a-z-]+)/)[1]
    const module = modules.find((v) => v.name === name)
    assert.ok(module, `wf help lists ${name}, but no module in lib/verbs/ is that verb`)
    return [name, module]
  }),
)

const FENCE_RE = /^```[^\n]*\n([\s\S]*?)^```/gm
const SPAN_RE = /`[^`\n]+`/g
const VERB_IN = /\bwf(?:\.mjs)? ([a-z][a-z-]*)/g
// A command line's start: `node …/wf.mjs <verb>` anywhere, or `wf <verb>` opening the line.
const COMMAND_START = /(?:\bnode \S*?(?=wf\.mjs )|^\s*(?:\$ )?)(wf(?:\.mjs)? ([a-z][a-z-]*))/
const COMMAND_END = / {2,}| # /
const ARG_RE = /"[^"]*"|<[^>]*>\S*|‹[^›]*›\S*|\S+/g

const lineOf = (markdown, index) => markdown.slice(0, index).split("\n").length

/** The `wf <verb>` mentions in a line's backtick spans: the verb name only. */
const mentionsIn = (line, where) =>
  [...line.matchAll(SPAN_RE)].flatMap(([span]) =>
    [...span.matchAll(VERB_IN)].map(([text, verb]) => ({ text, verb, argv: [], where, isCommand: false })),
  )

/** The command line a fenced line holds, outside its backtick spans, or null. */
function commandIn(line, where) {
  const bare = line.replace(SPAN_RE, (span) => " ".repeat(span.length))
  const start = bare.match(COMMAND_START)
  if (!start) return null
  const rest = bare.slice(start.index + start[0].length).split(COMMAND_END)[0]
  return { text: `${start[1]}${rest}`.trimEnd(), verb: start[2], argv: rest.match(ARG_RE) ?? [], where, isCommand: true }
}

/**
 * A code span that is a command line by where it sits — a verb table's first cell — read like a fenced
 * line: `wf <verb> …` with `\|` unescaped. Null when the span doesn't open with `wf <verb>`.
 */
export function commandInSpan(span, where) {
  return commandIn(span.replace(/^`|`$/g, "").replace(/\\\|/g, "|"), where)
}

/**
 * Every `wf <verb>` a markdown doc spells out, as `{ text, verb, argv, where, isCommand }` (`where` is
 * `source:line`). Command lines (see COMMAND_RULE) carry their arguments; mentions carry none.
 */
export function wfCommands(markdown, source = "doc") {
  const fenced = [...markdown.matchAll(FENCE_RE)].flatMap((block) => {
    const first = lineOf(markdown, block.index) + 1
    return block[1].split("\n").flatMap((line, i) => {
      const where = `${source}:${first + i}`
      const command = commandIn(line, where)
      return [...(command ? [command] : []), ...mentionsIn(line, where)]
    })
  })
  const prose = markdown.replace(FENCE_RE, (block) => block.replace(/[^\n]/g, " "))
  const mentions = prose.split("\n").flatMap((line, i) => mentionsIn(line, `${source}:${i + 1}`))
  return [...fenced, ...mentions]
}

const plural = (n) => `${n} argument${n === 1 ? "" : "s"}`

/** Each command names a real verb, and each command line's arguments parse against its flags and arity. */
export function assertCommandsParse(commands) {
  assert.ok(commands.length > 0, `found no wf commands in the doc\n${COMMAND_RULE}`)
  for (const { text, verb, argv, where, isCommand } of commands) {
    const fail = (problem) => assert.fail(`${where}: ${JSON.stringify(text)}: ${problem}\n${COMMAND_RULE}`)
    if (verb === "help" && !argv.length) continue // `wf help` is the CLI's own listing, not a verb
    const v = verbs.get(verb)
    if (!v) fail(`wf has no verb ${verb} (wf help lists ${[...verbs.keys()].join(", ")})`)
    if (!isCommand) continue
    let positionals
    try {
      ;({ positionals } = parseArgs(argv, v.flags))
    } catch (error) {
      fail(`${error.message} — usage: ${v.usage}`)
    }
    const min = v.minPositionals ?? 0
    if (positionals.length < min) fail(`wf ${verb} needs at least ${plural(min)}, got ${positionals.length} — usage: ${v.usage}`)
    if (positionals.length > v.maxPositionals)
      fail(`wf ${verb} takes at most ${plural(v.maxPositionals)}, got ${positionals.length}: ${positionals.join(" ")} — usage: ${v.usage}`)
  }
}
