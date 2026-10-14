// The *Wayfinder Effort Tickets* page. Its note holds only a stub block that calls
//   dv.view("_tools/views/effort-tickets")
// so a sandboxed command can't edit what this page runs: `_tools/` is denied to the sandbox, notes
// aren't (spec docs/specs/ticket-store.md, *Sandbox grant (Q2)*). Like every view, this file must never
// hold the a-word Dataview searches for (see the head of wf-core.js): it returns the loader's promise.

// ── 0. สัญญากับหน้าอื่น — ห้ามแก้ข้างเดียว ──────────────────────────────────
// คีย์นี้ถูก **เขียน** โดย `_tools/views/efforts.js` (ตอนคลิกตัวเลข 44/47) และ **อ่าน** ที่นี่
// ค่าที่เก็บคือสตริง "<repo>/<effort>" เช่น "my-repo/some-effort"
// ถ้าสองหน้าใช้คีย์คนละตัว อาการคือ "เปิดหน้ามาแล้วไม่เลือกอะไร" — ดูเหมือนโหลดช้า ไม่เหมือนของพัง
// ⇒ ไม่มีใครรู้ว่ามันเสีย · `_tools/doctor.mjs` จึงดึงสตริงนี้จากทั้งสองไฟล์แล้วเทียบ
//    regex ที่ doctor ใช้จับ **ชื่อตัวแปร** ⇒ ทั้งสองไฟล์ต้องประกาศเป็น `const LS_KEY = "..."` เหมือนกัน
const LS_KEY = "wayfinder-effort-tickets:selected"
// localStorage ของ Obsidian เป็นของ **ทั้งแอป ไม่ใช่ของ vault** — ต่อชื่อ vault ท้ายคีย์ ให้แต่ละ vault
// มีช่องของตัวเอง · ทั้งสองไฟล์ต้องคิดคีย์แบบเดียวกัน และ **ห้ามส่ง `LS_KEY` ดิบ ๆ เข้า localStorage**
const lsKey = () => `${LS_KEY}:${app.vault.getName()}`

// event ที่ `Wayfinder Efforts` ยิงต่อจากการเขียนคีย์ — ทำให้หน้านี้ที่เปิดค้างอยู่ใน pane อื่น
// สลับ effort ตามทันที แทนที่จะต้องรอ dataview วาดบล็อกใหม่ (หรือปิดเปิดหน้า)
const SELECT_EVENT = "wayfinder-effort-select"

// หน้านี้ **ไม่มีกฎของตัวเอง** — กลุ่มใบ · "ปลดกี่ใบ" · เส้นกราฟ · blocker ที่ยังค้าง · ค่าจาก Config
// มาจาก core (`_tools/lib/core.mjs`) ผ่าน loader กลาง ⇒ ตรงกับ Dashboard · Efforts · `wf` เสมอ
// ที่อยู่ในไฟล์นี้มีแค่ **การวาด**: HTML · CSS · layout ของกราฟ · ช่องค้น · การเลือก effort

// หน่วยวัดของกราฟ (§9a) — ล็อกจากใบ 01 ที่วัดมาแล้วว่าทั้ง 32 effort ไม่มีอันไหนล้น 700px
// (ลึกสุด 12 ชั้น = 670px) · ถ้าวันหนึ่งต้องบีบอีก **ให้ลด `GX` ก่อน ห้ามแตะ `NW`** (สเปกข้อ 8)
// อยู่บนสุดเพราะ CSS ต้องใช้ค่าเดียวกัน — ชิปในแถบ "ไม่ผูกกับใบไหน" ต้องเท่าโหนดเป๊ะ
// `GY` 18px ให้ป้าย blocker ชิดโหนดของตัวเอง · `LBL` คือที่ว่างเหนือ**แถวบนสุด** ซึ่งไม่มี `GY` อยู่ข้างบน
const NW = 40, NH = 26, GX = 16, GY = 18, PAD = 7, LBL = 6
const TINT = "33" // alpha 20% ทับพื้นโน้ตที่โปร่งใส แทนการ hardcode สีพื้น ⇒ รอดทั้งธีมสว่างและมืด

const CSS = `
.wft { font-size: var(--font-ui-medium); }
.wft-input { width: 100%; font-size: var(--font-ui-medium); }
.wft-list { max-height: 320px; overflow-y: auto; margin-top: 6px;
  border: 1px solid var(--background-modifier-border); border-radius: 6px; }
.wft-opt { display: grid; gap: 10px; align-items: center; cursor: pointer; padding: 5px 10px;
  grid-template-columns: minmax(0, 1fr) 56px 108px;
  border-bottom: 1px solid var(--background-modifier-border); }
.wft-opt:last-child { border-bottom: 0; }
.wft-opt:hover, .wft-opt.is-sel { background: var(--background-modifier-hover); }
.wft-nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.25; }
.wft-nm small { display: block; color: var(--text-faint); font-size: .85em; }
.wft-num, .wft-when { font-family: var(--font-monospace); font-size: .9em; color: var(--text-muted); }
.wft-badge { font-size: .8em; padding: 1px 6px; border-radius: 4px; white-space: nowrap;
  text-align: center; background: var(--background-secondary); color: var(--text-muted); }
.wft-badge.is-blank { background: none; }
.wft-badge.is-dropped, .wft-badge.is-nomap { color: var(--text-error); }
.wft-badge.is-paused { color: #FFB300; }
.wft-badge.is-draft { color: var(--text-faint); }
.wft-badge.is-done { color: #4CAF50; }
.wft-empty { color: var(--text-faint); padding: 8px 10px; }
.wft-warn { color: var(--text-error); font-size: .9em; padding: 6px 0; }
.wft-head { margin: 1.2em 0 .4em; padding: 8px 0 8px 12px;
  border-left: 3px solid var(--background-modifier-border); }
.wft-head.is-paused { border-left-color: #FFB300; }
.wft-head.is-dropped, .wft-head.is-nomap { border-left-color: var(--text-error); }
.wft-head.is-done { border-left-color: #4CAF50; }
.wft-head.is-active { border-left-color: var(--text-accent); }
.wft-htop { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.wft-htop .wft-nm { font-size: 1.15em; font-weight: 600; }
.wft-htop .wft-nm small { display: inline; font-weight: normal; margin-left: 8px; font-size: .72em; }
.wft-hbar { display: grid; gap: 10px; align-items: center; margin-top: 8px;
  grid-template-columns: 140px 56px minmax(0, 1fr); }
.wft-hmeta { margin-top: 6px; font-size: .9em; color: var(--text-faint); }
.wft-hmeta b { color: var(--text-muted); font-weight: normal; }
.wft-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden;
  background: var(--background-modifier-border); }
.wft-bar i { display: block; height: 100%; }
.wft-chip { font-family: var(--font-monospace); font-size: .84em; padding: 1px 4px;
  border-radius: 4px; margin-right: 3px; white-space: nowrap; background: var(--background-secondary); }
.wft-fro { color: var(--text-accent); }
.wft-blk { color: var(--text-error); }
.wft-hld { color: #FFB300; }
.wft-wai { color: #AB47BC; }
.wft-rdy { color: var(--text-faint); }
.wft-non { color: var(--text-faint); background: none; padding-left: 0; }

/* ── 5 กลุ่มใบ (ใบ 03) — สีทั้งหมดมาจากตัวแปรธีม ยกเว้นสีสถานะสี่สีที่ตกลงกันไว้ ── */
.wft-grp { margin-top: 1.1em; }
.wft-gh { display: flex; align-items: baseline; gap: 8px; }
.wft-gh small { color: var(--text-faint); font-weight: normal; }
details.wft-grp > summary { cursor: pointer; list-style: none; }
details.wft-grp > summary::-webkit-details-marker { display: none; }
details.wft-grp > summary::before { content: "▸"; color: var(--text-faint); }
details.wft-grp[open] > summary::before { content: "▾"; }
.wft-tbl { margin-top: 5px; border: 1px solid var(--background-modifier-border); border-radius: 6px; }
.wft-row { display: grid; gap: 10px; align-items: baseline; padding: 4px 10px;
  border-bottom: 1px solid var(--background-modifier-border); }
.wft-row:last-child { border-bottom: 0; }
.wft-row.is-th { font-size: .82em; color: var(--text-faint);
  background: var(--background-secondary); border-radius: 5px 5px 0 0; }
.wft-tbl.is-fro .wft-row, .wft-tbl.is-rdy .wft-row { grid-template-columns: minmax(0, 1fr) 22px 72px; }
.wft-tbl.is-blk .wft-row { grid-template-columns: minmax(0, 1fr) 22px minmax(0, 1.1fr); }
.wft-tbl.is-wai .wft-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr) 96px; }
.wft-tbl.is-hld .wft-row, .wft-tbl.is-res .wft-row, .wft-tbl.is-unk .wft-row {
  grid-template-columns: minmax(0, 1fr) 22px 96px; }
.wft-tbl.is-fro .wft-row > span:last-child, .wft-tbl.is-rdy .wft-row > span:last-child { text-align: right; }
.wft-tk { display: inline-block; max-width: 100%; vertical-align: bottom;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wft-tk b { font-family: var(--font-monospace); font-weight: 600; }
.wft-ty { font-family: var(--font-monospace); font-size: .78em; padding: 0 4px; border-radius: 3px;
  background: var(--background-secondary); color: var(--text-muted); }
.wft-bk { display: inline-block; max-width: 100%; vertical-align: bottom; font-size: .9em;
  margin-right: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wft-bk.is-dead { color: var(--text-error); }
.wft-bk small { color: var(--text-faint); }
.wft-note { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; font-size: .9em; color: var(--text-muted); }

/* ── กราฟ dependency (ใบ 04) — ยกจากต้นแบบใบ 01 ──
   ⚠️ หัวลูกศรในต้นแบบใช้คลาส \`.wft-head\` ซึ่ง**ชนกับหัว effort**ในไฟล์นี้ (\`<div class="wft-head">\`)
      ปล่อยไว้จะได้ \`opacity:.5\` ทับทั้งหัว effort ⇒ เปลี่ยนเป็น \`.wft-arw\` ตอนยกเข้ามา
   ขนาดชิปในแถบโดดเดี่ยวผูกกับ NW/NH ตรง ๆ — โหนดกับชิปต้องเป็นของชุดเดียวกันเสมอ */
.wft-svg { display: block; max-width: 100%; height: auto; overflow: visible; margin: 1.1em 0 .2em; }
.wft-edge { fill: none; stroke: var(--text-faint); stroke-width: 1.2; opacity: .5; }
.wft-arw { fill: var(--text-faint); opacity: .5; }
.wft-lbl { fill: var(--text-normal); font-family: var(--font-monospace); font-size: 12px;
  text-anchor: middle; dominant-baseline: middle; pointer-events: none; }
/* ป้าย blocker (ใบ 11) — \`paint-order: stroke\` วาดขอบสีพื้นก่อนตัวอักษร = halo
   จำเป็นเพราะป้ายนั่งอยู่บนเส้นที่ลอดผ่านช่องว่างระหว่าง lane พอดี ไม่มี halo แล้วอ่านไม่ออก
   (บล็อกนี้เป็น template literal — backtick ในคอมเมนต์ต้อง escape ไม่งั้นสตริงขาดกลางทาง) */
/* 9px ไม่ใช่ 7.5 — วัดแล้วป้ายยาวสุด 50.2px จาก 56px ที่มี ⇒ ยังเหลือที่ให้ "+10" (10 อักษร) ในอนาคต
   ที่ 10px จะกลายเป็น 55.8 คือชนเพดานพอดี ไม่เหลือที่เผื่อเลย
   (อย่าใช้ backtick ในคอมเมนต์นี้ — บล็อกนี้เป็น template literal สตริงจะขาดกลางทาง) */
.wft-blk { font-family: var(--font-monospace); font-size: 9px; fill: var(--text-muted);
  pointer-events: none;
  paint-order: stroke; stroke: var(--background-primary); stroke-width: 2.5px;
  stroke-linejoin: round; }
.wft-more { fill: var(--text-faint); }
.wft-svg a { cursor: pointer; }
.wft-svg a:hover rect { stroke-width: 2; }
.wft-isohd { margin: 1.1em 0 .4em; font-size: .84em; text-transform: uppercase;
  letter-spacing: .04em; color: var(--text-faint); }
.wft-isorow { display: flex; flex-wrap: wrap; gap: 8px; }
.wft-iso { display: inline-flex; align-items: center; justify-content: center;
  width: ${NW}px; height: ${NH}px; border-radius: 6px; border: 1px solid;
  font-family: var(--font-monospace); font-size: 12px; color: var(--text-normal);
  text-decoration: none; }
.wft-iso:hover { border-width: 2px; }
`

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
const ago = (d) => (d == null ? "—" : d <= 0 ? "วันนี้" : d === 1 ? "เมื่อวาน" : `${d} วันก่อน`)
// `NN` — กฎเดียวที่โหนดในกราฟกับตัวหนาในตารางใช้ร่วมกัน ⇒ เห็นเลขในรูปแล้วกวาดหาเลขเดียวกันในตาราง
const nnOf = (t) => String(t.nn).padStart(2, "0")

// `status_note` ของจริงยาวถึง ~1,200 ตัวอักษรและเป็นมาร์กดาวน์เต็มรูปแบบ — ใส่ดิบลงช่องตาราง
// จะได้กำแพง `**` กับ `[[…|…]]` ⇒ ลอกสัญลักษณ์ทิ้งให้เหลือข้อความ แล้วหนีบ 2 บรรทัดด้วย CSS
// ตัวเต็มยังอ่านได้ทาง hover ⇒ ไม่ได้ตัดข้อมูลทิ้ง แค่ไม่ให้มันกินทั้งหน้า
const plain = (s) =>
  String(s ?? "")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[>#]+\s*/gm, "")
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim()

// ── 1. แถวของ effort — ตัวเลขทุกตัวจาก core ไม่นับเอง ──────────────────────────
// ต่างจาก `Wayfinder Efforts` ตรงนี้จุดเดียว: หน้านั้นข้าม effort ที่ยังไม่มีใบ · หน้านี้ข้ามไม่ได้ —
// คนพิมพ์ค้นเอง ถ้าค้นแล้วไม่เจอจะแยกไม่ออกว่า "ไม่มี effort นี้" กับ "มีแต่ยังไม่มีใบ"
// ลิงก์ดิบตามที่เขียนไว้ใน frontmatter ไม่มี `[[ ]]` — ใช้ตอนที่ลิงก์ชี้ไปที่ที่ไม่มีอยู่
const linkText = (raw) => String(raw).replace(/^\[\[|\]\]$/g, "")

const effortRows = ({ core, index, today }) => {
  const blockName = (b) => index.tickets.get(b.target)?.name ?? b.target ?? linkText(b.raw)
  return [...index.efforts.values()]
    .map((e) => {
      const n = core.effortSummary(index, e.key, { today }) // ตัวเลข · นาฬิกา · blocked_by — ชุดเดียวกับ Efforts
      return {
        ...n,
        open: n.ready + n.blocked,
        key: e.key,
        repo: e.repo,
        effort: e.effort,
        tickets: e.tickets, // เรียงตาม NN มาจาก core แล้ว
        map: e.map?.path ?? null,
        hasMap: !!e.map,
        status: e.map?.status ?? null,
        note: e.map?.statusNote ?? null,
        supersededBy: e.map?.supersededBy ? core.parseRef(e.map.supersededBy)?.effort ?? linkText(e.map.supersededBy) : null,
        block: n.block && { ...n.block, name: blockName(n.block) },
      }
    })
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0)) // ขยับล่าสุดขึ้นก่อน — เหมือน `Wayfinder Efforts`
}

// ── 2. กราฟ dependency ของ effort ที่เลือก ─────────────────────────────────────
//   เส้น = `core.blockerEdges` (blocker → ใบที่มันปลด ภายใน effort นี้) · ที่นี่มีแค่ **layout**
//   ลูกศร: **blocker → ใบที่มันปลด** · ซ้าย→ขวา = ความคืบหน้า (สวนทาง Graph View โดยตั้งใจ)
//   อยู่**เหนือ**ตารางเพราะโหนดมีแค่เลข `NN` ⇒ ทางอ่านคือ เห็นรูปทรง → เจอเลขที่สนใจ → เลื่อนลงหาชื่อ
//   กราฟ **ไม่มี**กฎว่าเส้นไหน "ยังไม่ปลด" — สถานะอยู่ที่สีโหนดครบแล้ว
const SWEEPS = 4 // barycenter ลง-ขึ้น สลับกัน

function graph(tickets, edges, uid, colorOf) {
  const byRef = new Map(tickets.map((t) => [t.ref, t]))
  const preds = new Map(), succs = new Map()
  for (const ref of byRef.keys()) { preds.set(ref, []); succs.set(ref, []) }
  for (const [b, t] of edges) { succs.get(b).push(t); preds.get(t).push(b) }

  const linked = (n) => preds.get(n).length || succs.get(n).length
  // `tickets` มาเรียงตาม `NN` แล้ว ⇒ `depth` (ตอนเจอวงจร) ลำดับตั้งต้นของแต่ละชั้น และลำดับที่เขียนโหนด
  // ออกมา ล้วนนิ่ง ไม่ขึ้นกับลำดับที่ Dataview คืนโน้ตมา
  const inGraph = [...byRef.keys()].filter(linked)
  const iso = [...byRef.keys()].filter((n) => !linked(n))
  // ไม่มีเส้นสักเส้น = ไม่มีกราฟ ⇒ `svg` ว่าง และส่วนกราฟถูกข้ามทั้งส่วน (รวมแถบโดดเดี่ยวด้วย)
  if (!inGraph.length) return { svg: "", iso }

  // ชั้น = ความลึกของ dependency · depth(x)=0 ถ้าไม่มี blocker ในบ้าน
  // `mark` กันวงจร blocker (🩺 lint ฟ้องอยู่แล้ว) ไม่งั้น recursion วนไม่จบ
  const depth = new Map(), mark = new Set()
  const dep = (n) => {
    if (depth.has(n)) return depth.get(n)
    if (mark.has(n)) return 0
    mark.add(n)
    const p = preds.get(n)
    const d = p.length ? 1 + Math.max(...p.map(dep)) : 0
    mark.delete(n)
    depth.set(n, d)
    return d
  }
  inGraph.forEach(dep)

  const cols = Math.max(...inGraph.map((n) => depth.get(n))) + 1
  const layers = Array.from({ length: cols }, () => [])
  for (const n of inGraph) layers[depth.get(n)].push(n)

  // ลดเส้นตัดด้วย barycenter sweep ลง-ขึ้น · วัดด้วย y จริงไม่ใช่ index เพราะแต่ละชั้นจัดกึ่งกลาง
  const lanes = Math.max(...layers.map((L) => L.length))
  const y = new Map()
  const place = () => {
    for (const L of layers) {
      const off = ((lanes - L.length) * (NH + GY)) / 2
      L.forEach((n, i) => y.set(n, off + i * (NH + GY)))
    }
  }
  place()

  // นับเส้นตัดจริงบนจอ (เรขาคณิต) — เป็นทั้งตัวตัดสินของ transpose และตัวเลือกรอบที่ดีที่สุด
  const side2 = (a, b, c) => Math.sign((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]))
  const hits = (p1, p2, p3, p4) =>
    side2(p1,p2,p3) * side2(p1,p2,p4) < 0 && side2(p3,p4,p1) * side2(p3,p4,p2) < 0
  const count = () => {
    const seg = edges.map(([a, b]) => [
      [depth.get(a) * (NW + GX) + NW, y.get(a)],
      [depth.get(b) * (NW + GX), y.get(b)],
    ])
    let c = 0
    for (let i = 0; i < seg.length; i++)
      for (let j = i + 1; j < seg.length; j++)
        if (hits(seg[i][0], seg[i][1], seg[j][0], seg[j][1])) c++
    return c
  }

  const bary = (n, side) => {
    const nb = side.get(n)
    return nb.length ? nb.reduce((s, x) => s + y.get(x), 0) / nb.length : y.get(n)
  }
  const snap = () => layers.map((L) => L.slice())
  // barycenter ไม่การันตีว่ารอบใหม่ดีกว่ารอบเก่า ⇒ เก็บรอบที่ดีที่สุดไว้ แล้วคืนค่านั้นตอนจบ
  let best = snap(), bestC = count()
  for (let r = 0; r < SWEEPS; r++) {
    const down = r % 2 === 0
    const side = down ? preds : succs
    const order = layers.map((_, i) => i)
    for (const i of down ? order : order.reverse()) {
      if (layers[i].every((n) => !side.get(n).length)) continue // ชั้นปลาย ไม่มีอะไรให้อ้าง
      const b = new Map(layers[i].map((n) => [n, bary(n, side)])) // วัดให้ครบก่อนค่อยเรียง
      layers[i].sort((p, q) => b.get(p) - b.get(q)) // sort นิ่ง ⇒ เสมอกันคงลำดับเดิม
    }
    place()

    // transpose — สลับคู่ที่ติดกันเมื่อเส้นตัดลดลง วนจนไม่มีอะไรดีขึ้น
    for (let moved = true; moved; ) {
      moved = false
      for (const L of layers)
        for (let i = 0; i + 1 < L.length; i++) {
          const before = count()
          ;[L[i], L[i + 1]] = [L[i + 1], L[i]]
          place()
          if (count() < before) moved = true
          else { [L[i], L[i + 1]] = [L[i + 1], L[i]]; place() }
        }
    }
    const c = count()
    if (c < bestC) { bestC = c; best = snap() }
  }
  best.forEach((L, i) => (layers[i] = L))
  place()

  // วาด · `TOP` = ขอบบนของโหนดแถวแรก — เผื่อ `LBL` ไว้ให้ป้าย blocker ของแถวนั้นไม่โดนตัด
  const X = (n) => PAD + depth.get(n) * (NW + GX)
  const TOP = PAD + LBL
  const w = PAD * 2 + cols * NW + (cols - 1) * GX
  const h = PAD + TOP + lanes * NH + (lanes - 1) * GY

  const edge = ([a, b]) => {
    const x1 = X(a) + NW, y1 = TOP + y.get(a) + NH / 2
    const x2 = X(b) - 3, y2 = TOP + y.get(b) + NH / 2
    const c = Math.max(9, (x2 - x1) * 0.45) // เส้นข้ามหลายชั้นโค้งมากขึ้นเอง จะได้ไม่ทับโหนดกลางทาง
    return `<path class="wft-edge" d="M${x1} ${y1}C${x1 + c} ${y1} ${x2 - c} ${y2} ${x2} ${y2}" marker-end="url(#${uid})"/>`
  }

  // ป้ายบอก **ตัวตน**ของ blocker ไม่ใช่จำนวน — "ใบนี้ติด 07 กับ 12" กวาดตาทีเดียวจบ ไม่ต้องไล่เส้น
  // ที่ว่างจริงคือ `NW + GX` = 56px ⇒ โชว์ครบ 3 ถ้าพอดี · ถ้าเกินให้โชว์ **2 แล้วต่อ `+N`**
  // ⇒ ป้ายยาวไม่เกิน 9 ตัวอักษรเสมอ ไม่ว่าจะติดกี่ใบ
  const BLK = 3
  const blockerLabel = (n, x, ny) => {
    const ids = preds.get(n).map((ref) => nnOf(byRef.get(ref))).sort((a, b) => a.localeCompare(b))
    if (!ids.length) return ""
    const keep = ids.length <= BLK ? ids : ids.slice(0, BLK - 1)
    return (
      `<text class="wft-blk" x="${x}" y="${ny - 2.5}">◂${esc(keep.join(" "))}` +
      (keep.length < ids.length ? `<tspan class="wft-more"> +${ids.length - keep.length}</tspan>` : "") +
      `</text>`
    )
  }

  const node = (n) => {
    const t = byRef.get(n)
    const c = colorOf(t)
    const x = X(n), ny = TOP + y.get(n)
    return (
      blockerLabel(n, x, ny) +
      `<a class="internal-link" data-href="${esc(t.path)}" href="${esc(t.path)}">` +
      `<title>${esc(t.name)} · ${esc(t.status ?? "ไม่มี status")}</title>` +
      `<rect x="${x}" y="${ny}" width="${NW}" height="${NH}" rx="6" fill="${c}${TINT}" stroke="${c}"/>` +
      `<text class="wft-lbl" x="${x + NW / 2}" y="${ny + NH / 2 + 0.5}">${esc(nnOf(t))}</text>` +
      `</a>`
    )
  }

  const svg =
    `<svg class="wft-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><marker id="${uid}" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">` +
    `<path class="wft-arw" d="M0 0 6 3 0 6z"/></marker></defs>` +
    edges.map(edge).join("") +
    inGraph.map(node).join("") +
    `</svg>`
  return { svg, iso: iso.map((ref) => byRef.get(ref)) }
}

// แถบ "ไม่ผูกกับใบไหน" — ตัดทิ้งไม่ได้ (กราฟจะโกหกว่า effort มีแค่นี้) ยัดชั้น 0 ก็ไม่ได้
// (ชั้น 0 แปลว่า "ปิดแล้วของอื่นเดิน" ซึ่งไม่จริง) · ใบที่ blocker อยู่คนละ effort ล้วน ๆ ก็มาลงที่นี่
// ⇒ พาดหัวต้องพูดว่า "ใน effort นี้" ไม่งั้นจะขัดกับกลุ่ม 🚧 ที่โชว์ใบเดียวกันว่ามี blocker ค้าง (`↗`)
const isoBand = (iso, colorOf) =>
  !iso.length
    ? ""
    : `<div class="wft-isohd">ไม่ผูกกับใบไหนใน effort นี้ · ${iso.length}</div><div class="wft-isorow">` +
      iso
        .map((t) => {
          const c = colorOf(t)
          return (
            `<a class="internal-link wft-iso" data-href="${esc(t.path)}" href="${esc(t.path)}"` +
            ` title="${esc(t.name)} · ${esc(t.status ?? "ไม่มี status")}" style="background:${c}${TINT};border-color:${c}">` +
            `${esc(nnOf(t))}</a>`
          )
        })
        .join("") +
      `</div>`

// ── 3. กลุ่มใบ — แกนคือ **action** ไม่ใช่ `status` ดิบ (แกนเดียวกับ Dashboard) ─────
//   สถานะของใบ = `core.ticketState` · 🔥 = ใบที่อยู่ใน `core.frontier` (ตัวเดียวกับ `wf frontier`)
//   ⇒ ใบที่พร้อมแต่ map ไม่ `active` ไม่ใช่ frontier — ได้กลุ่ม 💤 ของมันเอง ไม่หายเงียบ ไม่แอบอ้างว่าหยิบได้
//   **คอลัมน์ที่สามไม่เหมือนกันสักกลุ่ม** เพราะแต่ละกลุ่มมีคำถามค้างคาคนละข้อ
const TYPE_LETTER = { research: "R", prototype: "P", grilling: "G", task: "T" }
const GROUPS = [
  { id: "fro", title: "🔥 Frontier", sub: "หยิบได้ตอนนี้", cols: ["ใบ", "", "ปลดกี่ใบ"] },
  { id: "rdy", title: "💤 พร้อม แต่ map ไม่ active", sub: "ไม่อยู่ใน frontier จนกว่า map จะกลับมา active", cols: ["ใบ", "", "ปลดกี่ใบ"] },
  { id: "blk", title: "🚧 Blocked", sub: "ติดใบอื่นที่อยู่ในมือเรา", cols: ["ใบ", "", "รออยู่"] },
  { id: "wai", title: "⏳ รอของนอก", sub: "ทำอะไรไม่ได้เลย", cols: ["ใบ", "รออะไร", "รอตั้งแต่"] },
  { id: "hld", title: "🖐 Claimed", sub: "มี session จับอยู่", cols: ["ใบ", "", "จับตั้งแต่"] },
  // ใบที่ `status` อยู่นอก enum ตกจากทุกกลุ่มข้างบน ⇒ กลุ่มนี้ทำให้ทุกกลุ่มบวกกันเท่า `total` เสมอ (ว่าง = ซ่อน)
  { id: "unk", title: "⚠️ สถานะที่ไม่รู้จัก", sub: "ตกจากทุกกลุ่ม", cols: ["ใบ", "", "status"] },
  { id: "res", title: "✅ Resolved", sub: "ปิดแล้ว", cols: ["ใบ", "", "ปิดเมื่อ"] },
]
const GROUP_OF_STATE = { blocked: "blk", waiting: "wai", claimed: "hld", resolved: "res" }

// หัว effort: สามอย่างที่ห้ามหาย — badge สถานะ map · `status_note` · `blocked_by` (สถานะจาก `core.mapBlockState`)
const BLOCK_WORD = {
  cleared: (n) => `blocker ปลดแล้ว — ${n} ⇒ กลับมาทำได้`,
  dead: (n) => `รอ ${n} ที่ไม่มีใครผลักให้เดิน ⇒ โซ่ตัน`,
  dangling: (n) => `blocked_by ชี้ไปที่ ${n} ที่ไม่มีอยู่`,
  waiting: (n) => `รอ ${n}`,
}

// ── 4. หน้า — วาดโครงครั้งเดียว แล้วอัปเดตทีละส่วน ────────────────────────────
//   ห้ามเขียน `dv.container.innerHTML` ทับทุกครั้งที่พิมพ์ ไม่งั้น `<input>` เสีย focus
function page(wf) {
  const { core, index, today } = wf
  const cfg = core.readConfig(wf.config)
  const COLORS = { resolved: cfg.color_resolved, claimed: cfg.color_claimed, open: cfg.color_open, waiting: cfg.color_waiting }
  const MAP_LABEL = { paused: cfg.label_paused, draft: cfg.label_draft, done: cfg.label_done, dropped: cfg.label_dropped }
  const colorOf = (t) => COLORS[t.status] ?? COLORS.open
  const daysSince = (date) => (date ? core.daysBetween(date, today) : null)
  const inFrontier = new Set(core.frontier(index).map((t) => t.ref))
  const rows = effortRows(wf)

  // selection อยู่ใน localStorage ตัวเดียว ที่เหลือเป็นของชั่วคราว
  const readLS = () => { try { return localStorage.getItem(lsKey()) } catch (_) { return null } }
  const writeLS = (k) => { try { localStorage.setItem(lsKey(), k) } catch (_) {} }
  let selected = readLS()
  // effort ที่จำไว้อาจถูกลบ/เปลี่ยนชื่อไปแล้ว — บอกตรง ๆ ดีกว่าเปิดมาเจอหน้าว่างแบบไม่มีเหตุผล
  const missing = selected && !rows.some((r) => r.key === selected) ? selected : null
  if (missing) selected = null
  let query = ""
  let listOpen = !selected // ยังไม่เคยเลือกอะไร → มีแค่รายการให้เลือก

  // ── ชิ้นส่วนที่วาดซ้ำ ──
  const nameOf = (r, asLink) => {
    const inner =
      asLink && r.map
        ? `<a class="internal-link" data-href="${esc(r.map)}" href="${esc(r.map)}">${esc(r.effort)}</a>`
        : esc(r.effort)
    return `<span class="wft-nm">${inner}<small>${esc(r.repo)}</small></span>`
  }
  const badge = (r) => {
    if (!r.hasMap) return `<span class="wft-badge is-nomap">⚠️ ไม่มี map</span>`
    if (r.status === "active") return `<span class="wft-badge is-blank"></span>`
    // status ที่ไม่มีหรือนอก enum ได้ป้ายดิบ ๆ (🩺 lint ฟ้องอยู่) — `hasOwn` กันชื่ออย่าง `constructor` ชนของใน prototype
    const label = Object.prototype.hasOwnProperty.call(MAP_LABEL, r.status) ? MAP_LABEL[r.status] : esc(r.status ?? "(ไม่มี status)")
    return `<span class="wft-badge is-${esc(r.status ?? "none")}">${label}</span>`
  }
  const bar = (r) => {
    const w = (n) => `${(n / r.total) * 100}%`
    return (
      `<span class="wft-bar">` +
      `<i style="width:${w(r.resolved)};background:${COLORS.resolved}"></i>` +
      `<i style="width:${w(r.claimed)};background:${COLORS.claimed}"></i>` +
      `<i style="width:${w(r.open)};background:${COLORS.open}"></i>` +
      `<i style="width:${w(r.waiting)};background:${COLORS.waiting}"></i>` +
      `</span>`
    )
  }
  const chips = (r) =>
    [
      r.frontier ? `<span class="wft-chip wft-fro">🔥${r.frontier}</span>` : "",
      r.ready > r.frontier
        ? `<span class="wft-chip wft-rdy" title="พร้อมหยิบ แต่ map ไม่ active — ไม่อยู่ใน frontier">💤${r.ready - r.frontier}</span>`
        : "",
      r.blocked ? `<span class="wft-chip wft-blk">🚧${r.blocked}</span>` : "",
      r.claimed ? `<span class="wft-chip wft-hld">🖐${r.claimed}</span>` : "",
      r.waiting ? `<span class="wft-chip wft-wai">⏳${r.waiting}</span>` : "",
    ].join("") || `<span class="wft-chip wft-non">ไม่มีใบค้าง</span>`

  dv.container.innerHTML =
    `<style>${CSS}</style><div class="wft">` +
    `<input class="wft-input" type="text" spellcheck="false" ` +
    `placeholder="ค้น effort — พิมพ์ชื่อ repo หรือ effort แล้วกด Enter">` +
    `<div class="wft-list"></div><div class="wft-head"></div><div class="wft-body"></div></div>`
  const $input = dv.container.querySelector(".wft-input")
  const $list = dv.container.querySelector(".wft-list")
  const $head = dv.container.querySelector(".wft-head")
  const $body = dv.container.querySelector(".wft-body")

  // ── รายการ effort ──
  const matches = () => {
    const q = query.trim().toLowerCase()
    // `key` คือ "<repo>/<effort>" ⇒ แมตช์ทีเดียวได้ทั้งสองฝั่ง และพิมพ์คร่อม "/" ก็ยังเจอ
    return q ? rows.filter((r) => r.key.toLowerCase().includes(q)) : rows
  }
  const optRow = (r) =>
    `<div class="wft-opt${r.key === selected ? " is-sel" : ""}" data-key="${esc(r.key)}">` +
    `${nameOf(r, false)}<span class="wft-num">${r.total ? `${r.resolved}/${r.total}` : "—"}</span>` +
    `${badge(r)}</div>`
  const renderList = () => {
    $list.style.display = listOpen ? "" : "none"
    if (!listOpen) return
    const list = matches()
    $list.innerHTML = list.length
      ? list.map(optRow).join("")
      : `<div class="wft-empty">ไม่พบ effort ที่ตรงกับ "${esc(query.trim())}"</div>`
  }

  // ── หัว effort ที่เลือก ── Dashboard กัน map ที่ถูกทิ้งด้วยการ **กรอง** — หน้านี้กรองไม่ได้ ⇒ กันด้วยการ **บอก**
  const renderHead = () => {
    if (missing && !selected) {
      $head.className = "wft-head is-nomap"
      $head.innerHTML = `<div class="wft-warn">effort ที่จำไว้ (<code>${esc(missing)}</code>) ไม่มีอยู่ใน vault แล้ว — เลือกใหม่จากรายการข้างบน</div>`
      return
    }
    const r = rows.find((x) => x.key === selected)
    if (!r) { $head.className = "wft-head"; $head.innerHTML = ""; return }
    const meta = [
      `คืบหน้าล่าสุด <b>${ago(r.status === "paused" ? r.pausedDays : r.days)}</b>`,
      r.block ? esc(BLOCK_WORD[r.block.state](r.block.name)) : "",
      r.note ? esc(r.note) : "",
      r.supersededBy ? `→ ${esc(r.supersededBy)}` : "",
    ].filter(Boolean).join(" · ")
    $head.className = `wft-head is-${r.hasMap ? esc(r.status ?? "none") : "nomap"}`
    $head.innerHTML =
      `<div class="wft-htop">${nameOf(r, true)}${badge(r)}</div>` +
      (r.total
        ? `<div class="wft-hbar">${bar(r)}<span class="wft-num">${r.resolved}/${r.total}</span>` +
          `<span>${chips(r)}</span></div>`
        : "") +
      `<div class="wft-hmeta">${meta}</div>`
  }

  // ── ตัวหน้า — กราฟ แล้วตามด้วยกลุ่มใบ ──
  // `NN` แยกตัวหนาไว้ เพราะโหนดในกราฟมีแค่ `NN` — ใช้ `nnOf()` ตัวเดียวกับที่กราฟใช้ ห้ามมีสองกฎ
  const ticketLink = (t) => {
    const nn = nnOf(t)
    const label = t.name.startsWith(`${nn}-`)
      ? `<b>${esc(nn)}</b> ${esc(t.name.slice(nn.length + 1))}`
      : esc(t.name)
    return `<a class="internal-link wft-tk" data-href="${esc(t.path)}" href="${esc(t.path)}" title="${esc(t.name)}">${label}</a>`
  }
  const typeChip = (t) =>
    t.type
      ? `<span class="wft-ty" title="${esc(t.type)}">${esc(TYPE_LETTER[t.type] ?? String(t.type)[0].toUpperCase())}</span>`
      : ""
  const when = (date) => `<span class="wft-when" title="${esc(date ?? "")}">${esc(ago(daysSince(date)))}</span>`

  // blocker ที่ยังค้าง = `core.openBlockers` · อาจอยู่คนละ effort (`↗`) หรือเป็นลิงก์เสีย (`null` = fail closed)
  const blockerLink = (r) => (ref) => {
    const b = ref == null ? null : index.tickets.get(ref)
    if (!b)
      return `<span class="wft-bk is-dead" title="ลิงก์ใน blockers ชี้ใบที่ไม่มีอยู่ — ใบนี้จะไม่มีวันปลดจนกว่าจะแก้ (ดู 🩺 lint บน Dashboard)">⚠️ ลิงก์เสีย</span>`
    const away = b.effortKey === r.key ? "" : `<small> ↗</small>` // ↗ = blocker ตัวนี้ไม่ได้อยู่ใน effort ที่กำลังดู
    return `<a class="internal-link wft-bk" data-href="${esc(b.path)}" href="${esc(b.path)}" title="${esc(b.path)}">${esc(b.name)}${away}</a>`
  }

  // "ปลดกี่ใบ" = `core.unblocks` · hover บอกว่าปิดใบนี้แล้ว **เดินได้ทันที** กี่ใบ (`core.dependents`)
  const unblocksCell = (x) => {
    const n = core.unblocks(index, x)
    const { waiting, freed } = core.dependents(index, x)
    const tip = waiting.length && freed.length !== waiting.length
      ? ` title="${freed.length} ใบเดินได้ทันที · อีก ${waiting.length - freed.length} ใบยังติด blocker ตัวอื่น"`
      : ""
    return `<span class="wft-num"${tip}>${n || "—"}</span>`
  }

  const CELL = {
    fro: (x) => [typeChip(x), unblocksCell(x)],
    rdy: (x) => [typeChip(x), unblocksCell(x)],
    blk: (x, r) => [typeChip(x), core.openBlockers(index, x).map(blockerLink(r)).join("")],
    wai: (x) => {
      const t = plain(x.statusNote)
      return [
        t ? `<span class="wft-note" title="${esc(t)}">${esc(t)}</span>` : `<span class="wft-when">—</span>`,
        when(x.statusSince),
      ]
    },
    hld: (x) => [typeChip(x), when(x.statusSince)],
    unk: (x) => [typeChip(x), `<span class="wft-when">${esc(x.status ?? "(ไม่มี status)")}</span>`],
    res: (x) => [typeChip(x), when(x.statusSince)],
  }
  const groupOf = (t) => {
    const state = core.ticketState(index, t)
    if (state === "ready") return inFrontier.has(t.ref) ? "fro" : "rdy"
    return GROUP_OF_STATE[state] ?? "unk"
  }

  const renderBody = () => {
    const r = rows.find((x) => x.key === selected)
    if (!r) { $body.innerHTML = ""; return }
    if (!r.total) {
      // effort ที่ยังไม่มีใบสักใบ — ต้องเป็นข้อความ ไม่ใช่กราฟเปล่า/ตารางเปล่า
      $body.innerHTML = `<div class="wft-empty">effort นี้ยังไม่มีใบ — ชาร์ตแล้วแต่ยังไม่มี ticket ใน <code>issues/</code></div>`
      return
    }
    // ทุกกลุ่มเรียงตาม `NN` (ลำดับที่ core ให้มา) — จงใจต่างจาก Dashboard ที่เรียง ⏳/🖐 ตามวันที่
    // เพราะสิ่งที่ได้กลับมาคือการจับคู่กับกราฟ ซึ่งมีแต่เลข
    const g = Object.fromEntries(GROUPS.map((gr) => [gr.id, []]))
    for (const t of r.tickets) g[groupOf(t)].push(t)

    // ✅ พับไว้เพราะยาวได้หลายสิบแถว · **ยกเว้นไม่มีใบค้างเลย ให้กางเอง** ไม่งั้นเปิดมาเจอหน้าว่างเปล่า
    const head = (gr, n, tag) =>
      `<${tag} class="wft-gh"><b>${gr.title}</b><small>${gr.sub}</small>` +
      `<span class="wft-num">${n}</span></${tag}>`

    // ลำดับบนหน้า: ค้น → หัว effort → **กราฟ + แถบ "ไม่ผูกกับใบไหน"** → กลุ่มใบ
    // `uid` ผูกกับ effort เพราะ `<marker id>` เป็น id ระดับเอกสาร — หน้านี้เปิดสองบานพร้อมกันได้
    // ไม่มีเส้นสักเส้น ⇒ **ข้ามทั้งส่วนกราฟ รวมแถบโดดเดี่ยวด้วย** — กฎนี้อยู่ใน ternary เดียวกับ `svg` ที่นี่ที่เดียว
    const gph = graph(r.tickets, core.blockerEdges(index, r.key), `wft-mk-${r.key.replace(/[^a-z0-9]+/gi, "-")}`, colorOf)
    const parts = gph.svg ? [gph.svg, isoBand(gph.iso, colorOf)] : []
    for (const gr of GROUPS) {
      const items = g[gr.id]
      if (!items.length) continue // กลุ่มว่าง = ซ่อนหัวข้อไปเลย ไม่ต้องโชว์ "0"
      const table =
        `<div class="wft-tbl is-${gr.id}">` +
        `<div class="wft-row is-th">${gr.cols.map((c) => `<span>${esc(c)}</span>`).join("")}</div>` +
        items
          .map((x) => `<div class="wft-row">${ticketLink(x)}` + CELL[gr.id](x, r).map((c) => `<span>${c}</span>`).join("") + `</div>`)
          .join("") +
        `</div>`
      parts.push(
        gr.id === "res"
          ? `<details class="wft-grp"${r.pending ? "" : " open"}>${head(gr, items.length, "summary")}${table}</details>`
          : `<section class="wft-grp">${head(gr, items.length, "div")}${table}</section>`
      )
    }
    $body.innerHTML = parts.join("")
  }

  const renderAll = () => { renderList(); renderHead(); renderBody() }

  // ── การโต้ตอบ ──
  const select = (key) => {
    selected = key
    writeLS(key)
    query = ""
    $input.value = ""
    listOpen = false
    renderAll()
  }

  $input.addEventListener("input", () => { query = $input.value; listOpen = true; renderList() })
  $input.addEventListener("focus", () => { listOpen = true; renderList() })
  $input.addEventListener("blur", () => { if (selected) { listOpen = false; renderList() } })
  $input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault()
      const top = matches()[0] // "ตัวบนสุดของรายการที่กรองแล้ว" = ตัวที่ขยับล่าสุด
      if (top) select(top.key)
    } else if (ev.key === "Escape" && selected) {
      ev.preventDefault()
      query = ""
      $input.value = ""
      listOpen = false
      renderList()
    }
  })
  // ใช้ mousedown (ไม่ใช่ click) + preventDefault: blur ของ input จะได้ไม่มาแข่งกับการเลือก
  $list.addEventListener("mousedown", (ev) => {
    const opt = ev.target.closest("[data-key]")
    if (!opt) return
    ev.preventDefault()
    select(opt.dataset.key)
  })

  // โหนดในกราฟเป็น `<a class="internal-link">` ที่อยู่ **ใน SVG** — ไม่มีหลักฐานว่า Obsidian delegate ให้
  // ⇒ จัดการเอง **เฉพาะในกรอบ `.wft-svg`** แล้ว `stopPropagation` · ลิงก์ HTML ที่เหลือปล่อยให้ Obsidian จัดการ
  dv.container.addEventListener("click", (ev) => {
    const a = ev.target?.closest?.("a.internal-link")
    if (!a || !a.closest(".wft-svg")) return
    ev.preventDefault()
    ev.stopPropagation()
    app.workspace.openLinkText(a.getAttribute("data-href"), "", ev.ctrlKey || ev.metaKey)
  })

  // หน้านี้เปิดค้างอยู่ใน pane อื่น แล้วมีคนคลิก 44/47 บน `Wayfinder Efforts`
  // `registerDomEvent` ปลด listener ให้เองตอนบล็อกถูกทิ้ง ⇒ ไม่มี listener ค้างสะสมทุกครั้งที่ dataview วาดใหม่
  const comp = dv.component ?? dv.currentComponent
  if (comp?.registerDomEvent)
    comp.registerDomEvent(window, SELECT_EVENT, () => {
      const k = readLS()
      if (k && k !== selected && rows.some((r) => r.key === k)) select(k)
    })

  renderAll()
}

return dv.view("_tools/views/wf-core", { render: page })
