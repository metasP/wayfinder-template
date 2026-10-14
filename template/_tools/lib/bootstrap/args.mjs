// args ของ bootstrap — ตรวจ **ก่อนแตะอะไรทั้งนั้น**
//
// รายชื่อ flag ที่รู้จัก **ปิดตาย** — เมื่อก่อน parser รับทุก `--x` แล้วข้ามทุกอย่างที่ไม่ขึ้นต้นด้วย `--`
// ⇒ `--help` · `-h` · flag พิมพ์ผิด (`--pln`) ถูกเงียบ แล้วรันจริงเต็มรอบ: บน vault ที่มี manifest
// คือ update ทับทุกไฟล์ + commit ลง `main` (เกิดจริงแล้วกับ `--help`)
// boolean ไม่กินคำถัดไปเด็ดขาด — ไม่งั้น `--yes ~/vault` กลืน path ทิ้งเงียบ ๆ แทนที่จะฟ้อง
import { readFile } from 'node:fs/promises'
import { die } from './say.mjs'

const BOOL_FLAGS = new Set(['plan', 'yes', 'wire-hook', 'wire-memory'])
const VALUE_FLAGS = new Set(['from', 'vault', 'parts', 'on-conflict', 'skills-dir', 'allow-brew'])

/** The `// ใช้:` comment block at the head of `script` (bootstrap.mjs), uncommented: what `--help` prints. */
export const usage = async (script) => {
  const src = (await readFile(script, 'utf8')).split('\n')
  const from = src.findIndex((l) => l.startsWith('// ใช้:'))
  const to = src.findIndex((l, i) => i > from && !l.startsWith('//'))
  return src.slice(from, to).map((l) => l.replace(/^\/\/ ?/, '')).join('\n').trimEnd()
}

/** `argv` → `{ opt(name), has(name) }`; an unknown flag, a bare word or a missing value exits 2. */
export function parseArgs(argv) {
  const flags = new Map()
  const bare = new Set()
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) die(`ไม่รู้จัก argument "${a}" — ทุกตัวต้องเป็น --flag (ดู --help)`, 2)
    const eq = a.indexOf('=')
    const name = a.slice(2, eq === -1 ? undefined : eq)
    if (BOOL_FLAGS.has(name)) {
      if (eq !== -1) die(`--${name} ไม่รับค่า (เจอ "${a}")`, 2)
      bare.add(name)
    } else if (VALUE_FLAGS.has(name)) {
      const value = eq !== -1 ? a.slice(eq + 1) : argv[++i]
      if (value === undefined || value === '' || (eq === -1 && value.startsWith('-'))) die(`--${name} ต้องมีค่าตามมา`, 2)
      flags.set(name, value)
    } else die(`ไม่รู้จัก flag "--${name}" — ดู --help`, 2)
  }
  return { opt: (k) => flags.get(k), has: (k) => bare.has(k) || flags.has(k) }
}
