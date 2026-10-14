// Argument parsing for `wf` verbs, and reading the refs they take (spec *Verbs*: `repo/effort#NN`, a
// vault path or a wikilink; output always uses `repo/effort#NN`).
import { formatRef, parseRef } from "./core.mjs"
import { usageError } from "./errors.mjs"
import { vaultRelative } from "./store.mjs"

// Flags every verb takes.
export const GLOBAL_FLAGS = Object.freeze({ json: "boolean", help: "boolean" })

/**
 * Split argv into `{ flags, positionals }` against `spec` (`{ name: "boolean" | "string" }`).
 * `--name value` and `--name=value` both work; `--` ends the flags. Unknown flags are usage errors.
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
    flags[name] = value
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
 * The ticket an argument names — `repo/effort#NN`, a vault path, or a full-path wikilink (a bare
 * `[[NN-slug]]` has no effort to resolve in). It must be in `index`.
 */
export function ticketArg(input, { roots, index }) {
  const id = parseRef(vaultRelative(input, roots))
  if (!id || id.nn == null)
    throw usageError(`cannot read ${JSON.stringify(input)} as a ticket ref — use repo/effort#NN, a vault path or a full-path wikilink`)
  const ref = formatRef(id)
  const t = index.tickets.get(ref)
  if (!t) throw usageError(`no ticket ${ref} in the vault`)
  return t
}
