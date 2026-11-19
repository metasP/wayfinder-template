// Which tickets can be worked side by side (spec *Verbs*: frontier). A ticket's `touches:` lists the
// paths or globs it writes, relative to its repo (`target_repo` when set, else its home repo). Two
// tickets collide when they share a repo and a path of one overlaps a path of the other; a serial map's
// tickets always collide with each other. `wf frontier` deals the frontier into rounds: round 1 is
// what can start now beside the claimed tickets, round 2 what follows, and so on. Pure.

// Types that write only their `## Answer` when `touches:` is missing; any other type takes its repo.
const ANSWER_ONLY_TYPES = new Set(["research", "grilling"])
const WHOLE_REPO = Symbol("whole repo")
const WILD_RE = /[*?[{]/

const segmentsOf = (pattern) =>
  String(pattern)
    .trim()
    .replace(/^(\.\/)+/, "")
    .split("/")
    .filter((s) => s !== "" && s !== ".")

const isWild = (segments) => segments.some((s) => WILD_RE.test(s))
const literalBase = (segments) => segments.slice(0, Math.max(0, segments.findIndex((s) => WILD_RE.test(s))))
const startsWith = (whole, prefix) => prefix.length <= whole.length && prefix.every((s, i) => whole[i] === s)

const escapeRe = (text) => text.replace(/[.+^$()|\\]/g, "\\$&")

// One glob segment as a regex: `*` and `?` stay inside the segment, `{a,b}` is a choice, `[…]` a class.
const segmentRe = (segment) =>
  segment
    .split(/(\{[^}]*\}|\[[^\]]*\])/)
    .map((part) => {
      if (part.startsWith("{")) return `(?:${part.slice(1, -1).split(",").map(segmentRe).join("|")})`
      if (part.startsWith("[")) return part.replace(/^\[!/, "[^")
      return escapeRe(part).replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")
    })
    .join("")

const globRe = (segments) => {
  const body = segments.map((s, i) => {
    const last = i === segments.length - 1
    if (s === "**") return last ? ".*" : "(?:.*/)?"
    return segmentRe(s) + (last ? "" : "/")
  })
  return new RegExp(`^${body.join("")}$`)
}

/**
 * Whether two `touches:` entries can name the same file. A plain path is a file or a directory, so a
 * directory overlaps everything under it. Between two globs this is conservative: they overlap when
 * the literal base of one holds the other's.
 */
export function globsOverlap(a, b) {
  const [sa, sb] = [segmentsOf(a), segmentsOf(b)]
  const [wa, wb] = [isWild(sa), isWild(sb)]
  if (!wa && !wb) return startsWith(sa, sb) || startsWith(sb, sa)
  if (wa && wb) {
    const [ba, bb] = [literalBase(sa), literalBase(sb)]
    return startsWith(ba, bb) || startsWith(bb, ba)
  }
  const [glob, path] = wa ? [sa, sb] : [sb, sa]
  const base = literalBase(glob)
  // The glob names the path; the path is a directory above the glob's base; or a `**` reaches under it.
  const reachesUnder = glob.includes("**") && startsWith(path, base)
  return globRe(glob).test(path.join("/")) || startsWith(base, path) || reachesUnder
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
