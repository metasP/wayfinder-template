// `wf lint [repo/effort…]` — the core's findings for the whole vault or the named efforts (spec
// *Verbs*, *Lint rules*). It reads vaults older than the supported schema, so their legacy-field
// findings stay visible. Error findings exit 1. `--fix` arrives with the write pipeline.
import { formatRef, lint, parseRef } from "../core.mjs"
import { effortArg } from "../args.mjs"
import { EXIT } from "../errors.mjs"

// The effort a finding belongs to; `Wayfinder Picks` findings belong to none.
const effortOf = (ref) => {
  const id = parseRef(ref)
  return id ? formatRef({ repo: id.repo, effort: id.effort }) : null
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

const textOf = (findings, errors, warnings) => {
  if (!findings.length) return "lint clean"
  const width = (key) => Math.max(...findings.map((f) => f[key].length))
  const [sev, rule, ref] = [width("severity"), width("rule"), width("ref")]
  const lines = findings.flatMap((f) => [
    `${f.severity.padEnd(sev)}  ${f.rule.padEnd(rule)}  ${f.ref.padEnd(ref)}  ${f.message}`,
    ...(f.fix ? [`${" ".repeat(sev)}  fix: ${f.fix}`] : []),
  ])
  return [...lines, `${plural(errors, "error")}, ${plural(warnings, "warning")}`].join("\n")
}

export default {
  name: "lint",
  summary: "lint findings for the vault or the named efforts",
  usage: "wf lint [repo/effort…] [--json]",
  flags: {},
  maxPositionals: Infinity,
  readsOlderSchema: true,
  run({ roots, index, config, sort, today }, { positionals }) {
    const named = new Set(positionals.map((p) => effortArg(p, { roots, index })))
    const all = lint(index, { today, config, sort })
    const findings = named.size ? all.filter((f) => named.has(effortOf(f.ref))) : all
    const errors = findings.filter((f) => f.severity === "error").length
    const warnings = findings.length - errors
    return {
      data: { findings, errors, warnings },
      text: textOf(findings, errors, warnings),
      exitCode: errors ? EXIT.INVARIANT : EXIT.OK,
      message: errors ? `lint found ${plural(errors, "error")}` : "",
    }
  },
}
