#!/usr/bin/env node
// ติดตั้งสกิลของ template ลงเครื่อง — คำสั่งเดียว ทำซ้ำได้ (ใบ nova-dance-retro-fixes-followup#05)
//
//   npm run install-skills                  วาง skills/* ที่ต่างจากที่ติดตั้งอยู่ (เรนเดอร์ path ของ vault ให้)
//   npm run install-skills -- --check       แค่บอกว่าสำเนาที่ติดตั้งต่างจาก template ไหม · ต่าง/หาย = exit 1
//
// ธง: --vault <path> (ไม่ใส่ = $WAYFINDER_VAULT หรือ ~/Documents/Git/wayfinder-vault)
//
// ทำไม: ใบ 06 ของ nova-dance-retro-fixes ต้องหาเองว่าสกิลมาจากไหน แล้ว `sed` แทนโทเคน path ทับสำเนาเอง
// พร้อม `.bak` · ที่นี่ใช้ `ownedPairs`/`renderOwned` ชุดเดียวกับ installer และ doctor §10 ⇒ ไบต์ที่วาง
// = ไบต์ที่ doctor เทียบ · ปลายทางมาจาก manifest ของ vault (`skills_targets` / `skills_dir`)
//
// รันจาก checkout ของ template ที่จะเอาสกิลมา (ปกติ = main หลัง merge) — สคริปต์บอก branch @ commit ที่ใช้
// ของเดิมที่ถูกทับเก็บไว้ใน `<vault>/.git/wayfinder-skills-backup/<เวลา>/` (สกิลไม่มี git ให้กู้)
// ไม่แตะไฟล์อื่นของ vault และไม่แก้ manifest — ของใน `_tools/` / README ใช้ bootstrap หรือ try-in-vault
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_VAULT = join(homedir(), 'Documents/Git/wayfinder-vault')
const MANIFEST = '.wayfinder-template.json'
const BACKUP_DIR = 'wayfinder-skills-backup'

export class InstallError extends Error {}

const readOrNull = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null)
const gitOut = (cwd, args) => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new InstallError(`git ${args.join(' ')} ล้ม: ${(r.stderr || '').trim()}`)
  return r.stdout.trim()
}

/** `{ check, vault }` from argv · an unknown flag is an InstallError */
export const parseArgs = (argv) => {
  const opts = { check: false, vault: null }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--check') opts.check = true
    else if (a === '--vault') {
      const v = argv[i + 1]
      if (!v || v.startsWith('--')) throw new InstallError('--vault ต้องตามด้วย path')
      opts.vault = v
      i += 1
    } else throw new InstallError(`ไม่รู้จัก ${a} — ใช้ได้: --check · --vault <path>`)
  }
  return opts
}

const readManifest = (vault) => {
  const text = readOrNull(join(vault, MANIFEST))
  if (text === null) throw new InstallError(`${vault} ไม่ใช่ vault ที่ติดตั้งแล้ว (ไม่มี ${MANIFEST}) — ใส่ --vault <path>`)
  let man
  try { man = JSON.parse(text) } catch (e) { throw new InstallError(`${MANIFEST} ของ ${vault} อ่านไม่ออก: ${e.message}`) }
  if (Array.isArray(man.parts) && !man.parts.includes('skills'))
    throw new InstallError(`${vault} ไม่ได้ติดตั้งสกิล (parts ไม่มี skills) — ไม่มีที่ให้วาง`)
  return man
}

/** Each skill file of `repo` as `{ shown, to, text, now }`: rendered for `vault`, and what is installed now. */
export const skillFiles = async ({ repo, vault }) => {
  const { ownedPairs, renderOwned } = await import(pathToFileURL(join(repo, 'template/_tools/lib/template-drift.mjs')).href)
  const man = readManifest(vault)
  const skillsDir = man.skills_dir ?? join(homedir(), '.claude/skills')
  const skillDir = (name) => man.skills_targets?.[name] ?? join(skillsDir, name)
  const pairs = (await ownedPairs({ repo, vault, skillDir })).filter((p) => p.isSkill && existsSync(p.from))
  return pairs.map((p) => ({
    shown: p.shown,
    to: p.to,
    text: renderOwned(p.rel, readFileSync(p.from, 'utf8'), vault, true),
    now: readOrNull(p.to),
  }))
}

/**
 * The vault's main checkout and its shared git dir: `--vault` may name a linked worktree of the vault, but
 * doctor renders the main checkout's path, and a worktree's own git dir goes away with it.
 */
export const mainVault = (vault) => {
  const common = gitOut(vault, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  const own = gitOut(vault, ['rev-parse', '--path-format=absolute', '--git-dir'])
  const main = own !== common && basename(common) === '.git' ? dirname(common) : vault
  return { vault: main, gitDir: common }
}

const backup = (dir, file) => {
  const dest = join(dir, file.shown.replace(/^skills\//, ''))
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, file.now)
}

/** Write each stale skill file (backing up what it replaces into `gitDir`) · returns the `shown` names written */
export const install = (gitDir, stale) => {
  const dir = join(gitDir, BACKUP_DIR, new Date().toISOString().replace(/[:.]/g, '-'))
  for (const f of stale) {
    if (f.now !== null) backup(dir, f)
    mkdirSync(dirname(f.to), { recursive: true })
    writeFileSync(f.to, f.text)
  }
  return stale.map((f) => f.shown)
}

const label = (f) => `${f.now === null ? 'ไม่มี' : '≠'} ${f.shown}`

const main = async () => {
  const opts = parseArgs(process.argv.slice(2))
  const given = resolve(opts.vault ?? process.env.WAYFINDER_VAULT ?? DEFAULT_VAULT)
  if (!existsSync(join(given, MANIFEST))) throw new InstallError(`${given} ไม่ใช่ vault ที่ติดตั้งแล้ว (ไม่มี ${MANIFEST}) — ใส่ --vault <path>`)
  // git ของ vault ต้องอ่านได้ **ก่อน** วางอะไร — backup อยู่ในนั้น
  const { vault, gitDir } = mainVault(given)
  const repo = gitOut(process.cwd(), ['rev-parse', '--show-toplevel'])
  const from = `${gitOut(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])} @ ${gitOut(repo, ['rev-parse', '--short', 'HEAD'])}`
  const files = await skillFiles({ repo, vault })
  const stale = files.filter((f) => f.now !== f.text)
  console.log(`สกิลจาก ${repo} (${from}) → vault ${vault}`)
  if (stale.length === 0) return console.log(`✅ ${files.length} ไฟล์ตรงกับ template อยู่แล้ว`)
  if (opts.check) {
    console.log(`❌ ${stale.length}/${files.length} ไฟล์ไม่ตรงกับ template:`)
    stale.forEach((f) => console.log(`  ${label(f)}`))
    console.log('   ติดตั้งด้วย npm run install-skills (ใน checkout ของ template ที่จะเอามา)')
    process.exitCode = 1
    return
  }
  const wrote = install(gitDir, stale)
  console.log(`✅ วาง ${wrote.length} ไฟล์ (ของเดิมอยู่ใน <vault>/.git/${BACKUP_DIR}/):`)
  wrote.forEach((f) => console.log(`  → ${f}`))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    if (!(e instanceof InstallError)) throw e
    console.error(`❌ ${e.message}`)
    process.exitCode = 2
  })
}
