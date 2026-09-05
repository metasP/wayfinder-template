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
//   node <vault>/_tools/bootstrap.mjs --from ~/Documents/Git/wayfinder-template   ← update
//   …คำสั่งไหนก็ได้ + `--plan` = รอบเดิมทุกอย่างโดยตัวเขียนถูกปิด แล้วรายงานว่า *จะ* ทำอะไร
//     (บน vault ที่ติดตั้งแล้ว = dry run ของ update · บนเครื่องเปล่าที่ยังไม่ตอบ 5 ข้อ = คำถาม 5 ข้อ)
//
// `--wire-hook` / `--wire-memory` ยัง opt-in เหมือนเดิม (ใช้กับ vault ที่ติดตั้งอยู่แล้ว)
// — ในโหมด install ทั้งสองชิ้นมาจากคำตอบข้อ 2 (`hook` / `memory`) แทน

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
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline/promises'

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
const log = (s = '') => console.log(s)
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

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flags = new Map()
const bare = new Set()
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) continue
  const eq = a.indexOf('=')
  if (eq !== -1) { flags.set(a.slice(2, eq), a.slice(eq + 1)); continue }
  const next = argv[i + 1]
  if (next !== undefined && !next.startsWith('--')) { flags.set(a.slice(2), next); i++ }
  else bare.add(a.slice(2))
}
const opt = (k) => flags.get(k)
const has = (k) => bare.has(k) || flags.has(k)

const die = (msg, code = 1) => { console.error(`❌ ${msg}`); process.exit(code) }

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
const PLAN = has('plan')
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

// ── ขั้นที่ 1 — ตรวจ (ยังไม่เขียนอะไร) ──────────────────────────────────────
// 1a. หา template repo: `<repo>/{template,skills,LICENSE}` คือลายเซ็นของราก repo
//     ใช้ของที่ repo มีอยู่แล้วเป็นตัวชี้ ไม่ต้องมีไฟล์ marker เพิ่ม
const isRepoRoot = async (d) =>
  (await exists(join(d, 'template'))) && (await exists(join(d, 'skills'))) && (await exists(join(d, 'LICENSE')))

const findRepo = async () => {
  if (has('from')) {
    const d = resolve(expand(opt('from')))
    if (await isRepoRoot(d)) return d
    if (await isRepoRoot(dirname(d))) return dirname(d) // ชี้มาที่ `template/` ก็รับ
    die(`--from ${d} ไม่ใช่ราก template repo (ต้องมี template/ · skills/ · LICENSE)`)
  }
  let d = dirname(SELF_DIR)                    // `<x>/_tools/..` = `<x>`
  for (let i = 0; i < 4; i++) {
    if (await isRepoRoot(d)) return d
    const up = dirname(d)
    if (up === d) break
    d = up
  }
  return null
}

// 1b. หา vault ปลายทาง
const selfVault = dirname(SELF_DIR)
const vaultArg = has('vault') ? resolve(expand(opt('vault'))) : null
const runningInsideVault = await exists(join(selfVault, MANIFEST))
const VAULT = vaultArg ?? (runningInsideVault ? selfVault : DEFAULT_VAULT)

const oldManifest = await readJson(join(VAULT, MANIFEST))
const MODE = oldManifest ? 'update' : 'install'

let REPO = await findRepo()
if (!REPO && oldManifest?.source_repo && await isRepoRoot(oldManifest.source_repo)) REPO = oldManifest.source_repo
if (!REPO) {
  die(`หา template repo ไม่เจอ — สคริปต์นี้ต้องรันจาก <repo>/template/_tools/bootstrap.mjs
   หรือส่ง --from <path ของ repo ที่ clone มา> มาให้ตรง ๆ`)
}
const SRC = join(REPO, 'template')
const SKILLS_SRC = join(REPO, 'skills')

const templateFiles = await walk(SRC).catch(() => die(`ไม่มี ${SRC}`))
const skillFiles = await walk(SKILLS_SRC).catch(() => [])
const templateSha = await run('git', ['-C', REPO, 'rev-parse', 'HEAD'])
  .then((r) => r.stdout.trim(), () => null)

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
  settings: await readJson(join(CLAUDE, 'settings.json')),
}
const hookWired = JSON.stringify(env.settings?.hooks?.PostToolUse ?? []).includes('autocommit.sh')

// ── ขั้นที่ 2 — รายงานก่อนแตะอะไร ───────────────────────────────────────────
const report = () => {
  log(`
── สถานะปัจจุบัน ────────────────────────────────────────────`)
  log(`  template repo   ${REPO}${templateSha ? ` (${templateSha.slice(0, 8)})` : ' (ยังไม่ได้ commit)'}`)
  log(`  ไฟล์ใน template ${templateFiles.length} ตัว · สกิล ${skillFiles.length} ไฟล์`)
  log(`  vault ปลายทาง   ${VAULT}  →  โหมด ${MODE.toUpperCase()}`)
  log(`  vault มีอยู่แล้ว  ${env.vaultExists ? 'มี' : 'ยังไม่มี'}${env.vaultIsRepo ? ' · เป็น git repo' : ''}`)
  log(`  Obsidian        ${env.obsidianApp ? 'ลงแล้ว' : 'ยังไม่ลง'}${env.obsidianRunning ? ' · ⚠️ เปิดค้างอยู่' : ''}`)
  log(`  hook            ${hookWired ? 'ต่อไว้แล้ว' : 'ยังไม่ต่อ'}`)
  log(`  ~/.claude/CLAUDE.md  ${env.claudeMd.includes('Wayfinder maps live in') ? 'มีย่อหน้าแล้ว' : 'ยังไม่มีย่อหน้า'}`)
  if (!env.darwin) log(`  ⚠️  ไม่ใช่ macOS — ข้อ Obsidian/brew ใช้ไม่ได้`)
}

// ── ขั้นที่ 3 — คำถาม 5 ข้อ ─────────────────────────────────────────────────
// สคริปต์ **ไม่เดาคำตอบให้** — ในโหมด install ถ้าไม่มีคำตอบมาทาง flag และ stdin ไม่ใช่ TTY
// (= agent เป็นคนรัน) มันจะพิมพ์คำถามแล้วออกด้วย code 2 ให้ agent เอาไปถามเจ้าของเครื่องทีละข้อ
// ตามโปรโตคอลขั้นที่ 3 ของ setup — ไม่ใช่ตอบแทนเขาเงียบ ๆ
const QUESTIONS = `
── ขั้นที่ 3: ถาม 5 ข้อ (ถามทีละข้อ รอคำตอบ) ────────────────────────────────

  1. vault จะวางที่ path ไหน?                    --vault <path>
     ค่าเริ่มต้น ${DEFAULT_VAULT}

  2. จะติดตั้งชิ้นไหนบ้าง? (เลือกได้หลายข้อ · ค่าเริ่มต้น = ทุกข้อ)   --parts a,b,c
     skills   สกิล /wayfinder + /wayfinder-next        (นอก vault)
     vault    เนื้อ vault + _tools + git               (ใน vault)
     hook     hook commit อัตโนมัติ                    (~/.claude/settings.json)
     obsidian ค่าตั้ง .obsidian + Dataview + ลงทะเบียน vault
     memory   ย่อหน้ากติกาใน ~/.claude/CLAUDE.md

     ⚠️ ต้องบอกตรง ๆ ตอนถามข้อ memory แล้วเคารพคำตอบ ไม่ตื๊อ:
        ย่อหน้าใน CLAUDE.md เป็นที่ **เดียว** ที่บอก /wayfinder ว่า vault อยู่ไหน
        ไม่เติม = เรียก /wayfinder แล้วมันจะไปทำตาม docs/agents/issue-tracker.md
        ของ repo ที่เปิดอยู่แทน ⇒ map ไม่ลงใน vault ต้องพิมพ์ path บอกเองทุกครั้ง

  3. เจอของเดิมอยู่แล้วเอายังไง?                  --on-conflict skip|backup
     ค่าเริ่มต้น skip (ข้าม ไม่ทับ) · อีกทาง backup (สำรอง .bak แล้วทับ)
     คำตอบนี้คุมเฉพาะ **เอกสารกับค่าตั้ง** — \`_tools/\` กับสกิลทับเสมอไม่ว่าตอบอะไร
     (ค้างรุ่นเก่าเมื่อไหร่ update รอบหน้าไม่ทำงาน แล้วไม่มีอะไรเตือน)

  4. อนุญาต \`brew install --cask obsidian\` ไหม?  --allow-brew yes|no
     **ไม่มีค่าเริ่มต้น ต้องตอบเอง** (ถามเฉพาะตอนเลือก obsidian และยังไม่มีแอป)
     Dataview ไม่ต้องถาม — ship มากับ repo แล้ว

  5. สกิลจะวางที่ไหน?                             --skills-dir <path>
     ค่าเริ่มต้น ${DEFAULT_SKILLS}
     ถ้า <dir>/<ชื่อสกิล> เป็น symlink อยู่แล้ว จะเดินตามไปทับที่ปลายทาง ไม่ทำลาย layout เดิม

  ตอบครบแล้วรันด้วย flag ข้างบน · หรือ --yes ถ้าเอาค่าเริ่มต้นทุกข้อ
`

const ask = async () => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const q = async (text, def) => {
    const a = (await rl.question(`${text}${def ? ` [${def}]` : ''} `)).trim()
    return a || def
  }
  const a = {}
  a.vault = resolve(expand(await q('1. vault path?', DEFAULT_VAULT)))
  a.parts = (await q(`2. ติดตั้งชิ้นไหน? (${ALL_PARTS.join(',')})`, 'all'))
  a.onConflict = await q('3. เจอของเดิม? (skip/backup)', 'skip')
  a.skillsDir = resolve(expand(await q('5. สกิลวางที่ไหน?', DEFAULT_SKILLS)))
  a.allowBrew = 'no'
  rl.close()
  return a
}

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
  report(); log(QUESTIONS); answers = await ask()
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
const fingerprint = async () => {
  const out = new Map()
  const at = async (key, abs) => out.set(key, await readFile(abs).then(sha, () => 'ø'))
  const vaultRels = new Set([MANIFEST, ...templateFiles,
    ...Object.keys(oldManifest?.files ?? {}), ...Object.keys(oldManifest?.seeded_once ?? {})])
  for (const rel of [...vaultRels].sort()) await at(`vault/${rel}`, join(TARGET, rel))
  for (const rel of [...new Set([...skillFiles, ...Object.keys(oldManifest?.skills ?? {})])].sort())
    await at(`skills/${rel}`, skillDest(rel))
  await at('~/.claude/settings.json', join(CLAUDE, 'settings.json'))
  await at('~/.claude/CLAUDE.md', join(CLAUDE, 'CLAUDE.md'))
  await at('obsidian.json', join(HOME, 'Library/Application Support/obsidian/obsidian.json'))
  out.set('git HEAD ของ vault', await run('git', ['-C', TARGET, 'rev-parse', 'HEAD']).then((r) => r.stdout.trim(), () => 'ø'))
  return out
}
const before = PLAN ? await fingerprint() : null

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
// `doctor.mjs` ไม่จับเพราะข้อ `lying` ตรวจแค่ map ที่ `paused`/`dropped`/`done` ⇒ เงียบ ไม่ใช่แดง
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
    seeded[rel] = await place(join(SRC, rel), dest, rel, { seed: true })
    stats.seeded++
  } else {
    files[rel] = await place(join(SRC, rel), dest, rel)
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

// ── 4d. ลบไฟล์ที่ template เลิกใช้แล้ว ───────────────────────────────────────
// ขับด้วย **manifest เก่าเท่านั้น** — ของที่ไม่เคยอยู่ใน manifest (harness-kit, effort ของผู้ใช้)
// ไม่มีทางเข้ามาถึงลูปนี้ได้เลย และ seed-once ก็ไม่เข้าเพราะอยู่คนละคีย์
const dropped = []
if (MODE === 'update') {
  const guard = (rel) => !isSeed(rel) && rel in (oldManifest.files ?? {})
  for (const rel of Object.keys(oldManifest.files ?? {})) {
    if (rel in files || !guard(rel)) continue
    const p = join(TARGET, rel)
    if (!(await exists(p))) continue
    await rm(p)
    dropped.push(rel)
    for (let d = dirname(p); d !== TARGET; d = dirname(d))
      if (!(await rmdir(d).then(() => true, () => false))) break
  }
  for (const rel of Object.keys(oldManifest.skills ?? {})) {
    if (rel in skills) continue
    const name = rel.split('/')[0]
    const base = skillTargets[name]
    if (!base) continue
    await rm(join(base, rel.slice(name.length + 1))).catch(() => {})
    dropped.push(`skills/${rel}`)
  }
  if (dropped.length) log(`  🗑  ${WILL}ลบไฟล์ที่ template เลิกใช้ ${dropped.length} ตัว: ${dropped.join(' · ')}`)
  if (stats.localEdits.length)
    log(`  ⚠️  ${WILL}ทับไฟล์ที่คุณเคยแก้ไว้ ${stats.localEdits.length} ตัว (กู้ได้: git log -p -- <ไฟล์>)\n     ${stats.localEdits.join(' · ')}`)
}

// ── 4e. git ─────────────────────────────────────────────────────────────────
if (parts.has('vault')) {
  await chmod(join(TARGET, AUTOCOMMIT), 0o755).catch(() => {})
  if (!(await run('git', ['-C', TARGET, 'rev-parse', '--git-dir']).then(() => true, () => false))) {
    await runWrite('git', ['-C', TARGET, 'init', '-q', '-b', 'main'])
    log(`  ${MARK} ${WILL}git init (vault เป็น local อย่างเดียว ไม่มี remote โดยตั้งใจ)`)
  }
}

// ── 4f. hook — สองเส้น Write|Edit และ Bash ──────────────────────────────────
// เส้น `Bash` ขาดไม่ได้: agent แก้ไฟล์ใน vault ด้วย sed/python3 บ่อย ซึ่ง payload ไม่มี `file_path`
// ⇒ มีแต่เส้นแรก การแก้แบบนั้นจะไม่ถูก commit เลย
if (parts.has('hook') || has('wire-hook')) {
  const p = join(CLAUDE, 'settings.json')
  const settings = (await readJson(p)) ?? {}
  settings.hooks ??= {}
  settings.hooks.PostToolUse ??= []
  // เทียบ **path ของสคริปต์** ไม่ใช่ทั้งบรรทัด · hook ที่เจ้าของต่อไว้เองก่อนมี installer มักเขียน
  // ต่างกันแค่ redirect (`\u2026/autocommit.sh || true` ไม่มี `2>/dev/null`) ⇒ การเทียบทั้งบรรทัดมองไม่เห็นมัน
  // แล้วเติมเส้นที่สองซ้อนลงไป ⇒ autocommit รัน **สองรอบทุก tool call ตลอดไป** โดยไม่มีอะไรบอกสักคำ
  // path เป็นตัวระบุที่ถูกต้อง: hook สองเส้นที่เรียกสคริปต์เดียวกัน คือเส้นเดียวกันเสมอ ไม่ว่าเขียนยังไง
  const script = `${TARGET}/_tools/autocommit.sh`
  const cmd = `${script} 2>/dev/null || true`
  let added = 0
  for (const matcher of ['Write|Edit', 'Bash']) {
    const block = settings.hooks.PostToolUse.find((b) => b.matcher === matcher)
    const mine = (block?.hooks ?? []).filter((h) => typeof h?.command === 'string' && h.command.includes(script))
    if (mine.length) {
      // ต่อไว้แล้ว — ไม่แตะของเขา แต่ห้ามเงียบถ้าสภาพผิดปกติ (กติกาข้อ 5 ของ INSTALL)
      if (mine.length > 1)
        log(`  \u26a0\ufe0f  matcher ${matcher}: มี hook ชี้มาที่สคริปต์นี้ ${mine.length} เส้น — autocommit รันซ้ำทุกครั้ง
     ลบให้เหลือเส้นเดียวใน ~/.claude/settings.json`)
      else if (mine[0].command !== cmd)
        log(`  \u2705 matcher ${matcher}: ต่อไว้แล้ว เขียนต่างจากของ installer — ปล่อยไว้ตามเดิม
     ${mine[0].command}`)
      continue
    }
    const entry = { type: 'command', command: cmd, timeout: 15, statusMessage: 'Committing wayfinder-vault...' }
    if (block) block.hooks.push(entry)
    else settings.hooks.PostToolUse.push({ matcher, hooks: [entry] })
    added++
  }
  if (added) {
    if (await exists(p)) await copyFile(p, `${p}.bak`)
    await writeFile(p, JSON.stringify(settings, null, 2) + '\n')
    log(`  ${MARK} ${WILL}ต่อ hook ${added} เส้นเข้า ~/.claude/settings.json (สำรองไว้ที่ settings.json.bak)`)
    log('     ⚠️ ต้องรีสตาร์ต Claude Code หรือเปิด /hooks หนึ่งครั้ง config ถึงจะโหลดใหม่')
  } else log('  ✅ hook ต่อไว้ครบทั้งสองเส้นแล้ว (ข้าม)')
} else log('  ⏭  ข้าม hook')

// ── 4g. ย่อหน้าใน ~/.claude/CLAUDE.md ───────────────────────────────────────
const MEMORY_BLOCK = `
## Wayfinder maps live in \`wayfinder-vault\`, never in a repo

Every \`/wayfinder\` map and ticket goes in **\`${TARGET}\`**, whatever repo the workspace
happens to be. That vault has its own git — being outside the repo is the whole point:
a map stored in \`docs/plan/\` dies with the worktree and can never be committed.

- **Never sync, mirror, or copy** a map between a repo and the vault. One copy, one place.
  If you find a map under \`docs/plan/wayfinder/\`, it drifted — move it into the vault
  rather than syncing it.
- Layout: \`${TARGET}/<repo>/<effort>/map.md\` + \`…/<effort>/issues/NN-<slug>.md\`
  (\`<repo>\` = the repo the work targets).
- Tickets carry **YAML frontmatter** — \`repo\`, \`effort\`, \`type\`
  (research|prototype|grilling|task), \`status\` (open|claimed|resolved), and \`blockers\` as
  a list of **\`[[wikilinks]]\`**, not numbers. Maps carry \`repo\`/\`effort\`/\`kind: map\`, plus
  \`runs:\` once \`/wayfinder-next\` has used them. Dataview and Graph View both read these,
  so a ticket without frontmatter is invisible on the dashboard.
- Two notes stay open while working: **\`Wayfinder Dashboard\`** (ticket level — what's
  pickable, what's blocked, who's holding) and **\`Wayfinder Efforts\`** (map level — how far
  each effort got, what's gone stale).
- \`_tools/\` holds the vault's own scripts; every Dataview query filters \`FROM -"_tools"\`.
  Leave it alone.
- **Don't commit the vault by hand** — the \`autocommit.sh\` PostToolUse hook commits it on
  every Write/Edit.
- Read \`${TARGET}/README.md\` before charting a new map; it is the source of truth for the
  format.
`
if (parts.has('memory') || has('wire-memory')) {
  const p = join(CLAUDE, 'CLAUDE.md')
  const cur = await readFile(p, 'utf8').catch(() => '')
  if (cur.includes('Wayfinder maps live in') || cur.includes(TARGET)) {
    log('  ✅ ~/.claude/CLAUDE.md มีย่อหน้าอยู่แล้ว (ข้าม)')
  } else {
    if (cur) await copyFile(p, `${p}.bak`)
    await writeFile(p, `${cur.trimEnd()}\n${MEMORY_BLOCK}`)
    log(`  ${MARK} ${WILL}เติมย่อหน้า wayfinder ลง ~/.claude/CLAUDE.md`)
  }
} else {
  log(`  ⏭  ข้ามย่อหน้าใน ~/.claude/CLAUDE.md
     ⚠️ นี่คือที่ **เดียว** ที่บอก /wayfinder ว่า vault อยู่ไหน — ไม่เติมแล้วมันจะไปทำตาม
        docs/agents/issue-tracker.md ของ repo ที่เปิดอยู่แทน ⇒ ต้องพิมพ์ path บอกเองทุกครั้ง`)
}

// ── 4h. Obsidian ────────────────────────────────────────────────────────────
if (parts.has('obsidian')) {
  if (env.obsidianRunning)
    log(`  ⚠️  Obsidian เปิดค้างอยู่ — ตอนแอปเปิด ไฟล์ใน .obsidian/ เป็น *output* ของมัน
     มันจะ flush ทับค่าที่เพิ่งเขียน ⇒ ปิดให้สนิทแล้วรันซ้ำถ้า Graph View ไม่มีสี`)
  if (!env.obsidianApp) {
    if (answers.allowBrew === 'yes' && env.brew) {
      await runWrite('brew', ['install', '--cask', 'obsidian']).then(
        () => log(`  ${MARK} ${WILL}brew install --cask obsidian`),
        (e) => log(`  ❌ brew ล้ม: ${String(e.message).split('\n')[0]}`))
    } else log('  ⏭  ยังไม่มี Obsidian — โหลดเองจาก obsidian.md แล้ว "Open folder as vault" ที่ vault นี้')
  }
  const p = join(HOME, 'Library/Application Support/obsidian/obsidian.json')
  const o = await readJson(p)
  if (!o) log('  ⏭  ยังไม่มี obsidian.json — เปิดแอปครั้งแรกแล้วใช้ "Open folder as vault"')
  else if (Object.values(o.vaults ?? {}).some((v) => v.path === TARGET)) log('  ✅ Obsidian รู้จัก vault นี้แล้ว')
  else {
    await copyFile(p, `${p}.bak`)
    o.vaults ??= {}
    let key
    do { key = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('') } while (o.vaults[key])
    o.vaults[key] = { path: TARGET, ts: Date.now() }
    await writeFile(p, JSON.stringify(o, null, 2) + '\n')
    log(`  ${MARK} ${WILL}ลงทะเบียน vault กับ Obsidian (สำรองไว้ที่ obsidian.json.bak)`)
  }
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
  template_sha: templateSha,
  source_repo: REPO,
  vault: TARGET,                       // path ที่เรนเดอร์เข้า `__VAULT__` (resolve symlink แล้ว)
  vault_as_given: TARGET_RAW === TARGET ? undefined : TARGET_RAW,
  rendered: [...new Set(rendered)].sort(),
  installed_at: oldManifest?.installed_at ?? STAMP,
  updated_at: oldManifest?.updated_at ?? STAMP,
  parts: [...parts],
  skills_dir: SKILLS_DIR,
  skills_targets: skillTargets,
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
if (PLAN) {
  const dirtyBefore = await run('git', ['-C', TARGET, 'status', '--porcelain']).then((r) => r.stdout.trim(), () => '')
  const mine = stats.written > 0 || dropped.length > 0 || manifestChanged
  log(`
── สรุปแผน ──────────────────────────────────────────────────`)
  log(`  จะเขียน ${stats.written} · จะลบ ${dropped.length} · เหมือนเดิม/ข้าม ${stats.skipped}` +
      (stats.keptSeed ? ` · ไม่แตะ seed ${stats.keptSeed}` : ''))
  log(`  ไม่แตะเด็ดขาด: effort ของคุณ · _tools/harness-kit/ · ทุกอย่างที่ไม่เคยอยู่ใน manifest`)
  if (parts.has('vault')) {
    // ⚠️ commit ปิดท้ายขับด้วย `git status` **ทั้ง working tree** ไม่ใช่เฉพาะไฟล์ที่ installer แตะ
    // ⇒ vault ที่สกปรกอยู่ก่อนแล้วจะถูก commit ไปด้วยแม้ update จะไม่เปลี่ยนอะไรเลย — แผนต้องบอก
    if (mine) log(`  จะ commit ลง vault: มี (${MODE})`)
    else if (dirtyBefore) log(`  จะ commit ลง vault: มี — **แต่ไม่ใช่ของ update** · vault สกปรกอยู่ก่อนแล้ว
     ${dirtyBefore.split('\n').length} รายการ แล้ว commit ปิดท้ายกวาด \`git add -A\` ทั้ง tree`)
    else log(`  จะ commit ลง vault: ไม่มี (ไม่มีอะไรเปลี่ยน)`)
  }

  // ตรวจว่าที่พูดมาทั้งหมดเป็นจริง — ตัวกัน `--plan` อยู่ที่ตัวห่อ fs/`runWrite` จุดเดียว แต่ "จุดเดียว"
  // เป็นจริงได้ก็ต่อเมื่อไม่มีใครเผลอเรียกของเดิมตรง ๆ ในอนาคต ⇒ ข้อนี้เฝ้าสมมติฐานนั้นแทนคอมเมนต์เตือน
  // **บั๊กที่ใบนี้แก้ เกิดจากธงที่ไม่เคยมีใครตรวจว่ามันทำงานจริงไหม — จะไม่ซ้ำรอยด้วยธงที่ไม่มีใครตรวจอีกอัน**
  const after = await fingerprint()
  const moved = [...after.keys()].filter((k) => before.get(k) !== after.get(k))
  log(`
── ตรวจว่า dry run ไม่ได้เขียนจริง ───────────────────────────`)
  if (moved.length) {
    log(`  ❌ มี ${moved.length} จุดขยับระหว่าง --plan: ${moved.join(' · ')}`)
    console.error(`❌ \`--plan\` เขียนของจริง — นี่คือบั๊กของตัวกัน dry run เอง ไม่ใช่ของ vault คุณ
   มีคนเรียก fsWriteFile/fsRm/fsMkdir/run ตรง ๆ แทนตัวห่อที่หัวไฟล์ (หรือ \`runWrite\`)
   กู้ของที่ขยับ: git -C ${TARGET} log -p -1`)
    process.exit(1)
  }
  log(`  ✅ ไม่มีไบต์ไหนขยับ — เทียบ ${after.size} จุด (ไฟล์ที่ manifest/template ครอบ · สกิล ·
     ~/.claude/settings.json · ~/.claude/CLAUDE.md · obsidian.json · git HEAD ของ vault)`)
  log(`
รันจริงด้วยคำสั่งเดิมโดย **ตัด \`--plan\` ออก**
`)
  process.exit(0)
}

// ── ขั้นที่ 5 — ตรวจแล้วสรุป ────────────────────────────────────────────────
log(`
── ตรวจ ─────────────────────────────────────────────────────`)
let bad = 0
const verify = (ok, label, detail = '') => { if (!ok) bad++; log(`  ${ok ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`) }

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
  const srcT = await readFile(join(SRC, rel), 'utf8').catch(() => '')
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
    const line = await readFile(join(SRC, rel), 'utf8').catch(() => '').then((t) => t.match(/^status_since:.*$/m)?.[0])
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
        `chore(vault): ${MODE} wayfinder template${templateSha ? ` ${templateSha.slice(0, 8)}` : ''}`]))
      .then(() => log(`  ✅ commit ${MODE} ลง vault แล้ว`),
        (e) => log(`  ⚠️  commit ไม่ผ่าน: ${String(e.message).split('\n')[0]}`))
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
────────────────────────────────────────────────────────────
`)

const { stdout } = await run('node', [join(TARGET, '_tools/doctor.mjs')]).catch((e) => e)
log(stdout ?? '')

if (bad) { console.error(`❌ ${MODE} ยังไม่ผ่าน — ${bad} ข้อข้างบนเป็นสีแดง`); process.exit(1) }
