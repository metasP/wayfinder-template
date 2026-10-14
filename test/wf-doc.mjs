// The doc tests' view of the `wf` CLI: the real verbs, and every `wf <verb> …` a markdown doc spells out
// in code — so a doc that names a verb, flag or argument count the CLI doesn't have turns a test red.
import assert from "node:assert/strict"
import { readdirSync } from "node:fs"
import { parseArgs } from "../template/_tools/lib/args.mjs"

const VERBS_DIR = new URL("../template/_tools/lib/verbs/", import.meta.url)

// Verb modules default-export `{ name, flags, … }`; the shared helpers in the same folder export none.
export const verbs = new Map(
  (await Promise.all(readdirSync(VERBS_DIR).map((f) => import(new URL(f, VERBS_DIR).href))))
    .map((m) => m.default)
    .filter((v) => v?.name)
    .map((v) => [v.name, v]),
)

/** Every `wf <verb> …` / `wf.mjs <verb> …` inside a code block or code span; prose is never scanned. */
export function wfCommands(markdown) {
  const code = [...markdown.matchAll(/```[\s\S]*?```|`[^`\n]+`/g)].map(([span]) => span)
  return code.flatMap((span) =>
    [...span.matchAll(/\bwf(?:\.mjs)? ([a-z][a-z-]*)([^`\n]*)/g)].map(([text, verb, rest]) => ({
      text,
      verb,
      // A "quoted value" standing alone is one argument, as a shell reads it (`--flag="a b"` is not handled).
      argv: rest.match(/"[^"]*"|\S+/g) ?? [],
    })),
  )
}

/** Each command names a real verb, and its arguments parse against that verb's flags and arity. */
export function assertCommandsParse(commands) {
  assert.ok(commands.length > 0, "found no wf commands in the doc's code")
  for (const { text, verb, argv } of commands) {
    const v = verbs.get(verb)
    assert.ok(v, `${JSON.stringify(text)}: wf has no verb ${verb}`)
    if (!argv.length) continue // a bare `wf <verb>` names the verb; it isn't a command line
    const { positionals } = parseArgs(argv, v.flags)
    assert.ok(positionals.length >= (v.minPositionals ?? 0), `${JSON.stringify(text)}: missing argument`)
    assert.ok(positionals.length <= v.maxPositionals, `${JSON.stringify(text)}: too many arguments`)
  }
}
