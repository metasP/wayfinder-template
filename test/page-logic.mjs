// What a Wayfinder page must not carry once it reads the core through the shared loader (spec *Modules* §4,
// ticket #19 AC): its own index of the vault, map `blocked_by` judging, frontier or blocker rules, Config
// readers, or a clock. `[what, pattern]` pairs, matched by `pageLogic` against a page's code.
const STATUS = `["'](open|claimed|waiting|resolved)["']`
export const PAGE_LOGIC = Object.freeze([
  ["reads the vault itself instead of the loader's index", /dv\.pages\(|dv\.page\(/],
  ["builds its own index", /new Map\(\)[\s\S]{0,80}index|const index = /],
  ["judges map blocked_by itself", /blockState|lookup\(/],
  ["reads blocker links itself", /\.blockers\b|\{[^}]*\bblockers\b[^}]*\}\s*=|rawBlockers|blockerOpen/],
  ["decides ticket states from raw statuses", new RegExp(`status\\s*[!=]==?\\s*${STATUS}|${STATUS}\\s*[!=]==?\\s*[\\w.?]*status\\b`)],
  ["carries Config readers of its own", /cfg(Num|Color|Label)\b|CONFIG_NOTE|STALE_DAYS/],
  ["reads the clock", /luxon|DateTime|new Date\(|Date\.now/],
])

// Line comments out, so prose that names an old helper doesn't count; strings and code stay.
const code = (src) => src.replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "")

/** The `what` of every PAGE_LOGIC rule the page's `dataviewjs` source breaks. */
export function pageLogic(src) {
  const body = code(src)
  return PAGE_LOGIC.filter(([, re]) => re.test(body)).map(([what]) => what)
}
