#!/usr/bin/env node
// ติดตั้ง / อัปเดต wayfinder vault จาก template repo — idempotent รันซ้ำได้ไม่พัง
//
// เมื่อก่อนไฟล์นี้ประกาศตัวเองว่า *"ไม่มีหน้าที่สร้างไฟล์เนื้อหาใด ๆ"* เพราะสมมติว่าเนื้อ vault
// มากับ git อยู่แล้ว — พอ template repo ไม่ใช่ vault ของใคร สมมติฐานนั้นพังทั้งอัน
// ⇒ ตอนนี้มันเป็นคน copy เนื้อเข้ามาจริง ๆ เรนเดอร์ path ติดตั้งสกิล และจดว่าวางอะไรไว้บ้าง
//
// ── สองโหมด (ตัดสินจาก `.wayfinder-template.json` ที่ราก vault ปลายทาง) ──────────────────
//   install  ยังไม่มี manifest  ถาม 5 ข้อ → วางทั้งชุด → seed Config/Picks/example → เขียน manifest
//   update   มี manifest แล้ว   ทับเฉพาะไฟล์ที่ manifest ครอบ · ลบไฟล์ที่ template เลิกใช้แล้ว
//                               · ไม่แตะอะไรที่ไม่เคยอยู่ใน manifest
//
// ── ของสามชั้น: ทุกไฟล์อยู่ชั้นใดชั้นหนึ่งเท่านั้น ────────────────────────────────────────
//   managed    ของ template — ทับได้เสมอ และถูกลบจริงเมื่อ template เลิกใช้ (อยู่ใน `files`)
//   seed-once  วางตอน install ครั้งเดียว **แล้วไม่แตะอีกเลย** ทั้งไม่ทับ ไม่ลบ ไม่ปลุกคืน
//              = `Wayfinder Config.md` · `Wayfinder Picks.md` · `example-repo/` · ค่าตั้งใน `.obsidian/`
//   unknown    ไม่เคยอยู่ใน manifest ⇒ **ของผู้ใช้** — `_tools/harness-kit/`, `<repo>/<effort>/`
//              ห้ามแตะไม่ว่ากรณีใด · การลบขับด้วย manifest เก่าเท่านั้น ไม่ใช่การ "กวาดของแปลกปลอม"
//
// ใช้:
//   node template/_tools/bootstrap.mjs --plan          ← ขั้น 1-3: ตรวจ → รายงาน → พิมพ์คำถาม 5 ข้อ
//   node template/_tools/bootstrap.mjs --vault ~/Documents/Git/wayfinder-vault \
//        --parts all --on-conflict skip --skills-dir ~/.claude/skills --allow-brew no
//   node template/_tools/bootstrap.mjs --vault ~/Documents/Git/wayfinder-vault --plan   ← update: ดูแผน
//   node template/_tools/bootstrap.mjs --vault ~/Documents/Git/wayfinder-vault --yes    ← update: ลงมือ
//   …คำสั่งไหนก็ได้ + `--plan` = รอบเดิมทุกอย่างโดยตัวเขียนถูกปิด แล้วรายงานว่า *จะ* ทำอะไร
//     (บน vault ที่ติดตั้งแล้ว = dry run ของ update · บนเครื่องเปล่าที่ยังไม่ตอบ 5 ข้อ = คำถาม 5 ข้อ)
//   update ลงมือเฉพาะเมื่อมี `--yes` (ไม่มีทั้งสองธง = แผน แล้วออก code 2) — มัน migrate โน้ตด้วย
//     `wf migrate` และแก้ ~/.claude/settings.json + CLAUDE.md · แผนพิมพ์ diff ของทั้งหมด
//
// `--wire-hook` / `--wire-memory` ยัง opt-in เหมือนเดิม (ใช้กับ vault ที่ติดตั้งอยู่แล้ว)
// — ในโหมด install ทั้งสองชิ้นมาจากคำตอบข้อ 2 (`hook` / `memory`) แทน
// `--help` / `-h` พิมพ์บล็อกนี้แล้วออก · flag ที่ไม่อยู่ในรายชื่อ (ดู lib/bootstrap/args.mjs) = error ก่อนแตะอะไร

// ตัวที่ **เขียน** เข้ามาด้วยชื่อ `fs*` แล้วถูกห่อใหม่ที่เดียวข้างล่าง (จุดเดียวที่ `--plan` ปิดได้)
// ตัวที่อ่านอย่างเดียวเข้ามาตรง ๆ — แยกสองกลุ่มตั้งแต่บรรทัด import เพื่อให้ "จุดที่เขียนได้" นับด้วยตาเปล่าได้
import { readFile, stat, lstat, readlink, realpath, readdir } from 'node:fs/promises'
import {
  writeFile as fsWriteFile, chmod as fsChmod, mkdir as fsMkdir,
  rm as fsRm, rmdir as fsRmdir, copyFile as fsCopyFile,
} from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { join, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { homedir } from 'node:os'
import { settingsShapeError, wireSettings, withWfBlock } from './lib/wiring.mjs'
import { sandboxGrant } from './lib/sandbox.mjs'
import { parseArgs, usage } from './lib/bootstrap/args.mjs'
import { ask, questions } from './lib/bootstrap/questions.mjs'
import { readClaudeFiles, wireClaudeFiles } from './lib/bootstrap/claude.mjs'
import { wireObsidian } from './lib/bootstrap/obsidian.mjs'
import { finishPlan, fingerprint } from './lib/bootstrap/plan-check.mjs'
import { pruneDropped } from './lib/bootstrap/prune.mjs'
import { findRepo, isRepoRoot } from './lib/bootstrap/find-repo.mjs'
import { die, log } from './lib/bootstrap/say.mjs'

const run = promisify(execFile)
const HOME = homedir()
const SELF_DIR = dirname(fileURLToPath(import.meta.url))
const CLAUDE = join(HOME, '.claude')

const MANIFEST = '.wayfinder-template.json'
const DEFAULT_VAULT = join(HOME, 'Documents/Git/wayfinder-vault')
const DEFAULT_SKILLS = join(CLAUDE, 'skills')
const ALL_PARTS = ['skills', 'vault', 'hook', 'obsidian', 'memory']

// ── ชั้น seed-once — เหตุผลติดไว้ทีละข้อ เพราะย้ายไฟล์ผิดชั้น = ลบของผู้ใช้เงียบ ๆ ─────────
//  · `Wayfinder Config.md` / `Wayfinder Picks.md` — ใบ 01 ย้ายค่าที่ผู้ใช้จูนเอง (STALE_DAYS,
//    COLORS, section "🎯 หยิบอันไหนต่อ") มาไว้สองใบนี้ ⇒ manifest ครอบเมื่อไหร่ update ลบโน้ตทิ้ง
//  · `example-repo/` — ship ตอน install เท่านั้น update ไม่ปลุกคืน (ลบแล้วต้องลบขาด)
//  · `.obsidian/` — เป็น "ค่าตั้ง" ของเครื่องเขา ยกเว้นตัวปลั๊กอิน Dataview ที่เป็น "โค้ด"
//    เส้นแบ่งคือ **โค้ดอัปเดตได้ ค่าตั้งอัปเดตไม่ได้**: ทับ `community-plugins.json` เมื่อไหร่
//    ปลั๊กอินอื่นที่เขาเปิดไว้จะถูกปิดเงียบ ๆ · ทับ `graph.json` = สีที่เขาปรับเองหาย
const OBSIDIAN_MANAGED = [
  '.obsidian/plugins/dataview/main.js',
  '.obsidian/plugins/dataview/manifest.json',
  '.obsidian/plugins/dataview/styles.css',
]
const isSeed = (rel) => {
  if (rel === 'Wayfinder Config.md' || rel === 'Wayfinder Picks.md') return true
  if (rel === 'example-repo' || rel.startsWith('example-repo/')) return true
  if (rel.startsWith('.obsidian/')) return !OBSIDIAN_MANAGED.includes(rel)
  return false
}

const SKIP_NAMES = new Set(['.DS_Store', '.git', 'workspace.json', 'workspace-mobile.json'])

// ── helper ──────────────────────────────────────────────────────────────────
const exists = (p) => stat(p).then(() => true, () => false)
const sha = (buf) => createHash('sha256').update(buf).digest('hex')
const expand = (p) => (p.startsWith('~/') ? join(HOME, p.slice(2)) : p)
const readJson = (p) => readFile(p, 'utf8').then(JSON.parse, () => null)
const isText = (buf) => !buf.includes(0)

const walk = async (root, base = root, acc = []) => {
  for (const e of await readdir(root, { withFileTypes: true })) {
    if (SKIP_NAMES.has(e.name)) continue
    const abs = join(root, e.name)
    if (e.isDirectory()) await walk(abs, base, acc)
    else if (e.isFile()) acc.push(relative(base, abs).split(sep).join('/'))
  }
  return acc
}

// ── args ──── รายชื่อ flag ปิดตาย ตรวจ **ก่อนแตะอะไรทั้งนั้น** (เหตุผลอยู่ใน lib/bootstrap/args.mjs) ──
const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) { console.log(await usage(fileURLToPath(import.meta.url))); process.exit(0) }
const { opt, has } = parseArgs(argv)

// ── `--plan` = dry run · **จุดเดียวที่ตัดสินว่าเขียนได้ไหม** ────────────────────────────────
// เมื่อก่อนธงนี้ถูกอ่านที่สาขา `else if (has('plan'))` ซึ่งอยู่ **หลัง** `if (MODE === 'update')`
// ⇒ vault ที่มี manifest แล้วแปลงเป็น update ก่อน แล้ว `--plan` ไม่มีวันถูกอ่าน: รอบที่ตั้งใจให้
// "ดูก่อน" กลับเขียนจริงและ commit จริง — **ตายสนิทตรงที่เดียวที่ dry run มีความหมาย** (ใบ 12)
// ตระกูลเดียวกับ `--on-conflict skip` ของใบ 09 ที่ไม่เคยถูกเรียกใช้จริงสักครั้ง
//
// ทางแก้ไม่ใช่การเติม `if (!PLAN)` ไล่ทีละจุด — จุดที่เขียนจริงมีสิบกว่าจุด (`place()` · ลูปลบ ·
// git init · settings.json · CLAUDE.md · brew · obsidian.json · manifest · commit) **ตกไปจุดเดียว
// = dry run ที่เขียนจริง ซึ่งคือบั๊กเดิมเป๊ะ ๆ** ⇒ ปิดที่ทางออกร่วมแทน: ตัวเขียนของ fs ถูกห่อตรงนี้
// ที่เดียว และคำสั่งที่เปลี่ยนเครื่อง (git/brew) ต้องผ่าน `runWrite` เท่านั้น
// · ข้อ 5p ท้ายไฟล์เฝ้าสมมติฐานนี้อีกชั้น — ถ้าวันหลังมีใครเรียก `fsWriteFile`/`run` ตรง ๆ มันดัง
//
// ตัวห่อถูกประกาศ **หลัง** ตัดสินโหมด (ขั้น 1b) เพราะ update ต้องการ `--yes` ถึงจะลงมือ (Q20): update
// เขียน CLAUDE.md · settings.json · hook ของเครื่องเขา แล้วสั่ง `wf migrate` ซึ่งเขียนโน้ตทั้ง vault —
// ประตูทางเดียว ⇒ update ที่ไม่มีทั้ง `--plan` และ `--yes` = แผนเต็มรอบ แล้วออก code 2 บอกให้เติม `--yes`
// ก่อนหน้านี้ไม่มีอะไรเขียนเลย (ขั้น 1a/1b อ่านอย่างเดียว)

// ── ขั้นที่ 1 — ตรวจ (ยังไม่เขียนอะไร) ──────────────────────────────────────
// 1a. หา template repo (lib/bootstrap/find-repo.mjs)

// 1b. หา vault ปลายทาง
const selfVault = dirname(SELF_DIR)
const vaultArg = has('vault') ? resolve(expand(opt('vault'))) : null
const runningInsideVault = await exists(join(selfVault, MANIFEST))
const VAULT = vaultArg ?? (runningInsideVault ? selfVault : DEFAULT_VAULT)

const oldManifest = await readJson(join(VAULT, MANIFEST))
const MODE = oldManifest ? 'update' : 'install'

// update ที่ไม่ได้ตอบ `--yes` = แผน (เหตุผลที่หัวข้อ `--plan` ข้างบน) · `--plan` ชนะ `--yes` เสมอ
const ASKED_PLAN = has('plan')
const PLAN = ASKED_PLAN || (MODE === 'update' && !has('yes'))
const nop = async () => {}
const writeFile = PLAN ? nop : fsWriteFile
const chmod = PLAN ? nop : fsChmod
const mkdir = PLAN ? nop : fsMkdir
const rm = PLAN ? nop : fsRm
const copyFile = PLAN ? nop : fsCopyFile
// `rmdir` ต้อง **ล้มเหลว** ไม่ใช่เงียบ — คนเรียกอ่านผลลัพธ์เป็น "ลบโฟลเดอร์ว่างได้ไหม" แล้วเดินขึ้นต่อ
// ตอบว่าสำเร็จในโหมด plan = รายงานว่าลบโฟลเดอร์ที่ไม่ได้ลบ
const rmdir = PLAN ? async () => { throw new Error('plan') } : fsRmdir
// คำสั่งที่เปลี่ยนเครื่อง (git init · git add/commit · brew install) — `run` เปล่า ๆ ยังใช้อ่านได้ตามปกติ
const runWrite = PLAN ? async () => ({ stdout: '', stderr: '' }) : run

// คำพูดของ log: โหมด plan พูดว่า "จะ…" ไม่ใช่ "…แล้ว" — บรรทัดเดียวกัน ต่างกันแค่กาล
const MARK = PLAN ? '📋' : '✅'
const WILL = PLAN ? 'จะ' : ''

let REPO = await findRepo({ from: has('from') ? resolve(expand(opt('from'))) : null, selfDir: SELF_DIR })
if (!REPO && oldManifest?.source_repo && await isRepoRoot(oldManifest.source_repo)) REPO = oldManifest.source_repo
if (!REPO) {
  die(`หา template repo ไม่เจอ — สคริปต์นี้ต้องรันจาก <repo>/template/_tools/bootstrap.mjs
   หรือส่ง --from <path ของ repo ที่ clone มา> มาให้ตรง ๆ`)
}
const SRC = join(REPO, 'template')
const SKILLS_SRC = join(REPO, 'skills')

// npm **ตัดไฟล์ชื่อ `.gitignore` ออกจาก tarball เสมอ** (กฎเฉพาะชื่อนี้ — `.obsidian/*` รอด)
// ⇒ ต้นทางเก็บไว้ในชื่อ `_gitignore` แล้วแมปกลับตอนวาง · ไม่งั้น vault ที่ติดตั้งผ่าน `npx`
// เกิดมาโดยไม่มี `.gitignore` แล้ว `autocommit.sh` (`git add -A -uall`) จะลาก
// `.claude/worktrees/` ทั้งชุดเข้า commit — อาการเดียวกับที่ไฟล์นั้นเขียนเตือนตัวเองไว้
// แมปที่ **rel ปลายทาง** ไม่ใช่ต้นทาง ⇒ manifest ของ vault ที่ติดตั้งไปแล้วไม่ต้องย้ายคีย์
const SRC_ALIAS = { '.gitignore': '_gitignore' }
const srcOf = (rel) => SRC_ALIAS[rel] ?? rel
const templateFiles = (await walk(SRC).catch(() => die(`ไม่มี ${SRC}`)))
  .map((rel) => (rel === '_gitignore' ? '.gitignore' : rel))
const skillFiles = await walk(SKILLS_SRC).catch(() => [])
const templateSha = await run('git', ['-C', REPO, 'rev-parse', 'HEAD'])
  .then((r) => r.stdout.trim(), () => null)
// ติดตั้งผ่าน `npx` ไม่มี `.git` ให้อ่าน — npm clone แล้ว pack เหลือแต่ไฟล์ · ไม่มี sha
// **ไม่ได้แปลว่า "ยังไม่ได้ commit"** ซึ่งเป็นคำที่ผิดความจริง ⇒ ถอยไปใช้ version ใน package.json
const templateVersion = templateSha ? null
  : await readFile(join(REPO, 'package.json'), 'utf8').then((t) => JSON.parse(t).version, () => null)
const templateLabel = templateSha ? templateSha.slice(0, 8)
  : templateVersion ? `v${templateVersion} · npx` : 'ไม่ทราบรุ่น'

// 1c. สภาพเครื่อง
const env = {
  darwin: process.platform === 'darwin',
  node: process.version,
  obsidianApp: await exists('/Applications/Obsidian.app'),
  obsidianRunning: await run('pgrep', ['-x', 'Obsidian']).then(() => true, () => false),
  brew: await run('brew', ['--version']).then(() => true, () => false),
  vaultExists: await exists(VAULT),
  vaultIsRepo: await run('git', ['-C', VAULT, 'rev-parse', '--git-dir']).then(() => true, () => false),
  claudeMd: await readFile(join(CLAUDE, 'CLAUDE.md'), 'utf8').catch(() => ''),
  settings: await readJson(join(CLAUDE, 'settings.json')).catch(() => null),   // หลวม ๆ เพื่อรายงาน · ขั้น 3b อ่านจริง
  // `/wayfinder` เป็นของปลั๊กอิน `mattpocock-skills` — template ไม่ ship สกิลนี้เองแล้ว (เคย fork ไว้
  // แต่ fork ไม่มีอะไรเกี่ยวกับ vault เลย เป็นแค่ upstream รุ่นเก่าที่ตามไม่ทัน) ⇒ เป็น prerequisite
  wayfinderPlugin: Object.keys((await readJson(join(CLAUDE, 'plugins/installed_plugins.json')))?.plugins ?? {})
    .some((k) => k.startsWith('mattpocock-skills@')),
}
// สถานะสำหรับรายงาน — คำนวณด้วยฟังก์ชันเดียวกับที่ขั้น 4f/4g ใช้เขียน ⇒ รายงานกับการกระทำไม่มีทางเห็นต่างกัน
const VAULT_REAL = await realpath(VAULT).catch(() => VAULT)
const pastVaults = [VAULT, oldManifest?.vault, oldManifest?.vault_as_given]
// settings.json ที่รูปไม่ตรงกับที่ Claude Code อ่าน = รายงานว่าแก้ไม่ได้ (ขั้น 3b หยุดให้) ไม่ใช่ crash ตั้งแต่รายงาน
const hookChanges = settingsShapeError(env.settings) ? null : wireSettings(env.settings, { vault: VAULT_REAL, vaults: pastVaults, home: HOME }).changes
const memoryStatus = withWfBlock(env.claudeMd, VAULT_REAL).status

// ── ขั้นที่ 2 — รายงานก่อนแตะอะไร ───────────────────────────────────────────
const report = () => {
  log(`
── สถานะปัจจุบัน ────────────────────────────────────────────`)
  log(`  template repo   ${REPO} (${templateLabel})`)
  log(`  ไฟล์ใน template ${templateFiles.length} ตัว · สกิล ${skillFiles.length} ไฟล์`)
  log(`  vault ปลายทาง   ${VAULT}  →  โหมด ${MODE.toUpperCase()}`)
  log(`  vault มีอยู่แล้ว  ${env.vaultExists ? 'มี' : 'ยังไม่มี'}${env.vaultIsRepo ? ' · เป็น git repo' : ''}`)
  log(`  Obsidian        ${env.obsidianApp ? 'ลงแล้ว' : 'ยังไม่ลง'}${env.obsidianRunning ? ' · ⚠️ เปิดค้างอยู่' : ''}`)
  log(`  hook + สิทธิ์ wf  ${hookChanges === null ? '⚠️ settings.json รูปไม่ตรง — ส่วน hook จะหยุดก่อนเขียน' : hookChanges.length ? `ต้องแก้ ${hookChanges.length} จุด (guard · autocommit · allow rule)` : 'ต่อไว้ครบแล้ว'}`)
  log(`  /wayfinder      ${env.wayfinderPlugin ? 'ปลั๊กอิน mattpocock-skills ลงแล้ว'
    : '⚠️ ไม่เจอปลั๊กอิน mattpocock-skills — ลงก่อนใช้ (INSTALL § What you need) · ลงทางอื่นแล้วข้ามได้'}`)
  log(`  ~/.claude/CLAUDE.md  ${memoryStatus === 'current' ? 'มีย่อหน้า wf รุ่นปัจจุบันแล้ว'
    : memoryStatus === 'replaced' ? '⚠️ มีย่อหน้ารุ่นเก่า — ส่วน memory จะแทนที่ให้ตรงที่เดิม'
    : 'ยังไม่มีย่อหน้า'}`)
  if (!env.darwin) log(`  ⚠️  ไม่ใช่ macOS — ข้อ Obsidian/brew ใช้ไม่ได้`)
}

// ── ขั้นที่ 3 — คำถาม 5 ข้อ (ข้อความกับตัวถามอยู่ใน lib/bootstrap/questions.mjs) ───────────────
// สคริปต์ **ไม่เดาคำตอบให้** — install ที่ไม่มีคำตอบมาทาง flag และ stdin ไม่ใช่ TTY (= agent รัน)
// พิมพ์คำถามแล้วออก code 2 ให้ agent ถามเจ้าของเครื่องทีละข้อ
const QUESTIONS = questions({ defaultVault: DEFAULT_VAULT, defaultSkills: DEFAULT_SKILLS })

let answers
if (MODE === 'update') {
  // map ข้อ 3: update ทับทั้งชุด **ไม่ต้องถาม** — คำตอบเดิมอยู่ใน manifest แล้ว
  answers = {
    vault: VAULT,
    parts: (oldManifest.parts ?? ALL_PARTS).join(','),
    onConflict: 'overwrite',
    skillsDir: oldManifest.skills_dir ?? DEFAULT_SKILLS,
    allowBrew: 'no',
  }
} else if (has('parts') || has('yes')) {
  // `--parts` / `--yes` คือสัญญาณว่า **ถาม 5 ข้อมาแล้ว** — `--vault` เดี่ยว ๆ ตอบแค่ข้อ 1
  // ไม่ใช่ใบอนุญาตให้เดาอีกสี่ข้อที่เหลือ
  answers = {
    vault: VAULT,
    parts: opt('parts') ?? 'all',
    onConflict: opt('on-conflict') ?? 'skip',
    skillsDir: resolve(expand(opt('skills-dir') ?? DEFAULT_SKILLS)),
    allowBrew: opt('allow-brew') ?? null,
  }
} else if (PLAN) {
  // install ที่ยังไม่มีคำตอบ 5 ข้อ: **แผนของ install คือคำถาม** ไม่ใช่รายการไฟล์ — ยังไม่รู้ vault
  // path, parts, หรือคำตอบข้อ 3 ก็คำนวณไม่ได้ว่าจะแตะอะไร ⇒ พฤติกรรมเดิมทุกอย่าง (report + คำถาม
  // + exit 0 + ไม่สร้างแม้แต่โฟลเดอร์ vault) · สาขานี้ย้ายลงมาอยู่ **หลัง** `--parts`/`--yes` แล้ว
  // ⇒ `--plan --parts …` บนเครื่องเปล่ากลายเป็น dry run ของ install เต็มรูปแบบ ไม่ใช่คำถามซ้ำ
  report(); log(QUESTIONS); process.exit(0)
} else if (process.stdin.isTTY) {
  report(); log(QUESTIONS)
  answers = await ask({ defaultVault: DEFAULT_VAULT, defaultSkills: DEFAULT_SKILLS, allParts: ALL_PARTS, toPath: (p) => resolve(expand(p)) })
} else {
  report(); log(QUESTIONS)
  console.error(`❌ ยังไม่มีคำตอบ 5 ข้อ — ถามเจ้าของเครื่องทีละข้อก่อน แล้วรันใหม่พร้อม --parts …
   (--yes = เขาตอบว่าเอาค่าเริ่มต้นทุกข้อ · --vault เดี่ยว ๆ ตอบแค่ข้อ 1 ไม่นับว่าตอบครบ)`)
  process.exit(2)
}

const parts = new Set(
  answers.parts === 'all' ? ALL_PARTS
  : answers.parts === 'none' ? []
  : answers.parts.split(',').map((s) => s.trim()).filter(Boolean)
)
for (const p of parts) if (!ALL_PARTS.includes(p)) die(`ไม่รู้จักชิ้น "${p}" — เลือกจาก ${ALL_PARTS.join(', ')}`)
// ── ขั้นที่ 3b — อ่านไฟล์ของ Claude Code ที่จะเขียน **ก่อนเขียนอะไรทั้งนั้น** (lib/bootstrap/claude.mjs) ──
// อ่านไม่ออก = หยุดตรงนี้ · ขั้น 4f/4g อ่านซ้ำอีกรอบก่อนเขียน (ระหว่างนั้น Claude Code เขียนไฟล์ได้)
const SETTINGS = join(CLAUDE, 'settings.json')
const CLAUDE_MD = join(CLAUDE, 'CLAUDE.md')
const WIRE_HOOK = parts.has('hook') || has('wire-hook')
const WIRE_MEMORY = parts.has('memory') || has('wire-memory')
const claudeSeen = await readClaudeFiles({ settingsPath: SETTINGS, claudeMdPath: CLAUDE_MD, wireHook: WIRE_HOOK, wireMemory: WIRE_MEMORY })


// path ของ vault ต้องเป็น path ที่ **resolve symlink แล้ว** ก่อนเอาไปเรนเดอร์ที่ไหนก็ตาม
// `import.meta.url` ของ ESM ผ่าน realpath เสมอ ⇒ `doctor.mjs`/`autocommit.sh` มองเห็นตัวเองเป็น
// path จริงเสมอ · ถ้า installer จด path ที่ยังมี symlink คั่นลง settings.json แทน มันจะเทียบกับ
// ตัวเองไม่ตรง ⇒ hook "ต่อแล้วแต่ doctor บอกว่ายังไม่ต่อ" และ `WT_PREFIX` ไม่ match — เงียบทั้งคู่
const TARGET_RAW = answers.vault
if (parts.has('vault') || parts.has('obsidian')) await mkdir(TARGET_RAW, { recursive: true })
const TARGET = await realpath(TARGET_RAW).catch(() => TARGET_RAW)
const SKILLS_DIR = answers.skillsDir
const CONFLICT = answers.onConflict

// ข้อ 4 ไม่มีค่าเริ่มต้น — ถ้ายังจำเป็นแล้วยังไม่ตอบ ห้ามเดา
const needBrew = parts.has('obsidian') && !env.obsidianApp
if (MODE === 'install' && needBrew && answers.allowBrew == null) {
  die('ข้อ 4 (brew install --cask obsidian) ไม่มีค่าเริ่มต้น — ต้องได้คำตอบก่อน (--allow-brew yes|no)', 2)
}
// ── ขั้นที่ 3c — แผนของ `wf migrate` (update เท่านั้น · Q20) ────────────────────────────
// คำนวณ **ในโปรเซสนี้** ด้วย lib ของ template ต้นทาง (SRC) ไม่ใช่สั่ง `wf` ของ vault: ตอนวางแผน
// `_tools/` ของ vault ยังเป็นรุ่นเก่า (0.4.x ไม่มี `wf` เลย) และ `wf` หา vault จาก path ของตัวเองเท่านั้น
// ⇒ diff ที่โชว์มาจากโค้ดเดียวกับ `wf migrate --yes` ที่ขั้น 4j รันหลังวาง `_tools/` ใหม่ลง vault แล้ว
// แผนล้ม (เช่นโน้ตที่ไม่มี frontmatter) = หยุด **ก่อนเขียนอะไรทั้งนั้น** ไม่ว่า `--plan` หรือ `--yes`
const importSrc = (rel) => import(pathToFileURL(join(SRC, '_tools', rel)).href)
const { SCHEMA_VERSION } = await importSrc('lib/core.mjs')
// ก่อน install ยังไม่มี manifest ⇒ ให้แผนเห็นเป็น `{}` (แผนของ manifest ถูกตัดทิ้งที่ install อยู่แล้ว)
const planMigrate = async () => {
  const [{ readVault, readText }, { default: migrate }] =
    await Promise.all([importSrc('lib/store.mjs'), importSrc('lib/verbs/migrate.mjs')])
  const { notes } = readVault(TARGET)
  const textOf = (path) => readText(TARGET, path) ?? (path === MANIFEST ? '{}' : null)
  return migrate.run({ notes, textOf }).data
}
const planError = (e) => [e.message, ...(e.details ?? [])].join('\n   ')
// schema ที่ใหม่กว่าที่ template นี้รู้จัก = template ตัวนี้เก่ากว่า vault ⇒ อย่าวาง `_tools/` รุ่นเก่าทับ
const vaultSchemaNow = oldManifest?.vault_schema ?? 1
if (MODE === 'update' && vaultSchemaNow > SCHEMA_VERSION)
  die(`vault นี้อยู่ที่ schema ${vaultSchemaNow} ใหม่กว่าที่ template นี้รู้จัก (${SCHEMA_VERSION}) — อัปเดต template repo ก่อน · ยังไม่มีอะไรถูกเขียน`, 2)
const migration = MODE === 'update'
  ? await planMigrate().catch((e) => die(`วางแผน wf migrate ไม่ได้ — ยังไม่มีอะไรถูกเขียน\n   ${planError(e)}`, 2))
  : { files: [], diff: '' }
// install ลงโฟลเดอร์ที่มีของอยู่ก่อน (effort · Config/Picks เก่าที่คำตอบข้อ 3 ข้ามไว้): จด schema ปัจจุบันลง
// manifest **เฉพาะเมื่อของเดิมไม่มีอะไรต้อง migrate** · ไม่งั้นปล่อยว่าง (= 1) ให้ update รอบถัดไป migrate ให้
// วางแผนไม่ได้ (เช่นโน้ตไม่มี frontmatter) ก็นับว่าต้อง migrate — update จะหยุดแล้วบอกชื่อไฟล์เอง
const installNeedsMigrate = MODE === 'install' && await exists(TARGET)
  ? await planMigrate().then((m) => m.files.some((path) => path !== MANIFEST), () => true)
  : false

// ── ขั้นที่ 4 — ลงมือ ────────────────────────────────────────────────────────
report()

// ลายนิ้วมือ "ก่อน" ของทุกอย่างที่ตัวเขียนของสคริปต์นี้เอื้อมถึง — เก็บก่อนขั้น 4 เทียบท้ายไฟล์ (ข้อ 5p)
// **จำกัดที่ของที่ manifest/template ครอบเท่านั้น** ไม่ใช่กวาดทั้ง vault: effort ของผู้ใช้เปลี่ยนได้
// ตลอดเวลาจาก session อื่น (hook `autocommit.sh` commit ทุก Write/Edit) ⇒ กวาดกว้างไป = เตือนหมาป่า
const skillDest = (rel) => {
  const name = rel.split('/')[0]
  const base = oldManifest?.skills_targets?.[name] ?? join(answers.skillsDir, name)
  return join(base, rel.slice(name.length + 1))
}
// ไฟล์นอก vault นับ `.bak` ของมันด้วย — ตัวเขียนเอื้อมถึงทั้งคู่
const OUTSIDE = [['~/.claude/settings.json', join(CLAUDE, 'settings.json')], ['~/.claude/CLAUDE.md', join(CLAUDE, 'CLAUDE.md')],
  ['obsidian.json', join(HOME, 'Library/Application Support/obsidian/obsidian.json')]]
const watched = () => {
  const vaultRels = new Set([MANIFEST, ...templateFiles, ...migration.files,
    ...Object.keys(oldManifest?.files ?? {}), ...Object.keys(oldManifest?.seeded_once ?? {})])
  const skillRels = new Set([...skillFiles, ...Object.keys(oldManifest?.skills ?? {})])
  return [
    ...[...vaultRels].sort().map((rel) => [`vault/${rel}`, join(TARGET, rel)]),
    ...[...skillRels].sort().map((rel) => [`skills/${rel}`, skillDest(rel)]),
    ...OUTSIDE.flatMap(([key, abs]) => [[key, abs], [`${key}.bak`, `${abs}.bak`]]),
  ]
}
const fingerprintNow = () => fingerprint(watched(), { vault: TARGET, run })
const before = PLAN ? await fingerprintNow() : null

log(`
── ${PLAN ? 'แผน — dry run ไม่เขียนอะไรเลยสักไบต์' : 'ลงมือ'} ────────────────────────────────────`)
if (PLAN) log(`  ทุกบรรทัดข้างล่างคือสิ่งที่ ${MODE.toUpperCase()} **จะ** ทำถ้ารันจริง — ยังไม่มีอะไรถูกแตะ`)
log(`  ชิ้นที่เลือก: ${[...parts].join(' · ') || '(ไม่มี)'}`)
if (TARGET !== TARGET_RAW) log(`  ↪️  vault path มี symlink คั่น — ใช้ path จริง ${TARGET}`)

const partOf = (rel) => (rel.startsWith('.obsidian/') ? 'obsidian' : 'vault')
const wanted = templateFiles.filter((rel) => parts.has(partOf(rel)))

// ── 4a. เรนเดอร์ `__VAULT__` ─────────────────────────────────────────────────
// สองสูตร ไม่ใช่สูตรเดียว — เอาผิดสูตรแล้วพังคนละแบบ:
//   · `_tools/autocommit.sh` → แทน **ทั้งบรรทัด** `^VAULT=` เท่านั้น
//     แทนแบบโทเคนทั่วไฟล์จะไปโดนคอมเมนต์ที่อธิบาย placeholder และบรรทัด fallback
//     `[ -d "$VAULT/.git" ] || VAULT="$HOME/…"` ซึ่งเป็นกันชนของ render ที่ล้มเหลว — ต้องรอด
//   · ไฟล์อื่น → แทนโทเคน `__VAULT__` ตรง ๆ (ในไฟล์สกิลรับ `<VAULT>` ด้วย ตามภาคผนวก J)
// placeholder ที่ค้างไม่ได้ทำให้ error — hook `exit 0` เงียบสนิท ไม่มี output ให้ `2>/dev/null`
// กลืนด้วยซ้ำ ⇒ ต้องกวาดตรวจหลังเขียน ไม่ใช่เชื่อว่า sed ทำงานแล้ว
const AUTOCOMMIT = '_tools/autocommit.sh'

// สคริปต์ที่ **พูดถึง** โทเคน ไม่ใช่ **ใช้** โทเคน — แทนโทเคนในนี้ = ทำลายกลไกทิ้ง
// เคสจริงที่เจอตอนเขียนใบนี้: `bootstrap.mjs` มีบรรทัด `text.split('__VAULT__')` อยู่ในตัวเอง
// ⇒ install เรนเดอร์ตัวเองไปด้วย ⇒ สำเนาที่อยู่ใน vault กลายเป็น `text.split('<path ของ vault>')`
// ⇒ **update รอบถัดไปหยุดเรนเดอร์ทุกไฟล์เงียบ ๆ** และตัวกวาดตรวจก็มองไม่เห็น เพราะมันเทียบ
// ผลลัพธ์ ไม่ได้เทียบว่าโค้ดที่ทำงานอยู่ยังเป็นตัวเดิมไหม
const RENDER_EXEMPT = new Set([AUTOCOMMIT, '_tools/bootstrap.mjs', '_tools/doctor.mjs'])

// สูตรที่สาม — โทเคน **วันที่** ที่เรนเดอร์เฉพาะชั้น seed-once (ใบ 11)
// `example-repo/` เคย hardcode `status_since: 2026-09-05` ⇒ ใครติดตั้งช้ากว่า `stale_days` (14)
// เห็น effort ตัวอย่างตกจาก `🔥 กำลังเดิน` ไป `⚠️ ต้องตัดสินใจ` พร้อมข้อความ "ประกาศ active แต่ไม่มี
// ใบไหนขยับ N วัน → paused" **ตั้งแต่วินาทีแรกที่ติดตั้งเสร็จ** — ตัวอย่างมีไว้ให้ "ว่างกับพังแยกออกจากกัน"
// แล้วกลายเป็น "สดกับเน่าแยกไม่ออก" แทน (ใบ 06 เจอแล้วบันทึกไว้ ไม่ได้แก้)
// `doctor.mjs` (ผ่าน `lint()` ของ core) ขึ้นแค่ ⚠️ ไม่ใช่ ❌ ⇒ ไม่มีอะไรแดงให้ใครสะดุด
//
// **ทำไมไม่ขยับ `stale_days` แทน** — เส้นนั้นคุม effort จริงของผู้ใช้ด้วย ขยับเมื่อไหร่ก็ไปกลบสัญญาณ
// ที่เขาต้องการจริง เพื่อแก้ปัญหาของไฟล์ตัวอย่างสี่ไฟล์
//
// **ทำไมเฉพาะ seed-once ไม่ใช่ทุกไฟล์อย่าง `__VAULT__`** — สองโทเคนนี้อายุไม่เท่ากัน: path ของ vault
// จริงตลอดอายุ vault ส่วนวันที่จริงแค่วินาทีที่เขียน · ไฟล์ managed ถูกเรนเดอร์ใหม่ทุกครั้งที่ update
// ⇒ โทเคนวันที่ที่หลุดไปอยู่ในนั้นทำให้เนื้อไฟล์เปลี่ยน**ทุกวัน**ทั้งที่ไม่มีของใหม่ ⇒ `updated_at`
// ขยับทุกรอบ แล้วคำถาม "มีของใหม่ไหม" ที่ `flat(oldManifest) !== flat(manifest)` ถามไว้ ตอบว่า "มี"
// ตลอดกาล · จำกัดที่ seed-once แล้วโทเคนมีความหมายเดียวคือ **"วันที่ vault นี้ถูก seed"**
// และเคสนั้นเกิดไม่ได้เชิงโครงสร้าง — ข้อ 5a ข้างล่างบังคับกฎนี้ ไม่ได้ฝากไว้กับความระวังของคนแก้
const DATE_TOKEN = '__TODAY__'

// เวลา **ท้องถิ่น** ไม่ใช่ `toISOString()` ซึ่งเป็น UTC — ในโซนที่ offset ติดลบ UTC เป็นวันพรุ่งนี้
// ของผู้ใช้ได้ ⇒ `Wayfinder Efforts` คิด `daysAgo()` ออกมาเป็น -1 วัน · ฝั่ง Dataview เทียบกับ
// `DateTime.now()` ที่เป็นเวลาท้องถิ่น สองฝั่งจึงต้องใช้ปฏิทินเดียวกัน
const TODAY = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

const renderVault = (rel, text, isSkill = false) => {
  // `autocommit.sh` แทน **ทั้งบรรทัด** อย่างเดียว — บรรทัด fallback ข้างล่างต้องรอด
  if (rel === AUTOCOMMIT) return text.replace(/^VAULT=.*$/m, `VAULT="${TARGET}"`)
  if (RENDER_EXEMPT.has(rel)) return text
  let out = text.split('__VAULT__').join(TARGET)
  if (isSeed(rel)) out = out.split(DATE_TOKEN).join(TODAY)   // seed-once เท่านั้น — เหตุผลข้างบน
  return isSkill ? out.split('<VAULT>').join(TARGET) : out
}

// ── 4b. copy ────────────────────────────────────────────────────────────────
const files = {}          // managed: rel → sha ของไฟล์ที่เขียนลงไปจริง
const seeded = {}         // seed-once: rel → sha ตอน install (update ไม่แตะ)
const rendered = []
const stats = { written: 0, skipped: 0, seeded: 0, keptSeed: 0, localEdits: [], replaced: [], created: [], overwritten: [] }

// คำตอบข้อ 3 ตัดสินชะตาของ **เอกสาร** ไม่ใช่ของ **โปรแกรม** (ใบ 09)
// เจอตอน dogfood: install ลง vault ที่มีอยู่ก่อนแล้วด้วยค่าเริ่มต้น `skip` เขียนได้ **ไฟล์เดียว**
// (`example-repo/.gitkeep`) — `_tools/` ยังรุ่นเก่า · สกิลยังรุ่นเก่า · `autocommit.sh` ยังเป็น
// `VAULT="__VAULT__"` ที่ไม่ถูกเรนเดอร์ ⇒ installer ประกาศว่าตัวเองไม่ผ่าน แล้วผู้ใช้ไม่มีทาง
// เดินต่อนอกจากก็อบเอง = ค่าเริ่มต้นที่พังสำหรับทุกคนที่มี vault อยู่ก่อน (ซึ่งคือทุกคนที่ย้ายมา)
//   · `_tools/*` คือตัวที่รัน update รอบหน้า — ค้างรุ่นเก่าเมื่อไหร่ vault หยุด converge เงียบ ๆ
//     ตระกูลเดียวกับบั๊ก `RENDER_EXEMPT` ของใบ 03 พอดี
//   · สกิลเป็นสำเนาไบต์ต่อไบต์ตามกติกาข้อ 4 ของ `INSTALL.md` — ไม่มี "ฉบับของผู้ใช้" ให้รักษา
//   · เอกสาร (`README` `SETUP` สามหน้า) ต่างกันได้จริง และ update รอบแรกทับให้เองอยู่แล้ว
//     ⇒ ปล่อยให้ `skip` คุ้มครองต่อ — และเป็นกันชนถ้า `--vault` ชี้ผิดที่ จะได้ไม่ทับ `README.md`
//     ของโฟลเดอร์อื่นทิ้ง
const mustWrite = (rel, isSkill) => isSkill || rel.startsWith('_tools/')

const place = async (src, dest, rel, { isSkill = false, seed = false } = {}) => {
  const raw = await readFile(src)
  let buf = raw
  if (isText(raw)) {
    const text = raw.toString('utf8')
    const out = renderVault(rel, text, isSkill)
    if (out !== text) { buf = Buffer.from(out, 'utf8'); rendered.push(rel) }
  }
  const digest = sha(buf)
  const already = await readFile(dest).then((b) => sha(b), () => null)

  if (already === digest) { stats.skipped++; return digest }
  if (already !== null) {
    // ของเดิมอยู่ตรงนั้นแล้วและเนื้อไม่ตรง — ตัดสินตามคำตอบข้อ 3 (install) หรือทับ (update)
    const must = mustWrite(rel, isSkill)
    if (CONFLICT === 'skip' && !must) { stats.skipped++; return already }
    if (CONFLICT === 'backup') await copyFile(dest, `${dest}.bak`)
    // update: ทับตรง ๆ ตามข้อ 3 ของ map (all-or-nothing) แต่จดไว้ว่าเขาเคยแก้ ⇒ กู้จาก git ได้
    if (CONFLICT === 'overwrite') {
      const prev = isSkill ? oldManifest?.skills?.[rel]
        : seed ? oldManifest?.seeded_once?.[rel]
        : oldManifest?.files?.[rel]
      if (prev !== already) stats.localEdits.push(rel)
    } else if (must) {
      // ทับทั้งที่เขาตอบ skip — ต้องพูดออกมาทีละไฟล์ (กติกาข้อ 5 ของ INSTALL: ห้ามทับเงียบ ๆ)
      stats.replaced.push(isSkill ? `skills/${rel}` : rel)
    }
  }
  ;(already === null ? stats.created : stats.overwritten).push(isSkill ? `skills/${rel}` : rel)
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, buf)
  if (rel.endsWith('.sh')) await chmod(dest, 0o755)
  stats.written++
  return digest
}

// ข้อ 9 ของ map: ship `example-repo/` **ตอน install เท่านั้น** เพื่อให้ Dashboard ไม่ว่างวันแรก
// — แต่ vault ที่ย้ายมาจากของเดิมมี effort จริงอยู่แล้ว การหย่อน effort ตัวอย่างลงไปคือการเพิ่ม
// แถวปลอมเข้า Frontier ที่เจ้าของต้องมาลบเอง (ใบ 09 ข้อ 4) · ข้ามแล้ว **ไม่ลง `seeded_once`**
// ⇒ update ไม่ปลุกคืน ตรงตามกฎ "ลบแล้วต้องลบขาด" ของข้อ 9
const vaultHasRealEfforts = async () => {
  for (const e of await readdir(TARGET, { withFileTypes: true }).catch(() => [])) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_') || e.name === 'example-repo') continue
    for (const f of await readdir(join(TARGET, e.name), { withFileTypes: true }).catch(() => []))
      if (f.isDirectory() && await exists(join(TARGET, e.name, f.name, 'map.md'))) return true
  }
  return false
}
const skipExample = MODE === 'install' && await vaultHasRealEfforts()
if (skipExample) log('  ↪️  vault มี effort จริงอยู่แล้ว — ข้าม example-repo/ (ข้อ 9: seed ครั้งเดียว ไม่ปลุกคืน)')
if (installNeedsMigrate)
  log('  ↪️  ของเดิมใน vault ยังเป็น schema เก่า — ต่อด้วย update: --plan ดู diff ของ wf migrate แล้ว --yes')

for (const rel of wanted) {
  if (skipExample && (rel === 'example-repo' || rel.startsWith('example-repo/'))) continue
  const dest = join(TARGET, rel)
  if (isSeed(rel)) {
    // seed-once: install วางให้ · update **ไม่แตะเลย** ทั้งที่ยังอยู่และที่เขาลบไปแล้ว
    if (MODE === 'update') {
      const carried = oldManifest.seeded_once?.[rel]
      if (carried) { seeded[rel] = carried; stats.keptSeed++ }
      continue
    }
    seeded[rel] = await place(join(SRC, srcOf(rel)), dest, rel, { seed: true })
    stats.seeded++
  } else {
    files[rel] = await place(join(SRC, srcOf(rel)), dest, rel)
  }
}
// update: ชิ้นที่คราวนี้ไม่ได้เลือก (หรือ part หายไป) ยังต้องอยู่ใน manifest ไม่งั้นจะโดนลบ
if (MODE === 'update') {
  for (const [rel, digest] of Object.entries(oldManifest.files ?? {}))
    if (!(rel in files) && !parts.has(partOf(rel))) files[rel] = digest
  for (const [rel, digest] of Object.entries(oldManifest.seeded_once ?? {}))
    if (!(rel in seeded)) seeded[rel] = digest
}

log(`  ${MARK} ไฟล์ template  ${WILL}เขียน ${stats.written}` +
    ` (ใหม่ ${stats.created.length} · ทับของเดิม ${stats.overwritten.length})` +
    ` · เหมือนเดิม/ข้าม ${stats.skipped}` +
    (stats.seeded ? ` · ${WILL}seed ${stats.seeded}` : '') + (stats.keptSeed ? ` · ไม่แตะ seed ${stats.keptSeed}` : ''))
if (PLAN && stats.created.length) log(`     ใหม่:  ${stats.created.join(' · ')}`)
if (PLAN && stats.overwritten.length) log(`     ทับ:   ${stats.overwritten.join(' · ')}`)

// ── 4c. สกิล — เดินตาม symlink ไปทับปลายทาง ─────────────────────────────────
const skillTargets = { ...(oldManifest?.skills_targets ?? {}) }
const skills = {}
if (parts.has('skills') && skillFiles.length) {
  const dirFor = async (name) => {
    if (skillTargets[name] && await exists(skillTargets[name])) return skillTargets[name]
    const p = join(SKILLS_DIR, name)
    const st = await lstat(p).catch(() => null)
    if (st?.isSymbolicLink()) {
      const real = await realpath(p).catch(async () => resolve(SKILLS_DIR, await readlink(p)))
      log(`  ↪️  ${name} เป็น symlink → ทับที่ ${real}`)
      return real
    }
    return p
  }
  const cache = new Map()
  for (const rel of skillFiles) {
    const name = rel.split('/')[0]
    if (!cache.has(name)) cache.set(name, await dirFor(name))
    skillTargets[name] = cache.get(name)
    const dest = join(cache.get(name), rel.slice(name.length + 1))
    skills[rel] = await place(join(SKILLS_SRC, rel), dest, rel, { isSkill: true })
  }
  log(`  ${MARK} ${WILL}วางสกิล ${cache.size} ตัว → ${SKILLS_DIR}`)
} else if (MODE === 'update') {
  Object.assign(skills, oldManifest.skills ?? {})
}

if (stats.replaced.length)
  log(`  ⚠️  ทับของเดิม ${stats.replaced.length} ตัว ทั้งที่ตอบข้อ 3 ว่า "${CONFLICT}" — โปรแกรม
     (\`_tools/\` + สกิล) ไม่ขึ้นกับคำตอบข้อนั้น ไม่งั้น vault จะค้างรุ่นเก่าโดยไม่มีอะไรเตือน
     ${stats.replaced.join(' · ')}
     ของใน vault กู้ได้ที่ git log -p -- <ไฟล์> · สกิลอยู่นอก git ⇒ ใช้ --on-conflict backup ถ้าต้องเก็บ`)

// ── 4d. ลบไฟล์ที่ template เลิกใช้แล้ว — ขับด้วย manifest เก่าเท่านั้น (lib/bootstrap/prune.mjs) ──────────
const dropped = []
if (MODE === 'update') {
  const pruned = await pruneDropped({ oldManifest, files, skills, skillTargets, vault: TARGET, isSeed, io: { rm, rmdir } })
  dropped.push(...pruned.dropped)
  const { keptSkills } = pruned
  if (dropped.length) log(`  🗑  ${WILL}ลบไฟล์ที่ template เลิกใช้ ${dropped.length} ตัว: ${dropped.join(' · ')}`)
  if (keptSkills.length)
    log(`  ↪️  ไม่ลบสกิลที่ template เลิก ship แต่เนื้อไม่ตรงกับที่เคยวาง (คุณแก้หรือลงทับเอง) ${keptSkills.length} ตัว
     เลิกติดตามใน manifest แล้ว ไม่ต้องการก็ลบเอง: ${keptSkills.join(' · ')}`)
  if (stats.localEdits.length)
    log(`  ⚠️  ${WILL}ทับไฟล์ที่คุณเคยแก้ไว้ ${stats.localEdits.length} ตัว (กู้ได้: git log -p -- <ไฟล์>)\n     ${stats.localEdits.join(' · ')}`)
}

// ── 4d2. แผนของ wf migrate (ลงมือจริงที่ขั้น 4j — หลัง commit ของ update) ─────────────────
if (MODE === 'update') {
  if (migration.files.length) {
    log(`  ${MARK} ${WILL}wf migrate → vault schema ${SCHEMA_VERSION}: ${migration.files.length} ไฟล์ (diff ทั้งหมดข้างล่าง · commit แยกของมันเอง)`)
    log(`\n${migration.diff.trimEnd()}\n`)
  } else log(`  ✅ wf migrate: vault อยู่ที่ schema ${SCHEMA_VERSION} แล้ว (ข้าม)`)
}

// ของที่ขั้น 4e–4h จะเปลี่ยน (นอกไฟล์ template) — สรุปแผนใช้ตอบ "รันซ้ำแล้วไม่มีอะไรเปลี่ยน" ได้ตรง
const otherChanges = []
// ข้อที่ล้ม — ขั้น 4f/4g นับด้วย (ไฟล์ที่ถูกแก้ระหว่างรอบจนอ่านไม่ออก) · ขั้นที่ 5 ตรวจเพิ่มแล้วสรุปที่ท้ายไฟล์
let bad = 0
const verify = (ok, label, detail = '') => { if (!ok) bad++; log(`  ${ok ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`) }

// ── 4e. git ─────────────────────────────────────────────────────────────────
if (parts.has('vault')) {
  await chmod(join(TARGET, AUTOCOMMIT), 0o755).catch(() => {})
  if (!(await run('git', ['-C', TARGET, 'rev-parse', '--git-dir']).then(() => true, () => false))) {
    otherChanges.push('git init')
    await runWrite('git', ['-C', TARGET, 'init', '-q', '-b', 'main'])
    log(`  ${MARK} ${WILL}git init (vault เป็น local อย่างเดียว ไม่มี remote โดยตั้งใจ)`)
  }
}

// ── 4f/4g. hook + allow rule ของ wf ใน settings.json · ย่อหน้าของ wf ใน CLAUDE.md (lib/bootstrap/claude.mjs) ──
// git ของ vault กู้สองไฟล์นี้ให้ไม่ได้ ⇒ แผนโชว์ diff ทุกบรรทัด · อ่านซ้ำก่อนเขียน · `.bak` ครั้งแรกไม่ถูกทับ
const io = { readFile, writeFile, copyFile, mkdir }
{
  const wiring = { vault: TARGET, vaults: [TARGET_RAW, ...pastVaults], home: HOME }
  const r = await wireClaudeFiles({ claudeDir: CLAUDE, settingsPath: SETTINGS, claudeMdPath: CLAUDE_MD, seen: claudeSeen,
    wireHook: WIRE_HOOK, wireMemory: WIRE_MEMORY, wiring, io, MARK, WILL })
  otherChanges.push(...r.changed)
  bad += r.failed
}

// ── 4h. Obsidian (lib/bootstrap/obsidian.mjs) ───────────────────────────────
if (parts.has('obsidian')) {
  const obsidianJson = join(HOME, 'Library/Application Support/obsidian/obsidian.json')
  otherChanges.push(...await wireObsidian({ env, allowBrew: answers.allowBrew, obsidianJson, vault: TARGET, io, runWrite, MARK, WILL }))
} else log('  ⏭  ข้าม Obsidian')

// ── 4i. manifest ────────────────────────────────────────────────────────────
// `files` = ของที่ update ทับ/ลบได้ · `seeded_once` = ของที่วางครั้งเดียวแล้วไม่แตะอีก
// สองคีย์นี้ **ห้ามซ้อนกันเด็ดขาด** — ไฟล์ที่หลุดจาก seeded_once ไป files คือโน้ตของผู้ใช้ที่จะโดนลบ
const overlap = Object.keys(files).filter((f) => f in seeded)
if (overlap.length) die(`บั๊ก: ไฟล์อยู่ทั้ง files และ seeded_once — ${overlap.join(', ')}`)

// `rendered` = บันทึกว่าไฟล์ที่ **วางอยู่** ตัวไหนถูกแทนโทเคนตอนเขียน · มันถูกเติมใน `place()` ที่เดียว
// แต่ของที่รอบนี้ไม่ได้เดินผ่าน `place()` (seed-once ที่ update ไม่แตะ · part ที่ไม่ได้เลือก) ยังวางอยู่
// จริงและยัง **ถูกเรนเดอร์แล้ว** อยู่ดี ⇒ ไม่ยกบันทึกเก่ามา รายการจะหดทุกครั้งที่ update แล้ว manifest
// เปลี่ยนทั้งที่ไม่มีอะไรใหม่ ⇒ `flat()` ตอบว่า "มีของใหม่" ⇒ **commit เปล่าหนึ่งใบทุก update แรก**
// ซึ่งค้านสัญญาข้อ "รันซ้ำแล้วไม่เกิด commit เปล่า" ของ `INSTALL.md` ตรง ๆ
// (เจอตอนทดสอบ `--plan` ของใบ 12 เอง: แผนบอก "จะเขียน 0 · จะลบ 0" แต่ "จะ commit: มี")
if (MODE === 'update')
  for (const rel of oldManifest.rendered ?? [])
    if (rel in files || rel in seeded || rel in skills) rendered.push(rel)

const STAMP = new Date().toISOString()
const manifest = {
  schema: 1,
  // schema ของ *เนื้อ vault* (คนละตัวกับ `schema` ของ manifest) — `wf migrate --yes` เป็นคนตั้ง
  // ⇒ update ต้องยกค่าเดิมมา ไม่งั้น vault ที่ migrate แล้วกลับไปอ่านเป็น schema 1 แล้ว `wf` ปฏิเสธการเขียน
  // install: seed ทุกใบเป็น schema ปัจจุบันอยู่แล้ว ⇒ จดเลย · ยกเว้นของเดิมที่ยังต้อง migrate (ขั้น 3c)
  vault_schema: MODE === 'update' ? oldManifest.vault_schema : installNeedsMigrate ? undefined : SCHEMA_VERSION,
  template_sha: templateSha,
  template_version: templateVersion,
  source_repo: REPO,
  vault: TARGET,                       // path ที่เรนเดอร์เข้า `__VAULT__` (resolve symlink แล้ว)
  vault_as_given: TARGET_RAW === TARGET ? undefined : TARGET_RAW,
  rendered: [...new Set(rendered)].sort(),
  installed_at: oldManifest?.installed_at ?? STAMP,
  updated_at: oldManifest?.updated_at ?? STAMP,
  parts: [...parts],
  skills_dir: SKILLS_DIR,
  // ตัดชื่อสกิลที่ไม่เหลือไฟล์ใน `skills` แล้ว — ไม่งั้นสกิลที่เลิก ship (เช่น `wayfinder`) ค้างใน
  // manifest ตลอดไป แล้ว `doctor.mjs` ใช้ path เก่านั้นต่อ
  skills_targets: Object.fromEntries(Object.entries(skillTargets)
    .filter(([name]) => Object.keys(skills).some((rel) => rel.startsWith(`${name}/`)))),
  files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
  skills: Object.fromEntries(Object.entries(skills).sort(([a], [b]) => a.localeCompare(b))),
  seeded_once: Object.fromEntries(Object.entries(seeded).sort(([a], [b]) => a.localeCompare(b))),
}
// update ที่ไม่มีอะไรเปลี่ยนต้องไม่ขยับ `updated_at` — ไม่งั้น "ตรวจว่ามีของใหม่ไหม" หนึ่งครั้ง
// = commit เปล่าหนึ่งใบใน vault ทุกครั้ง
const flat = (m) => JSON.stringify({ ...m, updated_at: null })
if (!oldManifest || flat(oldManifest) !== flat(manifest)) manifest.updated_at = STAMP
const manifestText = JSON.stringify(manifest, null, 2) + '\n'
const manifestChanged = (await readFile(join(TARGET, MANIFEST), 'utf8').catch(() => null)) !== manifestText
await mkdir(TARGET, { recursive: true })
await writeFile(join(TARGET, MANIFEST), manifestText)
log(`  ${MARK} ${WILL}เขียน ${MANIFEST} — managed ${Object.keys(files).length} · seed ${Object.keys(seeded).length} · สกิล ${Object.keys(skills).length}${PLAN && !manifestChanged ? ' (เนื้อเท่าเดิม)' : ''}`)

// ── ขั้นที่ 5p — เฉพาะ `--plan`: สรุปแผน แล้วพิสูจน์ว่าไม่ได้แตะอะไรจริง ─────────────────────
// อยู่ **ก่อน** ขั้นที่ 5 แล้ว `exit` ทิ้ง เพราะขั้นที่ 5 ทั้งขั้นอ่าน *ผลของการเขียน* ที่ยังไม่เกิด
// ⇒ ในโหมด plan มันจะแดงมั่วทุกข้อ แล้วไปกลบข้อเดียวที่แผนต้องตอบจริง ๆ คือ "ไม่มีอะไรถูกแตะ"
// (ออกตรงนี้ = ขั้นที่ 5 กับ git commit ท้ายไฟล์ **เอื้อมไม่ถึง** ในโหมด plan เชิงโครงสร้าง
//  ไม่ต้องพึ่ง `if (!PLAN)` ที่เติมไว้ถูกทุกจุด)
if (PLAN) await finishPlan({ mode: MODE, askedPlan: ASKED_PLAN, target: TARGET, wiresVault: parts.has('vault'), stats, dropped,
  manifestChanged, migrationFiles: migration.files, otherChanges, before, fingerprintNow, run })

// ── ขั้นที่ 5 — ตรวจแล้วสรุป ────────────────────────────────────────────────
log(`
── ตรวจ ─────────────────────────────────────────────────────`)

// 5a. placeholder ค้าง = hook ตายเงียบสนิท ⇒ ต้องกวาดจริง ไม่ใช่เชื่อว่า sed ทำงานแล้ว
{
  const leftover = []
  for (const rel of [...Object.keys(files), ...Object.keys(seeded)]) {
    if (RENDER_EXEMPT.has(rel)) continue      // ไฟล์พวกนี้พูดถึงโทเคนโดยตั้งใจ
    const buf = await readFile(join(TARGET, rel)).catch(() => null)
    if (!buf || !isText(buf)) continue
    const t = buf.toString('utf8')
    if (t.includes('__VAULT__')) leftover.push(rel)
    // โทเคนวันที่เรนเดอร์เฉพาะ seed-once ⇒ ที่โผล่ในไฟล์ managed คือของที่จะ **ไม่มีวันถูกเรนเดอร์**
    // กวาดทั้งสองชั้นด้วยกฎเดียว กฎ "seed-once เท่านั้น" จึงบังคับตัวเอง ไม่ได้ฝากไว้กับคอมเมนต์
    if (t.includes(DATE_TOKEN)) leftover.push(`${rel} (${DATE_TOKEN})`)
  }
  for (const rel of Object.keys(skills)) {
    const name = rel.split('/')[0]
    const buf = await readFile(join(skillTargets[name] ?? '', rel.slice(name.length + 1))).catch(() => null)
    const t = buf && isText(buf) ? buf.toString('utf8') : ''
    if (t.includes('__VAULT__') || t.includes('<VAULT>')) leftover.push(`skills/${rel}`)
    if (t.includes(DATE_TOKEN)) leftover.push(`skills/${rel} (${DATE_TOKEN})`)
  }
  verify(leftover.length === 0, 'ไม่เหลือ placeholder ค้าง', leftover.join(' · '))
}

// 5a2. กลับด้าน: ตัวเรนเดอร์ต้องยัง **มี** โทเคนอยู่ ไม่งั้น update รอบหน้าจะเงียบทั้งกระดาน
for (const rel of RENDER_EXEMPT) {
  if (!(rel in files)) continue
  const src = await readFile(join(TARGET, rel), 'utf8').catch(() => '')
  const srcT = await readFile(join(SRC, srcOf(rel)), 'utf8').catch(() => '')
  if (!srcT.includes('__VAULT__')) continue
  // ถูกเรนเดอร์ทับเมื่อไหร่ = update รอบหน้าเลิกเรนเดอร์ทุกไฟล์โดยไม่มีอะไรเตือน
  verify(src.includes('__VAULT__'), `${rel}: โทเคน __VAULT__ ในตัวสคริปต์ยังอยู่`)
}

// 5a3. กลับด้านของ 5a สำหรับโทเคนวันที่: ต้นฉบับชั้น seed-once ที่มี `status_since:` ต้องใช้โทเคน
// ไม่ใช่วันที่ตายตัว · 5a จับ "โทเคนไม่ถูกเรนเดอร์" ซึ่ง**ดัง** (doctor บังคับ `status_since` เป็น ISO
// date ⇒ ❌ ทันที) แต่ทิศตรงข้าม — โทเคนหายไปจาก template แล้วกลับไป hardcode — **เงียบสนิท**:
// ไฟล์ผ่าน lint ทุกข้อ แค่แก่ขึ้นวันละวันจนตัวอย่างขึ้นเตือนใส่คนที่เพิ่งติดตั้งเสร็จ (ใบ 06 · ใบ 11)
//
// อยู่ที่นี่ **ไม่ใช่ที่ `doctor.mjs`** ทั้งที่ใบ 04 วางข้อกลับด้านของ `__VAULT__` ไว้ฝั่งโน้น เพราะ
// สองข้อนี้ถามคนละคำถามกับของที่มองเห็นคนละชุด: doctor รันบน **vault** ที่ค่านั้นเรนเดอร์เป็นวันที่จริง
// ไปแล้ว **และขยับต่อได้ตามจริง**เมื่อผู้ใช้ลงมือกับตัวอย่าง ⇒ แยก "hardcode" ออกจาก "เก่าจริง" ไม่ได้
// เลย · ของที่ต้องเฝ้าคือ `template/` ของ repo ซึ่ง doctor ไม่เคยเห็น (มันรันบน vault เท่านั้น)
// ⇒ installer เป็นตัวเดียวที่ถือทั้ง SRC และ TARGET อยู่ในมือ
{
  const hardcoded = []
  for (const rel of templateFiles) {
    if (!isSeed(rel) || !rel.endsWith('.md')) continue
    const line = await readFile(join(SRC, srcOf(rel)), 'utf8').catch(() => '').then((t) => t.match(/^status_since:.*$/m)?.[0])
    if (line && !line.includes(DATE_TOKEN)) hardcoded.push(`${rel} → ${line.trim()}`)
  }
  verify(hardcoded.length === 0, `ต้นฉบับ seed-once ใช้ ${DATE_TOKEN} ไม่ใช่วันที่ตายตัว`, hardcoded.join(' · '))
}

// 5b. autocommit.sh — บรรทัด VAULT= ต้องชี้มาที่นี่ **และ** บรรทัด fallback ต้องรอด
if (AUTOCOMMIT in files) {
  const src = await readFile(join(TARGET, AUTOCOMMIT), 'utf8').catch(() => '')
  const line = src.match(/^VAULT=.*$/m)?.[0] ?? ''
  verify(line === `VAULT="${TARGET}"`, 'autocommit.sh: บรรทัด VAULT= เรนเดอร์แล้ว', line)
  // fallback คือกันชนของ render ที่ล้มเหลว — ห้ามให้ sed กินไปด้วย (ใบ 02 · ใบ 09)
  verify(/\|\|\s*VAULT="\$HOME\//.test(src), 'autocommit.sh: บรรทัด fallback รอด')
  const st = await stat(join(TARGET, AUTOCOMMIT)).catch(() => null)
  verify(st !== null && (st.mode & 0o111) !== 0, 'autocommit.sh execute ได้')
}

// 5c. ของที่ไม่ใช่ของ template ต้องรอด
verify(!Object.keys(files).some(isSeed), 'manifest ไม่ครอบ Config/Picks/example-repo/.obsidian ส่วนตัว')

// 5d. สกิลที่ยังฝัง path ปลอมอยู่ = /wayfinder ไปเขียน map ผิดที่โดยไม่มีอะไรเตือน
for (const rel of Object.keys(skills)) {
  const name = rel.split('/')[0]
  const t = await readFile(join(skillTargets[name] ?? '', rel.slice(name.length + 1)), 'utf8').catch(() => '')
  // ตัด TARGET ออกก่อนค้น — ไม่งั้น vault ที่ path ลงท้ายด้วย `Documents/Git/wayfinder-vault`
  // (เช่นใน `$HOME` จำลองตอนทดสอบ) จะเตือนใส่ path ที่ **เพิ่งเรนเดอร์ถูก** ของตัวเอง
  if (TARGET !== DEFAULT_VAULT && t.split(TARGET).join('').includes('Documents/Git/wayfinder-vault'))
    log(`  ⚠️  ${rel} ยังพูดถึง ~/Documents/Git/wayfinder-vault ทั้งที่ vault คุณอยู่ ${TARGET}
     — ใส่ __VAULT__ ตรงนั้นใน repo แล้ว installer จะเรนเดอร์ให้`)
}

// git commit ปิดท้าย — ให้ working tree สะอาดตามที่ doctor ตรวจ
if (parts.has('vault')) {
  const dirty = await run('git', ['-C', TARGET, 'status', '--porcelain']).then((r) => r.stdout.trim(), () => '')
  if (dirty) {
    await runWrite('git', ['-C', TARGET, 'add', '-A'])
      .then(() => runWrite('git', ['-C', TARGET, 'commit', '-q', '-m',
        `chore(vault): ${MODE} wayfinder template ${templateLabel}`]))
      .then(() => log(`  ✅ commit ${MODE} ลง vault แล้ว`),
        (e) => log(`  ⚠️  commit ไม่ผ่าน: ${String(e.message).split('\n')[0]}`))
  }
}

// ── 4j. wf migrate --yes — หลัง commit ของ update เพื่อให้ได้ tree สะอาดและ commit แยกของมันเอง ─────
// รันด้วย `wf` ตัวที่ **เพิ่งวางลง vault** (lock · commit `wf(migrate): …` ของมันเอง) — แผนที่โชว์ไว้ที่ขั้น 4d2
// มาจาก lib ชุดเดียวกันนี้ · ไม่ได้เลือกส่วน vault = `_tools/` ไม่ได้ถูกอัปเดต ⇒ ห้ามสั่ง wf รุ่นที่ไม่รู้จัก
if (migration.files.length) {
  if (!parts.has('vault')) verify(false, 'wf migrate', `ข้าม — ส่วน vault ไม่ได้เลือก จึงไม่มี _tools/wf.mjs รุ่นนี้ให้รัน`)
  else {
    const r = await runWrite(process.execPath, [join(TARGET, '_tools/wf.mjs'), 'migrate', '--yes'])
      .then((out) => ({ ok: true, text: out.stdout.trim() }), (e) => ({ ok: false, text: `${e.stdout ?? ''}${e.stderr ?? e.message}`.trim() }))
    verify(r.ok, `wf migrate --yes → vault schema ${SCHEMA_VERSION}`, r.text.split('\n').slice(-3).join(' · '))
  }
}

log(`
────────────────────────────────────────────────────────────
ที่เหลือต้องทำมือ (สคริปต์ทำแทนไม่ได้):
  1. เปิด Obsidian → "Open folder as vault" ที่ ${TARGET}
  2. Settings → Community plugins → Turn on
     (ตัวปลั๊กอิน Dataview + ค่าตั้ง + สี Graph View มากับ repo แล้ว ไม่ต้องโหลดใหม่)
  3. เปิดโน้ต "Wayfinder Dashboard" กับ "Wayfinder Efforts"
  4. ถ้าเพิ่งต่อ hook: เปิด /hooks ใน Claude Code หนึ่งครั้งให้ config โหลดใหม่
  5. ถ้า Claude Code รัน Bash ใน sandbox: รวมค่านี้เข้า "sandbox" ใน ~/.claude/settings.json เอง
     แล้วรีสตาร์ต Claude Code — ไม่งั้น wf เขียนลง vault ไม่ได้ · ห้ามตัด denyWrite ทิ้ง: hook, git
     และ Obsidian รันโค้ดจาก path พวกนี้นอก sandbox
${JSON.stringify({ filesystem: sandboxGrant(TARGET, HOME) }, null, 2).replace(/^/gm, '     ')}
────────────────────────────────────────────────────────────
`)

const { stdout } = await run('node', [join(TARGET, '_tools/doctor.mjs')]).catch((e) => e)
log(stdout ?? '')

if (bad) { console.error(`❌ ${MODE} ยังไม่ผ่าน — ${bad} ข้อข้างบนเป็นสีแดง`); process.exit(1) }
