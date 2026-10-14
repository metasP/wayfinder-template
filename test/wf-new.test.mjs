// `wf new` / `resolve` / `block` through the CLI against fixture vaults (spec *Verbs*: ticket
// transitions and `block`; Q24, Q36; Testing Decisions §1): the happy paths, every refused invariant
// (exit 1 with the fixing command), concurrency, and the wikilink forms `block` writes.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { chmodSync, existsSync } from "node:fs"
import { join } from "node:path"
import { git, makeVault, map, onOneDay, read, seed, ticket, ticketsBlock, wf, wfAsync, write } from "./vault.mjs"

const NO_SESSION = { CLAUDE_CODE_SESSION_ID: undefined }
const run = (vault, args, opts = {}) => wf(vault, args, { ...opts, env: { ...NO_SESSION, ...opts.env } })
const runAsync = (vault, args) => wfAsync(vault, args, { env: NO_SESSION })

const MAP_BODY = "# The map\n\n## Destination\n\nSomewhere.\n\n## Notes\n\nnone\n\n## Decisions so far\n\n- [[00-seed]]: the first call\n\n## Out of scope\n\n"
const vaultWith = (notes, opts = {}) => seed(makeVault({ notes, ...opts }))
const effort = (tickets = [], mapFields = {}) => [{ ...map("r/e/map.md", mapFields), body: MAP_BODY }, ...tickets]

const frontmatterOf = (vault, rel) => read(vault, rel).split("---\n")[1]
const lastCommit = (vault) => ({
  subject: git(vault, "log", "-1", "--format=%s"),
  files: git(vault, "show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean),
})

describe("wf new", () => {
  test("creates the next NN with frontmatter, the skeleton, a commit and the tickets block", () => {
    const vault = vaultWith(effort([ticket("r/e/issues/01-a.md", { title: "A" }), ticket("r/e/issues/04-d.md", { title: "D" })]))
    const { r, day } = onOneDay((day) => ({
      r: run(vault, ["new", "r/e", "--type", "research", "--title", "Where does it live?", "--question", "Find the store.", "--json"]),
      day,
    }))
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.json.data.ref, "r/e#05")
    assert.equal(r.json.data.path, "r/e/issues/05-where-does-it-live.md")
    assert.equal(
      read(vault, "r/e/issues/05-where-does-it-live.md"),
      [
        "---",
        "type: research",
        "status: open",
        `status_since: ${day}`,
        "title: Where does it live?",
        "blockers: []",
        "---",
        "",
        "## Question",
        "",
        "Find the store.",
        "",
        "## Answer",
        "",
        "(filled in at resolve)",
        "",
      ].join("\n"),
    )
    assert.deepEqual(lastCommit(vault), { subject: "wf(new): r/e#05", files: ["r/e/issues/05-where-does-it-live.md", "r/e/map.md"] })
    assert.match(read(vault, "r/e/map.md"), /^- \[\[05-where-does-it-live\]\] · research · open · Where does it live\?$/m)
  })
})

describe("wf new — options", () => {
  const base = () =>
    vaultWith([
      ...effort([ticket("r/e/issues/01-a.md", { title: "A", status: "resolved" }), ticket("r/e/issues/02-b.md", { title: "B" })]),
      map("o/x/map.md"),
      ticket("o/x/issues/03-far.md", { title: "Far" }),
    ])

  test("--blocker writes a bare wikilink within the effort and a full path across efforts", () => {
    const vault = base()
    const r = run(vault, ["new", "r/e", "--type", "task", "--title", "C", "--question", "q", "--blocker", "r/e#02", "--blocker", "[[o/x/issues/03-far]]", "--blocker", "[[01-a]]"])
    assert.equal(r.code, 0, r.stderr)
    assert.match(frontmatterOf(vault, "r/e/issues/03-c.md"), /^blockers:\n {2}- "\[\[02-b\]\]"\n {2}- "\[\[o\/x\/issues\/03-far\]\]"\n {2}- "\[\[01-a\]\]"\n/m)
    assert.match(read(vault, "r/e/map.md"), /^- \[\[03-c\]\] · task · open · C ⛔$/m)
  })

  test("--target-repo is written; the question can come from stdin", () => {
    const vault = base()
    const r = wf(vault, ["new", "r/e", "--type", "task", "--title", "C", "--target-repo", "other"], { env: NO_SESSION, input: "Line one.\nLine two.\n" })
    assert.equal(r.code, 0, r.stderr)
    const text = read(vault, "r/e/issues/03-c.md")
    assert.match(text, /^target_repo: other$/m)
    assert.match(text, /## Question\n\nLine one\.\nLine two\.\n\n## Answer/)
  })

  test("the answer placeholder follows language: in Wayfinder Config", () => {
    const vault = vaultWith(effort(), { config: { language: "th" } })
    assert.equal(run(vault, ["new", "r/e", "--type", "task", "--title", "งานแรก", "--question", "q"]).code, 0)
    assert.match(read(vault, "r/e/issues/01-งานแรก.md"), /## Answer\n\n\(เติมตอน resolve\)\n$/)
  })
})

describe("wf new refuses", () => {
  const unchanged = (vault, args, code, message, fix) => {
    const head = git(vault, "rev-parse", "HEAD")
    const r = run(vault, args)
    assert.equal(r.code, code, r.stderr)
    assert.match(r.stderr, message)
    if (fix) assert.match(r.stderr, new RegExp(`^  fix: ${fix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"))
    assert.equal(git(vault, "rev-parse", "HEAD"), head, "no commit")
    assert.equal(git(vault, "status", "--porcelain"), "", "nothing written")
  }
  const Q = ["--question", "q"]

  test("an effort without a map (exit 1)", () => {
    unchanged(vaultWith(effort()), ["new", "r/none", "--type", "task", "--title", "T", ...Q], 1, /r\/none has no map/, "wf chart r/none --title <title>")
  })

  test("a blocker that resolves to no ticket (exit 1)", () => {
    unchanged(vaultWith(effort()), ["new", "r/e", "--type", "task", "--title", "T", ...Q, "--blocker", "r/e#09"], 1, /blocker r\/e#09 resolves to no ticket/, "wf new r/e --type <type> --title <title> (create the blocker first)")
  })

  test("usage errors (exit 2): a bad --type, no --title, no question", () => {
    const vault = vaultWith(effort())
    unchanged(vault, ["new", "r/e", "--type", "chore", "--title", "T", ...Q], 2, /--type must be one of research, prototype, grilling, task/)
    unchanged(vault, ["new", "r/e", "--type", "task", ...Q], 2, /new needs --title/)
    assert.equal(wf(vault, ["new", "r/e", "--type", "task", "--title", "T"], { env: NO_SESSION, input: "" }).code, 2)
  })
})

describe("wf new — concurrency", () => {
  test("two wf new started together get different NN", async () => {
    const vault = vaultWith(effort([ticket("r/e/issues/01-a.md")]))
    const results = await Promise.all(["X", "Y"].map((title) => runAsync(vault, ["new", "r/e", "--type", "task", "--title", title, "--question", "q", "--json"])))
    for (const r of results) assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(results.map((r) => r.json.data.ref).sort(), ["r/e#02", "r/e#03"])
    assert.equal(git(vault, "status", "--porcelain"), "")
    assert.match(read(vault, "r/e/map.md"), /\[\[02-\w\]\][^\n]*\n- \[\[03-\w\]\]/)
  })
})

const ANSWERED = "\n## Question\n\nq\n\n## Answer\n\nIt lives in the vault.\n"
const PLACEHOLDER = "\n## Question\n\nq\n\n## Answer\n\n(filled in at resolve)\n"
const withBody = (note, body) => ({ ...note, body })

describe("wf resolve", () => {
  test("claimed → resolved: clears the claim, appends the decision line, regenerates the block", () => {
    const vault = vaultWith(
      effort([withBody(ticket("r/e/issues/01-a.md", { title: "A", status: "claimed", claimed_by: "me", wait_until: "2026-01-01", status_note: "x" }), ANSWERED)]),
    )
    const { r, day } = onOneDay((day) => ({ r: run(vault, ["resolve", "r/e#01", "--gist", "it lives in the vault", "--json"]), day }))
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.json.data.ref, "r/e#01")
    const fm = frontmatterOf(vault, "r/e/issues/01-a.md")
    assert.match(fm, /^status: resolved$/m)
    assert.match(fm, new RegExp(`^status_since: ${day}$`, "m"))
    assert.doesNotMatch(fm, /claimed_by|status_note|wait_until/)
    const mapText = read(vault, "r/e/map.md")
    assert.match(mapText, /## Decisions so far\n\n- \[\[00-seed\]\]: the first call\n- \[\[01-a\]\]: it lives in the vault\n\n## Out of scope/)
    assert.match(mapText, /^- \[\[01-a\]\] · task · resolved · A$/m)
    assert.deepEqual(lastCommit(vault), { subject: "wf(resolve): r/e#01", files: ["r/e/issues/01-a.md", "r/e/map.md"] })
  })

  test("waiting → resolved", () => {
    const vault = vaultWith(effort([withBody(ticket("r/e/issues/01-a.md", { status: "waiting", status_note: "vendor" }), ANSWERED)]))
    assert.equal(run(vault, ["resolve", "r/e#01", "--gist", "g"]).code, 0)
    assert.match(frontmatterOf(vault, "r/e/issues/01-a.md"), /^status: resolved$/m)
  })

  test("--out-of-scope: open → resolved, the line goes under ## Out of scope", () => {
    const vault = vaultWith(effort([withBody(ticket("r/e/issues/01-a.md"), PLACEHOLDER)]))
    const r = run(vault, ["resolve", "r/e#01", "--out-of-scope", "--gist", "past the destination"])
    assert.equal(r.code, 0, r.stderr)
    const mapText = read(vault, "r/e/map.md")
    assert.match(mapText, /## Out of scope\n\n- \[\[01-a\]\]: past the destination\n/)
    assert.doesNotMatch(mapText.split("## Out of scope")[0], /01-a\]\]:/)
  })

  test("a map without the section gets it at the end", () => {
    const vault = vaultWith([map("r/e/map.md"), withBody(ticket("r/e/issues/01-a.md", { status: "claimed", claimed_by: "me" }), ANSWERED)])
    assert.equal(run(vault, ["resolve", "r/e#01", "--gist", "g"]).code, 0)
    assert.match(read(vault, "r/e/map.md"), /\n## Decisions so far\n\n- \[\[01-a\]\]: g\n/)
  })

  test("resolving regenerates ⛔ marks in another effort's block", () => {
    const vault = vaultWith([
      ...effort([withBody(ticket("r/e/issues/01-a.md", { title: "A", status: "claimed", claimed_by: "me" }), ANSWERED)]),
      { ...map("o/x/map.md"), body: `# X\n\n${ticketsBlock("- [[01-far]] · task · open · Far ⛔")}` },
      ticket("o/x/issues/01-far.md", { title: "Far", blockers: ["[[r/e/issues/01-a]]"] }),
    ])
    assert.equal(run(vault, ["resolve", "r/e#01", "--gist", "g"]).code, 0)
    assert.match(read(vault, "o/x/map.md"), /^- \[\[01-far\]\] · task · open · Far$/m)
    assert.deepEqual(lastCommit(vault).files, ["o/x/map.md", "r/e/issues/01-a.md", "r/e/map.md"])
  })
})

describe("wf resolve refuses", () => {
  const refused = (vault, args, invariant, fix) => {
    const head = git(vault, "rev-parse", "HEAD")
    const r = run(vault, args)
    assert.equal(r.code, 1, r.stderr)
    assert.match(r.stderr, invariant)
    assert.match(r.stderr, new RegExp(`^  fix: ${fix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"))
    assert.equal(git(vault, "rev-parse", "HEAD"), head, "no commit")
    assert.equal(git(vault, "status", "--porcelain"), "", "nothing written")
  }
  const claimed = (body) => vaultWith(effort([withBody(ticket("r/e/issues/01-a.md", { status: "claimed", claimed_by: "me" }), body)]))

  test("an open ticket without --out-of-scope", () => {
    const vault = vaultWith(effort([withBody(ticket("r/e/issues/01-a.md"), ANSWERED)]))
    refused(vault, ["resolve", "r/e#01", "--gist", "g"], /r\/e#01 is open — resolve needs a ticket that is claimed or waiting/, "wf claim r/e#01")
  })

  test("--out-of-scope on a waiting ticket", () => {
    const vault = vaultWith(effort([withBody(ticket("r/e/issues/01-a.md", { status: "waiting", status_note: "v" }), ANSWERED)]))
    refused(vault, ["resolve", "r/e#01", "--out-of-scope", "--gist", "g"], /r\/e#01 is waiting \(v\) — resolve --out-of-scope needs a ticket that is open or claimed/, "wf release r/e#01")
  })

  test("a resolved ticket", () => {
    const vault = vaultWith(effort([withBody(ticket("r/e/issues/01-a.md", { status: "resolved" }), ANSWERED)]))
    refused(vault, ["resolve", "r/e#01", "--gist", "g"], /r\/e#01 is resolved/, "wf new r/e --type task --title <title> (a resolved ticket stays resolved; open a follow-up)")
  })

  test("an empty ## Answer, the placeholder in any language, or no ## Answer", () => {
    const fix = "write the answer under ## Answer in r/e/issues/01-a.md, then rerun"
    refused(claimed("\n## Question\n\nq\n\n## Answer\n\n\n## Notes\n\nx\n"), ["resolve", "r/e#01", "--gist", "g"], /r\/e#01 has no answer — resolve needs a non-empty ## Answer/, fix)
    refused(claimed(PLACEHOLDER), ["resolve", "r/e#01", "--gist", "g"], /has no answer/, fix)
    refused(claimed("\n## Answer\n\n(เติมตอน resolve)\n"), ["resolve", "r/e#01", "--gist", "g"], /has no answer/, fix)
    refused(claimed("\n## Question\n\nq\n"), ["resolve", "r/e#01", "--gist", "g"], /has no answer/, fix)
  })

  test("no --gist is a usage error (exit 2)", () => {
    const r = run(claimed(ANSWERED), ["resolve", "r/e#01"])
    assert.equal(r.code, 2)
    assert.match(r.stderr, /resolve needs --gist/)
  })
})

describe("wf resolve — concurrency", () => {
  test("two wf resolve on different tickets of one map keep both Decisions so far lines", async () => {
    const vault = vaultWith(
      effort(["01-a", "02-b"].map((name) => withBody(ticket(`r/e/issues/${name}.md`, { status: "claimed", claimed_by: "me" }), ANSWERED))),
    )
    const results = await Promise.all(["01", "02"].map((nn) => runAsync(vault, ["resolve", `r/e#${nn}`, "--gist", `gist ${nn}`])))
    for (const r of results) assert.equal(r.code, 0, r.stderr)
    const decisions = read(vault, "r/e/map.md").split("## Decisions so far")[1].split("## Out of scope")[0]
    assert.match(decisions, /^- \[\[01-a\]\]: gist 01$/m)
    assert.match(decisions, /^- \[\[02-b\]\]: gist 02$/m)
    assert.equal(git(vault, "status", "--porcelain"), "")
  })
})

describe("wf block", () => {
  const graph = () =>
    vaultWith([
      ...effort([
        ticket("r/e/issues/01-a.md", { title: "A" }),
        ticket("r/e/issues/02-b.md", { title: "B", blockers: ["[[01-a]]"] }),
        ticket("r/e/issues/03-c.md", { title: "C", blockers: ["[[02-b]]", "[[09-gone]]"] }),
        ticket("r/e/issues/04-d.md", { title: "D" }),
      ]),
      map("o/x/map.md"),
      ticket("o/x/issues/01-far.md", { title: "Far" }),
    ])

  test("adds a bare wikilink within an effort and regenerates ⛔", () => {
    const vault = graph()
    const r = run(vault, ["block", "r/e#01", "r/e#04", "--json"])
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(r.json.data.blockers, ["[[04-d]]"])
    assert.match(frontmatterOf(vault, "r/e/issues/01-a.md"), /^blockers:\n {2}- "\[\[04-d\]\]"\n/m)
    assert.match(read(vault, "r/e/map.md"), /^- \[\[01-a\]\] · task · open · A ⛔$/m)
    assert.equal(lastCommit(vault).subject, "wf(block): r/e#01")
  })

  test("adds a full-path wikilink across efforts, keeping the existing blockers", () => {
    const vault = graph()
    assert.equal(run(vault, ["block", "r/e#02", "o/x#01"]).code, 0)
    assert.match(frontmatterOf(vault, "r/e/issues/02-b.md"), /^blockers:\n {2}- "\[\[01-a\]\]"\n {2}- "\[\[o\/x\/issues\/01-far\]\]"\n/m)
  })

  test("--remove takes one edge out, by ref or by the raw link of a dangling blocker", () => {
    const vault = graph()
    assert.equal(run(vault, ["block", "r/e#03", "r/e#02", "--remove"]).code, 0)
    assert.match(frontmatterOf(vault, "r/e/issues/03-c.md"), /^blockers:\n {2}- "\[\[09-gone\]\]"\n/m)
    assert.equal(run(vault, ["block", "r/e#03", "[[09-gone]]", "--remove"]).code, 0)
    assert.match(frontmatterOf(vault, "r/e/issues/03-c.md"), /^blockers: \[\]$/m)
    assert.equal(lastCommit(vault).subject, "wf(block): r/e#03")
  })

  test("an edge that is already there, or already gone, writes nothing", () => {
    const vault = graph()
    const head = git(vault, "rev-parse", "HEAD")
    const added = run(vault, ["block", "r/e#02", "[[01-a]]"])
    assert.equal(added.code, 0, added.stderr)
    assert.match(added.stdout, /nothing to write/)
    assert.equal(run(vault, ["block", "r/e#01", "r/e#02", "--remove"]).code, 0)
    assert.equal(git(vault, "rev-parse", "HEAD"), head)
  })
})

describe("wf block refuses", () => {
  const refused = (vault, args, code, message, fix) => {
    const head = git(vault, "rev-parse", "HEAD")
    const r = run(vault, args)
    assert.equal(r.code, code, r.stderr)
    assert.match(r.stderr, message)
    if (fix) assert.match(r.stderr, new RegExp(`^  fix: ${fix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"))
    assert.equal(git(vault, "rev-parse", "HEAD"), head, "no commit")
    assert.equal(git(vault, "status", "--porcelain"), "", "nothing written")
  }
  const chain = () =>
    vaultWith(
      effort([
        ticket("r/e/issues/01-a.md"),
        ticket("r/e/issues/02-b.md", { blockers: ["[[01-a]]"] }),
        ticket("r/e/issues/03-c.md", { blockers: ["[[02-b]]"] }),
      ]),
    )

  test("an edge that closes a cycle, naming it", () => {
    refused(chain(), ["block", "r/e#01", "r/e#03"], 1, /r\/e#01 blocked by r\/e#03 would close the cycle r\/e#01 → r\/e#03 → r\/e#02 → r\/e#01/, "wf block r/e#03 r/e#02 --remove (cut the chain first)")
  })

  test("a ticket blocking itself", () => {
    refused(chain(), ["block", "r/e#02", "[[02-b]]"], 1, /r\/e#02 can't block itself/, "wf block r/e#02 <another ticket>")
  })

  test("a blocker that resolves to no ticket", () => {
    refused(chain(), ["block", "r/e#01", "r/e#09"], 1, /blocker r\/e#09 resolves to no ticket/, "wf new r/e --type <type> --title <title> (create the blocker first)")
  })

  test("a ref that isn't a ticket (exit 2)", () => {
    refused(chain(), ["block", "r/e#01", "nonsense"], 2, /cannot read "nonsense" as a ticket ref/)
  })
})

describe("review follow-ups", () => {
  test("wf new reads a question that arrives on stdin after a delay", async () => {
    const vault = vaultWith(effort())
    const child = spawn(process.execPath, [join(vault, "_tools/wf.mjs"), "new", "r/e", "--type", "task", "--title", "Late"], { cwd: vault, env: { ...process.env, ...NO_SESSION } })
    let stderr = ""
    child.stderr.on("data", (d) => (stderr += d))
    setTimeout(() => child.stdin.end("Slow question.\r\n"), 300)
    const code = await new Promise((done) => child.on("close", done))
    assert.equal(code, 0, stderr)
    assert.match(read(vault, "r/e/issues/01-late.md"), /## Question\n\nSlow question\.\n\n## Answer/)
  })

  test("NN counts a duplicate NN too", () => {
    const vault = vaultWith(effort([ticket("r/e/issues/01-a.md"), ticket("r/e/issues/03-b.md"), ticket("r/e/issues/03-c.md")]))
    assert.equal(run(vault, ["new", "r/e", "--type", "task", "--title", "N", "--question", "q", "--json"]).json.data.ref, "r/e#04")
  })

  test("a commit that fails takes the created ticket back out", () => {
    const vault = vaultWith(effort())
    write(vault, ".git/hooks/pre-commit", "#!/bin/sh\nexit 1\n")
    chmodSync(join(vault, ".git/hooks/pre-commit"), 0o755)
    const r = run(vault, ["new", "r/e", "--type", "task", "--title", "T", "--question", "q"])
    assert.equal(r.code, 2, r.stderr)
    assert.equal(existsSync(join(vault, "r/e/issues/01-t.md")), false)
    assert.equal(git(vault, "status", "--porcelain"), "")
  })

  test("a long title makes a slug cut at a word boundary", () => {
    const vault = vaultWith(effort())
    const title = "one two three four five six seven eight nine ten eleven twelve thirteen"
    const r = run(vault, ["new", "r/e", "--type", "task", "--title", title, "--question", "q", "--json"])
    assert.equal(r.json.data.path, "r/e/issues/01-one-two-three-four-five-six-seven-eight-nine-ten-eleven.md")
  })

  test("resolve refuses a ticket whose effort has no map", () => {
    const vault = vaultWith([withBody(ticket("r/e/issues/01-a.md", { status: "claimed", claimed_by: "me" }), ANSWERED)])
    const r = run(vault, ["resolve", "r/e#01", "--gist", "g"])
    assert.equal(r.code, 1, r.stderr)
    assert.match(r.stderr, /r\/e has no map — the decision goes in the map/)
    assert.match(r.stderr, /^ {2}fix: wf chart r\/e --title <title>$/m)
    assert.equal(git(vault, "status", "--porcelain"), "")
  })

  test("resolve keeps unknown keys and key order byte for byte", () => {
    const text = "---\nzeta: 1   # keep\ntype: task\nstatus: claimed\nclaimed_by: me\ncustom: [a, 'b']\nstatus_since: 2026-01-01\ntitle: A\nblockers: []\n---\n" + ANSWERED
    const vault = vaultWith(effort([{ path: "r/e/issues/01-a.md", text }]))
    const { r, day } = onOneDay((day) => ({ r: run(vault, ["resolve", "r/e#01", "--gist", "g"]), day }))
    assert.equal(r.code, 0, r.stderr)
    assert.equal(read(vault, "r/e/issues/01-a.md"), text.replace("status: claimed", "status: resolved").replace("claimed_by: me\n", "").replace("2026-01-01", day))
  })

  test("block --remove takes out any dangling link as written, as lint's fix says", () => {
    const vault = vaultWith(effort([ticket("r/e/issues/01-a.md", { blockers: ["[[nonexistent]]", "[[o/x/foo]]"] })]))
    const fix = run(vault, ["lint", "r/e", "--json"]).json.data.findings.find((f) => f.rule === "dangling-blocker").fix
    assert.equal(fix, 'wf block r/e#01 "[[nonexistent]]" --remove')
    assert.equal(run(vault, ["block", "r/e#01", "[[nonexistent]]", "--remove"]).code, 0)
    assert.equal(run(vault, ["block", "r/e#01", "[[o/x/foo]]", "--remove"]).code, 0)
    assert.match(frontmatterOf(vault, "r/e/issues/01-a.md"), /^blockers: \[\]$/m)
  })

  test("a no-op block says what was already true", () => {
    const vault = vaultWith(effort([ticket("r/e/issues/01-a.md"), ticket("r/e/issues/02-b.md", { blockers: ["[[01-a]]"] })]))
    assert.match(run(vault, ["block", "r/e#02", "r/e#01"]).stdout, /^r\/e#02 is already blocked by r\/e#01 \(nothing to write\)$/m)
    assert.match(run(vault, ["block", "r/e#01", "r/e#99", "--remove"]).stdout, /^r\/e#01 was not blocked by r\/e#99 \(nothing to write\)$/m)
    assert.equal(run(vault, ["block", "r/e#01", "nonsense", "--remove"]).code, 2)
  })
})
