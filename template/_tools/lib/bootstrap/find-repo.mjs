// 1a. หา template repo: `<repo>/{template,skills,LICENSE}` คือลายเซ็นของราก repo
//     ใช้ของที่ repo มีอยู่แล้วเป็นตัวชี้ ไม่ต้องมีไฟล์ marker เพิ่ม
import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
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

const gitPath = (dir, flag) => promisify(execFile)('git', ['-C', dir, 'rev-parse', '--path-format=absolute', flag])
  .then((r) => r.stdout.trim(), () => null)

/**
 * The main checkout of the repo `dir` is in, when `dir` is a linked worktree; else `dir` itself (also when
 * git can't tell — an npx install, a path that is gone). Worktrees come and go: one recorded as the template
 * (`source_repo`) keeps doctor §10 comparing against a stale branch (nova-dance-retro-fixes-followup#05).
 */
export const mainCheckout = async (dir) => {
  const [own, common] = await Promise.all([gitPath(dir, '--git-dir'), gitPath(dir, '--git-common-dir')])
  if (!own || !common || own === common || basename(common) !== '.git') return dir
  const main = dirname(common)
  return (await isRepoRoot(main)) ? main : dir
}
