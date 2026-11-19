// ── ขั้น 4a2 ของ update: ของที่มีแต่ใน vault — หยุด `--yes` ก่อนทับ (merge-route-fixes#03) ─────────────
// เคสจริง: หลายใบต่อยอดบน PR #73 ที่ยังไม่ merge — ก็อบไฟล์ของ PR ลง vault/สกิลเอง แล้ว `bootstrap --yes`
// จาก main (ที่ยังไม่มี #73) ทับ/ลบของพวกนั้นทิ้งเงียบ ๆ ⇒ ใบถัดไปต้อง cherry-pick คืน · บรรทัด
// "ทับไฟล์ที่คุณเคยแก้ไว้" เดิมขึ้น **หลัง** ทับไปแล้ว ⇒ ตอนนี้เช็คก่อนเขียนอะไรทั้งนั้น
//
// "มีแต่ใน vault" = ไฟล์ที่ update นี้จะทับหรือลบ ซึ่งเนื้อตอนนี้ไม่ใช่ทั้งของใหม่ และ:
//   · ไม่ใช่ไบต์ที่ installer รอบก่อนเขียนไว้ (sha ใน manifest) ⇒ มีคนแก้ใน vault/สกิลเองทีหลัง หรือ
//   · installer รอบก่อนรันจาก commit ที่ checkout นี้ **ไม่มีในประวัติ** (branch ที่ยังไม่ merge หรือ main
//     ที่ใหม่กว่า) ⇒ ไบต์ที่ manifest จดไว้เองก็ใหม่กว่าที่กำลังจะวาง — รันต่อ = ถอย template กลับ
// ไฟล์ที่เนื้อตรงกับของใหม่อยู่แล้ว (เช่น PR ที่ squash เข้า main แล้ว) ไม่นับ — ไม่มีอะไรหาย

/**
 * Whether the commit the last install came from (`installed`) is outside `head`'s history, as
 * `{ installed, branches }` (the branches holding it), or null — also when git can't tell (an npx
 * install has no sha; a commit this clone never fetched).
 */
export async function templateLineage({ run, repo, installed, head }) {
  if (!installed || !head || installed === head) return null
  const ok = (args) => run('git', ['-C', repo, ...args]).then(() => true, () => false)
  if (!(await ok(['cat-file', '-e', `${installed}^{commit}`]))) return null
  if (await ok(['merge-base', '--is-ancestor', installed, head])) return null
  const branches = await run('git', ['-C', repo, 'branch', '-a', '--contains', installed, '--format=%(refname:short)'])
    .then((r) => r.stdout.split('\n').map((b) => b.trim()).filter(Boolean), () => [])
  return { installed, branches }
}

/**
 * The `shown` names of `entries` whose installed copy holds a change only the vault has. Each entry is
 * `{ shown, now, next, prev }`: sha on disk (null: none), sha this run writes (null: it removes the
 * file), sha the last install wrote (from the manifest). `diverged`: the last install came from a commit
 * this checkout lacks, so even its bytes are newer than these.
 */
export const vaultOnlyChanges = ({ entries, diverged }) =>
  entries.filter((e) => e.now !== null && e.now !== e.next && (diverged || e.now !== e.prev)).map((e) => e.shown)

/** The message that stops `--yes` (or warns in a plan), naming each file and the ways out, after `heading`. */
export function vaultOnlyMessage({ files, lineage, headLabel, onTrial, heading }) {
  const lines = []
  lines.push(`${heading} — update นี้จะทับ/ลบของที่มีแต่ใน vault ${files.length} ไฟล์:`)
  lines.push(`     ${files.join(' · ')}`)
  if (lineage) {
    const where = lineage.branches.length ? ` (อยู่ใน ${lineage.branches.join(' · ')})` : ''
    lines.push(`   template รอบก่อนมาจาก ${lineage.installed.slice(0, 8)}${where} ซึ่ง checkout นี้ (${headLabel}) ไม่มี`)
    lines.push('   ⇒ merge PR ของ branch นั้นเข้า main ก่อน แล้ว pull --ff-only · หรือรัน bootstrap จาก checkout ที่มี commit นั้น')
  } else {
    lines.push('   ไฟล์พวกนี้ถูกแก้ใน vault/สกิลหลัง install รอบก่อน ⇒ ย้ายของที่แก้เข้า template (PR) แล้ว merge ก่อน')
  }
  if (onTrial) lines.push('   vault มีของจาก `npm run try-in-vault` ค้างอยู่ — `npm run try-in-vault -- --undo` (หรือ --forget หลัง merge) ก่อน')
  lines.push('   ตั้งใจทิ้งของพวกนี้จริง (กู้ของใน vault ได้จาก git log -p · สกิลอยู่นอก git): เติม --discard-vault-changes')
  return lines.join('\n')
}
