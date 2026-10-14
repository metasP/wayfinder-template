// Argument parsing for `wf` verbs, and reading the refs they take (spec *Verbs*: `repo/effort#NN`, a
// vault path or a wikilink; output always uses `repo/effort#NN`).
import { formatRef, parseRef } from "./core.mjs"
import { usageError } from "./errors.mjs"
import { vaultRelative } from "./store.mjs"

// Flags every verb takes.
export const GLOBAL_FLAGS = Object.freeze({ json: "boolean", help: "boolean" })

/**
 * Split argv into `{ flags, positionals }` against `spec` (`{ name: "boolean" | "string" | "strings" }`;
 * a `strings` flag may repeat and collects a list). `--name value` and `--name=value` both work; `--`
 * ends the flags. Unknown flags are usage errors.
 */
export function parseArgs(argv, spec) {
  const known = { ...GLOBAL_FLAGS, ...spec }
  const flags = {}
  const positionals = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (arg === "-h") {
      flags.help = true
      continue
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg)
      continue
    }
    const eq = arg.indexOf("=")
    const name = arg.slice(2, eq === -1 ? undefined : eq)
    if (!Object.prototype.hasOwnProperty.call(known, name)) throw usageError(`unknown flag --${name}`)
    if (known[name] === "boolean") {
      if (eq !== -1) throw usageError(`--${name} takes no value`)
      flags[name] = true
      continue
    }
    const value = eq === -1 ? argv[++i] : arg.slice(eq + 1)
    if (value === undefined || value === "" || (eq === -1 && value.startsWith("--")))
      throw usageError(`--${name} needs a value`)
    flags[name] = known[name] === "strings" ? [...(flags[name] ?? []), value] : value
  }
  return { flags, positionals }
}

/**
 * The `repo/effort` an argument names — `repo/effort`, `repo/effort#NN`, a vault path (relative, or
 * absolute under one of `roots`) or a full-path wikilink. The effort, and the ticket when one is
 * named, must be in `index`.
 */
export function effortArg(input, { roots, index }) {
  const id = parseRef(vaultRelative(input, roots))
  if (!id) throw usageError(`cannot read ${JSON.stringify(input)} as a ref — use repo/effort#NN, a vault path or a wikilink`)
  const key = formatRef({ repo: id.repo, effort: id.effort })
  if (!index.efforts.has(key)) throw usageError(`no effort ${key} in the vault`)
  if (id.nn != null && !index.tickets.has(formatRef(id))) throw usageError(`no ticket ${formatRef(id)} in the vault`)
  return key
}

/**
 * The ticket ref an argument names — `repo/effort#NN`, a vault path, a full-path wikilink, or a bare
 * `[[NN-slug]]` when `home` (`{ repo, effort }`) gives it an effort. The ticket may not exist.
 */
export function ticketRefArg(input, { roots }, { home } = {}) {
  const id = parseRef(vaultRelative(input, roots), { home })
  if (!id || id.nn == null) {
    const forms = home ? "repo/effort#NN, a vault path or a wikilink" : "repo/effort#NN, a vault path or a full-path wikilink"
    throw usageError(`cannot read ${JSON.stringify(input)} as a ticket ref — use ${forms}`)
  }
  return formatRef(id)
}

/** The ticket an argument names (see `ticketRefArg`). It must be in `index`. */
export function ticketArg(input, ctx, opts) {
  const ref = ticketRefArg(input, ctx, opts)
  const t = ctx.index.tickets.get(ref)
  if (!t) throw usageError(`no ticket ${ref} in the vault`)
  return t
}
