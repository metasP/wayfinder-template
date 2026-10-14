// `wf migrate [--plan | --yes]` — take the vault to schema 2 (spec *`wf migrate` (Q28, Q29)*, Q20). By
// default (or with `--plan`) it prints a unified diff of every change and writes nothing; `--yes` applies
// the same edits under the lock as one commit, `wf(migrate): vault schema 2`. It reads and writes vaults
// older than the supported schema — it is how they get there. A second run plans nothing.
import { SCHEMA_VERSION } from "../core.mjs"
import { unifiedDiff } from "../diff.mjs"
import { usageError } from "../errors.mjs"
import { planMigration } from "../migrate.mjs"
import { report } from "../pipeline.mjs"
import { CONFIG_NOTE, isTrackerNote, MANIFEST, PICKS_NOTE } from "../store.mjs"

const REF = `vault schema ${SCHEMA_VERSION}`
const NOTHING = `nothing to migrate — the vault is at ${REF}`

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

const editsOf = (ctx) =>
  planMigration({
    notes: ctx.notes.filter(({ path }) => isTrackerNote(path)).map(({ path }) => ({ path, text: ctx.textOf(path) })),
    picks: ctx.textOf(PICKS_NOTE),
    config: ctx.textOf(CONFIG_NOTE),
    manifest: ctx.textOf(MANIFEST),
  })

export default {
  name: "migrate",
  summary: `take the vault to ${REF}: prints the diff; --yes applies it as one commit`,
  usage: "wf migrate [--plan | --yes] [--json]",
  flags: { plan: "boolean", yes: "boolean" },
  maxPositionals: 0,
  readsOlderSchema: true,
  writesOlderSchema: true,
  writes: ({ flags }) => flags.yes === true,
  prepare(args) {
    if (args.flags.plan) throw usageError("--plan and --yes don't go together — --plan prints the diff, --yes applies it")
    return args
  },
  run(ctx) {
    const changes = editsOf(ctx).map((e) => ({ path: e.path, diff: unifiedDiff(e.path, ctx.textOf(e.path), e.text) }))
    const diff = changes.map((c) => c.diff).join("")
    const files = changes.map((c) => c.path)
    const text = files.length ? `${diff}wf: ${plural(files.length, "file")} to change — apply with: wf migrate --yes` : NOTHING
    return { data: { files, diff }, text }
  },
  plan(ctx) {
    const edits = editsOf(ctx)
    return { ref: REF, edits, data: { planned: edits.map((e) => e.path) } }
  },
  report(outcome) {
    const done = report(outcome, `migrated ${plural(outcome.files.length, "file")} to ${REF}`)
    return outcome.commit ? done : { ...done, text: NOTHING }
  },
}
