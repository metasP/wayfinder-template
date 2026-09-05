#!/usr/bin/env node
// ตรวจสุขภาพ wayfinder-vault — ทุกข้อที่ตรวจด้วยเครื่องได้
//
// ใช้:  node _tools/doctor.mjs
// exit 0 = ผ่านหมด, exit 1 = มีอย่างน้อยหนึ่งข้อพัง
//
// ข้อที่ *ตรวจด้วยเครื่องไม่ได้* (ต้องเปิด Obsidian ดูเอง) จะขึ้นเป็น MANUAL ท้ายรายงาน

import { readFile, readdir, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const run = promisify(execFile)
const VAULT = join(dirname(fileURLToPath(import.meta.url)), '..')

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

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'))
const exists = async (p) => stat(p).then(() => true, () => false)
const git = (...args) => run('git', ['-C', VAULT, ...args]).then((r) => r.stdout.trim())

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
{
  const gi = await readFile(join(VAULT, '.gitignore'), 'utf8').catch(() => '')
  check(gi.includes('.obsidian/plugins/*/data.json'),
    '.gitignore กัน plugin data.json', 'ไฟล์นั้นเก็บ API key + RSA private key')
  check(gi.includes('.obsidian/workspace.json'), '.gitignore กัน workspace.json')
}

// ── 3. plugin ───────────────────────────────────────────────────────────────
{
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
  const gi = await readFile(join(VAULT, '.gitignore'), 'utf8').catch(() => '')
  check(gi.includes('!.obsidian/plugins/dataview/data.json'),
    '.gitignore ยกเว้น data.json ของ Dataview', 'ไม่งั้นค่าตั้งนี้ไม่เดินทางไปเครื่องใหม่')
}

// ── 4. graph colorGroups ────────────────────────────────────────────────────
{
  const g = await readJson(join(VAULT, '.obsidian/graph.json')).catch(() => ({}))
  const groups = g.colorGroups ?? []
  check(groups.length >= 4, 'graph.json ตั้ง colorGroups แล้ว', `${groups.length} groups`)
  const propQueries = groups.filter((x) => x.query?.includes(':') && !x.query.startsWith('path:'))
  check(propQueries.every((x) => /^\[.+\]$/.test(x.query)),
    'colorGroups ใช้ syntax property แบบวงเล็บ',
    propQueries.map((x) => x.query).join(' '))
}

// ── 5. dashboard ────────────────────────────────────────────────────────────
{
  const dash = await readFile(join(VAULT, 'Wayfinder Dashboard.md'), 'utf8').catch(() => '')
  const blocks = dash.match(/```dataview\n/g)?.length ?? 0
  check(blocks >= 5, 'Dashboard มี dataview block ครบ', `${blocks} blocks`)
  const froms = dash.match(/^FROM .*$/gm) ?? []
  check(froms.length === blocks && froms.every((f) => f.includes('""')),
    'ทุก query มี source เชิงบวก (ไม่ใช่ FROM -"..." ลอย ๆ)',
    `${froms.length} FROM`)

  const eff = await readFile(join(VAULT, 'Wayfinder Efforts.md'), 'utf8').catch(() => '')
  check(eff.includes('```dataviewjs') && /const STALE_DAYS = \d+/.test(eff)
    && /const PAUSED_STALE_DAYS = \d+/.test(eff),
    'Wayfinder Efforts มีบล็อก dataviewjs + เส้นแบ่งเวลาทั้งสองเส้น')

  // สถานะ map เป็นของ load-bearing ⇒ ทุก view ระดับใบต้องกรองด้วยมัน
  // ไม่งั้นใบจาก map ที่พัก/ทิ้งแล้ว จะแอบกลับขึ้น Frontier
  const gated = (dash.match(/link\(repo \+ "\/" \+ effort \+ "\/map"\)\.status/g) ?? []).length
  check(gated >= blocks - 1, 'ทุก view บน Dashboard กรองด้วยสถานะของ map',
    `${gated} จุด / ${blocks} query`)
  check(dash.includes('[[Wayfinder Efforts]]'), 'Dashboard ลิงก์ไปหน้า Efforts')

  // ── หน้าที่สาม: Wayfinder Effort Tickets (ใบทั้ง effort เดียว จบในหน้าเดียว) ──
  const tix = await readFile(join(VAULT, 'Wayfinder Effort Tickets.md'), 'utf8').catch(() => '')
  check(tix.includes('```dataviewjs'), 'Wayfinder Effort Tickets มีบล็อก dataviewjs',
    tix ? '' : 'ไม่มีไฟล์ Wayfinder Effort Tickets.md')
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
  for (const name of ['LS_KEY', 'SELECT_EVENT']) {
    const a = sharedConst(eff, name)
    const b = sharedConst(tix, name)
    const same = a !== null && b !== null && a === b
    const show = (v) => (v === null ? 'ไม่พบ' : `"${v}"`)
    check(same, `${name} ตรงกันทั้ง Efforts และ Effort Tickets`,
      same ? `"${a}"` : `Efforts=${show(a)} · Effort Tickets=${show(b)}`)
  }

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
  const ticketsNote = eff.match(/^const\s+TICKETS_NOTE\s*=\s*["']([^"']+)["']/m)?.[1] ?? null
  const rootNotes = await readdir(VAULT).then(
    (fs) => fs.filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md')), () => [])
  const noteHit = ticketsNote !== null && rootNotes.includes(ticketsNote)
  // ต่างแค่ตัวพิมพ์/ช่องว่าง = เคสที่เจอบ่อยที่สุดและมองด้วยตาเปล่าแทบไม่ออก ⇒ ชี้ตัวที่น่าจะหมายถึงให้
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const near = ticketsNote === null ? []
    : rootNotes.filter((n) => n !== ticketsNote && norm(n) === norm(ticketsNote))
  check(noteHit, 'TICKETS_NOTE ชี้ไปยังโน้ตที่มีอยู่จริงใน vault',
    ticketsNote === null
      ? 'ไม่พบตัวประกาศ const TICKETS_NOTE ใน Wayfinder Efforts.md'
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

  // ── บล็อก dataviewjs ต้องเป็น JS ที่ parse ได้ ───────────────────────────────
  // ใบ 11 ตกกับดักนี้ **สองครั้งในใบเดียว**: `CSS` เป็น template literal ⇒ backtick ที่พิมพ์ลง
  // คอมเมนต์ CSS ตามนิสัยมาร์กดาวน์ (`/* `paint-order: stroke` วาดขอบก่อนตัวอักษร */`)
  // **ปิดสตริงกลางทาง** ⇒ บล็อกพังทั้งบล็อกตั้งแต่ตอน parse · Obsidian ขึ้นกล่องแดง
  // "Dataview: <error>" ทั้งที่ไฟล์ยังดูปกติทุกตัวอักษรในสายตา
  // (กติกาในไฟล์คือ escape เป็น \` — ดูคอมเมนต์ `.wft-head` ของใบ 04)
  // ⇒ ใบ 11 สรุปเองว่า **"ไม่ใช่เรื่องที่ระวังแล้วจะไม่พลาด"** ⇒ ต้องเป็นงานของเครื่อง
  //
  // **ตรวจไวยากรณ์อย่างเดียว ไม่รัน** — `new AsyncFunction(src)` คอมไพล์บอดี้แล้วทิ้ง ไม่ execute
  // ⇒ ไม่ต้องมี `dv` / DOM / `localStorage` / `app` ให้มันเรียก
  // ต้องเป็น **Async**Function ไม่ใช่ `Function` เปล่า เพราะ Dataview รันบล็อกเป็นบอดี้ของ
  // async function ⇒ `await` ระดับบนสุดถูกกฎ · ด้วยเหตุผลเดียวกัน `node --check` ใช้แทนไม่ได้
  // (โหมดสคริปต์ = top-level await แดงปลอม · โหมดโมดูล = `return` ระดับบนสุดแดงปลอม)
  //
  // สแกน **ทั้งสามหน้า** โดยจับจาก *ชนิด fence* ไม่ใช่ *ชื่อไฟล์* — วันนี้ `Wayfinder Dashboard`
  // เป็น DQL (```dataview) ล้วนจึงได้ 0 บล็อก ซึ่งถูกต้อง ไม่ใช่ข้อยกเว้นที่ต้อง hardcode
  // ⇒ วันที่มีคนเพิ่ม dataviewjs ลง Dashboard มันถูกเฝ้าทันทีโดยไม่ต้องแก้ doctor
  // **ไม่เจอเลยสักบล็อกทั้ง vault = ไม่ผ่าน** — regex ที่คว้าไม่โดนเลย (เช่นมีคนเปลี่ยนรูป fence
  // ทั้ง vault) ต้องแดง ไม่ใช่เขียวเพราะ "ไม่มีอะไรให้ตรวจ" ซึ่งคือกับดัก `null === null` ของใบ 05/06
  // ส่วน **การมีบล็อกอยู่ *รายหน้า* เป็นของสองข้อข้างบน** (`… มีบล็อก dataviewjs`) ⇒ ข้อนี้ไม่ตรวจซ้ำ
  // พิสูจน์แล้วด้วย harness: ทำ fence ของหน้าใบเพี้ยน หรือลบไฟล์หน้าใบทิ้ง ⇒ ข้อข้างบนแดง
  // ข้อนี้เขียวโดยเหลือ 1 บล็อก — เห็นได้จาก `detail` ที่นับบล็อกให้ ไม่ใช่เขียวแบบไม่บอกอะไร
  // และ `detail` โชว์ตำแหน่ง + ขนาดที่ดึงมาได้จริง เพื่อให้เห็นตั้งแต่บรรทัดที่ยังเขียว
  // ถ้าวันหนึ่งมันคว้าได้แค่เศษเสี้ยวของบล็อก
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const DVJS = /^```dataviewjs[ \t]*\r?\n([\s\S]*?)^```/gm
  const NOTES = [['Wayfinder Dashboard', dash],
    ['Wayfinder Efforts', eff], ['Wayfinder Effort Tickets', tix]]
  const jsBlocks = []
  for (const [note, body] of NOTES) {
    for (const m of body.matchAll(DVJS)) {
      const src = m[1]
      let err = null
      try { new AsyncFunction(src) } catch (e) { err = e.message }
      jsBlocks.push({ note, line: body.slice(0, m.index).split('\n').length,
        size: src.split('\n').length, err })
    }
  }
  const brokenJs = jsBlocks.filter((b) => b.err)
  check(jsBlocks.length > 0 && brokenJs.length === 0,
    'ทุกบล็อก dataviewjs parse เป็น JS ได้',
    brokenJs.length
      ? brokenJs.map((b) => `${b.note}.md บรรทัด ${b.line}: ${b.err}`).join(' · ')
      : jsBlocks.length
        ? `สแกน 3 หน้า ⇒ ${jsBlocks.length} บล็อก: `
          + jsBlocks.map((b) => `${b.note}:${b.line} (${b.size} บรรทัด)`).join(' · ')
        : 'ไม่พบบล็อก dataviewjs เลยสักหน้า')

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
  for (const [note, body] of NOTES) {
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
    if (c.to === null) { cssBad.push(`${c.note}.md บรรทัด ${c.from - 1}: เปิด \`const CSS = \`\` แล้วหาตัวปิดไม่เจอ`); continue }
    let esc = 0
    for (const [i, l] of c.lines.entries()) {
      const t = scanTicks(l)
      esc += t.esc
      if (t.raw) cssBad.push(`${c.note}.md:${c.from + i} มี backtick ไม่ escape ${t.raw} ตัว — ${l.trim().slice(0, 55)}`)
    }
    cssOk.push(`${c.note}:${c.from}–${c.to} (escape แล้ว ${esc} ตัว)`)
  }
  check(cssBodies.length > 0 && cssBad.length === 0,
    'backtick ในเนื้อ CSS escape ครบทุกตัว',
    cssBad.length ? cssBad.join(' · ')
      : cssBodies.length ? cssOk.join(' · ') : 'ไม่พบ `const CSS = `` เลยสักหน้า')
}

// ── 6. ticket ทุกใบ ─────────────────────────────────────────────────────────
const STATUS = ['open', 'claimed', 'resolved', 'waiting']
const TYPES = ['research', 'prototype', 'grilling', 'task']
const MAP_STATUS = ['active', 'draft', 'paused', 'done', 'dropped']
const PENDING = ['open', 'claimed', 'waiting'] // ยังไม่ปิด = ยังนับเป็นของค้าง
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// frontmatter หนึ่งก้อน + ตัวอ่านฟิลด์ (ตัดคอมเมนต์ `# …` และเครื่องหมายคำพูดรอบค่า)
const frontmatter = (raw) => {
  if (!raw.startsWith('---\n')) return null
  const fm = raw.slice(4, raw.indexOf('\n---', 4))
  return {
    text: fm,
    get: (k) => fm.match(new RegExp(`^${k}:[ \t]*(.*)$`, 'm'))?.[1]
      ?.replace(/\s+#.*$/, '').trim().replace(/^"(.*)"$/, '$1'),
  }
}

// wikilink ใน frontmatter ชี้ได้สองแบบ: ชื่อไฟล์ในโฟลเดอร์เดียวกัน (blockers ของใบ)
// หรือ path จากราก vault (blocked_by / superseded_by ของ map ที่ข้าม effort ได้)
const linkTargets = (fm) =>
  [...fm.text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].split('|')[0].trim())
const linkExists = async (target, dir) =>
  (await exists(join(dir, `${target}.md`))) || (await exists(join(VAULT, `${target}.md`)))

// เฉพาะ wikilink ที่อยู่ใต้ `blockers:` — ต่างจาก linkTargets ที่กวาดทั้ง frontmatter
// (รับทั้งแบบ list หลายบรรทัด และแบบ inline `blockers: ["[[…]]"]`)
const blockerTargets = (fm) => {
  const lines = fm.text.split('\n')
  const i = lines.findIndex((l) => /^blockers:/.test(l))
  if (i < 0) return []
  const raw = [lines[i]]
  for (let j = i + 1; j < lines.length && /^\s+-\s/.test(lines[j]); j++) raw.push(lines[j])
  return raw.flatMap((l) => [...l.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].split('|')[0].trim()))
}

const findIssueDirs = async (dir, acc = []) => {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_')) continue
    const p = join(dir, e.name)
    if (e.name === 'issues') acc.push(p)
    else await findIssueDirs(p, acc)
  }
  return acc
}

// เก็บสถานะใบต่อ effort ไว้ให้ข้อ 7 เอาไปเทียบกับสถานะของ map
const byEffort = new Map()

{
  const dirs = await findIssueDirs(VAULT)
  const tickets = []
  for (const d of dirs) {
    for (const f of (await readdir(d)).filter((x) => x.endsWith('.md'))) {
      const raw = await readFile(join(d, f), 'utf8')
      tickets.push({ dir: d, name: basename(f, '.md'), raw })
    }
  }
  warn(tickets.length > 0, 'มี ticket ใน vault',
    tickets.length ? `${tickets.length} ใบ` : 'ยังไม่มี — ปกติสำหรับ vault ที่เพิ่ง init')

  const bad = []
  const noSince = []
  const danglingLinks = []
  const byName = new Map()    // ชื่อไฟล์ใบ -> [effort ที่มีชื่อนี้]
  const nnSeen = new Map()    // effort -> Map(NN -> [ชื่อใบ])
  const blockerRefs = []      // { from, target } — เฉพาะที่เขียนใต้ `blockers:`
  for (const t of tickets) {
    const fm = frontmatter(t.raw)
    if (!fm) { bad.push(`${t.name}: ไม่มี frontmatter`); continue }
    const status = fm.get('status')
    const type = fm.get('type')
    const since = fm.get('status_since')
    if (!STATUS.includes(status)) bad.push(`${t.name}: status="${status}" ไม่ถูกต้อง`)
    if (!TYPES.includes(type)) bad.push(`${t.name}: type="${type}" ไม่ถูกต้อง`)
    if (!fm.get('effort')) bad.push(`${t.name}: ไม่มี effort`)
    // waiting = รอเหตุการณ์นอกมือเรา ⇒ ต้องบอกว่ารออะไร ไม่งั้นมันเน่าเงียบ
    if (status === 'waiting' && !fm.get('status_note')) bad.push(`${t.name}: waiting แต่ไม่มี status_note`)
    if (!ISO_DATE.test(since ?? '')) noSince.push(`${t.name}${since ? `="${since}"` : ''}`)

    for (const target of linkTargets(fm)) {
      if (!(await linkExists(target, t.dir))) danglingLinks.push(`${t.name} -> [[${target}]]`)
    }

    const effort = dirname(t.dir) // …/<repo>/<effort>/issues -> …/<repo>/<effort>
    if (!byEffort.has(effort)) byEffort.set(effort, [])
    byEffort.get(effort).push({ name: t.name, status, since })

    // `21a` เป็นคนละใบกับ `21` โดยตั้งใจ (vault ใช้ตัวอักษรท้ายเลขแยกใบที่แตกออกมา)
    // ⇒ NN ต้องรับตัวอักษรด้วย ไม่งั้นสองใบนั้นจะถูกฟ้องว่าซ้ำทั้งที่ไม่ซ้ำ
    const nn = t.name.match(/^(\d+[a-z]?)-/)?.[1]
    if (nn) {
      if (!nnSeen.has(effort)) nnSeen.set(effort, new Map())
      const seen = nnSeen.get(effort)
      seen.set(nn, [...(seen.get(nn) ?? []), t.name])
    }
    if (!byName.has(t.name)) byName.set(t.name, [])
    byName.get(t.name).push(effort)
    for (const target of blockerTargets(fm)) blockerRefs.push({ from: t.name, target })
  }
  check(bad.length === 0, 'ทุก ticket มี frontmatter ที่ถูกต้อง', bad.join(' · '))
  check(noSince.length === 0, 'ทุก ticket มี status_since เป็นวันที่',
    noSince.length ? `${noSince.length} ใบ: ${noSince.slice(0, 5).join(' · ')}` : '')
  check(danglingLinks.length === 0, 'blocker ทุกอันชี้ไปยังไฟล์ที่มีจริง', danglingLinks.join(' · '))

  const rel = (p) => p.slice(VAULT.length + 1)

  // ── NN ซ้ำใน effort เดียว ─────────────────────────────────────────────────
  // โหนดในกราฟบนหน้า Wayfinder Effort Tickets โชว์ **แค่ `NN`** และ chip ของ /wayfinder-next ก็ตั้งชื่อ
  // ด้วย `NN` (`#12-G09-…`) ⇒ `NN` คือตัวตนของใบ · ซ้ำเมื่อไหร่อ่านผิดได้ทั้งสองที่
  //
  // เตือน ไม่ใช่พัง: คู่เดียวที่มีวันนี้แช่อยู่ใน map ที่ปิดไปแล้ว การเปลี่ยนชื่อจะพาลทำ wikilink
  // ในเนื้อความพังหลายสิบจุดโดยไม่ได้อะไรกลับมา — และ doctor ที่แดงค้างถาวรสอนให้คนเลิกอ่าน doctor
  // ซึ่งแย่กว่าตัวข้อบกพร่องเอง · ของใหม่ที่เขียนหลังจากนี้จะเห็น ⚠️ ตั้งแต่ใบแรกที่ซ้ำ
  const dupNN = []
  for (const [effort, seen] of nnSeen)
    for (const [nn, names] of seen)
      if (names.length > 1) dupNN.push(`${rel(effort)} NN=${nn}: ${names.join(' + ')}`)
  warn(dupNN.length === 0, 'ไม่มีเลขใบ NN ซ้ำกันใน effort เดียว', dupNN.join(' · '))

  // ── ชื่อไฟล์ใบซ้ำ "ข้าม effort" ───────────────────────────────────────────
  // `blockers: [[ชื่อใบ]]` ถูกย่อเหลือ **ชื่อไฟล์** ทั้งใน Dataview และบนหน้า Wayfinder Effort Tickets
  // ⇒ ชื่อกำกวมเมื่อไหร่ blocker resolve ผิดตัวได้โดยไม่มีอะไรฟ้อง (ใบโชว์ว่าปลดแล้วทั้งที่ตัวจริง
  // ยังเปิดอยู่ — โกหกไปทางที่อันตรายที่สุด)
  //
  // แยกสองระดับตามชนวน: ชื่อกำกวมที่ **มี blocker ชี้อยู่จริง** = ระเบิดติดชนวนแล้ว ⇒ ❌
  // ส่วนชื่อซ้ำที่ยังไม่มีใครอ้าง = ยังไม่ติดชนวน ⇒ ⚠️ ไว้ก่อน (คู่เดียวที่มีวันนี้อยู่ในกลุ่มหลัง)
  const dupNames = [...byName].filter(([, efforts]) => efforts.length > 1)
  const armed = blockerRefs.filter((r) => (byName.get(r.target)?.length ?? 0) > 1)
  check(armed.length === 0, 'ไม่มี blocker ที่ชี้ไปยังชื่อใบซึ่งซ้ำข้าม effort',
    armed.map((r) => `${r.from} -> [[${r.target}]]`).join(' · '))
  warn(dupNames.length === 0, 'ไม่มีชื่อไฟล์ใบซ้ำกันข้าม effort',
    dupNames.map(([n, efforts]) => `${n}: ${efforts.map(rel).join(' + ')}`).join(' · '))
}

// ── 7. map ทุกใบ ────────────────────────────────────────────────────────────
// สถานะของ map เป็นของ load-bearing (กรอง Frontier ระดับใบ) ⇒ ต้องลินต์เท่าใบ
{
  const maps = []
  for (const repo of await readdir(VAULT, { withFileTypes: true })) {
    if (!repo.isDirectory() || repo.name.startsWith('.') || repo.name.startsWith('_')) continue
    for (const eff of await readdir(join(VAULT, repo.name), { withFileTypes: true })) {
      if (!eff.isDirectory()) continue
      const dir = join(VAULT, repo.name, eff.name)
      const raw = await readFile(join(dir, 'map.md'), 'utf8').catch(() => null)
      if (raw !== null) maps.push({ dir, name: `${repo.name}/${eff.name}`, raw })
    }
  }
  warn(maps.length > 0, 'มี map ใน vault', maps.length ? `${maps.length} effort` : 'ยังไม่มี')

  const bad = []
  const lying = []
  const stranded = []
  const dangling = []
  for (const m of maps) {
    const fm = frontmatter(m.raw)
    if (!fm) { bad.push(`${m.name}: ไม่มี frontmatter`); continue }
    const status = fm.get('status')
    const since = fm.get('status_since')
    if (!MAP_STATUS.includes(status)) bad.push(`${m.name}: status="${status}" ไม่ถูกต้อง`)
    if (!ISO_DATE.test(since ?? '')) bad.push(`${m.name}: status_since="${since}" ไม่ใช่วันที่`)
    // map ที่ไม่เดินต้องบอกเสมอว่า "อะไรจะทำให้กลับมา" (draft = ยังขาดอะไร, dropped = ทำไมทิ้ง)
    // active/done ไม่ต้อง — สองอันนั้น status_since ก็เล่าครบแล้ว
    if (['draft', 'paused', 'dropped'].includes(status) && !fm.get('status_note'))
      bad.push(`${m.name}: ${status} แต่ไม่มี status_note`)

    for (const target of linkTargets(fm)) {
      if (!(await linkExists(target, m.dir))) dangling.push(`${m.name} -> [[${target}]]`)
    }

    const tickets = byEffort.get(m.dir) ?? []
    // สถานะโกหก: ประกาศว่าไม่เดินแล้ว แต่มีใบขยับหลังวันที่ประกาศ
    if (['paused', 'dropped', 'done'].includes(status) && ISO_DATE.test(since ?? '')) {
      const moved = tickets.filter((t) => t.since && t.since > since)
      if (moved.length) lying.push(`${m.name} (${status} ตั้งแต่ ${since}) มี ${moved.length} ใบขยับหลังจากนั้น`)
    }
    // ใบค้างใน map ที่ประกาศว่าถึง Destination แล้ว — ต้องเลือกข้าง ไม่ใช่ปล่อยค้าง
    if (status === 'done') {
      const open = tickets.filter((t) => PENDING.includes(t.status))
      if (open.length) stranded.push(`${m.name}: ${open.map((t) => t.name).join(', ')}`)
    }
  }
  check(bad.length === 0, 'ทุก map มี status + status_since ที่ถูกต้อง', bad.join(' · '))
  check(dangling.length === 0, 'blocked_by/superseded_by ชี้ไปยังไฟล์ที่มีจริง', dangling.join(' · '))
  check(lying.length === 0, 'ไม่มี map ที่สถานะขัดกับความเคลื่อนไหวของใบ', lying.join(' · '))
  check(stranded.length === 0, 'ไม่มีใบค้างใน map ที่ปิดแล้ว', stranded.join(' · '))
}

// ── 8. hook ─────────────────────────────────────────────────────────────────
{
  const script = join(MAIN_VAULT, '_tools/autocommit.sh')
  const st = await stat(script).catch(() => null)
  check(st !== null && (st.mode & 0o111) !== 0, 'autocommit.sh มีสิทธิ์ execute')

  const settings = await readJson(join(homedir(), '.claude/settings.json')).catch(() => ({}))
  // ต้องชี้มาที่ vault *นี้* — ไม่ใช่แค่มีคำว่า autocommit.sh ของ vault อื่น
  const wired = JSON.stringify(settings.hooks?.PostToolUse ?? []).includes(script)
  check(wired, 'hook ต่อไว้ใน ~/.claude/settings.json แล้ว',
    wired ? '' : 'รัน bootstrap.mjs --wire-hook')

  // hook ที่ยิงจริงคือไฟล์ของ **vault หลัก** เสมอ (settings.json ชี้ path นั้นตรง ๆ) ⇒ การแก้ที่ยัง
  // ค้างใน worktree ยังไม่มีผลกับใคร · รุ่นที่ไม่รู้จัก worktree จะ `git add .claude/worktrees/…`
  // ซึ่งถูก ignore ⇒ commit ไม่ลงและล้มเงียบไปกับ `2>/dev/null || true`
  const src = await readFile(script, 'utf8').catch(() => '')
  const wtAware = src.includes('WT_PREFIX')
  check(wtAware, 'autocommit.sh ตัวจริงรองรับ worktree',
    wtAware ? '' : 'ยังเป็นรุ่นที่ commit ได้แค่ vault หลัก — merge _tools/autocommit.sh เข้า main')
}

// ── 9. Obsidian รู้จัก vault นี้ ─────────────────────────────────────────────
{
  const p = join(homedir(), 'Library/Application Support/obsidian/obsidian.json')
  const o = await readJson(p).catch(() => ({ vaults: {} }))
  const known = Object.values(o.vaults ?? {}).some((v) => v.path === MAIN_VAULT)
  check(known, 'Obsidian ลงทะเบียน vault นี้ไว้แล้ว')
}

// ── รายงาน ──────────────────────────────────────────────────────────────────
const pad = Math.max(...results.map((r) => [...r.label].length))
for (const r of results) {
  const icon = r.ok ? '✅' : r.soft ? '⚠️ ' : '❌'
  console.log(`${icon}  ${r.label.padEnd(pad)}  ${r.detail}`.trimEnd())
}

const failed = results.filter((r) => !r.ok && !r.soft)
const warned = results.filter((r) => !r.ok && r.soft)
const hard = results.filter((r) => !r.soft)
console.log(`\n${hard.length - failed.length}/${hard.length} ผ่าน` +
  (warned.length ? ` · ${warned.length} เตือน (ไม่นับว่าพัง)` : ''))

console.log(`
ตรวจด้วยเครื่องไม่ได้ — ต้องเปิด Obsidian ดูเอง:
  • Dashboard แต่ละ view เรนเดอร์เป็นตาราง ไม่ใช่กล่องแดง "Dataview: <error>"
    (ว่างเปล่าแล้วขึ้น "No results to show" = ปกติ ไม่ใช่พัง)
  • Graph View ระบายสี node ตาม status จริง`)

process.exit(failed.length ? 1 : 0)
