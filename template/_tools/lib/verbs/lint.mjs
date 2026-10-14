// `wf lint [repo/effort…] [--rule <rule>] [--fix]` — the core's findings for the whole vault or the named
// efforts, or of one rule (spec *Verbs*, *Lint rules*). It reads vaults older than the supported schema, so
// their legacy-field findings stay visible. Error findings exit 1. The text report folds a flood of one
// rule's warnings into one line and prints errors last; `--json` and `--rule` list every finding. `--fix` regenerates drifted `## Tickets` blocks through
// the write pipeline and never changes state; it then reports the findings that remain.
import { foldFindings, lint, renderTicketsBlock } from "../core.mjs"
import { effortArg } from "../args.mjs"
import { withTicketsBlock } from "../edit.mjs"
import { EXIT } from "../errors.mjs"
import { effortKeyOf } from "../pipeline.mjs"

const DRIFT_RULE = "tickets-block-drift"

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

// Warnings first, a flood of one rule's warnings as one line (all of them with --rule), errors last
// next to the count — so a terminal that keeps only the tail still shows every error.
const textOf = (findings, errors, warnings, rule) => {
  if (!findings.length) return "lint clean"
  const { warnings: shown, folded, errors: failed } = foldFindings(findings, rule ? { foldAt: Infinity } : {})
  const listed = [...shown, ...failed]
  const width = (key) => Math.max(0, ...listed.map((f) => f[key].length))
  const sev = Math.max(width("severity"), folded.length ? "warn".length : 0)
  const [ruleWidth, ref] = [Math.max(width("rule"), ...folded.map((g) => g.rule.length)), width("ref")]
  const lineOf = (f) => [
    `${f.severity.padEnd(sev)}  ${f.rule.padEnd(ruleWidth)}  ${f.ref.padEnd(ref)}  ${f.message}`,
    ...(f.fix ? [`${" ".repeat(sev)}  fix: ${f.fix}`] : []),
  ]
  const foldedLine = (g) =>
    `${"warn".padEnd(sev)}  ${g.rule.padEnd(ruleWidth)}  ${plural(g.count, "warning")} in ${plural(g.efforts, "effort")} — all of them: wf lint --rule ${g.rule}`
  const lines = [...shown.flatMap(lineOf), ...folded.map(foldedLine), ...failed.flatMap(lineOf)]
  return [...lines, `${plural(errors, "error")}, ${plural(warnings, "warning")}`].join("\n")
}

// The findings for the named efforts (all when none are named), of one rule with --rule.
const findingsOf = (index, { today, config, sort }, named, rule) => {
  const all = lint(index, { today, config, sort })
  return all.filter((f) => (!named.size || named.has(effortKeyOf(f.ref))) && (!rule || f.rule === rule))
}

const result = (findings, { rule, ...extra } = {}, prefix = "") => {
  const errors = findings.filter((f) => f.severity === "error").length
  const warnings = findings.length - errors
  return {
    data: { findings, errors, warnings, ...extra },
    text: prefix + textOf(findings, errors, warnings, rule),
    exitCode: errors ? EXIT.INVARIANT : EXIT.OK,
    message: errors ? `lint found ${plural(errors, "error")}` : "",
  }
}

const namedEfforts = ({ roots, index }, positionals) => new Set(positionals.map((p) => effortArg(p, { roots, index })))

export default {
  name: "lint",
  summary: "lint findings for the vault or the named efforts; --fix regenerates derived blocks",
  usage: "wf lint [repo/effort…] [--rule <rule>] [--fix] [--json]",
  flags: { fix: "boolean", rule: "string" },
  maxPositionals: Infinity,
  readsOlderSchema: true,
  writes: ({ flags }) => flags.fix === true,
  run(ctx, { positionals, flags }) {
    return result(findingsOf(ctx.index, ctx, namedEfforts(ctx, positionals), flags.rule), { rule: flags.rule })
  },
  plan(ctx, { positionals, flags }) {
    const named = namedEfforts(ctx, positionals)
    const drifted = [...new Set(findingsOf(ctx.index, ctx, named).filter((f) => f.rule === DRIFT_RULE).map((f) => f.ref))]
    const edits = drifted.map((key) => {
      const m = ctx.index.maps.get(key)
      return { path: m.path, text: withTicketsBlock(ctx.textOf(m.path), renderTicketsBlock(ctx.index, key, ctx.config.language), m.path) }
    })
    return { ref: drifted.join(", "), edits, data: { named, rule: flags.rule } }
  },
  report(outcome) {
    const fixed = outcome.files.map(effortKeyOf)
    const prefix = fixed.length ? `fixed the ## Tickets block of ${fixed.join(", ")} (commit ${outcome.commit.slice(0, 7)})\n` : ""
    const { named, rule } = outcome.data
    return result(findingsOf(outcome.index, outcome, named, rule), { rule, fixed, commit: outcome.commit }, prefix)
  },
}
