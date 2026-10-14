// ── 4h. Obsidian — แอป (brew ถ้าเขาอนุญาต) กับการลงทะเบียน vault ใน `obsidian.json` ─────────────
// ตัวเขียนมาทาง `io` / `runWrite` ของ bootstrap.mjs เท่านั้น (ตัวห่อของ `--plan`)
import { readFile } from 'node:fs/promises'
import { keepFirstBackup } from './owned-file.mjs'
import { log } from './say.mjs'

const randomKey = () => [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')

/**
 * Install the app (`brew`, only when allowed) and register `vault` in Obsidian's `obsidian.json`.
 * `env` is bootstrap's step-1c view of the machine. Returns the labels of what it changes.
 */
export async function wireObsidian({ env, allowBrew, obsidianJson, vault, io, runWrite, MARK, WILL }) {
  const changed = []
  if (env.obsidianRunning)
    log(`  ⚠️  Obsidian เปิดค้างอยู่ — ตอนแอปเปิด ไฟล์ใน .obsidian/ เป็น *output* ของมัน
     มันจะ flush ทับค่าที่เพิ่งเขียน ⇒ ปิดให้สนิทแล้วรันซ้ำถ้า Graph View ไม่มีสี`)
  if (!env.obsidianApp) {
    if (allowBrew === 'yes' && env.brew) {
      changed.push('brew install --cask obsidian')
      await runWrite('brew', ['install', '--cask', 'obsidian']).then(
        () => log(`  ${MARK} ${WILL}brew install --cask obsidian`),
        (e) => log(`  ❌ brew ล้ม: ${String(e.message).split('\n')[0]}`))
    } else log('  ⏭  ยังไม่มี Obsidian — โหลดเองจาก obsidian.md แล้ว "Open folder as vault" ที่ vault นี้')
  }
  const o = await readFile(obsidianJson, 'utf8').then(JSON.parse, () => null)
  if (!o) log('  ⏭  ยังไม่มี obsidian.json — เปิดแอปครั้งแรกแล้วใช้ "Open folder as vault"')
  else if (Object.values(o.vaults ?? {}).some((v) => v.path === vault)) log('  ✅ Obsidian รู้จัก vault นี้แล้ว')
  else {
    changed.push('obsidian.json')
    const backup = await keepFirstBackup(obsidianJson, io)
    let key
    do { key = randomKey() } while (o.vaults?.[key])
    const vaults = { ...(o.vaults ?? {}), [key]: { path: vault, ts: Date.now() } }
    await io.writeFile(obsidianJson, `${JSON.stringify({ ...o, vaults }, null, 2)}\n`)
    log(`  ${MARK} ${WILL}ลงทะเบียน vault กับ Obsidian` +
      (backup === 'created' ? ' (สำรองของเดิมไว้ที่ obsidian.json.bak)' : ' (obsidian.json.bak เดิมเก็บไว้ ไม่ทับ)'))
  }
  return changed
}
