// ขั้นที่ 5p ของ bootstrap — เฉพาะ `--plan`: สรุปแผน แล้วพิสูจน์ว่าไม่ได้แตะอะไรจริง ด้วยลายนิ้วมือ
// ของทุกอย่างที่ตัวเขียนของ bootstrap เอื้อมถึง (เก็บก่อนขั้น 4 · เทียบอีกรอบตรงนี้)
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { log } from './say.mjs'

const sha = (buf) => createHash('sha256').update(buf).digest('hex')

/** `watched` (`[key, absolute path]` pairs) → Map key → sha of the file ('ø': none), plus the vault's git HEAD. */
export async function fingerprint(watched, { vault, run }) {
  const out = new Map()
  for (const [key, abs] of watched) out.set(key, await readFile(abs).then(sha, () => 'ø'))
  out.set('git HEAD ของ vault', await run('git', ['-C', vault, 'rev-parse', 'HEAD']).then((r) => r.stdout.trim(), () => 'ø'))
  return out
}

/**
 * Print the plan's summary, check nothing moved since `before` (`fingerprintNow()` again), and exit:
 * 0, 1 when the dry run wrote something, 2 for an update run without `--plan` (it needs `--yes`).
 */
export async function finishPlan(ctx) {
  await sayPlan(ctx)
  await checkNothingMoved(ctx)
  sayNext(ctx)
  process.exit(0)
}

async function sayPlan({ mode, target, wiresVault, stats, dropped, manifestChanged, migrationFiles, otherChanges, run }) {
  const dirtyBefore = await run('git', ['-C', target, 'status', '--porcelain']).then((r) => r.stdout.trim(), () => '')
  const mine = stats.written > 0 || dropped.length > 0 || manifestChanged
  log(`
── สรุปแผน ──────────────────────────────────────────────────`)
  log(`  จะเขียน ${stats.written} · จะลบ ${dropped.length} · เหมือนเดิม/ข้าม ${stats.skipped}` +
      (stats.keptSeed ? ` · ไม่แตะ seed ${stats.keptSeed}` : ''))
  log(`  ไม่แตะเด็ดขาด: effort ของคุณ · _tools/harness-kit/ · ทุกอย่างที่ไม่เคยอยู่ใน manifest`)
  if (wiresVault) {
    // ⚠️ commit ปิดท้ายขับด้วย `git status` **ทั้ง working tree** ไม่ใช่เฉพาะไฟล์ที่ installer แตะ
    // ⇒ vault ที่สกปรกอยู่ก่อนแล้วจะถูก commit ไปด้วยแม้ update จะไม่เปลี่ยนอะไรเลย — แผนต้องบอก
    if (mine) log(`  จะ commit ลง vault: มี (${mode})`)
    else if (dirtyBefore) log(`  จะ commit ลง vault: มี — **แต่ไม่ใช่ของ update** · vault สกปรกอยู่ก่อนแล้ว
     ${dirtyBefore.split('\n').length} รายการ แล้ว commit ปิดท้ายกวาด \`git add -A\` ทั้ง tree`)
    else log(`  จะ commit ลง vault: ไม่มี (ไม่มีอะไรเปลี่ยน)`)
  }
  if (migrationFiles.length) log(`  จะ wf migrate: ${migrationFiles.length} ไฟล์ (commit แยก)`)
  if (otherChanges.length) log(`  จะแก้นอกไฟล์ template: ${otherChanges.join(' · ')}`)
  // บรรทัดเดียวที่ตอบ "รันซ้ำแล้วเป็น no-op ไหม" — เขียวได้เฉพาะเมื่อ **ทุก** ขั้นข้างบนว่าง
  if (!mine && !dirtyBefore && !migrationFiles.length && !otherChanges.length)
    log(`  ทั้งหมด: ไม่มีอะไรต้องเปลี่ยน — รันด้วย --yes ก็ไม่มีไบต์ไหนขยับ`)
}

async function checkNothingMoved({ target, before, fingerprintNow }) {
  // ตรวจว่าที่พูดมาทั้งหมดเป็นจริง — ตัวกัน `--plan` อยู่ที่ตัวห่อ fs/`runWrite` จุดเดียว แต่ "จุดเดียว"
  // เป็นจริงได้ก็ต่อเมื่อไม่มีใครเผลอเรียกของเดิมตรง ๆ ในอนาคต ⇒ ข้อนี้เฝ้าสมมติฐานนั้นแทนคอมเมนต์เตือน
  // **บั๊กที่ใบนี้แก้ เกิดจากธงที่ไม่เคยมีใครตรวจว่ามันทำงานจริงไหม — จะไม่ซ้ำรอยด้วยธงที่ไม่มีใครตรวจอีกอัน**
  const after = await fingerprintNow()
  const moved = [...after.keys()].filter((k) => before.get(k) !== after.get(k))
  log(`
── ตรวจว่า dry run ไม่ได้เขียนจริง ───────────────────────────`)
  if (moved.length) {
    log(`  ❌ มี ${moved.length} จุดขยับระหว่าง --plan: ${moved.join(' · ')}`)
    console.error(`❌ \`--plan\` เขียนของจริง — นี่คือบั๊กของตัวกัน dry run เอง ไม่ใช่ของ vault คุณ
   มีคนเรียก fsWriteFile/fsRm/fsMkdir/run ตรง ๆ แทนตัวห่อที่หัวไฟล์ (หรือ \`runWrite\`)
   กู้ของที่ขยับ: git -C ${target} log -p -1`)
    process.exit(1)
  }
  log(`  ✅ ไม่มีไบต์ไหนขยับ — เทียบ ${after.size} จุด (ไฟล์ที่ manifest/template ครอบ · สกิล ·
     ~/.claude/settings.json · ~/.claude/CLAUDE.md · obsidian.json กับ .bak ของมัน · git HEAD ของ vault)`)
}

function sayNext({ mode, askedPlan }) {
  if (mode === 'update') {
    log(`
ลงมือจริงด้วยคำสั่งเดิม${askedPlan ? 'โดยตัด `--plan` ออก แล้ว' : ''}เติม \`--yes\` — update ไม่ลงมือถ้าไม่มี \`--yes\`
`)
    if (!askedPlan) {
      console.error('❌ update ต้องมี --yes ถึงจะลงมือ — ข้างบนคือแผน ยังไม่มีอะไรถูกเขียน (อ่านแผนก่อน แล้วรันซ้ำพร้อม --yes)')
      process.exit(2)
    }
  } else log(`
รันจริงด้วยคำสั่งเดิมโดย **ตัด \`--plan\` ออก**
`)
}
