// Template-owned files vs what is installed (ticket parallel-run-fixes#02): `README.md`, `_tools/**` and the
// installed skills are overwritten by every template update, so `doctor` §10 names each one that differs.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { makeVault } from "./vault.mjs"
import { renderOwned, templateDrift } from "../template/_tools/lib/template-drift.mjs"

const TOOLS = fileURLToPath(new URL("../template/_tools/", import.meta.url))
const TOKEN = "__" + "VAULT" + "__"

const put = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
}

/** A minimal template repo: README, two `_tools` files, one skill. */
const makeRepo = () => {
  const repo = mkdtempSync(join(tmpdir(), "tpl-repo-"))
  put(repo, "LICENSE", "MIT\n")
  put(repo, "template/README.md", "# vault\n")
  put(repo, "template/_tools/wf.mjs", `// ${TOKEN}/_tools\n`)
  put(repo, "template/_tools/autocommit.sh", `VAULT="${TOKEN}"\n`)
  put(repo, "skills/next/SKILL.md", `run ${TOKEN}/_tools/wf.mjs · <VAULT>\n`)
  return repo
}

/** An install of `makeRepo()` rendered for `vault`, skills under `skills`. */
const install = (vault, skills) => {
  put(vault, "README.md", "# vault\n")
  put(vault, "_tools/wf.mjs", `// ${vault}/_tools\n`)
  put(vault, "_tools/autocommit.sh", `VAULT="${vault}"\n`)
  put(skills, "next/SKILL.md", `run ${vault}/_tools/wf.mjs · ${vault}\n`)
}

const setup = () => {
  const repo = makeRepo()
  const vault = mkdtempSync(join(tmpdir(), "tpl-vault-"))
  const skills = mkdtempSync(join(tmpdir(), "tpl-skills-"))
  install(vault, skills)
  return { repo, vault, skills, skillDir: (name) => join(skills, name) }
}

describe("templateDrift", () => {
  test("a fresh install matches once the template is rendered like the installer does", async () => {
    const { repo, vault, skillDir } = setup()
    assert.deepEqual(await templateDrift({ repo, vault, skillDir }), { compared: 4, differs: [], missing: [] })
  })

  test("names an edited vault file, an edited installed skill and a missing one", async () => {
    const { repo, vault, skills, skillDir } = setup()
    put(vault, "README.md", "# vault\nedited in the vault\n")
    put(skills, "next/SKILL.md", "edited in ~/.claude/skills\n")
    put(repo, "template/_tools/new.mjs", "// new in the template\n")
    const r = await templateDrift({ repo, vault, skillDir })
    assert.deepEqual(r.differs, ["README.md", "skills/next/SKILL.md"])
    assert.deepEqual(r.missing, ["_tools/new.mjs"])
  })

  test("leaves the user's _tools/harness-kit and vault-only files alone", async () => {
    const { repo, vault, skillDir } = setup()
    put(repo, "template/_tools/harness-kit/x.mjs", "template copy\n")
    put(vault, "_tools/extra.mjs", "vault only\n")
    assert.deepEqual(await templateDrift({ repo, vault, skillDir }), { compared: 4, differs: [], missing: [] })
  })

  test("skips what the installer never copies (.DS_Store) and the skills when they were not installed", async () => {
    const { repo, vault, skillDir } = setup()
    put(repo, "template/_tools/.DS_Store", "finder\n")
    put(repo, "skills/other/SKILL.md", "not installed\n")
    assert.deepEqual(await templateDrift({ repo, vault, skillDir, withSkills: false }), { compared: 3, differs: [], missing: [] })
  })

  test("renderOwned leaves the files that mention the token on purpose as they are", () => {
    assert.equal(renderOwned("_tools/doctor.mjs", TOKEN, "/v"), TOKEN)
    assert.equal(renderOwned("_tools/autocommit.sh", `VAULT="x"\nfallback ${TOKEN}`, "/v"), `VAULT="/v"\nfallback ${TOKEN}`)
    assert.equal(renderOwned("_tools/wf.mjs", `${TOKEN} <VAULT>`, "/v"), "/v <VAULT>")
  })
})

describe("doctor §10", () => {
  /** Run the doctor of a fixture vault with `args`, HOME at an empty temp dir. */
  const doctor = (vault, args) => {
    const r = spawnSync(process.execPath, [join(vault, "_tools/doctor.mjs"), "--json", ...args], {
      encoding: "utf8",
      env: { ...process.env, HOME: mkdtempSync(join(tmpdir(), "doctor-home-")) },
    })
    return { code: r.status, json: r.stdout ? JSON.parse(r.stdout) : null, stderr: r.stderr }
  }
  const section10 = (json) => json.checks.filter((c) => c.label.startsWith("ไฟล์ที่ template เป็นเจ้าของ"))

  const fixture = () => {
    const vault = makeVault({ manifest: null })
    cpSync(join(TOOLS, "doctor.mjs"), join(vault, "_tools/doctor.mjs"))
    return vault
  }

  test("without --template or a manifest it only warns how to point at the template", () => {
    const [c] = section10(doctor(fixture(), []).json)
    assert.equal(c.ok, false)
    assert.equal(c.soft, true)
    assert.match(c.detail, /--template/)
  })

  test("--template names each template-owned file that differs", () => {
    const vault = fixture()
    put(vault, "README.md", "# a README edited in the vault\n")
    const repo = makeRepo()
    const [c] = section10(doctor(vault, ["--template", repo]).json)
    assert.equal(c.ok, false)
    assert.equal(c.soft, undefined, "drift fails doctor")
    assert.match(c.detail, /≠ README\.md/)
    assert.match(c.detail, /README § ไฟล์ที่ template เป็นเจ้าของ/)
  })

  test("--template that is not a repo root fails; --template with no path is a usage error", () => {
    const vault = fixture()
    const [c] = section10(doctor(vault, ["--template", vault]).json)
    assert.equal(c.ok, false)
    assert.match(c.detail, /ไม่ใช่ราก repo/)
    assert.equal(doctor(vault, ["--template"]).code, 2)
  })
})
