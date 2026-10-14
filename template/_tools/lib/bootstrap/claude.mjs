// สองไฟล์ของ Claude Code ที่ bootstrap เขียน: `~/.claude/settings.json` (ชิ้น `hook`) กับ `~/.claude/CLAUDE.md`
// (ชิ้น `memory`) — ขั้น 3b อ่าน · ขั้น 4f/4g ต่อแล้วเขียน · กฎว่าเขียนอะไรอยู่ใน ../wiring.mjs
// ตัวเขียนมาทาง `io` ของ bootstrap.mjs เท่านั้น (ตัวห่อของ `--plan`) — ดู owned-file.mjs
import { readFile } from 'node:fs/promises'
import { settingsShapeError, wfCommand, wireSettings, withWfBlock } from '../wiring.mjs'
import { unifiedDiff } from '../diff.mjs'
import { writeOwned } from './owned-file.mjs'
import { die, log } from './say.mjs'

// settings.json ที่อ่านมา → `{ value }` หรือ `{ error }` · ส่วนที่ installer เขียนต้องมีรูปที่ Claude Code อ่าน
// อยู่แล้ว — รูปอื่น (เช่น `hooks.PostToolUse` เป็น object) ถ้าปล่อยให้ wireSettings เขียน = ค่าเดิมของเขาถูก
// แทนทั้งก้อนเงียบ ๆ
const parseSettings = (text) => {
  if (text === null) return { value: null }
  let value
  try { value = JSON.parse(text) } catch (e) { return { error: `ไม่ใช่ JSON (${e.message})` } }
  const shape = settingsShapeError(value)
  return shape ? { error: shape } : { value }
}
const serialize = (settings) => `${JSON.stringify(settings, null, 2)}\n`

// ── ขั้นที่ 3b — อ่านไฟล์ของเครื่องที่จะเขียน **ก่อนเขียนอะไรทั้งนั้น** ─────────────────────────────
// settings.json ที่ parse ไม่ได้ หรือ CLAUDE.md ที่อ่านไม่ได้ (ไม่ใช่ "ไม่มีไฟล์") = หยุดตรงนี้
// ไม่งั้นขั้น 4f/4g จะเขียนทับด้วยของที่สร้างจากไฟล์ว่าง ⇒ ค่าตั้งทั้งหมดของเขาหายเงียบ ๆ
// (ขั้น 1c อ่านแบบหลวม ๆ เพื่อรายงานเท่านั้น)
/** → `{ settings: { text, value }, claudeMd }`, each text null when there is no file (or it isn't wired). */
export async function readClaudeFiles({ settingsPath, claudeMdPath, wireHook, wireMemory }) {
  const readOwn = (p) => readFile(p, 'utf8')
    .catch((e) => (e.code === 'ENOENT' ? null : die(`อ่าน ${p} ไม่ได้ (${e.message}) — ยังไม่มีอะไรถูกเขียน`)))
  const seen = { settings: { text: null, value: null }, claudeMd: null }
  if (wireHook) {
    const text = await readOwn(settingsPath)
    const { value, error } = parseSettings(text)
    if (error) die(`${settingsPath}: ${error} — แก้ให้ถูกก่อน installer ไม่เขียนทับส่วนที่อ่านไม่ออก · ยังไม่มีอะไรถูกเขียน`)
    seen.settings = { text, value }
  }
  if (wireMemory) seen.claudeMd = await readOwn(claudeMdPath)
  return seen
}

const showDiff = (label, before, after) => log(`\n${unifiedDiff(label, before, after).trimEnd()}\n`)
const hookLine = (c) =>
  c.action === 'allow' ? `+ permissions.allow  ${c.rule}`
  : c.action === 'add' ? `+ ${c.event} "${c.matcher}"  ${c.command}`
  : c.action === 'replace' ? `↻ ${c.event} "${c.matcher}"  ${c.from}  →  ${c.command}`
  : `− ${c.event} "${c.matcher}"  ${c.command}  (เส้นเก่า/ซ้ำของ vault นี้)`

// ผลของ `writeOwned` เป็นคำพูด · คืนจำนวนข้อที่ล้ม (ไม่ได้เขียนเพราะอ่านซ้ำก่อนเขียนไม่ผ่าน)
const sayWritten = (name, r, WILL) => {
  if (r.status === 'refused') {
    log(`  ❌ ไม่ได้เขียน ${name} — ${r.raced ? 'ถูกแก้ระหว่างรอบนี้แล้วอ่านไม่ออก' : 'อ่านซ้ำก่อนเขียนไม่ได้'} (${r.error})` +
      ' · ของเดิมอยู่ครบ รันซ้ำเมื่อไฟล์นิ่ง')
    return 1
  }
  if (r.raced) log(`     ↪️  ${name} ถูกแก้ระหว่างรอบนี้ (เช่น Claude Code) — ` +
    (r.status === 'current' ? 'เนื้อล่าสุดต่อไว้ครบแล้ว ไม่ได้เขียน' : 'ต่อใหม่บนเนื้อล่าสุด ของที่แก้ไว้ไม่หาย'))
  if (r.backup === 'created') log(`     ↪️  ${WILL}สำรองของเดิมไว้ที่ ${name}.bak`)
  // `.bak` ที่มีอยู่ก่อนเก่ากว่ารอบนี้เสมอ (bootstrap รอบแรก · 0.4.x · หรือเจ้าของทำเอง) ⇒ ไม่ทับ และรอบนี้ไม่ได้สำรองใหม่
  if (r.backup === 'kept') log(`     ↪️  ${name}.bak มีอยู่แล้ว — ไม่ทับ (เก่ากว่ารอบนี้ · รอบนี้ไม่ได้สำรองใหม่)`)
  return 0
}

/**
 * Steps 4f (settings.json) and 4g (CLAUDE.md). `seen` is what `readClaudeFiles` read; `wiring` is
 * `{ vault, vaults, home }`; `io` is bootstrap's `{ readFile, writeFile, copyFile, mkdir }`.
 * Returns `{ changed: [labels of the files it changes], failed: count }`.
 */
export async function wireClaudeFiles(ctx) {
  const hook = await wireSettingsFile(ctx)
  const memory = await wireClaudeMd(ctx)
  return { changed: [...hook.changed, ...memory.changed], failed: hook.failed + memory.failed }
}

async function wireSettingsFile({ claudeDir, settingsPath, seen, wireHook, wiring, io, MARK, WILL }) {
  const changed = []
  let failed = 0
  // ── 4f. hook + allow rule ของ wf ใน ~/.claude/settings.json (Q15 · Q7 · Q21) ────────────────────
  // ต่อ frontmatter guard (PreToolUse `Write|Edit`) กับ autocommit ใหม่ (PostToolUse `Write|Edit` **เท่านั้น**
  // ไม่มี `|| true`) · ถอด autocommit รุ่นเก่าทุกเส้นของ vault นี้ รวม matcher `Bash` ที่ spec ตัดทิ้ง
  // (`wf` commit งานของตัวเอง) · เติม allow rule ของ `node <wf>` ตรงตัว — **ไม่แตะ `PATH`** (Q21)
  // กฎว่าเส้นไหน "ของเรา" อยู่ใน lib/wiring.mjs ที่เดียว (ขั้นที่ 2 ใช้ตัวเดียวกันรายงาน) · key อื่นทุกตัว
  // อยู่ตามเดิม · เขียนเฉพาะเมื่อมีอะไรเปลี่ยน ⇒ รันซ้ำแล้วไม่มีไบต์ไหนขยับ
  // diff เต็มของไฟล์นอก vault โชว์ในแผนทุกบรรทัด — git ของ vault กู้ไฟล์พวกนี้ให้ไม่ได้ มีแค่ `.bak`
  if (wireHook) {
    const { settings, changes } = wireSettings(seen.settings.value, wiring)
    if (changes.length) {
      changed.push('~/.claude/settings.json')
      log(`  ${MARK} ${WILL}แก้ ~/.claude/settings.json ${changes.length} จุด`)
      for (const c of changes) log(`     ${hookLine(c)}`)
      // diff **เฉพาะ key ที่ installer เป็นเจ้าของ** ไม่ใช่ทั้งไฟล์: settings.json มักมี token/API key อยู่ใน
      // `env` และแผนนี้มักถูกรันโดย agent ⇒ diff ทั้งไฟล์ = ความลับไปโผล่ใน transcript (ไฟล์ที่เขียนบรรทัด
      // เดียวทั้งก้อน re-serialize แล้ว diff ออกมาทุกบรรทัด) · key อื่นไม่เปลี่ยนค่า — บอกแค่ว่าจัดรูปใหม่ไหม
      const owned = (s) => `${JSON.stringify({ hooks: s?.hooks ?? {}, permissions: { allow: s?.permissions?.allow ?? [] } }, null, 2)}\n`
      showDiff('~/.claude/settings.json (hooks + permissions.allow)', owned(seen.settings.value), owned(settings))
      const reformatted = seen.settings.text !== null && seen.settings.text !== serialize(seen.settings.value)
      if (reformatted) log('     ↪️  key อื่นค่าเดิมทุกตัว แต่ไฟล์จะถูกเขียนใหม่เป็น JSON เว้น 2 ช่อง (รูปแบบเดิมดูได้จาก .bak)')
      await io.mkdir(claudeDir, { recursive: true })
      // เนื้อที่เปลี่ยนไประหว่างรอบ: ต่อใหม่ด้วยกฎเดียวกัน · ต่อแล้วไม่มีอะไรเปลี่ยน = คงไฟล์ไว้ไบต์ต่อไบต์
      const rewire = (text) => {
        const { value, error } = parseSettings(text)
        if (error) return { error }
        const fresh = wireSettings(value, wiring)
        return { text: fresh.changes.length ? serialize(fresh.settings) : text }
      }
      const r = await writeOwned(settingsPath, { seen: seen.settings.text, planned: serialize(settings), rewire, io })
      failed += sayWritten('settings.json', r, WILL)
      if (r.status === 'written') log('     ⚠️ ต้องรีสตาร์ต Claude Code หรือเปิด /hooks หนึ่งครั้ง config ถึงจะโหลดใหม่')
    } else log(`  ✅ hook (guard + autocommit) และ allow rule ของ wf ต่อไว้ครบแล้ว (ข้าม)`)
  } else log('  ⏭  ข้าม hook + allow rule ของ wf')
  return { changed, failed }
}

async function wireClaudeMd({ claudeDir, claudeMdPath, seen, wireMemory, wiring, io, MARK, WILL }) {
  const changed = []
  let failed = 0
  // ── 4g. ย่อหน้าของ wf ใน ~/.claude/CLAUDE.md ─────────────────────────────────────────────
  // ย่อหน้านี้เป็น **ตัวชี้** ไม่ใช่ตัว format — layout · frontmatter · operation อยู่ใน README ของ vault
  // ที่ update ตามได้ · ที่ต้องอยู่ใน CLAUDE.md จริง ๆ มีแค่ที่อยู่ของ vault กับ **วิธีเรียก `wf`** (path
  // เต็ม เพราะไม่แตะ `PATH` · Q21) และกติกาว่า state เปลี่ยนผ่าน `wf` ส่วนเนื้อเขียนด้วย Write/Edit
  // อยู่ระหว่าง marker ⇒ รันซ้ำแทนที่ตรงที่เดิม · ย่อหน้ารุ่นก่อน marker (หัวข้อเดิม) ถูกหาเจอแล้วแทนที่
  // ไม่ซ้อนซ้ำ — ย่อหน้ารุ่นนั้นสั่ง "ปล่อย commit ให้ autocommit" ซึ่งผิดแล้วเมื่อ `wf` commit เอง
  if (wireMemory) {
    const cur = seen.claudeMd ?? ''
    const { text, status } = withWfBlock(cur, wiring.vault)
    if (status === 'current') log('  ✅ ~/.claude/CLAUDE.md มีย่อหน้า wf รุ่นปัจจุบันแล้ว (ข้าม)')
    else {
      log(`  ${MARK} ${WILL}${status === 'added' ? 'เติม' : 'แทนที่ตรงที่เดิม —'} ย่อหน้า wf ใน ~/.claude/CLAUDE.md` +
        ` · agent เรียก ${wfCommand(wiring.vault)} <verb>`)
      showDiff('~/.claude/CLAUDE.md', cur, text)
      changed.push('~/.claude/CLAUDE.md')
      await io.mkdir(claudeDir, { recursive: true })
      const rewire = (now) => ({ text: withWfBlock(now ?? '', wiring.vault).text })
      const r = await writeOwned(claudeMdPath, { seen: seen.claudeMd, planned: text, rewire, io })
      failed += sayWritten('CLAUDE.md', r, WILL)
    }
  } else {
    log(`  ⏭  ข้ามย่อหน้าใน ~/.claude/CLAUDE.md
     ⚠️ นี่คือที่ **เดียว** ที่บอก /wayfinder ว่า vault อยู่ไหน และบอก agent ให้เปลี่ยน state ผ่าน wf
        ไม่เติมแล้วมันจะไปทำตาม docs/agents/issue-tracker.md ของ repo ที่เปิดอยู่แทน`)
  }
  return { changed, failed }
}
