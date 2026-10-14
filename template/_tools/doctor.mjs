#!/usr/bin/env node
// ตรวจสุขภาพ wayfinder-vault — ทุกข้อที่ตรวจด้วยเครื่องได้
//
// ใช้:  node _tools/doctor.mjs [--json]
// exit 0 = ผ่านหมด, exit 1 = มีอย่างน้อยหนึ่งข้อพัง, exit 2 = argument ผิด (รับแค่ --json)
// --json พิมพ์ `{ ok, checks: [{ ok, soft, label, detail }], lint: { findings, errors, warnings } | null }`
// แทนรายงาน — `lint.findings` คือชุดเดียวกับ `wf lint --json`
//
// ข้อที่ *ตรวจด้วยเครื่องไม่ได้* (ต้องเปิด Obsidian ดูเอง) จะขึ้นเป็น MANUAL ท้ายรายงาน

import { readFile, readdir, stat, realpath } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, dirname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const run = promisify(execFile)
const VAULT = join(dirname(fileURLToPath(import.meta.url)), '..')

// doctor รับแค่ `--json` — `--help` พิมพ์ "ใช้:" แล้วออก · อย่างอื่น (เช่น `--vault x` ที่หวังจะชี้ vault อื่น)
// ฟ้อง exit 2 แทนการเงียบแล้วตรวจ vault ข้างตัวสคริปต์ ซึ่งคนสั่งจะอ่านผิดว่าเป็นผลของ vault ที่ตั้งใจ
const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) {
  console.log('ใช้:  node <vault>/_tools/doctor.mjs [--json]   (ตรวจ vault ที่สคริปต์นี้อยู่)\nexit 0 = ผ่านหมด, exit 1 = มีอย่างน้อยหนึ่งข้อพัง, exit 2 = argument ผิด')
  process.exit(0)
}
const JSON_OUT = argv.includes('--json')
const unknownArgs = argv.filter((a) => a !== '--json')
if (unknownArgs.length) {
  console.error(`❌ doctor รับแค่ --json (เจอ ${unknownArgs.map((a) => `"${a}"`).join(' ')}) — รัน doctor.mjs ของ vault ที่จะตรวจตรง ๆ`)
  process.exit(2)
}

// doctor ถูกรันจาก **worktree ของ session** ได้ (`<vault>/.claude/worktrees/<ชื่อ>/`)
// ข้อที่ตรวจ *เนื้อ vault* ใช้ `VAULT` = working tree ที่กำลังทำงานอยู่จริง (ถูกแล้ว)
// แต่ข้อที่ตรวจ *การติดตั้ง* — hook ใน `settings.json` และการลงทะเบียน Obsidian — ผูกกับ
// vault หลักเสมอ ⇒ ถ้าเทียบกับ `VAULT` จะได้ ❌ ปลอมทุกครั้งที่รันใน worktree
const WT_MARK = '/.claude/worktrees/'
const MAIN_VAULT = VAULT.includes(WT_MARK) ? VAULT.slice(0, VAULT.indexOf(WT_MARK)) : VAULT

const results = []
const check = (ok, label, detail = '') => results.push({ ok, label, detail })
// เตือน แต่ไม่นับว่าพัง — สำหรับสภาพที่ถูกต้องได้ทั้งสองแบบ (เช่น vault ใหม่ที่ยังไม่มี ticket)
const warn = (ok, label, detail = '') => results.push({ ok, soft: true, label, detail })
// หนึ่งหมวดของการตรวจ — ข้อที่ throw (ไฟล์ตั้งค่ารูปร่างผิด ฯลฯ) กลายเป็น ❌ ของหมวดนั้น แล้วหมวดถัดไปตรวจต่อ
// ⇒ doctor ไม่ตายกลางทางด้วย stack trace และ `--json` พิมพ์ JSON เสมอ
const section = async (name, body) => {
  try {
    await body()
  } catch (e) {
    check(false, `${name} ตรวจจบหมวด`, `พังกลางทาง: ${String(e?.message ?? e).split('\n')[0]}`)
  }
}

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'))
const exists = async (p) => stat(p).then(() => true, () => false)
const git = (...args) => run('git', ['-C', VAULT, ...args]).then((r) => r.stdout.trim())

// เทียบ path ต้องผ่าน realpath ทั้งสองฝั่งเสมอ — `import.meta.url` ของ ESM ผ่าน realpath มาแล้ว
// ข้างเดียว ⇒ ถ้าอีกฝั่ง (settings.json / obsidian.json / manifest) จดตัวที่มี symlink คั่น
// การเทียบสตริงตรง ๆ จะได้ ❌ ปลอมทั้งที่ติดตั้งถูกทุกอย่าง (ใบ 03) · path ที่ไม่มีอยู่จริง
// ให้คืนตัวเดิม เพื่อให้ผลลัพธ์ยังเทียบได้แทนที่จะโยน
const real = async (p) => realpath(p).catch(() => p)

// ── โทเคน `__VAULT__` ที่ installer เรนเดอร์เป็น path จริงตอนติดตั้ง ──────────
// บรรทัดคอมเมนต์ข้างบนนี้คือ **ตัวล่อ** ของข้อ §9: `_tools/doctor.mjs` อยู่ใน `RENDER_EXEMPT`
// ของ `bootstrap.mjs` ⇒ เขียนโทเคนไว้ที่นี่ได้ปลอดภัย ไม่ถูกเรนเดอร์ทับ · และถ้าวันหนึ่งมันหายไป
// แปลว่า doctor **ถูกเรนเดอร์ทับแล้ว** = ตัวเรนเดอร์เสีย ⇒ update รอบถัดไปหยุดเรนเดอร์เงียบ ๆ (ใบ 03)
//
// ⚠️ ตัวแปรข้างล่าง **ประกอบจากสองท่อนโดยตั้งใจ** ห้ามรวบเป็นสตริงเดียว — ถ้าเขียนเต็ม ๆ แล้ววันหนึ่ง
// ไฟล์นี้โดนเรนเดอร์ทับ ตัวค้นหาจะกลายเป็น path ไปพร้อมกับตัวล่อ ⇒ มัน "หาเจอ" ทุกครั้งและเขียว
// ตลอดกาล · ข้อตรวจที่พังพร้อมกับสิ่งที่มันเฝ้า คือข้อตรวจที่ไม่มีอยู่จริง
const VAULT_TOKEN = '__' + 'VAULT' + '__'

// ── 1. git ──────────────────────────────────────────────────────────────────
try {
  const commits = await git('rev-list', '--count', 'HEAD')
  check(Number(commits) > 0, 'git repo มี commit แล้ว', `${commits} commits`)
  const dirty = await git('status', '--porcelain')
  check(dirty === '', 'working tree สะอาด', dirty ? dirty.split('\n').length + ' ไฟล์ค้าง' : '')
} catch (e) {
  check(false, 'git repo ใช้งานได้', e.message.split('\n')[0])
}

// ── 2. .gitignore กันความลับ ────────────────────────────────────────────────
await section('§2 .gitignore', async () => {
  const gi = await readFile(join(VAULT, '.gitignore'), 'utf8').catch(() => '')
  check(gi.includes('.obsidian/plugins/*/data.json'),
    '.gitignore กัน plugin data.json', 'ไฟล์นั้นเก็บ API key + RSA private key')
  check(gi.includes('.obsidian/workspace.json'), '.gitignore กัน workspace.json')

  // กฎนี้ต้องอยู่ใน `.gitignore` ที่ **git track** ไม่ใช่ `.git/info/exclude` ที่เดินทางไปกับ clone
  // ไม่ได้ — ไม่งั้นบนเครื่องคนอื่น `autocommit.sh` (`git add -A -uall`) จะลากทั้ง worktree เข้า
  // commit ของ vault หลัก · เป็นอาการเดียวกับที่ทำให้ `wayfinder-vercel-ci` หายไป ซึ่งเป็นเหตุ
  // ที่ vault นี้เกิดขึ้นแต่แรก (ใบ 02)
  //
  // ⚠️ เทียบ **ทั้งบรรทัดหลัง trim** ไม่ใช่ substring บนไฟล์ทั้งก้อน — เหนือกฎจริงมีคอมเมนต์
  // อธิบายเหตุผลที่เขียน `.claude/worktrees/<ชื่อ>/` ไว้เต็ม ๆ ⇒ substring test จะเขียวจากคอมเมนต์
  // นั้นตัวเดียว แม้กฎจริงถูกลบไปแล้ว (กับดัก "หาไม่เจอ = ผ่าน" ตัวเดิมของไฟล์นี้)
  const giLines = gi.split('\n').map((l) => l.trim())
  const wtRule = giLines.find((l) => l === '.claude/worktrees/' || l === '.claude/worktrees')
  check(wtRule !== undefined, '.gitignore กัน .claude/worktrees/',
    wtRule !== undefined ? `บรรทัด ${giLines.indexOf(wtRule) + 1}`
      : 'ไม่มีกฎนี้เป็นบรรทัดของตัวเอง — คอมเมนต์ที่พูดถึงมันไม่นับ')
})

// ── 3. plugin ───────────────────────────────────────────────────────────────
await section('§3 plugin', async () => {
  const cp = await readJson(join(VAULT, '.obsidian/community-plugins.json')).catch(() => [])
  check(cp.includes('dataview'), 'Dataview เปิดใช้งานอยู่')
  check(!cp.includes('obsidian-local-rest-api'),
    'ไม่มี Local REST API (ตั้งใจปิด)', 'มันชน port 27124 กับ vault อื่นที่ลง Local REST API ไว้')
  check(await exists(join(VAULT, '.obsidian/plugins/dataview/main.js')),
    'ตัว plugin Dataview อยู่ครบใน vault')

  // หน้า Wayfinder Efforts เป็น dataviewjs — ปิด JS = เห็นโค้ดดิบทั้งบล็อก
  const dvCfg = await readJson(join(VAULT, '.obsidian/plugins/dataview/data.json')).catch(() => null)
  check(dvCfg?.enableDataviewJs === true, 'Dataview เปิด enableDataviewJs',
    dvCfg ? '' : 'ไม่มี data.json — เปิด Obsidian หนึ่งครั้งแล้วตั้งใน Settings → Dataview')
  // inline JS (`$=`) ไม่มีหน้าไหนใช้ — เปิดไว้ = โน้ตที่ sandbox เขียนได้มีอีกทางให้รันโค้ดด้วยสิทธิ์เต็มของเจ้าของ
  // (spec *Sandbox grant (Q2)*) · data.json เป็น seed-once ⇒ vault เก่ายังเปิดอยู่จนกว่าเจ้าของจะปิดเอง ⇒ เตือน ไม่ใช่พัง
  warn(dvCfg?.enableInlineDataviewJs !== true, 'Dataview ปิด enableInlineDataviewJs (ไม่มีหน้าไหนใช้ inline JS)',
    dvCfg?.enableInlineDataviewJs === true ? 'ปิดที่ Settings → Dataview → Enable Inline JavaScript Queries' : '')
  const gi = await readFile(join(VAULT, '.gitignore'), 'utf8').catch(() => '')
  check(gi.includes('!.obsidian/plugins/dataview/data.json'),
    '.gitignore ยกเว้น data.json ของ Dataview', 'ไม่งั้นค่าตั้งนี้ไม่เดินทางไปเครื่องใหม่')
})

// ── 4. graph colorGroups ────────────────────────────────────────────────────
await section('§4 graph', async () => {
  const g = await readJson(join(VAULT, '.obsidian/graph.json')).catch(() => ({}))
  const groups = g.colorGroups ?? []
  check(groups.length >= 4, 'graph.json ตั้ง colorGroups แล้ว', `${groups.length} groups`)
  const propQueries = groups.filter((x) => x.query?.includes(':') && !x.query.startsWith('path:'))
  check(propQueries.every((x) => /^\[.+\]$/.test(x.query)),
    'colorGroups ใช้ syntax property แบบวงเล็บ',
    propQueries.map((x) => x.query).join(' '))
})

// ── 5. dashboard ────────────────────────────────────────────────────────────
await section('§5 dashboard', async () => {
  // สี่หน้า (Dashboard · Efforts · Effort Tickets · Picks) คำนวณจาก core ผ่าน loader กลางทุกบล็อก
  // (ไม่มี DQL / index / กฎ frontier / ตัวอ่าน Config ของตัวเองแล้ว) และ **โค้ดของหน้าอยู่ใน `_tools/views/`**
  // บล็อกในโน้ตเป็นแค่ stub บรรทัดเดียว (spec *Sandbox grant (Q2)*): `dataviewjs` รันด้วยสิทธิ์เต็มของเจ้าของ
  // ตอนเปิดโน้ต · sandbox เขียนโน้ตได้แต่เขียน `_tools/` ไม่ได้ ⇒ บล็อกที่ไม่ใช่ stub บนหน้าเหล่านี้ = โค้ดที่ใคร
  // ก็แก้ได้ ⇒ ไม่ผ่าน · ตรวจว่า view · loader · core อยู่ครบ และทุกบล็อกเป็น stub ที่เรียก view ของหน้านั้น
  const { PAGE_STUBS, PAGE_VIEWS, VIEWS_DIR, LOADER_VIEW, dataviewjsBlocks, stubOf, jsFenceCount } = await import('./lib/page-views.mjs')
  const { isLegacyPicksBlock } = await import('./lib/picks-page.mjs')
  const pageText = {}
  for (const note of Object.keys(PAGE_VIEWS)) pageText[note] = await readFile(join(VAULT, `${note}.md`), 'utf8').catch(() => '')
  const dash = pageText['Wayfinder Dashboard']
  const eff = pageText['Wayfinder Efforts']
  const tix = pageText['Wayfinder Effort Tickets']
  const picks = pageText['Wayfinder Picks']
  // view ห้ามมีคำ a-w-a-i-t แม้ในคอมเมนต์: Dataview ห่อ view ที่มีคำนี้ด้วย async IIFE แล้วทิ้ง promise
  // ⇒ บล็อกวาดก่อน view เสร็จ และ error หลุดเป็น unhandled rejection เงียบ ๆ (ดูหัวไฟล์ loader)
  const viewSrc = {}
  for (const view of [LOADER_VIEW, ...Object.values(PAGE_VIEWS)])
    viewSrc[view] = await readFile(join(VAULT, VIEWS_DIR, `${view}.js`), 'utf8').catch(() => null)
  const viewBad = Object.entries(viewSrc).filter(([, src]) => src === null || src.includes('aw' + 'ait'))
  check(viewBad.length === 0, `มี view ครบใน ${VIEWS_DIR}/ (loader กลาง + ของแต่ละหน้า · คืน promise ให้ Dataview)`,
    viewBad.length
      ? viewBad.map(([v, src]) => `${v}.js ${src === null ? 'ไม่มีไฟล์' : 'มีคำที่ทำให้ Dataview ทิ้ง promise'}`).join(' · ')
      : Object.keys(viewSrc).map((v) => `${v}.js`).join(' · '))
  check(await exists(join(VAULT, '_tools/lib/core.mjs')), 'มี core _tools/lib/core.mjs')
  const effJs = viewSrc.efforts ?? ''
  const tixJs = viewSrc['effort-tickets'] ?? ''
  // ไฟล์หาย = 0 บล็อก ⇒ ไม่ผ่าน (ไม่ใช่ "ผ่านเพราะไม่มีอะไรให้ตรวจ") · นับ fence แบบกว้างด้วย (`~~~` · ย่อหน้า ·
  // ใน callout · บนบรรทัด list) ⇒ บล็อกที่เขียนต่างรูปจากที่ template เขียนก็ไม่หลุดการตรวจ
  // stub ต้องครบตาม PAGE_STUBS เป๊ะ (Dashboard = ทุก section ครั้งละหนึ่ง) — หน้าเหล่านี้เป็นของ template
  const stubsOn = (note) => {
    const body = pageText[note]
    const blocks = dataviewjsBlocks(body)
    const stubs = blocks.map((b) => stubOf(b.src)).filter((st) => st?.view === PAGE_VIEWS[note]).map((st) => st.block)
    return { body, blocks, stubs, fences: jsFenceCount(body), dql: body.match(/^```dataview[ \t]*$/gm)?.length ?? 0 }
  }
  const sameStubs = (got, want) => got.length === want.length && got.every((b, i) => b === want[i])
  // Picks เป็น **โน้ตของผู้ใช้** (ตัวอัปเดตไม่แตะ) ⇒ ได้ข้อของตัวเองข้างล่าง ไม่อยู่ในลูปนี้
  for (const note of ['Wayfinder Dashboard', 'Wayfinder Efforts', 'Wayfinder Effort Tickets']) {
    const { body, stubs, fences, dql } = stubsOn(note)
    const want = PAGE_STUBS[note]
    const sections = want.some(Boolean) ? ` · section: ${stubs.join(' ') || '—'}` : ''
    check(sameStubs(stubs, want) && stubs.length === fences && dql === 0,
      `ทุกบล็อกบน ${note} เป็น stub ที่เรียก ${VIEWS_DIR}/${PAGE_VIEWS[note]}.js`,
      body ? `${stubs.length}/${fences} บล็อกเป็น stub (ต้องมี ${want.length})${sections} · ${dql} บล็อก DQL` : `ไม่มีไฟล์ ${note}.md`)
  }
  // Picks: vault เก่าอาจยังเป็น DQL หรือยังมีบล็อก inline ที่ 0.5.0 วางไว้ จนกว่า `wf migrate` จะแปลง ⇒ เตือน ไม่ใช่พัง
  // (DQL ไม่ได้พัง — Dashboard/`wf` เรียงด้วยค่าเริ่มต้นแทน แต่บรรทัด SORT ในนั้นไม่มีผลแล้ว)
  // ส่วนโค้ดอื่นที่ไม่ใช่ stub และไม่ใช่บล็อกรุ่นก่อน = โค้ดในโน้ตที่ sandbox เขียนได้ ⇒ **ไม่ผ่าน** ให้เจ้าของไปดู
  const pk = stubsOn('Wayfinder Picks')
  warn(!picks || pk.dql === 0, 'Wayfinder Picks เรียงด้วย sort: ใน frontmatter (ไม่มีบล็อก DQL ของตัวเอง)',
    pk.dql ? `${pk.dql} บล็อก DQL — บรรทัด SORT ในนั้นไม่มีผลกับ Dashboard/wf frontier แล้ว · ย้ายกฎไปที่ sort: (หรือรอ wf migrate)` : '')
  const legacyPicks = pk.blocks.filter((b) => isLegacyPicksBlock(['```dataviewjs', ...b.src.split(/\r?\n/).slice(0, -1), '```'])).length
  const strayPicks = pk.fences - pk.stubs.length - legacyPicks
  check(!picks || strayPicks === 0, `บล็อก dataviewjs บน Wayfinder Picks เป็น stub ที่เรียก ${VIEWS_DIR}/picks.js (หรือบล็อกรุ่นก่อน)`,
    strayPicks ? `${strayPicks} บล็อกไม่ใช่ stub และไม่ใช่บล็อกรุ่นก่อน — โค้ดในโน้ตที่ sandbox เขียนได้: ตรวจว่าใครใส่ไว้` : '')
  warn(!picks || legacyPicks === 0, 'Wayfinder Picks ไม่มีบล็อก inline รุ่นก่อน stub',
    legacyPicks ? 'โค้ดของหน้ายังอยู่ในโน้ต ⇒ `wf migrate --yes` เปลี่ยนเป็น stub ให้' : '')

  check(dash.includes('[[Wayfinder Efforts]]'), 'Dashboard ลิงก์ไปหน้า Efforts')

  // ── หน้าที่สาม: Wayfinder Effort Tickets (ใบทั้ง effort เดียว จบในหน้าเดียว) ──
  // ── หัวโน้ตหน้าใบ — ตรวจ *ตำแหน่ง + ชนิดบล็อก* ไม่ใช่แค่ "มีสตริงอยู่ในไฟล์" ────
  // ใบ 09 พิสูจน์บน Obsidian จริงแล้วว่าโครงที่ถูกคือ: บล็อกนำทาง (ลิงก์สามหน้า) อยู่ **นอก**
  // กล่องพับ · คำอธิบายกติกาอยู่ใน callout `> [!info]-` ที่พับเป็นค่าเริ่มต้น
  //
  // ข้อเดิมของหมวดนี้คือ `tix.includes('[[…]]')` ซึ่งเป็น substring test บนไฟล์ทั้งก้อน
  // ⇒ **เขียวเท่ากัน** ไม่ว่าลิงก์จะอยู่นอกกล่อง ถูกลากเข้าไปในกล่องที่พับอยู่ หรือถูกห่อด้วย
  // `<details>` จน Obsidian เลิก parse เป็นลิงก์ไปแล้ว — เพราะสตริงยังอยู่ในไฟล์เท่าเดิม
  // ⇒ แทนที่ด้วยสามข้อล่าง (ครอบสิ่งที่ข้อเดิมตรวจไว้ทั้งหมดแล้ว ไม่ได้ตรวจน้อยลง)
  //
  // ขอบเขต = **หัวโน้ตเท่านั้น** (ตัดที่ fence แรก) ตั้งใจ ด้วยสองเหตุผล:
  //  1. `<details>` สองที่ที่หน้านี้ใช้อยู่ ถูกสร้างจาก `dataviewjs` ซึ่ง Obsidian ไม่ได้ parse
  //     เป็นมาร์กดาวน์ตั้งแต่แรก ⇒ คนละเรื่องกับ `<details>` ที่พิมพ์ลงมาร์กดาวน์ (ใบ 09)
  //  2. ไม่ผูกกับสิ่งที่บล็อกวาด ซึ่งยังถูกแก้อยู่ ⇒ ข้อพวกนี้ไม่แดงเพราะงานของใบอื่น
  // และผูกกับ **โครงสร้าง** ล้วน — ไม่แตะข้อความหัวกล่องหรือเลขบรรทัด ซึ่งแก้คำครั้งเดียวก็แดง
  // ทั้งสามข้อ **หาไม่เจอ = ไม่ผ่าน** และ `detail` โชว์สิ่งที่ดึงมาได้จริง เพื่อให้เห็นตั้งแต่
  // บรรทัดที่ยังเขียว ถ้าวันหนึ่ง regex คว้าผิดตัว (กับดักเดียวกับ `LS_KEY` ของใบ 05/06)
  const head = tix.split(/^```/m)[0]
  const headLines = head.split('\n')
  const isQuote = (l) => /^\s*>/.test(l)
  // หัว callout ของ Obsidian: `> [!info]-` · ตัวท้าย `-` = พับเป็นค่าเริ่มต้น · `+` = กางไว้
  // · ไม่มีเลย = กางค้าง (หัวโน้ตกลับไปกินหน้าจอแรกเหมือนก่อนใบ 09)
  const CALLOUT = /^\s*>\s*\[!([A-Za-z]+)\]([-+]?)/

  // ชนวนที่ 1 — มีคนลากเส้น `>` ขึ้นไปคลุมบรรทัดนำทาง ⇒ ลิงก์หายเข้าไปในกล่องที่พับอยู่
  const NAV = ['Wayfinder Dashboard', 'Wayfinder Efforts', 'README']
  const navOut = NAV.filter((n) => headLines.some((l) => !isQuote(l) && l.includes(`[[${n}]]`)))
  const navIn = NAV.filter((n) => !navOut.includes(n))
  const navList = (xs) => xs.map((n) => `[[${n}]]`).join(' · ') || '(ไม่มี)'
  check(navIn.length === 0,
    'บล็อกนำทางหน้าใบอยู่นอกกล่องพับ (ลิงก์สามหน้าเห็นได้ตั้งแต่ยังไม่กาง)',
    navIn.length === 0 ? navList(navOut)
      : `นอกกล่อง: ${navList(navOut)} · หลุดเข้ากล่องพับ/หายไป: ${navList(navIn)}`)

  const callouts = headLines
    .map((l) => l.match(CALLOUT))
    .filter(Boolean)
    .map((m) => ({ type: m[1], fold: m[2] }))
  const calloutList = callouts.map((c) => `[!${c.type}]${c.fold}`).join(' · ')

  // ชนวนที่ 2 — เปลี่ยน callout เป็น `<details>`/`<summary>` · พับได้เหมือนกันทุกประการ
  // แต่ Obsidian ไม่แตะ HTML block ⇒ wikilink ข้างในกลายเป็นข้อความเปล่า (ใบ 09 ยืนยันแล้วว่า
  // เส้นแบ่งคือ *ชนิดบล็อก* ไม่ใช่ *ว่าพับได้หรือเปล่า*)
  const rawFold = headLines.filter((l) => /<\/?(?:details|summary)\b/i.test(l))
  check(callouts.length > 0 && rawFold.length === 0,
    'กล่องพับหัวโน้ตหน้าใบเป็น callout ของ Obsidian ไม่ใช่ <details>',
    rawFold.length
      ? `เจอ HTML พับในหัวโน้ต ${rawFold.length} บรรทัด (wikilink ข้างในจะตาย): ${rawFold[0].trim().slice(0, 60)}`
      : callouts.length ? `${callouts.length} callout: ${calloutList}`
        : 'ไม่พบ callout ในหัวโน้ต')

  // ชนวนที่ 3 — ถอด `-` ท้าย `[!info]` ⇒ กล่องกางค้าง หัวโน้ตกินหน้าจอแรกเหมือนก่อนใบ 09
  check(callouts.length > 0 && callouts.every((c) => c.fold === '-'),
    'ทุก callout ในหัวโน้ตหน้าใบพับเป็นค่าเริ่มต้น',
    callouts.length
      ? callouts.map((c) => `[!${c.type}]${c.fold || ' ⇒ ไม่มี - ท้าย ⇒ กางค้าง'}`).join(' · ')
      : 'ไม่พบ callout ในหัวโน้ต')

  // ขากลับ — ใบ 07 ล็อกว่าสามหน้าต้องลิงก์ถึงกัน แต่ที่ผ่านมาเฝ้าแต่ขาไป
  // เปลี่ยนชื่อไฟล์หน้าใบเมื่อไหร่ ลิงก์สองเส้นนี้ตายเงียบ ๆ โดยไม่มีอะไรฟ้อง
  check(dash.includes('[[Wayfinder Effort Tickets]]'), 'Dashboard ลิงก์มาหน้า Effort Tickets')
  check(eff.includes('[[Wayfinder Effort Tickets]]'), 'Wayfinder Efforts ลิงก์มาหน้า Effort Tickets')

  // ค่าคงที่ที่ **สองไฟล์ต้องตรงกัน** — coupling ที่พังเงียบ: แก้ชื่อข้างเดียวแล้วคลิก `44/47`
  // จะได้หน้าใบที่ไม่เลือกอะไร (LS_KEY) หรือ pane ที่เปิดค้างไม่สลับตาม (SELECT_EVENT)
  // ทั้งคู่ดูเหมือน "โหลดช้า" ไม่ใช่ "ของพัง" ⇒ ไม่มีใครรู้ว่ามันเสีย
  //
  // ⚠️ ต้องยึด **หัวบรรทัด** เสมอ — ในบล็อกมีคอมเมนต์ที่ *พูดถึง* รูปประกาศ (`const LS_KEY = "..."`)
  // อยู่เหนือตัวประกาศจริง · regex ที่ไม่ยึดหัวบรรทัดจะคว้าคอมเมนต์นั้นแล้วได้ค่า `...` ซึ่งเทียบแล้ว
  // อาจ "ผ่าน" ทั้งที่คีย์จริงเป็นอะไรก็ได้ — คือความล้มเหลวชนิดเดียวกับที่ข้อนี้ตั้งใจจับพอดี
  // ⇒ detail โชว์ค่าที่ดึงมาได้จริงด้วย เพื่อให้เห็นทันทีถ้าวันหนึ่งมันคว้าผิดตัว
  const sharedConst = (body, name) =>
    body.match(new RegExp(`^const\\s+${name}\\s*=\\s*["']([^"']+)["']`, 'm'))?.[1] ?? null
  // (ชื่อโน้ต Config ไม่อยู่ในลูปนี้แล้ว — ทุกหน้าอ่าน Config ผ่าน loader กลางตัวเดียว ไม่มีสองที่ให้ไม่ตรงกัน)
  for (const name of ['LS_KEY', 'SELECT_EVENT']) {
    const a = sharedConst(effJs, name)
    const b = sharedConst(tixJs, name)
    const same = a !== null && b !== null && a === b
    const show = (v) => (v === null ? 'ไม่พบ' : `"${v}"`)
    check(same, `${name} ตรงกันทั้ง Efforts และ Effort Tickets`,
      same ? `"${a}"` : `Efforts=${show(a)} · Effort Tickets=${show(b)}`)
  }

  // localStorage ของ Obsidian เป็นของ **ทั้งแอป** ไม่ใช่ของ vault ⇒ คีย์ที่ไม่ผูกชื่อ vault ทำให้
  // สอง vault ที่เปิดพร้อมกันใช้ช่องเดียวกัน — หน้าใบของ vault หนึ่งประกาศชื่อ effort ของอีก vault
  // ออกมาให้เห็นเต็ม ๆ · นั่นคือการรั่วข้าม vault ไม่ใช่แค่ความรำคาญ ⇒ ตรวจสองชั้น: มีตัวคิดคีย์ที่
  // ผูกชื่อ vault จริง **และ** ไม่มีใครส่ง `LS_KEY` ดิบเข้า localStorage หลงเหลืออยู่
  const nsKey = (b) => /^const lsKey = \(\) =>/m.test(b) && /app\.vault\.getName\(\)/.test(b)
  const rawLS = (b) => /localStorage\.(get|set)Item\(\s*LS_KEY\s*[,)]/.test(b)
  const nsOk = nsKey(effJs) && nsKey(tixJs) && !rawLS(effJs) && !rawLS(tixJs)
  check(nsOk, 'คีย์ localStorage ผูกกับชื่อ vault (ไม่รั่วข้าม vault)',
    nsOk ? 'ทั้งสองหน้าใช้ lsKey() ที่ต่อ app.vault.getName()'
      : `Efforts=${nsKey(effJs) ? 'ผูกแล้ว' : 'ยังไม่ผูก'}${rawLS(effJs) ? ' +ยังมี LS_KEY ดิบ' : ''}`
        + ` · Effort Tickets=${nsKey(tixJs) ? 'ผูกแล้ว' : 'ยังไม่ผูก'}${rawLS(tixJs) ? ' +ยังมี LS_KEY ดิบ' : ''}`)

  // ── coupling ตัวที่สาม: `TICKETS_NOTE` → ชื่อโน้ตจริงบนดิสก์ ─────────────────
  // สองข้อบนเทียบ **ไฟล์กับไฟล์** (ค่าเดียวกันประกาศไว้สองที่ ต้องตรงกัน) · ข้อนี้อยู่ **คนละฝั่ง
  // ของสัญญา** — เทียบ *สตริงกับชื่อไฟล์ที่มีอยู่จริง* ⇒ `sharedConst()` ใช้ซ้ำไม่ได้ ต้องดึงเอง
  // แล้วไปสืบบนดิสก์เอง
  //
  // ช่องที่ข้อนี้ปิดแคบกว่าที่เห็นตอนแรก และเป็นช่องสุดท้ายที่เหลือ (ใบ 10 ไล่ไว้ให้แล้ว):
  //  · *เปลี่ยนชื่อไฟล์หน้าใบ* — **จับได้อยู่แล้ว** เพราะ doctor อ่าน `Wayfinder Effort Tickets.md`
  //    ด้วยชื่อตรง ๆ ⇒ `tix` ว่าง ⇒ ข้อในหมวดนี้แดงพรึ่บหลายข้อพร้อมกัน
  //  · *แก้สตริง `TICKETS_NOTE` ข้างเดียวโดยไฟล์ยังชื่อเดิม* — **ก่อนมีข้อนี้ doctor เขียวครบ**
  //    ทั้งที่คลิก `44/47` แล้วจะ เขียนคีย์สำเร็จ · ยิง event สำเร็จ · **แต่ไม่มีโน้ตไหนเปิด**
  //    เงียบสนิท ไม่มี error สักบรรทัด — รูปแบบพังเงียบตัวเดียวกับที่ใบ 05/06 กันไว้
  //
  // เทียบกับ **สารบัญไฟล์จริงของ vault** ไม่ใช่สตริงตัวที่สองใน doctor — ไม่งั้นแค่ย้าย coupling
  // จาก "สองไฟล์ต้องตรงกัน" ไปเป็น "ไฟล์กับ doctor ต้องตรงกัน" ซึ่งพังเงียบได้เหมือนเดิมทุกประการ
  //
  // ขอบเขต = **โน้ตราก** ตั้งใจ: สามหน้าของสัญญานี้อยู่รากทั้งหมด และ doctor เองก็อ่านจากรากตรง ๆ
  // ⇒ วันที่มีคนย้ายหน้าใบลงโฟลเดอร์ ข้อนี้แดงพร้อมข้อที่อ่านไฟล์ไม่เจอ ไม่ใช่แดงลอยอยู่ข้อเดียว
  //
  // ใช้ `readdir` เทียบสตริงตรง ๆ **ไม่ใช่ `exists()`** — เจตนา: ดิสก์ของ mac เป็น case-insensitive
  // ⇒ `stat()` จะเปิด `"wayfinder effort tickets"` ผ่านหน้าตาเฉย ทั้งที่นั่นคือค่าที่ drift ไปแล้ว
  // ตรงนี้จึงเข้มกว่าตัว resolver ของ Obsidian หนึ่งขั้นโดยตั้งใจ: สัญญาคือ "สตริงสะกดชื่อโน้ต
  // ให้ตรงกับที่ vault สะกด" ไม่ใช่ "บังเอิญ resolve ติด" · ค่าใช้จ่ายของความเข้มนี้เป็นศูนย์ เพราะ
  // `detail` ตอนแดงชี้ตัวที่ใกล้เคียงให้ด้วย ⇒ แก้จบในตัวอักษรเดียว
  //
  // ⚠️ ยึด **หัวบรรทัด** เหมือนสองข้อบน (คอมเมนต์เหนือของจริงพูดถึงรูปประกาศอยู่)
  // · **หาไม่เจอ = ไม่ผ่าน** ห้ามเขียวเพราะเทียบ null กับ null · `readdir` พังก็ไม่ผ่าน (ตรวจไม่ได้
  // ห้ามเขียว) · `detail` โชว์ค่าที่ดึงมาได้จริงตั้งแต่ตอนยังเขียว จะได้เห็นทันทีถ้า regex คว้าผิดตัว
  const ticketsNote = effJs.match(/^const\s+TICKETS_NOTE\s*=\s*["']([^"']+)["']/m)?.[1] ?? null
  const rootNotes = await readdir(VAULT).then(
    (fs) => fs.filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md')), () => [])
  const noteHit = ticketsNote !== null && rootNotes.includes(ticketsNote)
  // ต่างแค่ตัวพิมพ์/ช่องว่าง = เคสที่เจอบ่อยที่สุดและมองด้วยตาเปล่าแทบไม่ออก ⇒ ชี้ตัวที่น่าจะหมายถึงให้
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const near = ticketsNote === null ? []
    : rootNotes.filter((n) => n !== ticketsNote && norm(n) === norm(ticketsNote))
  check(noteHit, 'TICKETS_NOTE ชี้ไปยังโน้ตที่มีอยู่จริงใน vault',
    ticketsNote === null
      ? `ไม่พบตัวประกาศ const TICKETS_NOTE ใน ${VIEWS_DIR}/efforts.js`
      : noteHit ? `"${ticketsNote}" ⇒ ${ticketsNote}.md`
        : `"${ticketsNote}" ไม่ตรงกับโน้ตรากไหนเลย (สแกน ${rootNotes.length} โน้ต)`
          + (near.length ? ` · ใกล้เคียง: "${near.join('" · "')}" — ต่างแค่ตัวพิมพ์/ช่องว่าง` : ''))

  // สคริปต์ที่ปลดระวางแล้ว — เอกสารต้องไม่ชี้ไปหาของที่ไม่มีอยู่
  const GONE = ['normalize-wayfinder', 'apply-graph-colors', '_tools/templates']
  const docs = { 'README.md': '', 'SETUP.md': '' }
  for (const f of Object.keys(docs)) docs[f] = await readFile(join(VAULT, f), 'utf8').catch(() => '')
  const stale = Object.entries(docs).flatMap(([f, body]) =>
    GONE.filter((g) => body.includes(g)).map((g) => `${f} -> ${g}`))
  check(stale.length === 0, 'เอกสารไม่อ้างสคริปต์ที่ลบไปแล้ว', stale.join(' · '))

  // `/wayfinder` หา tracker doc จาก **ชื่อหัวข้อ** `Wayfinding operations` และย่อหน้าใน
  // ~/.claude/CLAUDE.md ชี้มาที่สองหัวข้อนี้ด้วยชื่อ ⇒ เปลี่ยนชื่อหัวข้อเมื่อไหร่ ตัวชี้หลุดเงียบ ๆ
  // แล้ว skill กลับไปทำตาม GitHub issue / `.scratch/` ของตัวเอง โดยไม่มีอะไรแดงสักข้อ
  const TRACKER_HEADINGS = ['Wayfinding operations', 'Spec & ticket operations']
  const missingH = TRACKER_HEADINGS.filter((h) => !new RegExp(`^## ${h}[ \\t]*$`, 'm').test(docs['README.md']))
  check(missingH.length === 0, 'README มีหัวข้อที่ /wayfinder และ CLAUDE.md ชี้มา',
    missingH.length ? `ไม่เจอ: ${missingH.map((h) => `## ${h}`).join(' · ')}` : TRACKER_HEADINGS.join(' · '))

  // ── view และบล็อก dataviewjs ต้องเป็น JS ที่ parse ได้ ──────────────────────────
  // ใบ 11 ตกกับดักนี้ **สองครั้งในใบเดียว**: `CSS` เป็น template literal ⇒ backtick ที่พิมพ์ลง
  // คอมเมนต์ CSS ตามนิสัยมาร์กดาวน์ (`/* `paint-order: stroke` วาดขอบก่อนตัวอักษร */`)
  // **ปิดสตริงกลางทาง** ⇒ view พังทั้งไฟล์ตั้งแต่ตอน parse · Obsidian ขึ้นกล่องแดง
  // "Dataview: <error>" ทั้งที่ไฟล์ยังดูปกติทุกตัวอักษรในสายตา
  // (กติกาในไฟล์คือ escape เป็น \` — ดูคอมเมนต์ `.wft-head` ของใบ 04)
  // ⇒ ใบ 11 สรุปเองว่า **"ไม่ใช่เรื่องที่ระวังแล้วจะไม่พลาด"** ⇒ ต้องเป็นงานของเครื่อง
  //
  // **ตรวจไวยากรณ์อย่างเดียว ไม่รัน** — คอมไพล์บอดี้แล้วทิ้ง ไม่ execute ⇒ ไม่ต้องมี `dv` / DOM / `app`
  // · view: `new Function('dv', 'input', src)` แบบเดียวกับที่ `dv.view` คอมไพล์ (view ไม่มีคำ a-w-a-i-t
  //   จึงไม่ถูกห่อ async) ⇒ `return` ระดับบนสุดถูกกฎ
  // · บล็อกในโน้ต: **Async**Function เพราะ Dataview รันบล็อกเป็นบอดี้ของ async function
  // ด้วยเหตุผลเดียวกัน `node --check` ใช้แทนไม่ได้ (โหมดสคริปต์ = top-level await/return แดงปลอม)
  //
  // **ไม่เจอเลยสักไฟล์ = ไม่ผ่าน** — ต้องแดง ไม่ใช่เขียวเพราะ "ไม่มีอะไรให้ตรวจ" ซึ่งคือกับดัก
  // `null === null` ของใบ 05/06 · `detail` โชว์ขนาดที่อ่านมาได้จริง เพื่อให้เห็นตั้งแต่บรรทัดที่ยังเขียว
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const compiled = (compile, src) => { try { compile(src); return null } catch (e) { return e.message } }
  const jsUnits = [
    ...Object.entries(viewSrc).filter(([, src]) => src !== null).map(([view, src]) => ({
      where: `${VIEWS_DIR}/${view}.js`, size: src.split('\n').length,
      err: compiled((x) => new Function('dv', 'input', x), src) })),
    ...Object.entries(pageText).flatMap(([note, body]) => dataviewjsBlocks(body).map((b) => ({
      where: `${note}.md:${b.line}`, size: b.src.split('\n').length - 1,
      err: compiled((x) => new AsyncFunction(x), b.src) }))),
  ]
  const brokenJs = jsUnits.filter((u) => u.err)
  check(jsUnits.length > 0 && brokenJs.length === 0,
    'ทุก view และบล็อก dataviewjs parse เป็น JS ได้',
    brokenJs.length
      ? brokenJs.map((u) => `${u.where}: ${u.err}`).join(' · ')
      : jsUnits.length
        ? jsUnits.map((u) => `${u.where} (${u.size} บรรทัด)`).join(' · ')
        : 'ไม่พบ view หรือบล็อก dataviewjs เลย')

  // ── backtick ในเนื้อ CSS ต้อง escape ครบทุกตัว ───────────────────────────────
  // ข้อบนจับ "บล็อกพัง" · ข้อนี้จับ "**CSS พังแต่ JS ไม่พัง**" ซึ่งข้อบนมองไม่เห็นเลย
  // เส้นแบ่งคือ **parity ของ backtick ที่หลุด** (ใบ 11 บันทึกไว้เป็น addendum):
  //  · หลุด 1 ตัว (คี่) ⇒ template literal ปิดค้าง ⇒ JS พัง ⇒ **ข้อบนจับได้**
  //  · หลุด 2 ตัว (คู่) ⇒ ตัวแรกปิดสตริง ตัวที่สองเปิดใหม่ ⇒ สมดุลกลับมา · ข้อความระหว่างสองตัวนั้น
  //    กลายเป็น *โค้ด* และโค้ดจริงกลายเป็น *สตริง* ⇒ CSS ตายเงียบ · **และถ้าข้อความที่โผล่ออกมา
  //    บังเอิญเป็น JS ที่ถูกไวยากรณ์ ข้อบนจะเขียว** ⇒ พังเงียบเต็มรูปแบบ ไม่มีอะไรฟ้องเลย
  //    ไม่ใช่เคสสมมุติ — harness ยืนยันกับสตริงจริงในไฟล์นี้ว่ามันเป็น **การโยนหัวก้อย**:
  //      `\`.wft-arw\``  ⇒ กลายเป็น `.wft - arw\`…\`` (member access ลบ tagged template) ⇒ **ผ่าน**
  //      `\`opacity:.5\`` ⇒ `:` ทำให้พัง ⇒ ข้อบนจับได้
  //    ⇒ ตัวที่รอดคือ **ชื่อคลาส/ชื่อพร็อพเปล่า ๆ** (identifier + `-`) ซึ่งเป็นสิ่งที่คอมเมนต์ CSS
  //    เขียนถึงบ่อยที่สุดพอดี ⇒ ช่องนี้ไม่ได้หายาก มันอยู่ตรงที่คนพิมพ์บ่อยที่สุด
  // ⇒ **สองข้อนี้ไม่ครอบกัน ต้องมีทั้งคู่** (ข้อบนยังจับ typo/วงเล็บไม่ปิดที่ข้อนี้ไม่แตะ)
  //
  // ตัดขอบเขตด้วย **ตัวคั่นที่คนเขียนตั้งใจ** ไม่ใช่ที่ parser เห็น — `^const CSS = \`` ถึงบรรทัดที่มี
  // backtick เดี่ยวโดด ๆ · จำเป็น เพราะถ้ามี backtick หลุด สตริงจริงจบไปตั้งแต่ตรงนั้นแล้ว
  // ⇒ ถ้าไล่ตามสายตา parser จะได้ขอบเขตของ *ไฟล์ที่พังแล้ว* ไม่ใช่ของ *ไฟล์ที่คนตั้งใจเขียน*
  // **ปิดไม่เจอ = ไม่ผ่าน** (ตรวจไม่ได้ ห้ามเขียว) · ไม่เจอ `const CSS` เลยทั้ง vault = ไม่ผ่าน
  //
  // `detail` นับ **ตัวที่ escape แล้ว** มาโชว์ตอนเขียวด้วย ไม่ใช่แค่บอก "ผ่าน" — วันนี้หน้าใบมี 6 ตัว
  // ถ้าวันหนึ่งมันขึ้น `0 ตัว` ทั้งที่ไฟล์ยังมี `\`` อยู่ แปลว่าตัวตัดขอบเขตคว้าผิด และเห็นได้
  // ตั้งแต่บรรทัดที่ยังเขียว (กับดัก `LS_KEY` ของใบ 05/06 อีกครั้ง)
  const cssBodies = []
  for (const [view, body] of Object.entries(viewSrc)) {
    if (body === null) continue
    const note = `${VIEWS_DIR}/${view}.js`
    const lines = body.split('\n')
    const open = lines.findIndex((l) => /^const CSS\s*=\s*`/.test(l))
    if (open === -1) continue
    const rel = lines.slice(open + 1).findIndex((l) => /^`\s*$/.test(l))
    cssBodies.push({ note, from: open + 2, to: rel === -1 ? null : open + 1 + rel,
      lines: rel === -1 ? [] : lines.slice(open + 1, open + 1 + rel) })
  }
  // escape = มี backslash คี่ตัวนำหน้า (`\\\`` คือ backslash ที่ escape ตัวเอง แล้ว backtick หลุด)
  const scanTicks = (text) => {
    let raw = 0, esc = 0
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '`') continue
      let bs = 0
      while (text[i - 1 - bs] === '\\') bs++
      bs % 2 ? esc++ : raw++
    }
    return { raw, esc }
  }
  const cssBad = [], cssOk = []
  for (const c of cssBodies) {
    if (c.to === null) { cssBad.push(`${c.note} บรรทัด ${c.from - 1}: เปิด \`const CSS = \`\` แล้วหาตัวปิดไม่เจอ`); continue }
    let esc = 0
    for (const [i, l] of c.lines.entries()) {
      const t = scanTicks(l)
      esc += t.esc
      if (t.raw) cssBad.push(`${c.note}:${c.from + i} มี backtick ไม่ escape ${t.raw} ตัว — ${l.trim().slice(0, 55)}`)
    }
    cssOk.push(`${c.note}:${c.from}–${c.to} (escape แล้ว ${esc} ตัว)`)
  }
  check(cssBodies.length > 0 && cssBad.length === 0,
    'backtick ในเนื้อ CSS escape ครบทุกตัว',
    cssBad.length ? cssBad.join(' · ')
      : cssBodies.length ? cssOk.join(' · ') : `ไม่พบ \`const CSS = \`\` ใน ${VIEWS_DIR}/ เลยสักไฟล์`)

  // ── โน้ตอื่นที่มีบล็อก dataviewjs ─────────────────────────────────────────────
  // sandbox ของ Claude Code เขียนโน้ตได้ทุกใบ (spec *Sandbox grant (Q2)*) และบล็อก `dataviewjs` ในโน้ตไหนก็รัน
  // ด้วยสิทธิ์เต็มของเจ้าของตอนเปิดใน Obsidian ⇒ บล็อกที่ไม่ได้อยู่บนสี่หน้าข้างบน คือโค้ดที่ไม่มีใครในชุดนี้วางไว้
  // `wf` ไม่เขียนบล็อกแบบนี้ลงใบหรือ map เลย ⇒ เตือนพร้อมชื่อโน้ต ให้เจ้าของเปิดดูก่อนเปิดโน้ตนั้นใน Obsidian
  // (เตือน ไม่ใช่พัง: เจ้าของอาจเขียนเองในโน้ตส่วนตัว) · ขอบเขต = ทุกโน้ตที่ Obsidian เปิดได้ ข้ามแค่โฟลเดอร์จุด
  // กับ `_tools/` ที่ราก (sandbox เขียนไม่ได้) — **กว้างกว่า store** ซึ่งข้าม `_` ที่รากทุกตัว: `_inbox/` เขียนได้และเปิดได้
  // อ่านโฟลเดอร์ไหนไม่ได้ = ข้อนี้ไม่ผ่าน (ตรวจไม่ครบ ห้ามเขียว) แต่ไม่ล้มทั้งหมวด
  const pageFiles = new Set(Object.keys(PAGE_VIEWS).map((n) => `${n}.md`))
  const notesUnder = async (rel) => {
    const entries = await readdir(join(VAULT, rel), { withFileTypes: true })
    const nested = await Promise.all(entries.map((e) => {
      const path = rel ? `${rel}/${e.name}` : e.name
      if (e.name.startsWith('.') || path === '_tools') return []
      if (e.isDirectory()) return notesUnder(path)
      return e.isFile() && e.name.endsWith('.md') ? [path] : []
    }))
    return nested.flat()
  }
  const scanned = await notesUnder('').then((paths) => ({ paths }), (e) => ({ err: e.message }))
  const otherJs = []
  for (const path of (scanned.paths ?? []).filter((f) => !pageFiles.has(f))) {
    const n = jsFenceCount(await readFile(join(VAULT, path), 'utf8').catch(() => ''))
    if (n) otherJs.push(`${path} (${n})`)
  }
  if (scanned.err) check(false, 'สแกนโน้ตทั้ง vault หาบล็อก dataviewjs', `อ่านไม่ได้: ${scanned.err}`)
  else warn(otherJs.length === 0, 'ไม่มีบล็อก dataviewjs ในโน้ตอื่นนอกจากสี่หน้า Wayfinder',
    otherJs.length ? `เปิดดูก่อนเปิดใน Obsidian: ${otherJs.join(' · ')}` : `สแกน ${scanned.paths.length} โน้ต`)

  // ── โน้ตของผู้ใช้: Wayfinder Config · Wayfinder Picks (ใบ 01) ────────────────
  // ใบ 01 ย้ายค่าที่ผู้ใช้จูนออกจากสามหน้าไปไว้สองใบนี้ เพราะตัวอัปเดต **ทับสามหน้าทั้งชุดโดยไม่ถาม**
  // ⇒ ตั้งแต่นั้น "จูนค่าแล้วไม่มีอะไรขยับ" กลายเป็นโหมดพังที่เงียบที่สุดของระบบ: ตัวอ่านถูกออกแบบให้
  // **ห้าม throw** และตกไปใช้ค่าเริ่มต้น *เป็นราย ๆ คีย์* ⇒ ไม่มีกล่องแดง ไม่มี error ไม่มีอะไรบอกเลย
  // ว่าค่าที่เพิ่งแก้ถูกทิ้ง · ผู้ใช้จะสรุปว่า *ฟีเจอร์พัง* แล้วไปไล่หาผิดทางทั้งเส้น
  //
  // ⚠️ รายชื่อคีย์และกฎว่าค่าไหนใช้ได้ **มาจาก core** (`CONFIG_DEFAULTS` · `isConfigValue`) ตัวเดียวกับที่
  // ทุกหน้าอ่านผ่าน `core.readConfig` — ไม่ใช่ลิสต์ตัวที่สองใน doctor ⇒ เติมคีย์ใน core เมื่อไหร่ ข้อนี้เรียกร้อง
  // ให้โน้ต Config มีคีย์นั้นทันที และไม่มีกฎสองชุดให้ drift · core โหลดไม่ได้ = ไม่ผ่าน (ตรวจไม่ได้ ห้ามเขียว)
  const core = await import('./lib/core.mjs').catch(() => null)
  const cfgKeys = core?.CONFIG_DEFAULTS ? Object.keys(core.CONFIG_DEFAULTS).sort() : []

  // ชื่อโน้ตคือตัวที่ loader อ่าน (`Wayfinder Config.md`) ⇒ สตริงนั้นต้องสะกดตรงกับโน้ตที่มีอยู่จริง เหมือนข้อ `TICKETS_NOTE`
  const configNote = 'Wayfinder Config'
  const cfgOnDisk = rootNotes.includes(configNote)
  // อ่านด้วย `parseNote` ตัวเดียวกับที่ `wf` อ่านโน้ตนี้ (ไม่ใช่ parser ตัวที่สองใน doctor) · frontmatter นอก
  // YAML subset = อ่านไม่ได้ (ข้อ `wf lint` ใน §6 บอกบรรทัด)
  const cfgFm = !cfgOnDisk ? null : await (async () => {
    const { parseNote } = await import('./lib/frontmatter.mjs')
    const { frontmatter: fm, errors } = parseNote(await readFile(join(VAULT, `${configNote}.md`), 'utf8').catch(() => ''))
    return errors.length || !Object.keys(fm).length ? null : { get: (k) => fm[k] }
  })()
  // คีย์ที่ขาดตกไปค่าเริ่มต้นทีละคีย์ตามที่โน้ตสัญญาไว้ ("ลบโน้ตนี้ทิ้งได้ ไม่พัง") ⇒ เตือน ไม่นับว่าพัง
  // (vault เก่ายังไม่มี `claim_stale_days` จนกว่า `wf migrate` จะเติมให้) · core โหลดไม่ได้ต่างหากที่พัง
  const cfgMissing = cfgFm === null ? cfgKeys : cfgKeys.filter((k) => cfgFm.get(k) === undefined)
  check(cfgKeys.length > 0, 'โหลดรายชื่อคีย์ Config จาก core ได้', cfgKeys.length ? '' : 'โหลด _tools/lib/core.mjs ไม่ได้')
  warn(cfgOnDisk && cfgFm !== null && cfgKeys.length > 0 && cfgMissing.length === 0,
    'Wayfinder Config มีอยู่จริง + frontmatter ครบทุกคีย์ที่ core อ่าน',
    cfgKeys.length === 0 ? 'โหลด _tools/lib/core.mjs ไม่ได้ — ไม่รู้ว่าต้องมีคีย์อะไรบ้าง'
      : !cfgOnDisk ? `ไม่มี ${configNote}.md ที่รากของ vault (สแกน ${rootNotes.length} โน้ต)`
        : cfgFm === null ? `${configNote}.md ไม่มี frontmatter หรืออยู่นอก YAML subset`
          : cfgMissing.length ? `ขาด ${cfgMissing.length} คีย์: ${cfgMissing.join(' · ')}`
            : `${cfgKeys.length} คีย์: ${cfgKeys.join(' · ')}`)

  // คีย์ครบแต่ค่าใช้ไม่ได้ = ตกไปค่าเริ่มต้นเงียบ ๆ ⇒ ต้องเป็นคนละข้อ ไม่รวบ · กฎคือ `core.isConfigValue` ตัวเดียวกับหน้า
  const cfgBad = cfgFm === null || !core ? [] : cfgKeys.filter((k) => {
    const v = cfgFm.get(k)
    return v !== undefined && !core.isConfigValue(k, v)
  })
  check(cfgFm !== null && cfgKeys.length > 0 && cfgBad.length === 0,
    'ค่าทุกคีย์ใน Wayfinder Config ใช้ได้จริง (ไม่ตกไปค่าเริ่มต้นเงียบ ๆ)',
    cfgFm === null || cfgKeys.length === 0 ? 'อ่าน frontmatter ของโน้ต Config หรือ core ไม่ได้ — ดูข้อบน'
      : cfgBad.length
        ? cfgBad.map((k) => `${k}="${cfgFm.get(k)}" ใช้ไม่ได้ (ค่าเริ่มต้น ${core.CONFIG_DEFAULTS[k]})`).join(' · ')
        : `ตรวจแล้ว ${cfgKeys.filter((k) => cfgFm.get(k) !== undefined).length} ค่า`)

  // `Wayfinder Picks` — section `🎯 หยิบอันไหนต่อ` ที่ย้ายออกจากท้าย Dashboard (ใบ 01)
  // Dashboard เป็นไฟล์ **managed** (update ทับทั้งชุด) และมันลิงก์มาที่โน้ตนี้ ⇒ โน้ตหายเมื่อไหร่
  // ลิงก์บน Dashboard กลายเป็นลิงก์ตาย และ section ทั้งอันหายไปโดยไม่มีใครสังเกต
  // ตรวจสองขาแยกกัน: **มีไฟล์จริง** (เทียบสารบัญราก ไม่ใช่ `exists()` — ดิสก์ mac เป็น
  // case-insensitive ⇒ `stat()` เปิด "wayfinder picks" ผ่านหน้าเฉย) และ **Dashboard ยังลิงก์มา**
  const PICKS = 'Wayfinder Picks'
  const picksOnDisk = rootNotes.includes(PICKS)
  const picksLinked = dash.includes(`[[${PICKS}]]`)
  check(picksOnDisk && picksLinked, `${PICKS} มีอยู่จริง และ Dashboard ลิงก์ไปหา`,
    picksOnDisk && picksLinked ? `${PICKS}.md`
      : [picksOnDisk ? '' : `ไม่มี ${PICKS}.md ที่รากของ vault`,
        picksLinked ? '' : `Dashboard ไม่มีลิงก์ [[${PICKS}]]`].filter(Boolean).join(' · '))
})

// ── 6. เนื้อ vault — `lint()` ของ core ตัวเดียวกับ `wf lint` ──────────────────
// doctor **ไม่มีกฎเนื้อหาของตัวเอง** (spec *`doctor`*, Q27): ใบ · map · Config · Picks อ่านผ่าน store
// ของ `wf` แล้วส่งให้ `lint()` ครั้งเดียว ⇒ findings ชุดเดียวกับ `wf lint` และหน้า 🩺 บน Dashboard
// ไม่มีกฎสองชุดให้ drift · กฎใหม่เติมที่ core ที่เดียว · error = พัง, warn = เตือน
// อ่าน vault ไม่ได้ (core/store โหลดไม่ขึ้น หรือ frontmatter นอก YAML subset) = ตรวจไม่ได้ ⇒ ไม่ผ่าน ห้ามเขียว
// vault schema เก่ากว่าก็ยังลินต์ (เหมือน `wf lint`) เพื่อให้ finding ของฟิลด์ legacy ยังโผล่
let lintReport = null
await section('§6 เนื้อ vault', async () => {
  const label = 'เนื้อ vault ผ่าน wf lint (ไม่มี error)'
  try {
    const { buildIndex, isoDate, lint } = await import('./lib/core.mjs')
    const { readVault } = await import('./lib/store.mjs')
    const { notes, config, sort } = readVault(VAULT)
    const findings = lint(buildIndex(notes), { today: isoDate(new Date()), config, sort })
    const errors = findings.filter((f) => f.severity === 'error').length
    lintReport = { findings, errors, warnings: findings.length - errors }
    const tickets = notes.filter((n) => !n.path.endsWith('/map.md')).length
    check(errors === 0, label, `${errors} error · ${notes.length - tickets} map · ${tickets} ใบ`)
    warn(lintReport.warnings === 0, 'เนื้อ vault ไม่มี lint warning', `${lintReport.warnings} warning`)
  } catch (e) {
    check(false, label, `อ่าน vault ไม่ได้: ${[e.message, ...(e.details ?? [])].join(' · ')}`)
  }
})

// ── 7. hook ─────────────────────────────────────────────────────────────────
await section('§7 hook', async () => {
  const script = join(MAIN_VAULT, '_tools/autocommit.sh')
  const st = await stat(script).catch(() => null)
  check(st !== null && (st.mode & 0o111) !== 0, 'autocommit.sh มีสิทธิ์ execute')

  // ไม่มีไฟล์ = ยังไม่ได้ต่ออะไร (ข้อ hook ข้างล่างฟ้องเอง) · มีแต่อ่านไม่ได้ = บอกตรง ๆ ไม่ใช่ทำเป็นว่า "ไม่ได้ต่อ"
  const settingsPath = join(homedir(), '.claude/settings.json')
  const settings = await readJson(settingsPath).then((v) => (v && typeof v === 'object' ? v : {}), (e) => {
    if (e.code !== 'ENOENT') check(false, '~/.claude/settings.json อ่านได้', `${settingsPath}: ${e.message.split('\n')[0]}`)
    return {}
  })
  // hook ต้องชี้มาที่ vault *นี้* — ไม่ใช่แค่มีคำว่า autocommit.sh ของ vault อื่น
  //
  // เทียบสตริงก่อน แล้วค่อยตกมาที่ **realpath** เป็นทางที่สอง (ใบ 03): `import.meta.url` ของ ESM
  // ผ่าน realpath มาแล้วเสมอ ⇒ path ฝั่งนี้เป็น path จริงอยู่ข้างเดียว · ถ้า installer จด path
  // ที่มี symlink คั่นลง settings.json ข้อนี้จะ ❌ ทั้งที่ hook ยิงอยู่จริงทุกครั้ง — แดงปลอมชนิดที่
  // ไล่หาสาเหตุไม่เจอ เพราะทุกอย่างที่ตาเห็นถูกหมด
  //
  // matcher เป็น regex ของ Claude Code (`Write|Edit` · `^(Edit|Write)$` · `.*`) · ว่างหรือ `*` = ทุก tool
  // regex ที่ compile ไม่ได้ตกไปอ่านเป็นชื่อ tool คั่นด้วย `|`
  const covers = (matcher, tool) => {
    if (!matcher || matcher === '*') return true
    try {
      return new RegExp(`^(?:${matcher})$`).test(tool)
    } catch {
      return matcher.split('|').map((m) => m.trim()).includes(tool)
    }
  }
  const on = (hooks, tool) => hooks.filter((h) => covers(h.matcher, tool))
  // Write และ Edit ต้องถูกจับทั้งคู่ — จะอยู่บล็อกเดียวกันหรือแยกบล็อกก็ได้
  const wiredOnWriteEdit = (hooks) => on(hooks, 'Write').length > 0 && on(hooks, 'Edit').length > 0
  // path ของสคริปต์ในคำสั่ง hook: ใน single/double quote (path ที่มีช่องว่าง — bootstrap quote ให้) หรือเปล่า ๆ
  const HOOK_PATH_RE = /'([^']*_tools\/[\w.-]+\.(?:sh|mjs))'|"([^"]*_tools\/[\w.-]+\.(?:sh|mjs))"|([^"'\s]*_tools\/[\w.-]+\.(?:sh|mjs))/g
  // hook ของ `event` ที่เรียก `_tools/<ชื่อ>` ตัวใดตัวหนึ่งใน `names` ของ vault นี้: `[{ matcher, command }]`
  const hooksTo = async (event, names) => {
    const targets = names.map((n) => join(MAIN_VAULT, '_tools', n))
    const realTargets = await Promise.all(targets.map(real))
    const isOurs = async (p) => targets.includes(p) || realTargets.includes(await real(p))
    const blocks = Array.isArray(settings.hooks?.[event]) ? settings.hooks[event] : []
    const found = []
    for (const block of blocks)
      for (const h of Array.isArray(block?.hooks) ? block.hooks : []) {
        const paths = typeof h?.command === 'string' ? [...h.command.matchAll(HOOK_PATH_RE)].map((m) => m[1] ?? m[2] ?? m[3]) : []
        for (const p of paths)
          if (await isOurs(p)) { found.push({ matcher: block.matcher ?? '', command: h.command }); break }
      }
    return found
  }
  const REWIRE = 'ต่อ hook ใหม่ด้วย bootstrap (update) หรือแก้ ~/.claude/settings.json เอง'

  // frontmatter guard (spec *Frontmatter guard hook (Q15)*): PreToolUse บน Write|Edit — state ในใบ/map
  // เปลี่ยนผ่าน `wf` เท่านั้น ⇒ ไม่มี guard = agent แก้ frontmatter ตรง ๆ ได้โดยไม่มีอะไรห้าม
  const guardFile = join(MAIN_VAULT, '_tools/frontmatter-guard.mjs')
  const guard = await hooksTo('PreToolUse', ['frontmatter-guard.mjs'])
  const guardOnDisk = await exists(guardFile)
  const guardWired = wiredOnWriteEdit(guard)
  check(guardWired && guardOnDisk, 'frontmatter-guard ต่อไว้บน PreToolUse Write|Edit',
    !guardOnDisk ? `ไม่มี ${guardFile} — อัปเดต _tools/ ด้วย bootstrap`
      : guardWired ? on(guard, 'Write')[0].command : `ยังไม่ได้ต่อ — ${REWIRE}: PreToolUse "Write|Edit" → node ${guardFile}`)

  // autocommit ใหม่ (spec *New autocommit (Q7)*): PostToolUse บน Write|Edit **เท่านั้น** — `wf` commit
  // งานของตัวเอง และ Bash ที่เขียน vault ตรง ๆ โผล่ที่ข้อ "working tree สะอาด" แทน
  const autocommit = await hooksTo('PostToolUse', ['autocommit.sh', 'autocommit.mjs'])
  const autocommitWired = wiredOnWriteEdit(autocommit)
  check(autocommitWired, 'autocommit ต่อไว้บน PostToolUse Write|Edit', autocommitWired ? '' : `ยังไม่ได้ต่อ — ${REWIRE}`)
  // เส้นที่ต่อค้างจาก wiring รุ่นก่อน `wf`: matcher Bash (spec ตัดทิ้ง) · หรือ Write|Edit ซ้ำสองเส้น
  // (ของเก่าเหลือค้างข้างของใหม่ ⇒ autocommit รันซ้ำทุก Write/Edit)
  const onBash = on(autocommit, 'Bash')
  const twice = Math.max(on(autocommit, 'Write').length, on(autocommit, 'Edit').length)
  const leftovers = [
    ...(onBash.length ? [`matcher ที่จับ Bash ${onBash.length} เส้น (Bash ไม่มี autocommit แล้ว)`] : []),
    ...(twice > 1 ? [`Write|Edit ต่อซ้ำ ${twice} เส้น (รันซ้ำทุกครั้ง)`] : []),
  ]
  check(leftovers.length === 0, 'ไม่มี autocommit รุ่นเก่าต่อค้างอยู่',
    leftovers.length ? `${leftovers.join(' · ')} — ${REWIRE}` : '')

  // hook ที่ยิงจริงคือไฟล์ของ **vault หลัก** เสมอ (settings.json ชี้ path นั้นตรง ๆ) ⇒ การแก้ที่ยัง
  // ค้างใน worktree ยังไม่มีผลกับใคร · รุ่นเก่า (ก่อน `autocommit.mjs`) ล้มเงียบไปกับ `|| true`
  // และยัง sync branch ของ worktree ลง `main` ซึ่ง spec ตัดทิ้งแล้ว (Q14)
  const src = await readFile(script, 'utf8').catch(() => '')
  const isNew = src.includes('_tools/autocommit.mjs')
  check(isNew, 'autocommit.sh ตัวจริงเป็นรุ่นใหม่ (ส่งต่อให้ autocommit.mjs)',
    isNew ? '' : 'ยังเป็นรุ่นเก่าที่ sync worktree ลง main และพังเงียบ — อัปเดต _tools/ ด้วย bootstrap')

  // ── `VAULT` ที่สคริปต์คำนวณได้ ต้องเป็น vault นี้จริง (ใบ 02 ฝากไว้) ────────
  // ข้อข้างบนตรวจแค่ว่าเป็นรุ่นไหน ⇒ **จับ `__VAULT__` ที่ยังไม่ถูกเรนเดอร์ไม่ได้เลย**
  // ซึ่งเป็นบั๊กที่ทำให้ hook ตายเงียบที่สุดเท่าที่วัดมา: `[ -e "$REPO/.git" ]` ไม่ผ่าน ⇒ `exit 0`
  // **ไม่มี stdout ไม่มี stderr** ⇒ `2>/dev/null || true` ใน settings.json ไม่ได้กลืนอะไรเลย
  // เพราะไม่มีอะไรให้กลืนตั้งแต่แรก ⇒ รู้ตัวได้ทางเดียวคือบังเอิญไปเห็นว่า `git log` หยุดเดิน
  //
  // ตรวจโดย **รันสองบรรทัดนั้นจริง** ไม่ใช่อ่านค่าแล้วจำลองตรรกะ fallback เอง — ไม่งั้น doctor
  // ถือสำเนาที่สองของกฎไว้ แล้ว drift จากตัวจริงได้เงียบ ๆ (บั๊กชนิดเดียวกับที่ข้อนี้ตั้งใจจับพอดี)
  // หยิบมาเฉพาะบรรทัดที่ตรงรูป `VAULT=` / `[ -d "$VAULT/.git" ] || VAULT=` ⇒ ไม่ได้ eval ทั้งไฟล์
  // **หาบรรทัดไม่เจอ = ไม่ผ่าน** (สคริปต์เปลี่ยนรูปจนตรวจไม่ได้ ก็คือตรวจไม่ได้ ห้ามเขียว)
  const vaultLines = src.split('\n').filter((l) =>
    /^VAULT=/.test(l) || /^\[ -d "\$VAULT\/\.git" \][ \t]*\|\|[ \t]*VAULT=/.test(l))
  const resolved = vaultLines.length
    ? await run('bash', ['-c', `${vaultLines.join('\n')}\nprintf %s "$VAULT"`])
      .then((r) => r.stdout, () => null)
    : null
  const hookVault = resolved === null ? null : await real(resolved)
  const vaultOk = hookVault !== null && hookVault === await real(MAIN_VAULT)
  check(vaultOk, 'VAULT ใน autocommit.sh ชี้มาที่ vault นี้จริง',
    vaultLines.length === 0 ? 'หาบรรทัด VAULT= ในสคริปต์ไม่เจอ — รูปสคริปต์เปลี่ยนไปแล้ว'
      : resolved === null ? 'รันบรรทัด VAULT= ไม่ผ่าน'
        : vaultOk ? hookVault
          : `ได้ "${resolved}" แต่ vault อยู่ที่ ${MAIN_VAULT}`
            + (resolved.includes(VAULT_TOKEN) ? ` — โทเคน ${VAULT_TOKEN} ยังไม่ถูกเรนเดอร์` : ''))
})

// ── 7b. autocommit ล้มเหลวที่ยังไม่มีใครเคลียร์ ─────────────────────────────────
// autocommit ไม่ block และไม่ล้มเงียบ: บอก agent ทาง `additionalContext` ในเทิร์นนั้น และต่อท้ายหนึ่งบรรทัด
// (`<เวลา ISO>\t<ไฟล์>\t<เหตุ>`) ลง log ใน git dir ร่วมของ vault ⇒ doctor ฟ้องจนกว่าเจ้าของจะล้าง log เอง
// (ล้าง = รับทราบแล้ว) · log ไม่มีหรือว่าง = ผ่าน · อ่าน git dir หรือ log ไม่ได้ = ตรวจไม่ได้ ⇒ ไม่ผ่าน
await section('§7b autocommit failure log', async () => {
  const label = 'ไม่มี autocommit ที่ล้มค้างใน wf-autocommit-failures.log'
  try {
    const { FAILURE_LOG } = await import('./lib/autocommit.mjs')
    const commonDir = await run('git', ['-C', MAIN_VAULT, 'rev-parse', '--git-common-dir'])
      .then((r) => real(resolve(MAIN_VAULT, r.stdout.trim())))
    const logPath = join(commonDir, FAILURE_LOG)
    const text = await readFile(logPath, 'utf8').catch((e) => {
      if (e.code === 'ENOENT') return ''
      throw e
    })
    const lines = text.split('\n').filter((l) => l.trim())
    // บรรทัดที่ไม่ได้รูป `<เวลา>\t<ไฟล์>\t<เหตุ>` แสดงทั้งบรรทัดตามที่เป็น
    const fields = (lines.at(-1) ?? '').split('\t')
    const latest = fields.length >= 3 ? `${fields[0]} ${fields[1]}: ${fields.slice(2).join(' ')}` : fields.join(' ')
    const quoted = `'${logPath.replace(/'/g, "'\\''")}'`
    check(lines.length === 0, label, lines.length === 0 ? '' : `${lines.length} ครั้ง · ล่าสุด ${latest}`
      + ` — commit ไฟล์ที่ค้างตามเหตุใน log แล้วล้าง log: : > ${quoted}`)
  } catch (e) {
    check(false, label, `อ่าน log ไม่ได้: ${e.message.split('\n')[0]}`)
  }
})

// ── 7c. sandbox ที่ให้เขียน vault ต้องไม่ให้เขียนโค้ดที่รันนอก sandbox ───────────────────
// `sandbox` ใน ~/.claude/settings.json เป็นของเจ้าของ (spec Q2) — doctor แค่อ่าน · ให้เขียน vault ทั้งก้อน
// (หรือแค่บางส่วนของมัน) แต่ไม่ deny `_tools/` · `.git/hooks` ฯลฯ = Bash ใน sandbox วางโค้ดให้ hook รันนอก sandbox ได้ ⇒ ไม่ผ่าน
// ตรวจแค่ `sandbox.filesystem` ของ user settings: ค่าจาก scope อื่น, wildcard และ `Edit` allow rule ไม่ถูกนับ
await section('§7c sandbox', async () => {
  const { SANDBOX_DENY, sandboxGaps, sandboxGrant, sandboxPath } = await import('./lib/sandbox.mjs')
  const settingsPath = join(homedir(), '.claude/settings.json')
  const settings = await readJson(settingsPath).catch((e) => {
    if (e.code === 'ENOENT') return {}
    throw new Error(`อ่าน ${settingsPath} ไม่ได้: ${e.message}`)
  })
  const fs = settings?.sandbox?.filesystem ?? {}
  // deny ของ path ที่ยังไม่มี (`.git/modules` · `.mcp.json`) ก็ต้องเทียบผ่าน realpath ได้ ⇒ ใช้ของ ancestor ที่มีอยู่
  const realUpTo = async (p) => {
    const r = await realpath(p).catch(() => null)
    if (r !== null || dirname(p) === p) return r ?? p
    return join(await realUpTo(dirname(p)), basename(p))
  }
  const paths = async (entries) => {
    const abs = (Array.isArray(entries) ? entries : []).map((e) => sandboxPath(e, homedir())).filter(Boolean)
    return [...abs, ...(await Promise.all(abs.map(realUpTo)))]
  }
  const vaults = [...new Set([MAIN_VAULT, await real(MAIN_VAULT)])]
  const { granted, missing } = sandboxGaps({ allow: await paths(fs.allowWrite), deny: await paths(fs.denyWrite) }, vaults)
  // `denyWrite` ของ `sandboxGrant` เรียงตาม `SANDBOX_DENY` ⇒ หยิบตัวที่ขาดตามตำแหน่ง สะกดแบบที่ INSTALL เขียน
  const spelled = sandboxGrant(MAIN_VAULT, homedir()).denyWrite
  const toAdd = SANDBOX_DENY.flatMap((p, i) => (missing.includes(p) ? [spelled[i]] : []))
  check(missing.length === 0, 'sandbox ที่ให้เขียน vault ไม่ให้เขียนโค้ดที่ hook · git · Obsidian รันนอก sandbox',
    missing.length ? `allowWrite ถึง path พวกนี้แต่ denyWrite ยังไม่กัน ${missing.length} path — เพิ่มเองใน ${settingsPath}: ${toAdd.join(' · ')}`
      : granted ? `denyWrite ครบ ${SANDBOX_DENY.length} path` : 'ไม่ได้ให้ sandbox เขียน vault')
  if (settings?.sandbox?.enabled === true)
    warn(granted, 'Bash ใน sandbox เขียน vault ได้ (wf ต้องใช้)',
      granted ? '' : `sandbox เปิดอยู่แต่ไม่มี allowWrite ที่ครอบ ${MAIN_VAULT} — wf จะเขียน vault ไม่ได้ (INSTALL: Upgrading from 0.4.x ขั้น 3)`)
})

// ── 8. Obsidian รู้จัก vault นี้ ─────────────────────────────────────────────
await section('§8 Obsidian', async () => {
  const p = join(homedir(), 'Library/Application Support/obsidian/obsidian.json')
  const o = await readJson(p).catch(() => ({ vaults: {} }))
  // เทียบ realpath ด้วยเหมือน §7 — Obsidian จดตาม path ที่ผู้ใช้ลากเข้าไป ซึ่งอาจมี symlink คั่น
  // ⇒ เทียบสตริงตรง ๆ อย่างเดียวจะบอกว่า "ยังไม่ลงทะเบียน" ทั้งที่เปิด vault นี้อยู่ (ใบ 03)
  const vaultPaths = Object.values(o.vaults ?? {}).map((v) => v?.path).filter(Boolean)
  let known = vaultPaths.includes(MAIN_VAULT)
  if (!known) {
    const mainReal = await real(MAIN_VAULT)
    for (const v of vaultPaths) if (await real(v) === mainReal) { known = true; break }
  }
  check(known, 'Obsidian ลงทะเบียน vault นี้ไว้แล้ว')
})

// ── 9. ติดตั้งจากเทมเพลต — manifest · โทเคนที่ต้องถูกเรนเดอร์ ───────────────
// vault ที่ติดตั้งจาก public template มี `.wayfinder-template.json` เป็นสัญญาว่า *ไฟล์ไหนเป็นของ
// template* · หมวดนี้ตรวจฝั่ง "ติดตั้งครบและยังครบอยู่ไหม" ซึ่ง §1-§6 ไม่ได้มองเลย (ใบ 03)
await section('§9 manifest', async () => {
  const MANIFEST = '.wayfinder-template.json'
  // ไม่มีไฟล์ = ยังไม่ได้ติดตั้ง (⚠️ ข้างล่าง) · มีแต่อ่านไม่ได้ = พัง (`wf` ก็ปฏิเสธ vault นี้ทั้งก้อน)
  let unreadable = null
  const man = await readJson(join(VAULT, MANIFEST)).catch((e) => {
    if (e.code !== 'ENOENT') unreadable = e.message.split('\n')[0]
    return null
  })
  if (unreadable !== null) check(false, `${MANIFEST} อ่านได้และมีรายชื่อไฟล์`, `อ่านไม่ได้: ${unreadable}`)

  // vault ที่ยังไม่เคยผ่าน installer **ไม่ใช่ความผิดพลาด** — vault ที่มีมาก่อน template ก็หน้าตาแบบนี้
  // ⇒ ⚠️ ไม่ใช่ ❌ (แบบเดียวกับ "มี ticket ใน vault") · และข้อที่ขึ้นกับ manifest จะ **ไม่ถูก
  // ลงทะเบียนเลย** แทนที่จะลงทะเบียนแบบเขียวโดยไม่ได้ตรวจอะไร — ตัวเลข `N/M` จะได้ไม่โกหกว่า
  // ตรวจครบแล้ว · บรรทัด ⚠️ นี้คือสิ่งที่บอกว่าทำไม M ถึงน้อยลง
  if (unreadable === null) warn(man !== null, `มี ${MANIFEST} (vault นี้ติดตั้งจากเทมเพลต)`,
    man ? `template ${man.template_sha ? String(man.template_sha).slice(0, 12)
        : man.template_version ? `v${man.template_version} · npx` : '?'}`
      + ` · ติดตั้ง ${String(man.installed_at ?? '?').slice(0, 10)}`
      + ` · อัปเดต ${String(man.updated_at ?? '?').slice(0, 10)}`
      : 'ยังไม่ได้ติดตั้งจากเทมเพลต ⇒ ข้อที่ขึ้นกับ manifest ยังไม่ถูกตรวจ (node _tools/bootstrap.mjs --plan)')

  if (man !== null) {
    const files = man.files && typeof man.files === 'object' ? Object.keys(man.files) : []
    const skillFiles = Object.keys(man.skills ?? {})
    check(man.schema === 1 && files.length > 0, `${MANIFEST} อ่านได้และมีรายชื่อไฟล์`,
      `schema=${man.schema} · managed ${files.length}`
      + ` · seed ${Object.keys(man.seeded_once ?? {}).length} · สกิล ${skillFiles.length}`)

    // vault schema (ฟิลด์ `vault_schema` แยกจาก `schema` ของ manifest เอง) — ตัดสินด้วย `checkSchema` ตัวเดียวกับ
    // ที่ `wf` ใช้ปฏิเสธการเขียน ⇒ เก่ากว่า = "run `wf migrate`" · ใหม่กว่า = อัปเดต template
    const schemaLabel = 'vault_schema ตรงกับที่ wf รองรับ'
    try {
      const { checkSchema } = await import('./lib/store.mjs')
      check(true, schemaLabel, `vault_schema=${checkSchema(VAULT)}`)
    } catch (e) {
      check(false, schemaLabel, e.message)
    }

    // manifest จด path ที่ **เรนเดอร์ลงไปในไฟล์แล้ว** ⇒ ย้าย/ก็อบ vault ไปที่อื่นโดยยังไม่รัน update
    // = ทุก path ที่เรนเดอร์ไว้ (hook · สกิล) ยังชี้กลับไปที่เดิม ทั้งที่ vault ไม่ได้อยู่ตรงนั้นแล้ว
    // เทียบ realpath ทั้งสองฝั่งเหมือน §7/§8 · เทียบกับ `MAIN_VAULT` เพราะ path ที่เรนเดอร์คือของ
    // vault หลักเสมอ ไม่ใช่ของ worktree ที่ doctor บังเอิญถูกรันอยู่
    const manVault = await real(String(man.vault ?? ''))
    const here = await real(MAIN_VAULT)
    check(manVault === here, `${MANIFEST} จด path ตรงกับที่ vault อยู่จริง`,
      manVault === here ? here : `manifest จด "${man.vault}" แต่ vault อยู่ที่ ${MAIN_VAULT}`)

    // ไฟล์ระบบหายไปหนึ่งตัวแล้ววินิจฉัยไม่ได้ว่าหายตอนไหน ⇒ ต้องมีอะไรฟ้อง
    // ⚠️ **เฉพาะ `files` ไม่รวม `seeded_once`** — ของชั้น seed ผู้ใช้ลบทิ้งได้ตามสิทธิ์ (ตัวอย่าง
    // ชัดที่สุดคือ `example-repo/` ที่สเปกข้อ 9 บอกเองว่า "ลบแล้วต้องลบขาด" update ไม่ปลุกคืน)
    // ⇒ เอา `seeded_once` มาตรวจเมื่อไหร่ = แดงใส่คนที่ทำถูกตามสเปกเป๊ะ ๆ
    const missing = []
    for (const rel of files) if (!(await exists(join(VAULT, rel)))) missing.push(rel)
    check(missing.length === 0, 'ไฟล์ใน manifest ยังอยู่ครบทุกตัว',
      missing.length ? `หาย ${missing.length}: ${missing.slice(0, 5).join(' · ')}`
        : `${files.length} ไฟล์`)

    // ── โทเคนค้าง — `__VAULT__` ที่ไม่ถูกเรนเดอร์ ────────────────────────────
    // ขอบเขต = **สิ่งที่ตัวเรนเดอร์รับผิดชอบ** (managed + สกิลที่ติดตั้งไว้) ไม่ใช่ "ทุกไฟล์ใน vault"
    // ตั้งใจ: effort ของผู้ใช้เขียนถึงโทเคนตัวนี้ได้ตามปกติ (ใบของ effort นี้เองก็เขียน) ⇒ กวาดทั้ง
    // vault เมื่อไหร่ = แดงใส่ prose ของตัวเอง แล้วคนจะเลิกอ่าน doctor ซึ่งแย่กว่าตัวบั๊ก
    //
    // `RENDER_EXEMPT` ของ bootstrap ถูกยกเว้นตรงนี้เพราะทั้งสามตัว *พูดถึง* โทเคนโดยตั้งใจ —
    // ฝั่งที่เฝ้าสามตัวนั้นคือข้อ §7 (`autocommit.sh` resolve ได้ถูกไหม) กับข้อกลับด้านข้างล่าง
    const EXEMPT = new Set(['_tools/autocommit.sh', '_tools/bootstrap.mjs', '_tools/doctor.mjs'])
    const leftover = []
    for (const rel of files) {
      if (EXEMPT.has(rel)) continue
      const t = await readFile(join(VAULT, rel), 'utf8').catch(() => null)
      if (t !== null && t.includes(VAULT_TOKEN)) leftover.push(rel)
    }
    // สกิลอยู่ **นอก vault** (`~/.claude/skills/` หรือปลายทางของ symlink) ⇒ ต้องตามไปจาก manifest
    // ตรงนี้คือที่ที่บั๊ก "ตัวเรนเดอร์เรนเดอร์ตัวเอง" โผล่ให้เห็นครั้งแรกในใบ 03 — สกิลกลับมามีโทเคน
    // หลัง update รอบสอง · รับ `<VAULT>` ด้วยตามภาคผนวก J ของใบ 03
    for (const rel of skillFiles) {
      const cut = rel.indexOf('/')
      const base = cut < 0 ? null : man.skills_targets?.[rel.slice(0, cut)]
      if (!base) continue
      const t = await readFile(join(base, rel.slice(cut + 1)), 'utf8').catch(() => null)
      if (t !== null && (t.includes(VAULT_TOKEN) || t.includes('<VAULT>'))) leftover.push(`skills/${rel}`)
    }
    check(leftover.length === 0, `ไม่เหลือ ${VAULT_TOKEN} ค้างในไฟล์ที่ติดตั้ง`,
      leftover.length ? `${leftover.length} ไฟล์: ${leftover.slice(0, 5).join(' · ')}`
        : `สแกน managed ${files.length - [...EXEMPT].filter((e) => files.includes(e)).length} + สกิล ${skillFiles.length} ไฟล์`)
  }

  // ── ข้อ **กลับด้าน**: ตัวเรนเดอร์ต้องยังถือโทเคนไว้เอง (ใบ 03) ───────────────
  // ข้อข้างบนตรวจ *ผลลัพธ์* — ข้อนี้ตรวจว่า *เครื่องมือยังทำงานอยู่ไหม* และสองอย่างนี้ไม่ครอบกัน
  // เคสจริง: `bootstrap.mjs` มี `text.split('__VAULT__')` อยู่ในตัวเอง ⇒ install เรนเดอร์ตัวเอง
  // ⇒ สำเนาใน vault กลายเป็น `text.split('<path>')` ⇒ **update รอบถัดไปหยุดเรนเดอร์ทุกไฟล์เงียบ
  // สนิท** โดยตัวกวาด "ไม่เหลือ placeholder ค้าง" ยังเขียวสวยงาม เพราะรอบนั้นไม่มีอะไรค้างจริง ๆ
  //
  // ไม่ขึ้นกับ manifest โดยตั้งใจ — vault ที่ยังไม่ติดตั้ง (เช่นตัวที่กำลังจะย้ายเข้าเทมเพลต) ก็ต้อง
  // รู้ตัวว่าเครื่องมือของมันยังใช้การได้อยู่ก่อนจะเริ่ม
  const holders = ['_tools/bootstrap.mjs', '_tools/doctor.mjs']
  const lost = []
  for (const rel of holders) {
    const t = await readFile(join(VAULT, rel), 'utf8').catch(() => null)
    if (t === null || !t.includes(VAULT_TOKEN)) lost.push(rel)
  }
  check(lost.length === 0, `ตัวเรนเดอร์ยังถือโทเคน ${VAULT_TOKEN} ไว้เอง`,
    lost.length ? `ถูกเรนเดอร์ทับ/หายไปแล้ว: ${lost.join(' · ')}` : holders.join(' · '))
})

// ── รายงาน ──────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok && !r.soft)
const warned = results.filter((r) => !r.ok && r.soft)
const hard = results.filter((r) => !r.soft)

// `process.exitCode` ไม่ใช่ `process.exit()` — exit ทันทีหลัง console.log ตัด stdout ที่ยังค้างใน pipe ทิ้ง
// (เกิน ~64 KiB ⇒ JSON ขาดกลางทาง) · ปล่อยให้ process จบเองหลังเขียนครบ
process.exitCode = failed.length ? 1 : 0
if (JSON_OUT) console.log(JSON.stringify({ ok: failed.length === 0, checks: results, lint: lintReport }, null, 2))
else printReport()

function printReport() {
  const pad = Math.max(...results.map((r) => [...r.label].length))
  for (const r of results) {
    const icon = r.ok ? '✅' : r.soft ? '⚠️ ' : '❌'
    console.log(`${icon}  ${r.label.padEnd(pad)}  ${r.detail}`.trimEnd())
  }

  // finding ทีละบรรทัดแบบเดียวกับ `wf lint` — ข้อ §6 บอกแค่จำนวน
  if (lintReport?.findings.length) {
    console.log(`\n🩺 wf lint — ${lintReport.errors} error · ${lintReport.warnings} warning`)
    for (const f of lintReport.findings) {
      console.log(`  ${f.severity === 'error' ? '❌' : '⚠️ '}  ${f.rule}  ${f.ref}  ${f.message}`)
      if (f.fix) console.log(`        fix: ${f.fix}`)
    }
  }

  console.log(`\n${hard.length - failed.length}/${hard.length} ผ่าน` +
    (warned.length ? ` · ${warned.length} เตือน (ไม่นับว่าพัง)` : ''))

  // รายการรับงานด้วยมือใน Obsidian จาก spec (*Testing Decisions → Manual acceptance in Obsidian*) อยู่สี่ข้อแรก
  console.log(`
ตรวจด้วยเครื่องไม่ได้ — ต้องเปิด Obsidian ดูเอง:
  • ทุกหน้า (Dashboard · Efforts · Effort Tickets · Picks) เรนเดอร์ผ่าน stub → view ใน _tools/views/ → loader กลาง
    เป็นตาราง ไม่ใช่กล่องแดง "Dataview: <error>" (view ว่างขึ้นบรรทัดเอียง "ไม่มี…" · 🩺 สะอาดขึ้น "✅ lint clean" = ปกติ)
  • แก้ _tools/lib/core.mjs แล้ว render รอบถัดไปเห็นของใหม่โดยไม่ต้องรีสตาร์ต Obsidian (อาศัย mtime ใน getResourcePath)
  • core พัง (ลองใส่ syntax error) ⇒ ทุกบล็อกขึ้นข้อความของ loader ที่บอกชื่อไฟล์ core + doctor
  • หน้าทั้งสี่กับ \`node _tools/wf.mjs frontier\` แสดง frontier ชุดเดียวกัน · 🩺 บน Dashboard ตรงกับ \`wf lint\`
    (Picks เรียงเหมือน \`wf frontier\` · แก้ \`sort:\` แล้วทั้งสองเปลี่ยนตาม) · blocker ข้าม effort ขึ้นสถานะเดียวกันทุกหน้า
  • คลิกตัวเลขใบ (\`44/47\`) บน Efforts ⇒ เปิด Effort Tickets พร้อมเลือก effort นั้น
  • Graph View ระบายสี node ตาม status จริง`)
}
