// The sandbox grant for the vault (spec docs/specs/ticket-store.md, Q2 and *Sandbox grant*): the vault root
// is writable, and every path holding code that runs outside the sandbox is denied.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { SANDBOX_DENY, sandboxGaps, sandboxGrant, sandboxPath } from "../template/_tools/lib/sandbox.mjs"

const HOME = "/Users/owner"
const VAULT = `${HOME}/Documents/Git/wayfinder-vault`
const abs = (entries) => entries.map((e) => sandboxPath(e, HOME))

describe("sandboxGrant", () => {
  test("allows the vault root and denies the hook scripts, git's hooks and config, Obsidian and .claude", () => {
    assert.deepEqual(sandboxGrant(VAULT, HOME), {
      allowWrite: ["~/Documents/Git/wayfinder-vault"],
      denyWrite: [
        "~/Documents/Git/wayfinder-vault/_tools",
        "~/Documents/Git/wayfinder-vault/.git/hooks",
        "~/Documents/Git/wayfinder-vault/.git/config",
        "~/Documents/Git/wayfinder-vault/.git/modules",
        "~/Documents/Git/wayfinder-vault/.obsidian",
        "~/Documents/Git/wayfinder-vault/.claude",
        "~/Documents/Git/wayfinder-vault/.mcp.json",
      ],
    })
  })

  test("keeps a vault outside home absolute", () => {
    assert.deepEqual(sandboxGrant("/srv/vault", HOME).allowWrite, ["/srv/vault"])
    assert.equal(sandboxGrant("/srv/vault", HOME).denyWrite[0], "/srv/vault/_tools")
  })

  test("does not spell a sibling of home through ~", () => {
    assert.deepEqual(sandboxGrant(`${HOME}2/vault`, HOME).allowWrite, [`${HOME}2/vault`])
  })
})

describe("sandboxPath", () => {
  test("resolves ~/ under home, / and // as absolute, and the rest under ~/.claude", () => {
    assert.equal(sandboxPath("~/vault/", HOME), `${HOME}/vault`)
    assert.equal(sandboxPath("/srv/vault", HOME), "/srv/vault")
    assert.equal(sandboxPath("//srv/vault", HOME), "/srv/vault")
    assert.equal(sandboxPath("cache", HOME), `${HOME}/.claude/cache`)
  })

  test("is null for a wildcard or a non-string", () => {
    assert.equal(sandboxPath("~/vault/**", HOME), null)
    assert.equal(sandboxPath(42, HOME), null)
    assert.equal(sandboxPath("", HOME), null)
    assert.equal(sandboxPath("~", HOME), null)
  })
})

describe("sandboxGaps", () => {
  test("the printed grant, read back, leaves nothing missing", () => {
    const { allowWrite, denyWrite } = sandboxGrant(VAULT, HOME)
    assert.deepEqual(sandboxGaps({ allow: abs(allowWrite), deny: abs(denyWrite) }, [VAULT]), { granted: true, missing: [] })
  })

  test("the vault root granted alone misses every deny", () => {
    assert.deepEqual(sandboxGaps({ allow: [VAULT], deny: [] }, [VAULT]), { granted: true, missing: SANDBOX_DENY })
  })

  test("a grant on an ancestor of the vault counts, and so does a deny on an ancestor of a path", () => {
    const deny = [`${VAULT}/_tools`, `${VAULT}/.git`, `${VAULT}/.obsidian`, `${VAULT}/.claude`, `${VAULT}/.mcp.json`]
    assert.deepEqual(sandboxGaps({ allow: [`${HOME}/Documents`], deny }, [VAULT]), { granted: true, missing: [] })
  })

  test("a path that only shares a prefix with the vault is no grant, and no deny", () => {
    const gaps = sandboxGaps({ allow: [`${VAULT}-old`], deny: [`${VAULT}/_tools-old`] }, [VAULT])
    assert.deepEqual(gaps, { granted: false, missing: [] })
    assert.deepEqual(sandboxGaps({ allow: [VAULT], deny: [`${VAULT}/_tools-old`] }, [VAULT]).missing, SANDBOX_DENY)
  })

  test("an allow narrower than the vault needs the denies it reaches, and only those", () => {
    assert.deepEqual(sandboxGaps({ allow: [`${VAULT}/_tools/lib`], deny: [] }, [VAULT]), { granted: false, missing: ["_tools"] })
    assert.deepEqual(sandboxGaps({ allow: [`${VAULT}/.git`], deny: [`${VAULT}/.git/hooks`] }, [VAULT]),
      { granted: false, missing: [".git/config", ".git/modules"] })
    assert.deepEqual(sandboxGaps({ allow: [`${VAULT}/r/e`], deny: [] }, [VAULT]), { granted: false, missing: [] })
  })

  test("no allow at all needs no deny", () => {
    assert.deepEqual(sandboxGaps({ allow: [], deny: [] }, [VAULT]), { granted: false, missing: [] })
  })

  test("the vault matches through any of its spellings", () => {
    const real = "/Volumes/data/wayfinder-vault"
    const gaps = sandboxGaps({ allow: [real], deny: [`${real}/_tools`] }, [VAULT, real])
    assert.equal(gaps.granted, true)
    assert.equal(gaps.missing.includes("_tools"), false)
  })
})
