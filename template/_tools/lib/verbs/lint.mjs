// `wf lint [repo/effort…] [--fix]` — the core's findings for the whole vault or the named efforts
// (spec *Verbs*, *Lint rules*). It reads vaults older than the supported schema, so their legacy-field
// findings stay visible. Error findings exit 1. `--fix` regenerates drifted `## Tickets` blocks through
// the write pipeline and never changes state; it then reports the findings that remain.
import { lint, renderTicketsBlock } from "../core.mjs"
import { effortArg } from "../args.mjs"
import { withTicketsBlock } from "../edit.mjs"
import { EXIT } from "../errors.mjs"
import { effortKeyOf } from "../pipeline.mjs"

const DRIFT_RULE = "tickets-block-drift"

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

// The findings for the named efforts (all when none are named).
const findingsOf = (index, { today, config, sort }, named) => {
  const all = lint(index, { today, config, sort })
  return named.size ? all.filter((f) => named.has(effortKeyOf(f.ref))) : all
}

const result = (findings, extra = {}, prefix = "") => {
  const errors = findings.filter((f) => f.severity === "error").length
  const warnings = findings.length - errors
  return {
    data: { findings, errors, warnings, ...extra },
    text: prefix + textOf(findings, errors, warnings),
    exitCode: errors ? EXIT.INVARIANT : EXIT.OK,
    message: errors ? `lint found ${plural(errors, "error")}` : "",
  }
}

const namedEfforts = ({ roots, index }, positionals) => new Set(positionals.map((p) => effortArg(p, { roots, index })))

export default {
  name: "lint",
  summary: "lint findings for the vault or the named efforts; --fix regenerates derived blocks",
  usage: "wf lint [repo/effort…] [--fix] [--json]",
  flags: { fix: "boolean" },
  maxPositionals: Infinity,
  readsOlderSchema: true,
  writes: ({ flags }) => flags.fix === true,
  run(ctx, { positionals }) {
    return result(findingsOf(ctx.index, ctx, namedEfforts(ctx, positionals)))
  },
  plan(ctx, { positionals }) {
    const named = namedEfforts(ctx, positionals)
    const drifted = [...new Set(findingsOf(ctx.index, ctx, named).filter((f) => f.rule === DRIFT_RULE).map((f) => f.ref))]
    const edits = drifted.map((key) => {
      const m = ctx.index.maps.get(key)
      return { path: m.path, text: withTicketsBlock(ctx.textOf(m.path), renderTicketsBlock(ctx.index, key, ctx.config.language), m.path) }
    })
    return { ref: drifted.join(", "), edits, data: { named } }
  },
  report(outcome) {
    const fixed = outcome.files.map(effortKeyOf)
    const prefix = fixed.length ? `fixed the ## Tickets block of ${fixed.join(", ")} (commit ${outcome.commit.slice(0, 7)})\n` : ""
    return result(findingsOf(outcome.index, outcome, outcome.data.named), { fixed, commit: outcome.commit }, prefix)
  },
}
