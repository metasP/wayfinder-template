// A stand-in for the slice of Obsidian + Dataview the pages use, so the loader view and the Dashboard's
// `dataviewjs` blocks run in Node unchanged (spec, *Loading the core in Obsidian*). It evaluates code the
// way Dataview does and records what gets rendered; it is not a model of Dataview's markdown output.
//
// The vault is a directory on disk (the template by default): `dv.view` reads `<name>.js` from it, and
// `app.vault.adapter.getResourcePath` turns a vault path into a URL with an mtime query, as Obsidian does.
// Notes are in memory — `{ path, frontmatter, body? }` — because Dataview hands pages their parsed
// frontmatter; `dv.io.load` returns the note's text with a `---` frontmatter block.
import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { noteText } from "./vault.mjs"

export const TEMPLATE = fileURLToPath(new URL("../template/", import.meta.url))
export const LOADER = "_tools/views/wf-core"

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

/** Dataview's `dv.view`: a view whose text holds `await` is wrapped in an IIFE whose promise is dropped. */
const evalView = (contents, dv, input) => {
  const body = contents.includes("await") ? `(async () => { ${contents} })()` : contents
  return Promise.resolve(new Function("dv", "input", body)(dv, input))
}

/**
 * `{ dv, out, run(block) }`. `out` collects `{ kind, … }` render calls in order. `run(src)` evaluates a
 * `dataviewjs` block (an async function body, as Dataview runs it) with `app` installed as a global.
 */
export function fakeDataview({ notes = [], vault = TEMPLATE, failLoad = () => false } = {}) {
  const out = []
  const byPath = new Map(notes.map((n) => [n.path, n]))
  const page = (n) => ({ file: { path: n.path, name: n.path.split("/").pop().replace(/\.md$/, ""), frontmatter: n.frontmatter } })
  const dv = {
    pages: () => ({ array: () => notes.map(page) }),
    page: (path) => (byPath.has(path) ? page(byPath.get(path)) : undefined),
    io: {
      load: (path) => {
        if (failLoad(path)) return Promise.reject(new Error(`cannot read ${path}`))
        const n = byPath.get(path)
        return Promise.resolve(n ? noteText(n.frontmatter, n.body ?? "") : undefined)
      },
    },
    fileLink: (path, embed = false, display) => ({ link: path, display }),
    table: (headers, rows) => out.push({ kind: "table", headers, rows }),
    paragraph: (text) => out.push({ kind: "paragraph", text }),
    view: (name, input) => evalView(readFileSync(join(vault, `${name}.js`), "utf8"), dv, input),
  }
  const app = {
    vault: {
      adapter: {
        getResourcePath: (path) => `${pathToFileURL(join(vault, path)).href}?${statSync(join(vault, path)).mtimeMs}`,
      },
    },
  }
  const run = async (src) => {
    globalThis.app = app
    try {
      await new AsyncFunction("dv", src)(dv)
    } finally {
      delete globalThis.app
    }
  }
  return { dv, out, run }
}

/** The `dataviewjs` blocks of a note, in order. */
export function dataviewjsBlocks(text) {
  return [...text.matchAll(/^```dataviewjs[ \t]*\r?\n([\s\S]*?)^```/gm)].map((m) => m[1])
}
