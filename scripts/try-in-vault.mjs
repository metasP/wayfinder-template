#!/usr/bin/env node
// ลอง template ของ worktree นี้ใน vault จริง — คำสั่งเดียว · undo ได้ (ใบ dashboard-navigation-retro-fixes#01)
//
//   npm run try-in-vault                  ทำให้ไฟล์ที่ template เป็นเจ้าของใน vault ตรงกับ worktree นี้ + รัน doctor
//   npm run try-in-vault -- --undo        คืนของเดิมทุกไฟล์
//   npm run try-in-vault -- --forget      เลิกติดตาม แต่เก็บไฟล์ที่ลองไว้ (หลัง merge — ห้าม undo หลัง update template)
//   npm run try-in-vault -- --status      ลองอะไรค้างอยู่ จาก worktree ไหน
//
// ธง: --vault <path> (ไม่ใส่ = $WAYFINDER_VAULT หรือ ~/Documents/Git/wayfinder-vault)
//     --force (undo ทับไฟล์ที่มีคนแก้หลังลอง)
//
// ทำไม: ใบ 01 และ 03 ของ dashboard-navigation copy ไฟล์ทีละตัวเข้า `_tools/` เอง แล้วลืม doctor ⇒ doctor
// ใน vault ยังเฝ้าของรุ่นเก่า · ที่นี่วาง **ทุก** ไฟล์ที่ template เป็นเจ้าของ (`ownedPairs` — ชุดเดียวกับที่
// installer ทับ) ที่ต่างจากใน vault — ไม่ใช่แค่ไฟล์ที่ branch แก้ เพราะ vault ที่ตามหลัง main ได้ของผสม
// (view ใหม่ + doctor เก่า = บั๊กเดิม) · เรนเดอร์ `__VAULT__` แบบเดียวกับ installer
//
// backup อยู่ใน `<vault>/.git/wayfinder-try/` — ไม่ถูก track ไม่ถูก autocommit ลาก · ไฟล์ที่ลองถูกตั้ง
// `skip-worktree` (ที่ track อยู่) หรือใส่ `.git/info/exclude` (ไฟล์ใหม่) ⇒ `autocommit.sh` (`git add -A`)
// ไม่ commit ของที่ยังไม่ merge เข้า history ของ vault · undo/forget ถอดทั้งสองอย่างคืน
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const STATE_DIR = 'wayfinder-try'
const EXCLUDE_BEGIN = '# >>> wayfinder try-in-vault'
const EXCLUDE_END = '# <<< wayfinder try-in-vault'
const DEFAULT_VAULT = join(homedir(), 'Documents/Git/wayfinder-vault')
const MANIFEST = '.wayfinder-template.json'
const MODES = { '--undo': 'undo', '--forget': 'forget', '--status': 'status' }

// รายการดูด้วยตามาตรฐาน — ของที่เครื่องตรวจไม่ได้ · /implement ส่งรายการนี้ให้ผู้ใช้ (CLAUDE.md § Trying template changes)
export const EYE_CHECKLIST = [
  'เปิด Obsidian ที่ vault แล้วเปิดหน้าที่ใบนี้แตะใหม่ (ปิด tab แล้วเปิดใหม่ หรือ Cmd+R ถ้าเป็นโค้ด view)',
  'ไม่มีกล่องแดง "Dataview: <error>" หรือข้อความ loader บนหน้าทั้งสี่ (Dashboard · Efforts · Effort Tickets · Picks)',
  'พฤติกรรมที่ใบนี้สัญญาไว้ (ดู AC ของ issue) เห็นได้จริง — ลองทีละข้อ',
  'หน้าอื่นที่ไม่ได้แตะยังเหมือนเดิม',
  'ดูเสร็จ: npm run try-in-vault -- --undo · หรือถ้าจะ merge แล้ว: --forget (เก็บไฟล์ไว้ ไม่ต้อง undo)',
]

export class TryError extends Error {}

const sha = (text) => createHash('sha256').update(text).digest('hex')
const readOrNull = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null)
const git = (cwd, args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
const gitOut = (cwd, args) => {
  const r = git(cwd, args)
  if (r.status !== 0) throw new TryError(`git ${args.join(' ')} ล้ม: ${(r.stderr || '').trim()}`)
  return r.stdout.trim()
}

/** โหมด + ธงจาก argv · ธงที่ไม่รู้จัก = TryError */
export const parseArgs = (argv) => {
  const opts = { mode: 'apply', vault: null, force: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (MODES[a]) opts.mode = MODES[a]
    else if (a === '--force') opts.force = true
    else if (a === '--vault') {
      const v = argv[i + 1]
      if (!v || v.startsWith('--')) throw new TryError('--vault ต้องตามด้วย path')
      opts.vault = v
      i += 1
    } else throw new TryError(`ไม่รู้จัก ${a} — ใช้ได้: --undo · --forget · --status · --vault <path> · --force`)
  }
  return opts
}

const resolveVault = (arg) => {
  const vault = resolve(arg ?? process.env.WAYFINDER_VAULT ?? DEFAULT_VAULT)
  if (!existsSync(join(vault, MANIFEST)))
    throw new TryError(`${vault} ไม่ใช่ vault ที่ติดตั้งแล้ว (ไม่มี ${MANIFEST}) — ใส่ --vault <path>`)
  return vault
}

// ── state: `<vault>/.git/wayfinder-try/state.json` + backup/ ──────────────────────────
const gitDir = (vault) => gitOut(vault, ['rev-parse', '--absolute-git-dir'])
const stateDir = (vault) => join(gitDir(vault), STATE_DIR)
const loadState = (vault) => {
  const p = join(stateDir(vault), 'state.json')
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
}
const saveState = (vault, state) => {
  const dir = stateDir(vault)
  if (state.files.length === 0) return rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`)
}

/** ทุกคู่ template → vault ที่ template เป็นเจ้าของ พร้อมเนื้อที่เรนเดอร์แล้ว (สกิลตาม manifest) */
const ownedRendered = async (repo, vault) => {
  const { ownedPairs, renderOwned } = await import(pathToFileURL(join(repo, 'template/_tools/lib/template-drift.mjs')).href)
  const man = JSON.parse(readFileSync(join(vault, MANIFEST), 'utf8'))
  const skillsDir = man.skills_dir ?? join(homedir(), '.claude/skills')
  const skillDir = (name) => man.skills_targets?.[name] ?? join(skillsDir, name)
  const withSkills = !Array.isArray(man.parts) || man.parts.includes('skills')
  const pairs = await ownedPairs({ repo, vault, skillDir, withSkills })
  return pairs.filter((p) => existsSync(p.from))
    .map((p) => ({ ...p, text: renderOwned(p.rel, readFileSync(p.from, 'utf8'), vault, p.isSkill) }))
}

// ── git ของ vault: กันไม่ให้ autocommit ลากของที่ลองเข้า history ──────────────────────────
const inVault = (vault, file) => !relative(vault, file).startsWith('..')
const isTracked = (vault, file) => git(vault, ['ls-files', '--error-unmatch', '--', relative(vault, file)]).status === 0
const setSkip = (vault, file, on) =>
  git(vault, ['update-index', on ? '--skip-worktree' : '--no-skip-worktree', '--', relative(vault, file)])
const syncExclude = (vault, files) => {
  const p = join(gitDir(vault), 'info/exclude')
  const block = new RegExp(`\\n?${EXCLUDE_BEGIN}[\\s\\S]*?${EXCLUDE_END}\\n?`)
  const kept = (readOrNull(p) ?? '').replace(block, '\n').replace(/\n+$/, '')
  const created = files.filter((f) => f.git === 'excluded').map((f) => `/${relative(vault, f.to)}`)
  const added = created.length ? `\n${EXCLUDE_BEGIN}\n${created.join('\n')}\n${EXCLUDE_END}` : ''
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, `${kept}${added}\n`)
}
const release = (vault, f) => { if (f.git === 'skip-worktree') setSkip(vault, f.to, false) }

const restoreOne = (vault, dir, f) => {
  if (f.backup === null) rmSync(f.to, { force: true })
  else writeFileSync(f.to, readFileSync(join(dir, f.backup)))
  release(vault, f)
}

const track = (vault, dir, p, current) => {
  const entry = { shown: p.shown, to: p.to, backup: null, git: 'none', written: null }
  if (current !== null) {
    entry.backup = `backup/${sha(p.to).slice(0, 16)}`
    mkdirSync(join(dir, 'backup'), { recursive: true })
    writeFileSync(join(dir, entry.backup), current)
  }
  if (inVault(vault, p.to)) entry.git = current !== null && isTracked(vault, p.to) ? 'skip-worktree' : 'excluded'
  return entry
}

/**
 * ทำให้ไฟล์ที่ template เป็นเจ้าของใน vault ตรงกับ `repo` · ของเดิมถูก backup ครั้งแรกที่ทับเท่านั้น
 * (ลองซ้ำจาก worktree เดิม = refresh) · คืน `{ state, wrote }`
 */
export const apply = async ({ repo, vault }) => {
  const prev = loadState(vault)
  if (prev && prev.repo !== repo)
    throw new TryError(`vault กำลังลองของ ${prev.branch} (${prev.repo}) อยู่ — undo ก่อน: ` +
      `cd ${prev.repo} && npm run try-in-vault -- --undo`)
  const branch = gitOut(repo, ['branch', '--show-current']) || '(detached)'
  const files = [...(prev?.files ?? [])]
  const dir = stateDir(vault)
  const wrote = []
  for (const p of await ownedRendered(repo, vault)) {
    const current = readOrNull(p.to)
    if (current === p.text) continue
    let entry = files.find((f) => f.to === p.to)
    if (!entry) files.push((entry = track(vault, dir, p, current)))
    mkdirSync(dirname(p.to), { recursive: true })
    writeFileSync(p.to, p.text)
    entry.written = sha(p.text)
    if (entry.git === 'skip-worktree') setSkip(vault, p.to, true)
    wrote.push(p.shown)
  }
  const state = { repo, branch, vault, applied_at: new Date().toISOString(), files }
  saveState(vault, state)
  syncExclude(vault, files)
  return { state, wrote }
}

/** คืนของเดิม · ไฟล์ที่มีคนแก้หลังลอง ข้ามไว้ (เว้นแต่ `force`) — คืน `{ restored, kept, state }` */
export const undo = ({ vault, force }) => {
  const state = loadState(vault)
  if (!state) return { restored: [], kept: [], state: null }
  const dir = stateDir(vault)
  const kept = state.files.filter((f) => {
    const current = readOrNull(f.to)
    return !force && current !== null && sha(current) !== f.written
  })
  const restored = state.files.filter((f) => !kept.includes(f))
  restored.forEach((f) => restoreOne(vault, dir, f))
  syncExclude(vault, kept)
  saveState(vault, { ...state, files: kept })
  return { restored: restored.map((f) => f.shown), kept: kept.map((f) => f.shown), state }
}

/** เลิกติดตาม: เก็บไฟล์ที่ลอง ทิ้ง backup · ถอด skip-worktree/exclude ⇒ autocommit เห็นมันตามปกติ */
export const forget = ({ vault }) => {
  const state = loadState(vault)
  if (!state) return null
  state.files.forEach((f) => release(vault, f))
  syncExclude(vault, [])
  saveState(vault, { ...state, files: [] })
  return state
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const runDoctor = (vault, repo) => {
  const doctor = join(vault, '_tools/doctor.mjs')
  if (!existsSync(doctor)) return console.log('\n(ไม่มี _tools/doctor.mjs ใน vault — ข้าม doctor)') ?? 0
  console.log(`\n🩺 node ${doctor} --template ${repo}\n`)
  return spawnSync(process.execPath, [doctor, '--template', repo], { stdio: 'inherit', cwd: vault }).status ?? 1
}

const NOTHING = (vault) => `ไม่มีอะไรลองค้างใน ${vault}`

const printStatus = (vault) => {
  const s = loadState(vault)
  if (!s) return console.log(NOTHING(vault))
  console.log(`ลอง ${s.branch} (${s.repo}) · ${s.applied_at} · ${s.files.length} ไฟล์:`)
  for (const f of s.files) console.log(`  ${f.backup === null ? '+' : '~'} ${f.shown}`)
}

const printUndo = (vault, force) => {
  const { restored, kept, state } = undo({ vault, force })
  if (!state) return console.log(NOTHING(vault))
  console.log(`คืน ${restored.length} ไฟล์ของ ${state.branch}${restored.map((f) => `\n  ↺ ${f}`).join('')}`)
  if (!kept.length) return
  console.log(`ข้าม ${kept.length} ไฟล์ที่มีคนแก้หลังลอง (ยังมี backup): ${kept.join(' · ')} — ทับด้วย --undo --force`)
  process.exitCode = 1
}

const printApply = async (vault) => {
  const repo = gitOut(process.cwd(), ['rev-parse', '--show-toplevel'])
  const { state, wrote } = await apply({ repo, vault })
  console.log(`ลอง ${state.branch} ใน ${vault} — วาง ${wrote.length} ไฟล์ · ` +
    `ติดตามทั้งหมด ${state.files.length} (backup ของเดิมใน .git/${STATE_DIR}/)`)
  for (const f of wrote) console.log(`  → ${f}`)
  const code = runDoctor(vault, repo)
  console.log('\nดูด้วยตา (ส่งรายการนี้ให้ผู้ใช้):')
  EYE_CHECKLIST.forEach((item, i) => console.log(`  ${i + 1}. ${item}`))
  if (code === 0) return
  console.log('\n⚠️  doctor ไม่ผ่าน — ไฟล์วางแล้ว แต่แก้ข้อ ❌ ก่อนให้ผู้ใช้ดู')
  process.exitCode = code
}

const main = async () => {
  const opts = parseArgs(process.argv.slice(2))
  const vault = resolveVault(opts.vault)
  if (opts.mode === 'status') return printStatus(vault)
  if (opts.mode === 'undo') return printUndo(vault, opts.force)
  if (opts.mode === 'forget') {
    const s = forget({ vault })
    return console.log(s ? `เลิกติดตาม ${s.files.length} ไฟล์ของ ${s.branch} — ไฟล์อยู่ต่อ backup ถูกทิ้ง` : NOTHING(vault))
  }
  return printApply(vault)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    if (!(e instanceof TryError)) throw e
    console.error(`❌ ${e.message}`)
    process.exitCode = 2
  })
}
