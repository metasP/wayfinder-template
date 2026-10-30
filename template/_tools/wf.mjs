#!/usr/bin/env node
// wf — the ticket store's CLI (spec docs/specs/ticket-store.md). Run it by absolute path:
//   node <vault>/_tools/wf.mjs <verb> [args] [--json]
// The vault is the directory above this script's `_tools/`; wf always reads its main checkout.
import { fileURLToPath } from "node:url"
import { main } from "./lib/cli.mjs"
import block from "./lib/verbs/block.mjs"
import bumpRuns from "./lib/verbs/bump-runs.mjs"
import chart from "./lib/verbs/chart.mjs"
import claim from "./lib/verbs/claim.mjs"
import frontier from "./lib/verbs/frontier.mjs"
import lint from "./lib/verbs/lint.mjs"
import mapStatus from "./lib/verbs/map-status.mjs"
import migrate from "./lib/verbs/migrate.mjs"
import release from "./lib/verbs/release.mjs"
import resolve from "./lib/verbs/resolve.mjs"
import serial from "./lib/verbs/serial.mjs"
import show from "./lib/verbs/show.mjs"
import stats from "./lib/verbs/stats.mjs"
import newTicket from "./lib/verbs/new.mjs"
import wait from "./lib/verbs/wait.mjs"

const VERBS = [frontier, show, lint, chart, mapStatus, newTicket, claim, release, wait, resolve, block, bumpRuns, serial, migrate, stats]

const { code, stdout, stderr } = main(process.argv.slice(2), {
  verbs: VERBS,
  toolsDir: fileURLToPath(new URL(".", import.meta.url)),
})
if (stdout) process.stdout.write(`${stdout}\n`)
if (stderr) process.stderr.write(`${stderr}\n`)
process.exitCode = code
