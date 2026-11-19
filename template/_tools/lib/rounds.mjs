// Which tickets can be worked side by side (spec *Verbs*: frontier). A ticket's `touches:` lists the
// paths or globs it writes, relative to its repo (`target_repo` when set, else its home repo). Two
// tickets collide when they share a repo and a path of one overlaps a path of the other; a serial map's
// tickets always collide with each other. `wf frontier` deals the frontier into rounds: round 1 is
// what can start now beside the claimed tickets, round 2 what follows, and so on. Pure.

// Types that write only their `## Answer` when `touches:` is missing; any other type takes its repo.
const ANSWER_ONLY_TYPES = new Set(["research", "grilling"])
const WHOLE_REPO = Symbol("whole repo")
const WILD_RE = /[*?[{]/

// Paths compare case-insensitively: the default macOS file system says `SRC/a` and `src/a` are one file.
const segmentsOf = (pattern) =>
  String(pattern)
    .trim()
    .toLowerCase()
    .replace(/^(\.\/)+/, "")
    .split("/")
    .filter((s) => s !== "" && s !== ".")

const isWild = (segments) => segments.some((s) => WILD_RE.test(s))
const literalBase = (segments) => {
  const wild = segments.findIndex((s) => WILD_RE.test(s))
  return wild === -1 ? segments : segments.slice(0, wild)
}
const startsWith = (whole, prefix) => prefix.length <= whole.length && prefix.every((s, i) => whole[i] === s)

const MAX_ALTERNATIVES = 64

// `{a,b}` groups expanded into plain alternatives, nested and across `/` too; null when the braces don't
// balance or expand past MAX_ALTERNATIVES — the caller then compares conservatively.
const expandBraces = (pattern) => {
  const open = pattern.indexOf("{")
  if (open === -1) return pattern.includes("}") ? null : [pattern]
  let depth = 0
  const commas = []
  for (let i = open; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === "{") depth += 1
    else if (c === "}") depth -= 1
    else if (c === "," && depth === 1) commas.push(i)
    if (depth > 0) continue
    const cuts = [open, ...commas, i]
    const head = pattern.slice(0, open)
    const tail = pattern.slice(i + 1)
    const out = []
    for (let k = 0; k + 1 < cuts.length; k++) {
      const expanded = expandBraces(head + pattern.slice(cuts[k] + 1, cuts[k + 1]) + tail)
      if (!expanded) return null
      out.push(...expanded)
      if (out.length > MAX_ALTERNATIVES) return null
    }
    return out
  }
  return null
}

const escapeRe = (text) => text.replace(/[.+^$()|\\{}]/g, "\\$&")

// One glob segment as a regex source: `*` and `?` stay inside the segment, `[…]` is a class.
const segmentRe = (segment) =>
  segment
    .split(/(\[[^\]]*\])/)
    .map((part) => (part.startsWith("[") ? part.replace(/^\[!/, "[^") : escapeRe(part).replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")))
    .join("")

// The segments as an anchored regex, or null when a class doesn't parse (an unterminated `[`).
const globRe = (segments) => {
  const body = segments.map((s, i) => {
    const last = i === segments.length - 1
    if (s === "**") return last ? ".*" : "(?:.*/)?"
    return segmentRe(s) + (last ? "" : "/")
  })
  try {
    return new RegExp(`^${body.join("")}$`)
  } catch {
    return null
  }
}

// Two brace-free entries. A plain path is a file or a directory, so a directory overlaps everything
// under it; a glob may name a directory too. Between two globs this is conservative: they overlap when
// the literal base of one holds the other's.
const overlapOne = (sa, sb) => {
  const [wa, wb] = [isWild(sa), isWild(sb)]
  if (!wa && !wb) return startsWith(sa, sb) || startsWith(sb, sa)
  const [ba, bb] = [literalBase(sa), literalBase(sb)]
  const basesNest = startsWith(ba, bb) || startsWith(bb, ba)
  if (wa && wb) return basesNest
  const [glob, path] = wa ? [sa, sb] : [sb, sa]
  const re = globRe(glob)
  if (!re) return basesNest
  const base = literalBase(glob)
  // The glob names the path or a directory above it; the path is a directory above the glob's base;
  // or a `**` reaches under the path.
  const namesPathOrParent = path.some((_, k) => re.test(path.slice(0, k + 1).join("/")))
  const reachesUnder = glob.includes("**") && startsWith(path, base)
  return namesPathOrParent || startsWith(base, path) || reachesUnder
}

/**
 * Whether two `touches:` entries can name the same file. False only when they surely can't: a pattern
 * this can't read (unbalanced braces, a broken class) overlaps whatever its literal base could hold.
 */
export function globsOverlap(a, b) {
  const [ea, eb] = [expandBraces(String(a)), expandBraces(String(b))]
  if (!ea || !eb) {
    const base = (p) => literalBase(segmentsOf(String(p).replace(/[{}].*$/, "*")))
    const [ba, bb] = [base(a), base(b)]
    return startsWith(ba, bb) || startsWith(bb, ba)
  }
  return ea.some((x) => eb.some((y) => overlapOne(segmentsOf(x), segmentsOf(y))))
}

const footprintOf = (t) => {
  if (t.touches) return t.touches
  return ANSWER_ONLY_TYPES.has(t.type) ? [] : WHOLE_REPO
}

const footprintsOverlap = (fa, fb) => {
  if (fa === WHOLE_REPO) return fb === WHOLE_REPO || fb.length > 0
  if (fb === WHOLE_REPO) return fa.length > 0
  return fa.some((a) => fb.some((b) => globsOverlap(a, b)))
}

const repoOf = (t) => t.targetRepo ?? t.repo

/** Whether tickets `a` and `b` would write the same files (or share a serial map). */
export function collide(a, b, { isSerial = () => false } = {}) {
  if (a.effortKey === b.effortKey && isSerial(a.effortKey)) return true
  if (repoOf(a) !== repoOf(b)) return false
  return footprintsOverlap(footprintOf(a), footprintOf(b))
}

/**
 * Deal `tickets` (in pick order) into rounds, first fit: each goes in the earliest round where it
 * collides with nothing already there. The `inFlight` tickets (claimed now) sit in round 1.
 * Returns ref → `{ round, collidesWith }`, where `collidesWith` lists what holds it back: the claimed
 * tickets and those ahead of it in pick order that it collides with.
 */
export function planRounds(tickets, { inFlight = [], isSerial } = {}) {
  const rounds = [[...inFlight]]
  const plan = new Map()
  tickets.forEach((t, i) => {
    const hits = (x) => collide(t, x, { isSerial })
    let index = rounds.findIndex((members) => !members.some(hits))
    if (index === -1) index = rounds.push([]) - 1
    rounds[index] = [...rounds[index], t]
    const ahead = [...inFlight, ...tickets.slice(0, i)]
    plan.set(t.ref, { round: index + 1, collidesWith: ahead.filter(hits).map((x) => x.ref) })
  })
  return plan
}
