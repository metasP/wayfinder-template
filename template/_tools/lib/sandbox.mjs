// The vault and Claude Code's Bash sandbox (spec docs/specs/ticket-store.md, Q2 and *Sandbox grant*).
// `sandbox` in ~/.claude/settings.json is the owner's to edit, not bootstrap's: bootstrap prints the
// grant, and doctor checks it.
//
// `wf` runs in sandboxed Bash and writes notes and `.git` (objects, refs, the index, its lock), so the
// owner grants the vault root. But hooks, the git a hook runs, Obsidian, and a Claude Code session
// started in the vault all run outside the sandbox, and they load code or config from inside the vault.
// A sandboxed command that could write there could plant code that runs unsandboxed at the next
// Write/Edit. So the grant comes with one deny for each such path. The sandbox's own protected paths
// cover `.git/hooks`, `.git/config` and `.claude` only in the session's working directory, and the
// vault usually isn't one.
import { isAbsolute, join, relative, resolve } from "node:path"

/** Vault-relative paths sandboxed Bash must not write, though the vault root is granted. */
export const SANDBOX_DENY = [
  "_tools", // the hook scripts Claude Code runs on every Write/Edit, and the libraries they import
  ".git/hooks", // run by the autocommit hook's `git commit`, and by the owner's
  ".git/config", // `core.hooksPath`, `core.fsmonitor`, filter drivers: run the same way
  ".git/modules", // a submodule's config, which a plain `git status` in the vault reads
  ".obsidian", // plugin code that Obsidian runs when it starts
  ".claude", // the settings and hooks of a Claude Code session started in the vault
  ".mcp.json", // that session's MCP servers
]

/** `path` spelled through `~/` when it is under `home`, the way INSTALL writes it. */
const tilde = (path, home) => (home && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path)

/** The `sandbox.filesystem` entries that let `wf` write the vault at `vault`, and nothing that runs. */
export const sandboxGrant = (vault, home = null) => ({
  allowWrite: [tilde(vault, home)],
  denyWrite: SANDBOX_DENY.map((p) => tilde(join(vault, p), home)),
})

/**
 * An entry of `sandbox.filesystem` in ~/.claude/settings.json as an absolute path: `~/` is under `home`,
 * `/` and `//` are absolute, and anything else is relative to `~/.claude`. Null for what can't be
 * resolved to one path: a non-string, a bare `~` (not a spelling Claude Code documents), or a wildcard.
 */
export function sandboxPath(entry, home) {
  if (typeof entry !== "string" || entry === "" || entry === "~" || /[*?[]/.test(entry)) return null
  if (entry.startsWith("~/")) return resolve(home, entry.slice(2))
  if (isAbsolute(entry)) return resolve(entry)
  return resolve(home, ".claude", entry)
}

/** Whether `dir` is `path` or one of its ancestors. */
const covers = (dir, path) => {
  const rel = relative(dir, path)
  return rel === "" || (rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel))
}

/**
 * How the absolute `allow` and `deny` paths treat the vault, spelled any of `vaults` (as given, real):
 * `granted` when an allow covers the whole vault, and `missing` — the `SANDBOX_DENY` paths an allow
 * reaches (the vault, the path, or something inside it) and no deny covers.
 */
export function sandboxGaps({ allow, deny }, vaults) {
  const granted = allow.some((a) => vaults.some((v) => covers(a, v)))
  const inVault = (p) => vaults.map((v) => join(v, p))
  const reached = (p) => inVault(p).some((path) => allow.some((a) => covers(a, path) || covers(path, a)))
  const denied = (p) => inVault(p).some((path) => deny.some((d) => covers(d, path)))
  return { granted, missing: SANDBOX_DENY.filter((p) => reached(p) && !denied(p)) }
}
