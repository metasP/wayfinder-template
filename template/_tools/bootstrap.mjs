#!/usr/bin/env node
// ต่อ wayfinder-vault ที่ copy/clone มาแล้ว เข้ากับเครื่องนี้ — idempotent รันซ้ำได้ไม่พัง
//
// ทำอะไรบ้าง:
//   1. เช็คว่าไฟล์ใน vault ครบ — ขาดแล้วหยุด (สร้างแทนให้ไม่ได้ ต้อง copy/clone มาให้ครบ)
//   2. git init + commit แรก ถ้ายังไม่เป็น repo
//   3. chmod +x autocommit.sh
//   4. --wire-hook    ต่อ PostToolUse hook เข้า ~/.claude/settings.json
//   5. --wire-memory  ใส่กติกา wayfinder-vault ลง ~/.claude/CLAUDE.md (user scope)
//   6. พิมพ์ขั้นตอนที่ต้องทำมือ แล้วรัน doctor
//
// ใช้:
//   node _tools/bootstrap.mjs --wire-hook --wire-memory
//
// ทั้งสองแฟล็กเป็น opt-in เพราะมันแก้ config ระดับ global — ต้องพิมพ์เองถึงจะทำ ไม่ทำเงียบ ๆ
//
// เนื้อหาของ vault (Dashboard, Efforts, README, .gitignore, สี Graph View, ตัวปลั๊กอิน Dataview)
// **track อยู่ใน git ทั้งหมด** ⇒ clone มาก็ได้ครบ สคริปต์นี้จึงไม่มีหน้าที่สร้างไฟล์เนื้อหาใด ๆ

import { readFile, writeFile, chmod, stat, copyFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const run = promisify(execFile)
const VAULT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLAUDE = join(homedir(), '.claude')
const args = process.argv.slice(2)
const has = (f) => args.includes(f)

const log = (s) => console.log(s)
const exists = (p) => stat(p).then(() => true, () => false)

const HOOK_CMD = `${VAULT}/_tools/autocommit.sh 2>/dev/null || true`

const REQUIRED = [
  '_tools/autocommit.sh',
  '_tools/doctor.mjs',
  'Wayfinder Dashboard.md',
  'Wayfinder Efforts.md',
  'README.md',
  'SETUP.md',
  '.gitignore',
]

// ── 1. ไฟล์ครบไหม ───────────────────────────────────────────────────────────
{
  const missing = []
  for (const f of REQUIRED) if (!(await exists(join(VAULT, f)))) missing.push(f)
  if (missing.length) {
    console.error(`❌ ไฟล์หายไป ${missing.length} ตัว: ${missing.join(', ')}`)
    console.error('   สร้างแทนให้ไม่ได้ — copy/clone vault มาให้ครบก่อน แล้วรันใหม่')
    process.exit(1)
  }
  log(`✅ ไฟล์ครบ ${REQUIRED.length} ตัว`)
}

// ── 2. git ──────────────────────────────────────────────────────────────────
{
  const isRepo = await run('git', ['-C', VAULT, 'rev-parse', '--git-dir']).then(() => true, () => false)
  if (!isRepo) {
    await run('git', ['-C', VAULT, 'init', '-q', '-b', 'main'])
    await run('git', ['-C', VAULT, 'add', '-A'])
    await run('git', ['-C', VAULT, 'commit', '-q', '-m', 'chore: init wayfinder vault'])
    log('✅ git init + commit แรก')
  } else {
    log('✅ เป็น git repo อยู่แล้ว')
  }
}

// ── 3. chmod ────────────────────────────────────────────────────────────────
await chmod(join(VAULT, '_tools/autocommit.sh'), 0o755)
log('✅ autocommit.sh execute ได้')

// ── 4. hook ─────────────────────────────────────────────────────────────────
if (has('--wire-hook')) {
  const p = join(CLAUDE, 'settings.json')
  const raw = await readFile(p, 'utf8').catch(() => '{}')
  const settings = JSON.parse(raw)

  settings.hooks ??= {}
  settings.hooks.PostToolUse ??= []

  const already = JSON.stringify(settings.hooks.PostToolUse).includes('autocommit.sh')
  if (already) {
    log('✅ hook ต่อไว้อยู่แล้ว (ข้าม)')
  } else {
    if (await exists(p)) await copyFile(p, `${p}.bak`)
    const entry = {
      type: 'command',
      command: HOOK_CMD,
      timeout: 15,
      statusMessage: 'Committing wayfinder-vault...',
    }
    const block = settings.hooks.PostToolUse.find((b) => b.matcher === 'Write|Edit')
    if (block) block.hooks.push(entry)
    else settings.hooks.PostToolUse.push({ matcher: 'Write|Edit', hooks: [entry] })

    await writeFile(p, JSON.stringify(settings, null, 2) + '\n')
    log(`✅ ต่อ hook เข้า ~/.claude/settings.json แล้ว (สำรองไว้ที่ settings.json.bak)`)
  }
} else {
  log('⏭  ข้าม hook — เติม --wire-hook ถ้าต้องการ')
}

// ── 5. memory / กติกา user scope ────────────────────────────────────────────
const MEMORY_BLOCK = `
## Wayfinder maps live in \`wayfinder-vault\`, never in a repo

ทุก \`/wayfinder\` map และ ticket อยู่ที่ **\`${VAULT}\`** ไม่ว่าจะทำงานอยู่ repo ไหน
vault นี้มี git ของตัวเอง — การอยู่นอก repo คือประเด็นทั้งหมด: map ที่เก็บใน \`docs/plan/\`
จะตายไปพร้อม worktree และ commit ไม่ได้ (ดูกติกา *Never commit implementation-plan docs*)

- Layout: \`wayfinder-vault/<repo>/<effort>/map.md\` + \`…/<effort>/issues/NN-<slug>.md\`
- Ticket ใช้ **YAML frontmatter** — \`repo\`, \`effort\`, \`type\`
  (research|prototype|grilling|task), \`status\` (open|claimed|resolved) และ
  \`blockers\` เป็น list ของ **\`[[wikilinks]]\`** ไม่ใช่เลข; map ใช้ \`repo\`/\`effort\`/\`kind: map\`
  Dataview และ Graph View อ่านค่าพวกนี้ — ticket ที่ไม่มี frontmatter จะหายไปจาก dashboard
- สองหน้าที่เปิดค้างไว้: **Wayfinder Dashboard** (ระดับใบ) · **Wayfinder Efforts** (ระดับแมป)
- \`_tools/\` เก็บสคริปต์ของ vault เอง ทุก Dataview query กรองด้วย \`FROM "" AND -"_tools"\`
- **ห้าม commit vault ด้วยมือ** — PostToolUse hook \`autocommit.sh\` commit ให้ทุก Write/Edit
- **ห้าม sync/copy map ไป-กลับระหว่าง repo กับ vault** — มีที่เดียว ก็อบปี้เดียว
- ตรวจสุขภาพ setup: \`node ${VAULT}/_tools/doctor.mjs\`
- อ่าน \`wayfinder-vault/README.md\` ก่อนเริ่ม map ใหม่
`

if (has('--wire-memory')) {
  const p = join(CLAUDE, 'CLAUDE.md')
  const cur = await readFile(p, 'utf8').catch(() => '')
  if (cur.includes('wayfinder-vault')) {
    log('✅ ~/.claude/CLAUDE.md พูดถึง wayfinder-vault อยู่แล้ว (ข้าม)')
  } else {
    if (cur) await copyFile(p, `${p}.bak`)
    await writeFile(p, `${cur.trimEnd()}\n${MEMORY_BLOCK}`)
    log('✅ เติมกติกา wayfinder-vault ลง ~/.claude/CLAUDE.md แล้ว')
  }
} else {
  log('⏭  ข้าม memory — เติม --wire-memory ถ้าต้องการ')
}

// ── 6. ขั้นตอนที่ต้องทำมือ ──────────────────────────────────────────────────
log(`
────────────────────────────────────────────────────────────
ที่เหลือต้องทำมือ (ผมทำแทนไม่ได้):

  1. ติดตั้ง Obsidian แล้ว "Open folder as vault" ที่
     ${VAULT}
  2. Settings → Community plugins → Turn on
     (ตัวปลั๊กอิน Dataview + ค่าตั้ง + สี Graph View มากับ repo แล้ว ไม่ต้องโหลดใหม่)
  3. เปิดโน้ต "Wayfinder Dashboard" กับ "Wayfinder Efforts"
  4. ถ้าเพิ่งต่อ hook: เปิด /hooks ใน Claude Code หนึ่งครั้งให้ config โหลดใหม่
────────────────────────────────────────────────────────────
`)

// ── 7. doctor ───────────────────────────────────────────────────────────────
const { stdout } = await run('node', [join(VAULT, '_tools/doctor.mjs')]).catch((e) => e)
log(stdout ?? '')
