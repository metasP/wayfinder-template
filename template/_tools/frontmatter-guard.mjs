#!/usr/bin/env node
// Frontmatter guard — a Claude Code PreToolUse hook on Write|Edit (spec docs/specs/ticket-store.md,
// *Frontmatter guard hook (Q15)*). Tracker state in a ticket's or map's frontmatter changes only
// through `wf` (Q3): a Write or Edit that would change it is denied, and the reason names the verb.
//   node <vault>/_tools/frontmatter-guard.mjs   ← hook JSON on stdin
// A denial prints the decision JSON; anything else prints nothing and exits 0 (no opinion — the
// normal permission flow continues). Bash is not inspected: `doctor` and `wf lint` catch that.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { guard } from "./lib/guard.mjs"

// `guard` never throws; only reading stdin can, and that fails open too.
let result
try {
  result = guard(readFileSync(0, "utf8"), { toolsDir: fileURLToPath(new URL(".", import.meta.url)) })
} catch (e) {
  result = { warning: `cannot read hook input (${e.message}) — allowing the tool call` }
}
if (result.warning) process.stderr.write(`frontmatter-guard: ${result.warning}\n`)
if (result.decision) process.stdout.write(`${JSON.stringify(result.decision)}\n`)
