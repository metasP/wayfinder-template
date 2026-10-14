// ── ขั้นที่ 3 — คำถาม 5 ข้อ ─────────────────────────────────────────────────
// สคริปต์ **ไม่เดาคำตอบให้** — ในโหมด install ถ้าไม่มีคำตอบมาทาง flag และ stdin ไม่ใช่ TTY
// (= agent เป็นคนรัน) มันจะพิมพ์คำถามแล้วออกด้วย code 2 ให้ agent เอาไปถามเจ้าของเครื่องทีละข้อ
// ตามโปรโตคอลขั้นที่ 3 ของ setup — ไม่ใช่ตอบแทนเขาเงียบ ๆ
import { createInterface } from 'node:readline/promises'

/** The five questions, with their flags and defaults, as bootstrap prints them. */
export const questions = ({ defaultVault, defaultSkills }) => `
── ขั้นที่ 3: ถาม 5 ข้อ (ถามทีละข้อ รอคำตอบ) ────────────────────────────────

  1. vault จะวางที่ path ไหน?                    --vault <path>
     ค่าเริ่มต้น ${defaultVault}

  2. จะติดตั้งชิ้นไหนบ้าง? (เลือกได้หลายข้อ · ค่าเริ่มต้น = ทุกข้อ)   --parts a,b,c
     skills   สกิล /wayfinder-next                     (นอก vault · /wayfinder มาจากปลั๊กอิน)
     vault    เนื้อ vault + _tools + git               (ใน vault)
     hook     guard + autocommit + allow rule ของ wf  (~/.claude/settings.json)
     obsidian ค่าตั้ง .obsidian + Dataview + ลงทะเบียน vault
     memory   ย่อหน้ากติกา + วิธีเรียก wf ใน ~/.claude/CLAUDE.md

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
     ค่าเริ่มต้น ${defaultSkills}
     ถ้า <dir>/<ชื่อสกิล> เป็น symlink อยู่แล้ว จะเดินตามไปทับที่ปลายทาง ไม่ทำลาย layout เดิม

  ตอบครบแล้วรันด้วย flag ข้างบน · หรือ --yes ถ้าเอาค่าเริ่มต้นทุกข้อ
`

/** Ask the questions on a TTY. `toPath` turns an answer into an absolute path (`~/` expanded). */
export const ask = async ({ defaultVault, defaultSkills, allParts, toPath }) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const q = async (text, def) => {
    const a = (await rl.question(`${text}${def ? ` [${def}]` : ''} `)).trim()
    return a || def
  }
  const a = {}
  a.vault = toPath(await q('1. vault path?', defaultVault))
  a.parts = (await q(`2. ติดตั้งชิ้นไหน? (${allParts.join(',')})`, 'all'))
  a.onConflict = await q('3. เจอของเดิม? (skip/backup)', 'skip')
  a.skillsDir = toPath(await q('5. สกิลวางที่ไหน?', defaultSkills))
  a.allowBrew = 'no'
  rl.close()
  return a
}
