// ── 4d. ลบไฟล์ที่ template เลิกใช้แล้ว (update เท่านั้น) ─────────────────────────────────
// ขับด้วย **manifest เก่าเท่านั้น** — ของที่ไม่เคยอยู่ใน manifest (harness-kit, effort ของผู้ใช้)
// ไม่มีทางเข้ามาถึงลูปนี้ได้เลย และ seed-once ก็ไม่เข้าเพราะอยู่คนละคีย์
// ตัวลบมาทาง `io` ของ bootstrap.mjs เท่านั้น (ตัวห่อของ `--plan` · `rmdir` ล้มในโหมด plan โดยตั้งใจ)
import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'

const sha = (buf) => createHash('sha256').update(buf).digest('hex')

// ลบ `path` แล้วเก็บโฟลเดอร์ที่ว่างตามขึ้นไป จนถึง (ไม่รวม) `stopAt` หรือโฟลเดอร์แรกที่ยังมีของ
const removeFile = async (path, stopAt, { rm, rmdir }) => {
  await rm(path)
  for (let d = dirname(path); d !== stopAt; d = dirname(d))
    if (!(await rmdir(d).then(() => true, () => false))) break
}

/**
 * Remove what `oldManifest` placed and this run no longer ships: vault files not in `files`, skill files
 * not in `skills` (only when still the bytes the installer placed). Returns `{ dropped, keptSkills }`:
 * the rels removed, and the skill paths left because someone changed them.
 */
export async function pruneDropped({ oldManifest, files, skills, skillTargets, vault, isSeed, io }) {
  const dropped = []
  for (const rel of Object.keys(oldManifest.files ?? {})) {
    if (rel in files || isSeed(rel)) continue
    const p = join(vault, rel)
    if (!(await stat(p).then(() => true, () => false))) continue
    await removeFile(p, vault, io)
    dropped.push(rel)
  }
  // สกิลอยู่นอก git ⇒ ลบเฉพาะไฟล์ที่ยังเป็นไบต์เดียวกับที่ installer วางไว้ (sha ตรง manifest)
  // ตัวอย่างจริง: `skills/wayfinder` เลิก ship แล้วให้ลงจากปลั๊กอิน `mattpocock-skills` แทน — ถ้าเขา
  // ลงสกิลนั้นทางอื่นมาทับที่เดิมไว้ (`npx skills add` = symlink ที่ชื่อเดียวกัน) ห้ามลบของเขาทิ้ง
  const keptSkills = []
  for (const rel of Object.keys(oldManifest.skills ?? {})) {
    if (rel in skills) continue
    const name = rel.split('/')[0]
    const base = skillTargets[name]
    if (!base) continue
    const p = join(base, rel.slice(name.length + 1))
    const now = await readFile(p).then(sha, () => null)
    if (now === null) continue
    if (now !== oldManifest.skills[rel]) { keptSkills.push(p); continue }
    await removeFile(p, dirname(base), io)
    dropped.push(`skills/${rel}`)
  }
  return { dropped, keptSkills }
}
