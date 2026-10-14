// Fixture vaults for the `wf` CLI tests (spec docs/specs/ticket-store.md, Testing Decisions §1): a fresh
// temp dir with `git init`, `_tools/` copied from the template (wf locates the vault from its own path),
// a manifest at vault schema 2, and notes written from a compact description. `wf` runs as a child process.
import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isoDate } from "../template/_tools/lib/core.mjs"
import * as fixture from "./fixture.mjs"

const TOOLS = fileURLToPath(new URL("../template/_tools/", import.meta.url))
export const MANIFEST = ".wayfinder-template.json"

// `wf` reads today from the clock, so fixture dates are relative to it: a vault built from the core
// fixture's fixed dates would turn stale (and its tests red) once `stale_days` passed.
export const today = () => isoDate(new Date())
export const RECENT = isoDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
export const ticket = (path, fields = {}) => fixture.ticket(path, { status_since: RECENT, ...fields })
export const map = (path, fields = {}) => fixture.map(path, { status_since: RECENT, ...fields })

// A frontmatter value as YAML: strings double-quoted (JSON strings are valid YAML), lists in flow style.
const yamlValue = (value) =>
  Array.isArray(value) ? `[${value.map(yamlValue).join(", ")}]` : typeof value === "string" ? JSON.stringify(value) : String(value)

/** A note's text: `---` frontmatter `---`, then the body. */
export function noteText(frontmatter, body = "") {
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${yamlValue(value)}`)
  return ["---", ...lines, "---", "", body].join("\n")
}

export const ticketsBlock = (lines) => `## Tickets\n\n<!-- wf:tickets -->\n${lines}\n<!-- /wf:tickets -->\n`

/**
 * A vault in a new temp dir. `notes`: `{ path, frontmatter, body? }` (the core test builders fit) or
 * `{ path, text }` for a raw file. `manifest: null` writes none; otherwise it is merged over
 * `{ schema: 1, vault_schema: 2 }`. `config` / `picks` become the frontmatter of those notes.
 */
export function makeVault({ notes = [], manifest = {}, config, picks } = {}) {
  const vault = mkdtempSync(join(tmpdir(), "wf-vault-"))
  git(vault, "init", "-q")
  cpSync(join(TOOLS, "wf.mjs"), join(vault, "_tools/wf.mjs"))
  cpSync(join(TOOLS, "frontmatter-guard.mjs"), join(vault, "_tools/frontmatter-guard.mjs"))
  cpSync(join(TOOLS, "lib"), join(vault, "_tools/lib"), { recursive: true })
  if (manifest !== null) write(vault, MANIFEST, JSON.stringify({ schema: 1, vault_schema: 2, ...manifest }, null, 2))
  if (config) write(vault, "Wayfinder Config.md", noteText({ kind: "wayfinder-config", ...config }))
  if (picks) write(vault, "Wayfinder Picks.md", noteText(picks, "# Wayfinder Picks\n"))
  for (const note of notes) write(vault, note.path, note.text ?? noteText(note.frontmatter, note.body))
  return vault
}

export function write(vault, rel, text) {
  mkdirSync(dirname(join(vault, rel)), { recursive: true })
  writeFileSync(join(vault, rel), text)
}

export function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" })
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`)
  return r.stdout.trim()
}

/** Run `node <vault>/_tools/wf.mjs …args`. `json` is stdout parsed, when it parses. */
export function wf(vault, args = [], { cwd = vault, script = join(vault, "_tools/wf.mjs"), env = {} } = {}) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env } })
  let json
  try {
    json = JSON.parse(r.stdout)
  } catch {
    json = undefined
  }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json }
}

/** `run()` with the day it ran on, retried once if the clock crossed midnight while it ran. */
export function onOneDay(run) {
  for (let attempt = 0; ; attempt++) {
    const day = today()
    const result = run(day)
    if (today() === day || attempt > 0) return result
  }
}
