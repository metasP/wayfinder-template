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
 * A DOM element as far as the pages that draw HTML use one: `innerHTML` is kept as a string, and
 * `querySelector` hands back one child per selector, so a page that fills `.wft-body` leaves its HTML
 * there. `querySelectorAll("[data-x]")` returns an element per `data-x="…"` in `innerHTML`, whose
 * listeners `fire(type)` runs. Nothing is parsed beyond that.
 */
const fakeElement = () => {
  const children = new Map()
  const found = new Map() // selector + innerHTML → elements, so a later call sees the listeners bound
  const listeners = []
  const el = {
    innerHTML: "",
    className: "",
    value: "",
    style: {},
    dataset: {},
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    fire: (type, event = {}) =>
      listeners.filter((l) => l.type === type).forEach((l) => l.fn({ preventDefault() {}, stopPropagation() {}, ...event })),
    querySelector: (selector) => {
      if (!children.has(selector)) children.set(selector, fakeElement())
      return children.get(selector)
    },
    querySelectorAll: (selector) => {
      const attr = /^\[data-([a-z]+)\]$/.exec(selector)?.[1]
      if (!attr) return []
      const key = `${selector}\n${el.innerHTML}`
      if (!found.has(key))
        found.set(
          key,
          [...el.innerHTML.matchAll(new RegExp(`data-${attr}="([^"]*)"`, "g"))].map((m) => {
            const child = fakeElement()
            child.dataset[attr] = m[1]
            return child
          }),
        )
      return found.get(key)
    },
  }
  return el
}

// Globals a block sees while it runs, put back afterwards (Node may define some of them itself).
const withGlobals = async (globals, run) => {
  const saved = Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  try {
    return await run()
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

/**
 * `{ dv, out, run(block), inPage(fn), storage, opened, events }`. `out` collects `{ kind, … }` render
 * calls in order. `run(src)` evaluates a `dataviewjs` block (an async function body, as Dataview runs
 * it) with `app`, `localStorage` and `window` installed as globals; `inPage(fn)` runs `fn` — an event
 * a test fires after the block returned — with the same globals. `storage` is the `localStorage` contents (pass it
 * in to share it between pages), `opened` the notes `app.workspace.openLinkText` opened, `events` the
 * names `window.dispatchEvent` saw. `dv.container` is a fresh `fakeElement`.
 */
export function fakeDataview({ notes = [], vault = TEMPLATE, failLoad = () => false, storage = new Map(), vaultName = "test-vault" } = {}) {
  const out = []
  const opened = []
  const events = []
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
    container: fakeElement(),
  }
  const app = {
    vault: {
      getName: () => vaultName,
      adapter: {
        getResourcePath: (path) => `${pathToFileURL(join(vault, path)).href}?${statSync(join(vault, path)).mtimeMs}`,
      },
    },
    workspace: { openLinkText: (link) => opened.push(link) },
  }
  const localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
  }
  const window = { addEventListener() {}, dispatchEvent: (event) => events.push(event.type) }
  const CustomEvent = class {
    constructor(type) {
      this.type = type
    }
  }
  const inPage = (fn) => withGlobals({ app, localStorage, window, CustomEvent }, fn)
  const run = (src) => inPage(() => new AsyncFunction("dv", src)(dv))
  return { dv, out, run, inPage, storage, opened, events }
}

/** The `dataviewjs` blocks of a note, in order. */
export function dataviewjsBlocks(text) {
  return [...text.matchAll(/^```dataviewjs[ \t]*\r?\n([\s\S]*?)^```/gm)].map((m) => m[1])
}
