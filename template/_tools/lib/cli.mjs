// The `wf` CLI (spec *Modules* §3): parse arguments, dispatch the verb, format text or `--json`, map
// errors to exit codes. A verb is `{ name, summary, usage, flags, maxPositionals, readsOlderSchema?,
// run(ctx, args) → { data, text, exitCode?, message? } }`. A write verb adds `writes(args)` and
// `plan` / `report` (see pipeline.mjs) and runs through the write pipeline instead of the eager read.
// `--json` prints `{ ok, data, error }`: `ok` is true exactly when wf exits 0. A verb that ran but
// exits 1 (lint with error findings) keeps its `data` and says why in `error`.
import { buildIndex, isoDate } from "./core.mjs"
import { parseArgs } from "./args.mjs"
import { EXIT, WfError, usageError } from "./errors.mjs"
import { runWrite } from "./pipeline.mjs"
import { checkSchema, locateVault, readVault } from "./store.mjs"

const usageText = (verbs) =>
  [
    "usage: node <vault>/_tools/wf.mjs <verb> [args] [--json]",
    "",
    "verbs:",
    ...verbs.map((v) => `  ${v.usage.padEnd(52)}  ${v.summary}`),
    "",
    "exit codes: 0 ok · 1 invariant violated · 2 usage or environment error",
  ].join("\n")

const warningLines = (warnings = []) => warnings.map((w) => `wf: warning: ${w}`)

// The JSON envelope (`ok`, nullable `data` / `error`) and the text form of one result. Warnings
// (lint findings after a write, a broken stale lock) go to stderr in both forms.
const success = (json, { data, text, exitCode = EXIT.OK, message = "", warnings = [] }) => {
  const ok = exitCode === EXIT.OK
  const error = ok ? null : { code: exitCode, message, details: [] }
  const stderr = warningLines(warnings).join("\n")
  return { code: exitCode, stdout: json ? JSON.stringify({ ok, data, error }, null, 2) : text, stderr }
}

const failure = (json, error) => {
  const { code, message, details } = error
  const warned = warningLines(error.warnings)
  const text = [...warned, `wf: ${message}`, ...details.map((d) => `  ${d}`)].join("\n")
  return json
    ? { code, stdout: JSON.stringify({ ok: false, data: null, error: { code, message, details } }, null, 2), stderr: warned.join("\n") }
    : { code, stdout: "", stderr: text }
}

const runVerb = (verb, rest, { toolsDir }) => {
  const args = parseArgs(rest, verb.flags)
  if (args.flags.help) return { data: { usage: verb.usage }, text: `usage: ${verb.usage}\n  ${verb.summary}` }
  if (args.positionals.length > verb.maxPositionals)
    throw usageError(`unexpected argument ${JSON.stringify(args.positionals[verb.maxPositionals])} — usage: ${verb.usage}`)
  if (args.positionals.length < (verb.minPositionals ?? 0)) throw usageError(`missing argument — usage: ${verb.usage}`)
  if (verb.writes?.(args)) return runWrite(verb, args, { toolsDir })
  const { vault, checkout } = locateVault(toolsDir)
  checkSchema(vault, { allowOlder: verb.readsOlderSchema === true })
  const { notes, config, sort } = readVault(vault)
  // `roots`: where an absolute path in a ref may point — the main checkout, or the one wf runs from.
  const ctx = { vault, roots: [vault, checkout], index: buildIndex(notes), config, sort, today: isoDate(new Date()) }
  return verb.run(ctx, args)
}

/**
 * Run `wf` with `argv` (verb first). `toolsDir` is the `_tools/` directory wf runs from — the vault is
 * located from it. Returns `{ code, stdout, stderr }`; nothing is printed here.
 */
export function main(argv, { verbs, toolsDir }) {
  const end = argv.indexOf("--")
  const json = (end === -1 ? argv : argv.slice(0, end)).includes("--json")
  const [name, ...rest] = argv
  try {
    if (name === undefined) throw usageError("no verb given", { details: usageText(verbs).split("\n") })
    if (name === "help" || name === "--help" || name === "-h") return success(json, { data: { verbs: verbs.map((v) => v.usage) }, text: usageText(verbs) })
    const verb = verbs.find((v) => v.name === name)
    if (!verb) throw usageError(`unknown verb ${JSON.stringify(name)}`, { details: usageText(verbs).split("\n") })
    return success(json, runVerb(verb, rest, { toolsDir }))
  } catch (e) {
    if (e instanceof WfError) return failure(json, e)
    return failure(json, new WfError(EXIT.USAGE, `internal error: ${e.message}`, { details: String(e.stack).split("\n").slice(1) }))
  }
}
