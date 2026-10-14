// A line-based unified diff (`diff -u` shape) for `wf migrate`'s plan (spec *`wf migrate`*: the plan
// prints a unified diff and writes nothing). Zero dependencies: a longest-common-subsequence over the
// lines between the common prefix and suffix, which is small for the notes migrate rewrites. Pure.

export const CONTEXT_LINES = 3

const NO_EOL = "\\ No newline at end of file"

// A text's lines, and whether its last line lacks a terminator.
const splitLines = (text) => {
  const lines = text.split("\n")
  const hasEol = lines[lines.length - 1] === ""
  if (hasEol) lines.pop()
  return { lines, missingEol: !hasEol && lines.length > 0 }
}

// The edit script between `a` and `b` as `[op, line]` pairs: " " kept, "-" removed, "+" added.
const editScript = (a, b) => {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  // lcs[i][j]: the LCS length of midA[i..] and midB[j..].
  const lcs = Array.from({ length: midA.length + 1 }, () => new Uint32Array(midB.length + 1))
  for (let i = midA.length - 1; i >= 0; i--)
    for (let j = midB.length - 1; j >= 0; j--)
      lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const middle = []
  let i = 0
  let j = 0
  // On a tie, removals come before additions, as `diff -u` prints them.
  while (i < midA.length || j < midB.length) {
    if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
      middle.push([" ", midA[i++]])
      j++
    } else if (i < midA.length && (j === midB.length || lcs[i + 1][j] >= lcs[i][j + 1])) middle.push(["-", midA[i++]])
    else middle.push(["+", midB[j++]])
  }
  return [...a.slice(0, start).map((l) => [" ", l]), ...middle, ...a.slice(endA).map((l) => [" ", l])]
}

// Each op with its 1-based line number in `a` and in `b`.
const numbered = (ops) => {
  let aNo = 0
  let bNo = 0
  return ops.map(([op, line]) => {
    if (op !== "+") aNo++
    if (op !== "-") bNo++
    return { op, line, aNo, bNo }
  })
}

// Runs of changed ops, each widened by CONTEXT_LINES on both sides; runs that touch are merged.
const hunkRanges = (ops) => {
  const ranges = []
  ops.forEach(({ op }, i) => {
    if (op === " ") return
    const from = Math.max(0, i - CONTEXT_LINES)
    const to = Math.min(ops.length, i + CONTEXT_LINES + 1)
    const last = ranges[ranges.length - 1]
    if (last && from <= last.to) last.to = to
    else ranges.push({ from, to })
  })
  return ranges
}

// `start,length` of a hunk side; an empty side names the line before it, as `diff -u` does.
const span = (start, length) => `${length === 0 ? start - 1 : start},${length}`

const hunkText = (ops, { from, to }, eol) => {
  const slice = ops.slice(from, to)
  const aLen = slice.filter((o) => o.op !== "+").length
  const bLen = slice.filter((o) => o.op !== "-").length
  const aStart = slice.find((o) => o.op !== "+")?.aNo ?? ops[from].aNo + 1
  const bStart = slice.find((o) => o.op !== "-")?.bNo ?? ops[from].bNo + 1
  const body = slice.flatMap((o) => {
    const isLastA = o.op !== "+" && o.aNo === eol.aLines && eol.aMissing
    const isLastB = o.op !== "-" && o.bNo === eol.bLines && eol.bMissing
    return [`${o.op}${o.line}`, ...(isLastA || isLastB ? [NO_EOL] : [])]
  })
  return [`@@ -${span(aStart, aLen)} +${span(bStart, bLen)} @@`, ...body]
}

/**
 * The unified diff from `before` to `after` for the vault file `path` (`--- a/path`, `+++ b/path`,
 * `@@` hunks with CONTEXT_LINES of context), ending in a newline; "" when the texts are equal.
 */
export function unifiedDiff(path, before, after) {
  if (before === after) return ""
  const a = splitLines(before)
  const b = splitLines(after)
  // A line that only gains or loses its terminator still differs: compare it with a marker.
  const mark = (side) => side.lines.map((l, i) => (side.missingEol && i === side.lines.length - 1 ? `${l}\0` : l))
  const ops = numbered(editScript(mark(a), mark(b))).map((o) => ({ ...o, line: o.line.replace(/\0$/, "") }))
  const eol = { aLines: a.lines.length, aMissing: a.missingEol, bLines: b.lines.length, bMissing: b.missingEol }
  const hunks = hunkRanges(ops).flatMap((range) => hunkText(ops, range, eol))
  return [`--- a/${path}`, `+++ b/${path}`, ...hunks, ""].join("\n")
}
