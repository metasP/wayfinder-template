// Argument parsing for `wf` verbs, and reading the refs they take (spec *Verbs*: `repo/effort#NN`,
// `repo/effort NN`, `repo/effort/NN`, a vault path or a wikilink; output always uses `repo/effort#NN`).
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

/** A flag that must be one non-empty line of text, trimmed; `verb` names the verb in the error. */
export function oneLineFlag(verb, name, value) {
  const text = value?.trim()
  if (!text) throw usageError(`${verb} needs --${name} "…"`)
  if (/[\r\n]/.test(text)) throw usageError(`--${name} must be one line`)
  return text
}

/**
 * The `repo/effort` an argument names — `repo/effort`, a vault path or a full-path wikilink — whether
 * or not the effort exists yet. A ticket ref is not an effort.
 */
export function effortRefArg(input, { roots }) {
  const id = parseRef(vaultRelative(input, roots))
  if (!id || id.nn != null) throw usageError(`cannot read ${JSON.stringify(input)} as an effort — use repo/effort`)
  return formatRef(id)
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

// Every form a ticket `<ref>` takes on the command line — `wf help` and a bad ref both list them.
export const REF_FORMS = Object.freeze(["repo/effort#NN", "repo/effort NN", "repo/effort/NN", "a vault path"])
const SPLIT_NN_RE = /^\d+$/

/**
 * Join a ref a shell split in two — `repo/effort` then `NN` — into one `repo/effort#NN` positional.
 * Only a bare `repo/effort` (no `#NN`, not a path) followed by digits alone is joined.
 */
export function joinSplitRefs(positionals) {
  return positionals.reduce((out, arg) => {
    const prev = out.at(-1)
    const id = prev === undefined ? null : parseRef(prev)
    const joins = SPLIT_NN_RE.test(arg) && id != null && id.nn == null && formatRef(id) === prev.trim()
    return joins ? [...out.slice(0, -1), `${prev.trim()}#${arg}`] : [...out, arg]
  }, [])
}

// The usage error for an argument that isn't a ticket ref: the forms that work, and an example built
// from what was typed (its effort, or its digits) so the fix is one edit away.
const badTicketRef = (input, verb, { home } = {}) => {
  const id = parseRef(input)
  const effort = id && id.nn == null ? formatRef(id) : null
  const forms = [...REF_FORMS, ...(home ? ["[[NN-slug]]"] : [])].join(" · ")
  const nn = (String(input).match(/\d+/)?.[0] ?? "01").padStart(2, "0")
  const example = `wf ${verb ?? "show"} ${effort ?? "my-repo/my-effort"}#${effort ? "01" : nn}`
  const lead = effort ? `name the ticket: ${effort}#NN (or ${effort} NN)` : `use ${forms}`
  return usageError(`cannot read ${JSON.stringify(input)} as a ticket ref — ${lead}; e.g. ${example}`)
}

/**
 * The ticket ref an argument names — any of `REF_FORMS`, a full-path wikilink, or a bare
 * `[[NN-slug]]` when `home` (`{ repo, effort }`) gives it an effort. The ticket may not exist.
 */
export function ticketRefArg(input, { roots, verb }, { home } = {}) {
  const id = parseRef(vaultRelative(input, roots), { home })
  if (!id || id.nn == null) throw badTicketRef(input, verb, { home })
  return formatRef(id)
}

/** The ticket an argument names (see `ticketRefArg`). It must be in `index`. */
export function ticketArg(input, ctx, opts) {
  const ref = ticketRefArg(input, ctx, opts)
  const t = ctx.index.tickets.get(ref)
  if (!t) throw usageError(`no ticket ${ref} in the vault`)
  return t
}
