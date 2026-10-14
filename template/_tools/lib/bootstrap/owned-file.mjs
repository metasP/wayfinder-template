// วิธีที่ bootstrap เขียนไฟล์ **นอก vault** (`~/.claude/settings.json` · `~/.claude/CLAUDE.md` · `obsidian.json`)
// — git ของ vault กู้ไฟล์พวกนี้ให้ไม่ได้ มีแค่ `.bak` กับความระวังตอนเขียน (issue #47)
//
//   · `.bak` เขียน **ครั้งเดียว** แล้วไม่ทับอีก = ไฟล์ก่อน bootstrap แก้ครั้งแรกเสมอ
//     เมื่อก่อนทุกรอบที่มีอะไรเปลี่ยนก็อบทับ `.bak` ⇒ รันสองรอบแล้วไฟล์ของ 0.4.x ที่เจ้าของอยากได้คืนหายไป
//   · อ่านซ้ำ **ก่อนเขียน** — ขั้น 3b อ่านไว้ตั้งแต่ก่อนวางไฟล์ vault แต่ Claude Code ที่เปิดค้างเขียน
//     settings.json ได้ตลอด (ตอบ "always allow" หนึ่งครั้ง) ⇒ เขียนของที่คำนวณจากเนื้อเก่าทับ = ของเขาหายเงียบ ๆ
//     เนื้อเปลี่ยนไปแล้ว → ต่อใหม่บนเนื้อล่าสุด · ต่อไม่ได้ (เขียนค้างครึ่งไฟล์) → ไม่เขียน แล้วบอก
//
// ตัวเขียนมาทาง `io` เท่านั้น ไม่ import ตัวเขียนของ fs เอง — ตัวห่อของ `--plan` ที่ bootstrap.mjs เลือกไว้ที่เดียว
// ต้องเป็นทางเดียวที่ไฟล์ถูกเขียน (ข้อ 5p เฝ้าอยู่)
import { access, constants } from 'node:fs/promises'

/**
 * Copy `path` to `<path>.bak` unless a `.bak` is there already — bootstrap's from an earlier run, or one
 * the owner (or 0.4.x) made: either way it is older than this run and is not overwritten.
 * Returns `created` or `kept`.
 * `io.copyFile` is bootstrap's (a no-op under `--plan`, which then reports what it would do).
 */
export async function keepFirstBackup(path, io) {
  const bak = `${path}.bak`
  if (await access(bak).then(() => true, () => false)) return 'kept'
  return io.copyFile(path, bak, constants.COPYFILE_EXCL)
    .then(() => 'created', (e) => (e.code === 'EEXIST' ? 'kept' : Promise.reject(e)))
}

/**
 * Write `planned` to `path` — computed from `seen`, the text read earlier (null: no file) — after reading
 * the file again. If it changed meanwhile, `rewire(now)` (`{ text }` or `{ error }`) computes what to write
 * from the content there now instead. Backs the file up first (`keepFirstBackup`).
 * Returns `{ status: written | current | refused, raced, backup: created | kept | null, error? }`.
 */
export async function writeOwned(path, { seen, planned, rewire, io }) {
  let now
  try {
    now = await io.readFile(path, 'utf8')
  } catch (e) {
    if (e.code !== 'ENOENT') return { status: 'refused', raced: false, backup: null, error: e.message }
    now = null
  }
  const raced = now !== seen
  let next = planned
  if (raced) {
    const fresh = rewire(now)
    if (fresh.error) return { status: 'refused', raced, backup: null, error: fresh.error }
    next = fresh.text
  }
  if (next === now) return { status: 'current', raced, backup: null }
  const backup = now === null ? null : await keepFirstBackup(path, io)
  await io.writeFile(path, next)
  return { status: 'written', raced, backup }
}
