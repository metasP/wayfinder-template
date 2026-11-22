// `wf repo-path <repo>` — the main checkout of a repo on this machine, read-only, so a chip prompt can name it
// and a session never guesses (nova-dance-retro-fixes-followup#04: a chip guessed a path that didn't exist and
// spent four calls finding the real one). One place answers it, in this order:
//   1. *Wayfinder Config* `repo_paths:` — a list of `<repo>=<absolute path>` strings, written by the owner;
//   2. else the main checkout most of the repo's claims ran in (the claim commit's `Cwd:`), counting a ticket
//      for its `target_repo` when set, else its home repo, and skipping claims run in the vault itself.
// A configured path that doesn't exist, or a malformed entry, is refused — never passed over for a guess.
import { existsSync, realpathSync } from "node:fs"
import { isAbsolute } from "node:path"
import { invariantError, usageError } from "../errors.mjs"
import { existingDirOf, latestClaims, mainCheckoutOf } from "../unmerged.mjs"

const USAGE = "wf repo-path <repo> [--json]"
const CONFIG_KEY = "repo_paths"
const ENTRY_RE = /^\s*([^=\s][^=]*?)\s*=\s*(.+?)\s*$/

const realOf = (path) => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

const addHint = (repo) => `add "${repo}=<absolute path of its main checkout>" to ${CONFIG_KEY}: in Wayfinder Config`

// `<repo>=<path>` → `{ repo, path }`; anything else is refused with the entry named.
const parseEntry = (entry) => {
  const m = typeof entry === "string" ? entry.match(ENTRY_RE) : null
  if (!m || !isAbsolute(m[2]))
    throw invariantError(`Wayfinder Config ${CONFIG_KEY}: entry ${JSON.stringify(entry)} is not <repo>=<absolute path>`, {
      fix: `write it as "<repo>=/absolute/path" in Wayfinder Config`,
    })
  return { repo: m[1], path: m[2] }
}

/** The configured path of `repo`, or null when Config has no entry for it. */
export function configuredPath(config, repo) {
  const raw = config?.[CONFIG_KEY]
  const entries = (Array.isArray(raw) ? raw : raw == null ? [] : [raw]).map(parseEntry)
  const hit = entries.find((e) => e.repo === repo)
  if (!hit) return null
  if (!existsSync(hit.path))
    throw invariantError(`Wayfinder Config ${CONFIG_KEY}: ${hit.repo}=${hit.path} — no such directory`, {
      fix: `correct the path of ${hit.repo} in ${CONFIG_KEY}: in Wayfinder Config`,
    })
  return mainCheckoutOf(hit.path)?.path ?? hit.path
}

/** The main checkout most of `repo`'s claims ran in, outside the vault; null when none did. */
export function claimedPath(vault, index, repo) {
  const vaultPath = realOf(vault)
  const counts = new Map()
  for (const [ref, claim] of latestClaims(vault)) {
    const t = index.tickets.get(ref)
    if (!t || (t.targetRepo ?? t.repo) !== repo || !claim.cwd) continue
    const dir = existingDirOf(claim.cwd)
    const main = dir && mainCheckoutOf(dir)?.path
    if (!main || realOf(main) === vaultPath) continue
    counts.set(main, (counts.get(main) ?? 0) + 1)
  }
  const [best] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return best?.[0] ?? null
}

export default {
  name: "repo-path",
  summary: "the main checkout of a repo on this machine (Wayfinder Config repo_paths, else its claims)",
  usage: USAGE,
  flags: {},
  minPositionals: 1,
  maxPositionals: 1,
  run(ctx, { positionals }) {
    const repo = positionals[0].trim()
    if (!repo || repo.includes("/")) throw usageError(`${JSON.stringify(positionals[0])} is not a repo name — usage: ${USAGE}`)
    const fromConfig = configuredPath(ctx.config, repo)
    const path = fromConfig ?? claimedPath(ctx.vault, ctx.index, repo)
    if (!path)
      throw invariantError(`no path known for repo ${repo}: Wayfinder Config has no ${CONFIG_KEY} entry and no claim ran in it`, {
        fix: addHint(repo),
      })
    const remote = mainCheckoutOf(path)?.remote ?? false
    const data = { repo, path, source: fromConfig ? "config" : "claims", remote }
    return { data, text: path }
  },
}
