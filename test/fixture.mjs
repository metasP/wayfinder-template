// Compact, in-memory note builders for the read-model core tests. No filesystem:
// the core's input is `Array<{ path, frontmatter }>`, so the fixture is just data.

export const TODAY = "2026-10-14"

export function ticket(path, fields = {}) {
  return {
    path,
    frontmatter: {
      type: "task",
      status: "open",
      status_since: "2026-10-10",
      title: path.split("/").pop().replace(/\.md$/, ""),
      blockers: [],
      ...fields,
    },
  }
}

export function map(path, fields = {}) {
  return {
    path,
    frontmatter: { kind: "map", title: "map", status: "active", status_since: "2026-10-10", ...fields },
  }
}

// The ticket-01 prototype fixture, carried over: a cross-effort blocker, a paused map,
// a dangling blocker and a stale claim.
export const PROTOTYPE_NOTES = [
  map("repoA/eff1/map.md", { status: "active", status_since: "2026-10-01" }),
  map("repoB/eff2/map.md", { status: "paused", status_since: "2026-10-01", status_note: "later" }),
  ticket("repoA/eff1/issues/01-done.md", { status: "resolved", status_since: "2026-10-01" }),
  ticket("repoA/eff1/issues/02-ready.md", { status_since: "2026-10-01", blockers: ["[[01-done]]"] }),
  ticket("repoA/eff1/issues/03-blocked.md", { status_since: "2026-10-01", blockers: ["[[04-claimed]]"] }),
  ticket("repoA/eff1/issues/04-claimed.md", {
    status: "claimed",
    status_since: "2026-09-01",
    claimed_by: "session:abcd1234",
  }),
  ticket("repoA/eff1/issues/05-cross.md", {
    status_since: "2026-10-01",
    blockers: ["[[repoB/eff2/issues/01-other]]"],
  }),
  ticket("repoA/eff1/issues/06-dangling.md", { status_since: "2026-10-01", blockers: ["[[99-missing]]"] }),
  ticket("repoB/eff2/issues/01-other.md", { status: "resolved", status_since: "2026-10-01" }),
  ticket("repoB/eff2/issues/02-paused.md", { status_since: "2026-10-01" }),
]

export const refs = (tickets) => tickets.map((t) => t.ref)
