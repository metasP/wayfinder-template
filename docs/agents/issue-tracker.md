# Issue tracker: GitHub

Build tickets for this repo live as GitHub issues on `metasP/wayfinder-template`. Specs live as files in the
repo, reviewed through a pull request. Use the `gh` CLI for all operations; it infers the repo from `git remote -v`.

There is **no Project board** — the issue list (filtered by label) is the board.

## Labels

| Label | Goes on | Meaning |
| --- | --- | --- |
| `spec` | the PR that adds a spec | A spec waiting for owner review |
| `build` | every build ticket (issue) | A unit of build work — one ticket, one PR |

This repo has no triage labels. Where a skill says to apply `ready-for-agent`, apply `build` instead (on an
issue) or `spec` (on a spec PR) — nothing else.

If `gh` rejects a label as missing, create it once and retry:
`gh label create spec --description "Spec awaiting owner review"` ·
`gh label create build --description "Build ticket: one ticket, one PR"`.

## Specs — `/to-spec`

- A spec is a file at `docs/specs/<slug>.md`, **not** an issue.
- Publish it as a PR against `main` (branch `spec/<slug>`, commit type `docs:`), labelled `spec`, for the owner
  to review. The spec is accepted when that PR merges — `/to-tickets` reads the merged version, never a draft.
- Product questions that come up while writing go to the owner as PR comments; don't settle them in the spec.

## Build tickets — `/to-tickets`

- One GitHub issue per ticket, labelled `build`, created in dependency order (blockers first) so each
  `Blocked by` can reference real issue numbers.
- One ticket = one PR into `main`. The PR body carries `Closes #<n>`. Commits follow Conventional Commits —
  release-please builds `CHANGELOG.md` from them.
- When the effort has a feature-level issue, attach every ticket to it as a GitHub sub-issue.

Every ticket body uses these headings, in this order:

```markdown
## Problem

What is wrong or missing today, from the user's (vault owner's / agent's) point of view.

## Context

What the implementer needs to know first: the spec it comes from (`docs/specs/<slug>.md`), decisions
already locked, related tickets.

## Fix

The end-to-end behaviour this ticket makes work — a vertical slice, not a layer-by-layer task list.

## AC

- [ ] Observable, testable acceptance criteria

## Risk

**one-way door** or **two-way door**, and why.

## Blocked by

- #<n> — or `None`
```

### Risk: one-way vs two-way door

- **two-way door** — cheap to back out (revert the PR). Tickets that don't block each other may run in parallel.
- **one-way door** — expensive or impossible to back out: vault schema, migrations that rewrite users' notes,
  anything already written into a user's vault, the CLI/frontmatter contract other people's vaults depend on.
  A one-way ticket lists every ticket that must merge before it, and tickets that follow it list it as a blocker.

### Blocking

- Record each edge with GitHub's native issue dependencies:
  `gh api --method POST repos/metasP/wayfinder-template/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`,
  where `<blocker-db-id>` comes from `gh api repos/metasP/wayfinder-template/issues/<n> --jq .id` (the database id,
  not the `#number`).
- Also keep the `## Blocked by` heading in the body — it is the human-readable copy.
- A ticket is unblocked when every blocker is closed.
- A blocker in **another repo** can't be expressed here. Note it under `## Blocked by` as text and leave the
  ticket out of anyone's queue until that blocker merges; the cross-repo order itself is kept by whoever planned
  the work (for a wayfinder effort, the map's `## Build board`).

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

- A spec → open a `spec`-labelled PR adding `docs/specs/<slug>.md` (see *Specs*).
- Anything else → create a GitHub issue labelled `build` with the headings above.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`. For a spec, read `docs/specs/<slug>.md` on `main` (or the open `spec` PR
with `gh pr view <number> --comments` and `gh pr diff <number>`).

## Wayfinding operations

**Not hosted here.** `/wayfinder` maps and their tickets (research · prototype · grilling · task) live in the
owner's wayfinder vault, outside this repo — never as GitHub issues, `.scratch/`, or `docs/plan/`. This repo's
tracker only receives what the build step produces: specs and build tickets.
