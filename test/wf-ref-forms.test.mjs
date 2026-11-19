// The forms a ticket `<ref>` takes on every verb (parallel-run-fixes#04): `repo/effort#NN`,
// `repo/effort NN` (two arguments, as a shell splits it), `repo/effort/NN` and a full vault path —
// plus what `wf help` and a bad ref say about them.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { join } from "node:path"
import { makeVault, map, ticket, wf } from "./vault.mjs"

const vaultOf = () =>
  makeVault({
    notes: [map("r/e/map.md"), ticket("r/e/issues/04-four.md"), ticket("r/e/issues/05-five.md")],
  })

const FORMS = [
  ["repo/effort#NN", () => ["r/e#04"]],
  ["repo/effort NN", () => ["r/e", "04"]],
  ["repo/effort NN without the leading zero", () => ["r/e", "4"]],
  ["repo/effort/NN", () => ["r/e/04"]],
  ["vault path", () => ["r/e/issues/04-four.md"]],
  ["absolute path", (vault) => [join(vault, "r/e/issues/04-four.md")]],
]

describe("every <ref> form names the same ticket", () => {
  for (const [name, refOf] of FORMS) {
    test(`show, claim and release take ${name}`, () => {
      const vault = vaultOf()
      const shown = wf(vault, ["show", ...refOf(vault), "--json"])
      assert.equal(shown.code, 0, shown.stderr)
      assert.equal(shown.json.data.ref, "r/e#04")

      const claimed = wf(vault, ["claim", ...refOf(vault), "--by", "a"])
      assert.equal(claimed.code, 0, claimed.stderr)
      assert.match(claimed.stdout, /claimed r\/e#04/)

      const released = wf(vault, ["release", ...refOf(vault), "--by", "a"])
      assert.equal(released.code, 0, released.stderr)
    })
  }

  test("block takes both refs as repo/effort NN", () => {
    const vault = vaultOf()
    const r = wf(vault, ["block", "r/e", "05", "r/e", "04", "--json"])
    assert.equal(r.code, 0, r.stderr)
    const shown = wf(vault, ["show", "r/e", "05", "--json"])
    assert.deepEqual(shown.json.data.frontmatter.blockers, ["[[04-four]]"])
  })

  test("a split ref still counts as one argument: a third positional is refused", () => {
    const r = wf(vaultOf(), ["show", "r/e", "04", "extra"])
    assert.equal(r.code, 2)
    assert.match(r.stderr, /unexpected argument "extra"/)
  })
})

describe("what wf says about ref forms", () => {
  test("wf help lists every form a ref takes", () => {
    const r = wf(vaultOf(), ["help"])
    assert.equal(r.code, 0)
    assert.match(r.stdout, /<ref>.*repo\/effort#NN/)
    assert.match(r.stdout, /repo\/effort NN/)
    assert.match(r.stdout, /repo\/effort\/NN/)
    assert.match(r.stdout, /vault path/)
  })

  test("an effort with no ticket number says how to add it, with the effort itself", () => {
    const r = wf(vaultOf(), ["claim", "r/e", "--by", "a"])
    assert.equal(r.code, 2)
    assert.match(r.stderr, /cannot read "r\/e" as a ticket ref/)
    assert.match(r.stderr, /r\/e#NN/)
    assert.match(r.stderr, /e\.g\. wf claim r\/e#01/)
  })

  test("a bare #NN is refused with the forms and an example", () => {
    const r = wf(vaultOf(), ["show", "#04"])
    assert.equal(r.code, 2)
    assert.match(r.stderr, /cannot read "#04" as a ticket ref/)
    assert.match(r.stderr, /repo\/effort#NN · repo\/effort NN · repo\/effort\/NN · a vault path/)
    assert.match(r.stderr, /e\.g\. wf show my-repo\/my-effort#04/)
  })
})
