// ไฟล์ที่ template เป็นเจ้าของ เทียบกับที่ติดตั้งอยู่จริง — ใช้โดย `doctor.mjs` §10
//
// ของสามชุดนี้ update ของ template **ทับทั้งไฟล์** ⇒ แก้ใน vault/สกิลตรง ๆ = หายรอบหน้า (ใบ parallel-run-fixes#02)
// ข้อนี้ฟ้องว่าตอนนี้ต่างกันตรงไหน เพื่อให้ของที่แก้ตรง ๆ ไปเข้า template ก่อนจะโดนทับ
// (ทางที่ถูก: README § ไฟล์ที่ template เป็นเจ้าของ)
//
// เทียบหลัง **เรนเดอร์ฝั่ง template แบบเดียวกับ installer** (`renderVault` ของ `bootstrap.mjs`) — ไม่งั้น
// ทุกไฟล์ที่มีโทเคน path ขึ้นว่าต่างหมด · โทเคนเขียนเป็นสองท่อนโดยตั้งใจ: ไฟล์นี้อยู่ใต้ `_tools/` ที่ installer
// เรนเดอร์ ⇒ เขียนเต็ม ๆ เมื่อไหร่ installer จะแทนมันเป็น path แล้วตัวเทียบนี้เลิกเรนเดอร์เงียบ ๆ (บั๊กของใบ 03)
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const VAULT_TOKEN = '__' + 'VAULT' + '__'
const SKILL_TOKEN = '<' + 'VAULT' + '>'
const AUTOCOMMIT = '_tools/autocommit.sh'
// ตรงกับ `RENDER_EXEMPT` ของ bootstrap.mjs — สามไฟล์นี้พูดถึงโทเคนโดยตั้งใจ ไม่ถูกเรนเดอร์
const RENDER_EXEMPT = new Set([AUTOCOMMIT, '_tools/bootstrap.mjs', '_tools/doctor.mjs'])
// ของผู้ใช้ที่อยู่ใต้ `_tools/` — ไม่เคยมาจาก template ⇒ ไม่เทียบ
const USER_OWNED_TOOLS = ['_tools/harness-kit/']
// โน้ตที่รากของ vault ที่ update ทับ — `Wayfinder Config.md` · `Wayfinder Picks.md` เป็น seed-once (ของผู้ใช้) ⇒ ไม่อยู่ในนี้
// ตรงกับ `SKIP_NAMES` ของ bootstrap.mjs — installer ไม่เคยคัดลอกของพวกนี้ ⇒ ห้ามฟ้องว่า "ไม่มี"
const SKIP_NAMES = new Set(['.DS_Store', '.git', 'workspace.json', 'workspace-mobile.json'])
const ROOT_NOTES = ['README.md', 'SETUP.md', 'Wayfinder Dashboard.md', 'Wayfinder Efforts.md', 'Wayfinder Effort Tickets.md']

/** Render a template file the way the installer writes it into `vault`. */
export const renderOwned = (rel, text, vault, isSkill = false) => {
  if (rel === AUTOCOMMIT) return text.replace(/^VAULT=.*$/m, `VAULT="${vault}"`)
  if (RENDER_EXEMPT.has(rel)) return text
  const out = text.split(VAULT_TOKEN).join(vault)
  return isSkill ? out.split(SKILL_TOKEN).join(vault) : out
}

/** Every file under `dir`, as paths relative to it (`a/b.mjs`); none when `dir` is missing. */
const walk = async (dir, prefix = '') => {
  const entries = await readdir(join(dir, prefix), { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(entries.filter((e) => !SKIP_NAMES.has(e.name)).map((e) => {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) return walk(dir, rel)
    return e.isFile() ? [rel] : []
  }))
  return nested.flat().sort()
}

const readOrNull = (p) => readFile(p, 'utf8').catch(() => null)

/**
 * The template-owned pairs: `{ shown, from, to, rel, isSkill }` — `from` in the template repo, `to` installed.
 * `skillDir(name)` = where skill `name` is installed.
 */
export const ownedPairs = async ({ repo, vault, skillDir, withSkills = true }) => {
  const pairs = ROOT_NOTES.map((rel) => ({ shown: rel, rel, from: join(repo, 'template', rel), to: join(vault, rel) }))
  for (const f of await walk(join(repo, 'template/_tools'))) {
    const rel = `_tools/${f}`
    if (USER_OWNED_TOOLS.some((p) => rel.startsWith(p))) continue
    pairs.push({ shown: rel, rel, from: join(repo, 'template', rel), to: join(vault, rel) })
  }
  const skills = withSkills ? await readdir(join(repo, 'skills'), { withFileTypes: true }).catch(() => []) : []
  for (const s of skills.filter((e) => e.isDirectory()).map((e) => e.name).sort())
    for (const f of await walk(join(repo, 'skills', s)))
      pairs.push({ shown: `skills/${s}/${f}`, rel: `${s}/${f}`, isSkill: true,
        from: join(repo, 'skills', s, f), to: join(skillDir(s), f) })
  return pairs
}

/**
 * Template-owned files whose installed copy differs from the rendered template (`differs`) or is
 * missing (`missing`), as `shown` paths. `vault` is the path the installer rendered in (the main checkout).
 */
export const templateDrift = async ({ repo, vault, skillDir, withSkills = true }) => {
  const differs = []
  const missing = []
  const pairs = await ownedPairs({ repo, vault, skillDir, withSkills })
  let compared = 0
  for (const p of pairs) {
    const [src, dst] = await Promise.all([readOrNull(p.from), readOrNull(p.to)])
    if (src === null) continue
    compared += 1
    if (dst === null) missing.push(p.shown)
    else if (renderOwned(p.rel, src, vault, p.isSkill) !== dst) differs.push(p.shown)
  }
  return { compared, differs, missing }
}

/**
 * `templateDrift` against the first of `repos` the install matches, as `{ repo, compared, differs, missing }`;
 * when none matches, the drift against `repos[0]`. `repos` = the manifest's `source_repo`, then its main
 * checkout: a worktree recorded by a bootstrap run from it keeps its old branch, while the vault was later
 * brought up to `main` file by file (nova-dance-retro-fixes-followup#05).
 */
export const driftAgainstAny = async ({ repos, ...rest }) => {
  let first = null
  for (const repo of [...new Set(repos)]) {
    const r = { repo, ...(await templateDrift({ repo, ...rest })) }
    // เทียบ 0 ไฟล์ (repo ว่าง/ผิดตัว) ไม่นับว่าตรง — ไม่งั้นตัวสำรองผ่านแบบไม่ได้เทียบอะไรเลย
    if (r.compared > 0 && r.differs.length === 0 && r.missing.length === 0) return r
    first ??= r
  }
  return first
}
