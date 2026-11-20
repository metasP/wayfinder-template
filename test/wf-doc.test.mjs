// The doc tests' reader (test/wf-doc.mjs): which `wf …` in a markdown doc is a command line, which is a
// mention, and what a failure says — prose (Thai or English) never parses as a command.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readdirSync } from "node:fs"
import { assertCommandsParse, COMMAND_RULE, verbs, wfCommands } from "./wf-doc.mjs"

const fence = (...lines) => ["```", ...lines, "```"].join("\n")
const commandsOf = (markdown) => wfCommands(markdown, "doc.md").filter((c) => c.isCommand)
const failureOf = (markdown) => {
  try {
    assertCommandsParse(wfCommands(markdown, "doc.md"))
  } catch (error) {
    return error.message
  }
  assert.fail("expected the doc to fail")
}

describe("wf-doc: verbs", () => {
  test("are the verbs wf help lists", () => {
    assert.ok(verbs.has("claim") && verbs.has("touches"))
    assert.ok(!verbs.has("help"))
  })

  test("every verb module in lib/verbs is registered in wf.mjs", async () => {
    const dir = new URL("../template/_tools/lib/verbs/", import.meta.url)
    for (const file of readdirSync(dir)) {
      const { default: verb } = await import(new URL(file, dir).href)
      if (verb?.name) assert.ok(verbs.has(verb.name), `lib/verbs/${file} is verb ${verb.name}, but wf help doesn't list it — add it to VERBS in template/_tools/wf.mjs`)
    }
  })
})

describe("wf-doc: wfCommands", () => {
  test("prose outside a fence is a mention, never a command line", () => {
    const doc = "ถาม `wf frontier ว่ารอบ 1 มีใบไหน` ก่อน แล้วค่อย `wf claim`\nwf frontier บอกรอบให้เอง"
    assert.deepEqual(commandsOf(doc), [])
    assert.deepEqual(
      wfCommands(doc, "doc.md").map((c) => c.verb),
      ["frontier", "claim"],
    )
  })

  test("in a fence, a line starting with wf <verb> is a command", () => {
    const [cmd] = commandsOf(fence("wf claim my-repo/my-effort#04 --by me"))
    assert.deepEqual([cmd.verb, cmd.argv, cmd.where], ["claim", ["my-repo/my-effort#04", "--by", "me"], "doc.md:2"])
  })

  test("in a fence, node <path>/wf.mjs <verb> is a command wherever it starts", () => {
    const [cmd] = commandsOf(fence("  claim (first thing):     node __VAULT__/_tools/wf.mjs claim <ref>"))
    assert.deepEqual([cmd.verb, cmd.argv], ["claim", ["<ref>"]])
  })

  test("in a fence, a wf <verb> inside a sentence or in backticks is a mention", () => {
    const doc = fence("รัน wf frontier ก่อนแล้วค่อย claim", "A `wf resolve --gist` line after a verb")
    assert.deepEqual(commandsOf(doc), [])
    assert.deepEqual(wfCommands(doc, "doc.md").map((c) => c.verb), ["resolve"])
  })

  test("a command ends at two spaces or ' # ', so a note can follow it", () => {
    const doc = fence(
      "node v/_tools/wf.mjs touches <ref> <glob>…   (right after the claim when the ticket has no touches:)",
      "wf release <ref> # hand it back",
    )
    assert.deepEqual(commandsOf(doc).map((c) => c.argv), [["<ref>", "<glob>…"], ["<ref>"]])
  })

  test('"…", <…> and ‹…› are one argument each, spaces and all', () => {
    const [cmd] = commandsOf(fence('wf resolve <the ticket ref> --gist "one line" --answer-file ‹ไฟล์ answer›'))
    assert.deepEqual(cmd.argv, ["<the ticket ref>", "--gist", '"one line"', "--answer-file", "‹ไฟล์ answer›"])
  })
})

describe("wf-doc: assertCommandsParse", () => {
  test("passes a doc whose commands parse", () => {
    assertCommandsParse(wfCommands(fence('wf resolve <ref> --gist "…"'), "doc.md"))
  })

  test("a mention naming no verb fails, with where and the rule", () => {
    const message = failureOf("ใช้ `wf frotnier` ก่อน")
    assert.match(message, /doc\.md:1/)
    assert.match(message, /wf has no verb frotnier/)
    assert.ok(message.includes(COMMAND_RULE))
  })

  test("Thai prose that starts a fenced line with wf <verb> fails with the rule, not a bare count", () => {
    const message = failureOf(fence("wf frontier บอกรอบให้เอง"))
    assert.match(message, /doc\.md:2/)
    assert.match(message, /wf frontier takes at most 0 arguments, got 1: บอกรอบให้เอง/)
    assert.ok(message.includes(COMMAND_RULE))
  })

  test("an unknown flag fails with where and the rule", () => {
    const message = failureOf(fence("wf claim <ref> --by-name me"))
    assert.match(message, /doc\.md:2.*unknown flag --by-name/)
    assert.ok(message.includes(COMMAND_RULE))
  })

  test("a missing argument names how many the verb needs", () => {
    assert.match(failureOf(fence("wf block <ref>")), /wf block needs at least 2 arguments, got 1/)
  })
})
