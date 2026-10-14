#!/usr/bin/env node
// Autocommit — a Claude Code PostToolUse hook on Write|Edit (spec docs/specs/ticket-store.md, *New
// autocommit (Q7)*): commits the edited prose file in the vault repository that holds it.
//   node <vault>/_tools/autocommit.mjs   ← hook JSON on stdin (wired through `_tools/autocommit.sh`)
// The vault is the directory above this script's `_tools/`. Success prints nothing; a failure still
// exits 0 (it never blocks) and prints hook JSON whose `additionalContext` says what failed and how
// to fix it, after appending a line to the failure log in the vault's git dir.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const LIB = "./lib/autocommit.mjs"
const vault = fileURLToPath(new URL("..", import.meta.url))

const say = (context) =>
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context } })}\n`)

// Loaded here, not imported: a missing or partial lib/ (an interrupted update) or a Node too old for it
// would otherwise die at import time on stderr, which the wiring discards — the silent failure this
// hook exists to end.
let autocommit
try {
  ;({ autocommit } = await import(LIB))
} catch (e) {
  say(`wayfinder autocommit: this edit was not committed: cannot load ${fileURLToPath(new URL(LIB, import.meta.url))} (${e.message}). Re-run the wayfinder-template bootstrap for this vault (Node 18+), then commit the file by hand.`)
  process.exit(0)
}

// Unreadable stdin reaches `autocommit` as empty input, which it reports as unreadable hook input.
let stdin = ""
try {
  stdin = readFileSync(0, "utf8")
} catch {}
const { context } = autocommit(stdin, { vault })
if (context) say(context)
