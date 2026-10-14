// 1a. หา template repo: `<repo>/{template,skills,LICENSE}` คือลายเซ็นของราก repo
//     ใช้ของที่ repo มีอยู่แล้วเป็นตัวชี้ ไม่ต้องมีไฟล์ marker เพิ่ม
import { stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { die } from './say.mjs'

const exists = (p) => stat(p).then(() => true, () => false)

export const isRepoRoot = async (d) =>
  (await exists(join(d, 'template'))) && (await exists(join(d, 'skills'))) && (await exists(join(d, 'LICENSE')))

/** The repo root: from `--from` (`from`, absolute; its `template/` is accepted too), else up from `selfDir`. */
export const findRepo = async ({ from, selfDir }) => {
  if (from) {
    if (await isRepoRoot(from)) return from
    if (await isRepoRoot(dirname(from))) return dirname(from) // ชี้มาที่ `template/` ก็รับ
    die(`--from ${from} ไม่ใช่ราก template repo (ต้องมี template/ · skills/ · LICENSE)`)
  }
  let d = dirname(selfDir)                    // `<x>/_tools/..` = `<x>`
  for (let i = 0; i < 4; i++) {
    if (await isRepoRoot(d)) return d
    const up = dirname(d)
    if (up === d) break
    d = up
  }
  return null
}
