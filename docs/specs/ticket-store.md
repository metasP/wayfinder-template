# Spec: ticket store (`wf`) + shared read model + new autocommit

Status: draft for owner review · target release `0.5.0` · origin: the wayfinder map *Ticket Store (`wf`)*
(architecture review candidates **A** ticket store · **B** one read model · **G** commits belong to the store)

## Problem Statement

A wayfinder vault is a tracker whose only write interface is "edit markdown by hand". Every invariant of the
tracker — status enums, `status_since` stamping, NN reservation, blocker shape, map/ticket identity, the
`## Tickets` list, *Decisions so far* — lives as prose in the vault README (≈65 rules, ≈53 KB) and has to be held
in an agent's head while it uses Write/Edit. When an agent gets one wrong, nothing notices:

- 34 of 297 tickets in the owner's vault carry a `repo` in frontmatter that doesn't match their folder, because
  `repo` is used for two things (identity, and "which repo this ticket changes"). Three open/waiting tickets have
  silently disappeared from the Dashboard as a result.
- A map's hand-written `## Tickets` list shows 8 of its 11 tickets; a claim leaked for 28 days.
- "Frontier" is encoded 7 times (four Dataview pages, the README, `wayfinder-next`, the upstream skill) and the
  pages disagree on cross-effort blockers; "which ticket next" has 4 different answers.
- The status enum exists in ~9 copies.
- Commits are made by a PostToolUse hook that swallows every failure (`|| true`, always exit 0). One vault branch
  has been stuck unmerged since 2026-08-28 and nobody was told.

`doctor` passes all its checks while all of the above is true: its checks cover the install, not whether the
vault's state is truthful.

## Solution

Give the tracker a real module with a small interface, and make the vault's state unable to lie:

1. **`wf` — the ticket store CLI.** One verb per state transition (`chart`, `new`, `claim`, `release`, `wait`,
   `resolve`, `map-status`, `block`, `bump-runs`) plus three read/maintenance verbs (`frontier`, `lint`,
   `migrate`). Every invariant lives inside the verb that owns the transition. `wf` is the only thing that
   changes tracker state in frontmatter; agents still write prose (`## Question`, `## Answer`, map sections) with
   Write/Edit. Each verb takes the vault lock, writes, regenerates derived blocks, lints what it touched, and
   commits — and fails loudly with a non-zero exit and a fix hint when it can't.
2. **One read model.** A single pure core module — the schema (enums, field shapes) plus index, frontier,
   blocked, stale, pick order and lint — loaded unchanged by Node (`wf`, `doctor`) and by Obsidian (every
   Dataview page). There is exactly one definition of "frontier" and one rule for "which ticket next", and the
   rule is data the owner edits.
3. **Commits belong to the store.** `wf` commits its own writes to the vault's main checkout. The old
   worktree-to-main sync is deleted. The remaining autocommit hook only commits prose edits, and when it fails the
   agent is told immediately and `doctor` reports it.
4. **Identity comes from the path.** `repo` and `effort` leave frontmatter; a ticket that changes another repo
   says so with `target_repo`. `wf migrate` takes existing vaults there, previewed as a diff first.
5. **The README shrinks to a verb table plus concepts.** Prose protocols (NN race, stubs) are deleted because the
   verbs make them unnecessary.

## User Stories

**Agent working a map**

1. As an agent, I want to claim a ticket with one command, so that I don't have to remember which fields to change
   or that `status_since` must be restamped.
2. As an agent, I want `wf claim` to refuse a ticket that is blocked, already claimed, or on a map that isn't
   active, so that two sessions can't work the same ticket and I can't start work that isn't ready.
3. As an agent, I want the claim check to re-read the ticket under a lock, so that a claim made by another session
   a second ago is never overwritten.
4. As an agent, I want `wf claim` to record who claimed the ticket, so that the owner can tell which session holds
   it and stale claims can be traced.
5. As an agent, I want to resolve a ticket with a one-line gist, so that the ticket's status and the map's
   *Decisions so far* line are written together and can't drift apart.
6. As an agent, I want `wf resolve` to refuse a ticket whose `## Answer` is empty or still the placeholder, so that
   a resolved ticket always carries its answer.
7. As an agent, I want the *Decisions so far* append to happen under the lock after re-reading the map, so that a
   concurrent session's line is never lost.
8. As an agent, I want to close a ticket as out of scope with a gist that lands under `## Out of scope`, so that
   scope cuts are recorded in the right place without me remembering the rule.
9. As an agent, I want to mark a ticket as waiting on an outside event with a required note and an optional
   "until" date, so that it leaves the frontier and comes back to the owner's attention when the date passes.
10. As an agent, I want to release a claimed or waiting ticket back to open, so that I can hand work back cleanly
    and the claim/wait fields are cleared for me.
11. As an agent, I want `wf new` to reserve the next ticket number atomically, so that two sessions creating
    tickets at the same moment never collide and nobody has to write a stub.
12. As an agent, I want `wf new` to write the ticket skeleton (`## Question` from my input, `## Answer`
    placeholder), so that every ticket starts in the right shape.
13. As an agent, I want to add a blocker edge with `wf block`, so that blockers are always stored as resolvable
    wikilinks and cycles are rejected.
14. As an agent, I want `wf frontier` to give me the workable tickets already in the owner's preferred order, so
    that I don't re-derive ranking rules from prose.
15. As an agent, I want `wf frontier --repo X` to include tickets whose home repo or target repo is X, so that a
    session in repo X sees every ticket it can act on.
16. As an agent, I want every verb to accept a ticket as `repo/effort#NN`, a vault path, or a wikilink, and to
    print tickets back as `repo/effort#NN`, so that I can paste whatever reference I have.
17. As an agent, I want `--json` output on every verb, so that skills can consume results without parsing prose.
18. As an agent, I want a failed verb to exit 1 with the violated invariant and the command that fixes it, so that
    I can recover without reading the README.
19. As an agent, I want a usage or environment error (bad arguments, vault not writable from my sandbox, lock held
    too long) to exit 2 and say which, so that I can tell "I did something wrong" from "the environment is wrong".
20. As an agent running in a git worktree, I want `wf` to write and commit in the vault's main checkout regardless
    of my current directory, so that tracker state never strands on a branch.
21. As an agent, I want a direct Edit of tracker frontmatter to be refused with a message naming the verb to use,
    so that I can't bypass the invariants by accident.
22. As an agent, I want to be told in the same turn when a prose autocommit fails, so that I can fix it before the
    failure is buried.
23. As an agent running `wayfinder-next`, I want ranked candidates from `wf frontier --json` and run numbers from
    `wf bump-runs`, so that chip titles and ordering come from the same model as the Dashboard.
24. As an agent charting a new map, I want `wf chart` to create the map in `draft` and `wf map-status ... active`
    to refuse until `## Destination` is written, so that no map goes active without a destination.
25. As an agent closing a map, I want `wf map-status ... done` to refuse while tickets are still pending and to
    remind me to run `/retro`, so that maps aren't closed with work in flight.

**Vault owner**

26. As the owner, I want the Dashboard, Efforts, Effort Tickets and Picks pages to agree on what is workable,
    blocked, waiting and stale, so that I can trust any page I open.
27. As the owner, I want cross-effort blockers to be judged by the blocker's real status everywhere, so that a
    ticket in one effort doesn't look free on one page and blocked on another.
28. As the owner, I want a blocker that points at a missing ticket to count as blocking (fail closed) and to be
    reported, so that a typo never releases work early.
29. As the owner, I want each map's `## Tickets` section to be generated from the tickets themselves, so that it
    can never list 8 of 11.
30. As the owner, I want my rule for "which ticket next" to be a short list of sort keys in the frontmatter of
    *Wayfinder Picks*, so that changing my priorities is a one-line edit that every consumer honours.
31. As the owner, I want a lint panel on the Dashboard fed by the same checks as `wf lint`, so that I see broken
    state when I open Obsidian, without a separate command.
32. As the owner, I want claims older than a configurable number of days, and waits past their `wait_until` date,
    to be flagged, so that leaked claims don't sit for 28 days.
33. As the owner, I want a clear message instead of a bare Dataview stack trace when the shared core fails to
    load, so that I know to run `doctor`.
34. As the owner, I want editing the core in my vault to take effect on the next render without restarting
    Obsidian, so that template updates apply immediately.
35. As the owner, I want `doctor` to report content problems via `wf lint` and to report autocommit failures, so
    that a passing `doctor` actually means the vault is healthy.
36. As the owner, I want every vault commit to be specific (`wf(claim): repo/effort#NN`), so that the vault
    history reads as a log of tracker events rather than thousands of "update file" commits.
37. As the owner, I want a ticket's title stored on the ticket, so that generated lists, frontier output and chips
    show a human title without parsing prose.

**Template user (anyone installing or upgrading the template)**

38. As a template user upgrading from 0.4.x, I want `bootstrap --plan` to show me exactly what `wf migrate` will
    change in my vault before anything is written, so that I can review a one-way change.
39. As a template user, I want migration to keep my hand-written `## Tickets` lists (folded away, not deleted), so
    that no notes I wrote are lost.
40. As a template user, I want migration to be idempotent, so that running it twice is harmless and a second
    `--plan` shows no changes.
41. As a template user, I want `wf` to refuse to write a vault whose schema is older than it understands and tell
    me to run `wf migrate`, so that a half-upgraded vault can't be corrupted.
42. As a template user, I want bootstrap to wire everything `wf` needs (the instruction block for agents, a
    permission rule for the `wf` command, the frontmatter guard hook, the new autocommit), so that upgrading is
    one command.
43. As a template user on Node 18 or later with no extra packages, I want `wf` to run with zero dependencies, so
    that installation stays a single `npx`.
44. As a template user whose vault language is not English, I want text that `wf` writes into notes to follow
    `language:` in *Wayfinder Config*, while CLI messages stay English, so that my notes stay in my language and
    error output stays searchable.

**Template maintainer**

45. As the maintainer, I want every verb tested through the `wf` interface against a fixture vault, so that tests
    survive refactoring of the internals.
46. As the maintainer, I want the read model tested once, through the core, so that all consumers are covered by
    one test suite.
47. As the maintainer, I want migration tested against a scrubbed snapshot of a real vault, so that real-world
    shapes (cross-repo tickets, hand-written lists, odd frontmatter) are covered.
48. As the maintainer, I want `node --test` to run in CI on every PR, so that a broken core never reaches a user's
    Obsidian.
49. As the maintainer, I want the README's wayfinding section reduced to a verb table and concepts, so that
    there's one place where operations are defined — the code.

## Implementation Decisions

### Modules

The work is five modules. The first three are new; the last two are existing modules that get rewritten.

1. **Read-model core** (new, deep, pure). It holds the schema and every derived view, and it is shared by Obsidian
   and Node.
   - It is a single ES module file with **no imports and no I/O**. Ticket 01 proved this is the shape that loads
     in both runtimes. A relative import inside the core is not proven under Obsidian's resource-URL loading,
     so the schema lives inside the core.
   - Input: `notes: Array<{ path, frontmatter }>`, where `frontmatter` holds raw values. Dataview's
     `file.frontmatter` already has exactly this shape (01 confirmed it: strings, not Luxon dates). Date
     normalisation still accepts Date and Luxon values defensively.
   - Exports, grouped by concern:
     - **Schema:** ticket and map status enums, ticket types, field definitions per kind (required/optional,
       scalar/list), and the transition table for tickets and maps.
     - **Identity:** parse a path or a reference into `{ repo, effort, nn, slug }`. The repo may contain `/`.
     - **Index:** `buildIndex(notes)` returns maps and tickets keyed by `repo/effort` and `repo/effort#NN`, with
       blockers resolved to refs. A bare `[[NN-slug]]` resolves within the ticket's own effort only. A full
       `[[repo/effort/issues/NN-slug]]` is absolute. Anything else becomes `null`, which counts as blocking.
     - **Queries:** `openBlockers`, `isBlocked`, `frontier(index, { repo?, from? })`, `pickOrder(index,
       tickets, rules, { from? })`, `staleClaims`, `staleMaps`, `overdueWaits`, `unblocks` (counted from real
       `blockers` edges), and the map `blocked_by` states the Efforts page shows (cleared, dead, dangling,
       waiting).
     - **Lint:** `lint(index, { today, config })` returns `Finding[]`, where each finding is `{ severity:
       "error"|"warn", rule, ref, message, fix }`. `fix` is the `wf` command that resolves the finding, when
       one exists.
     - **Rendering:** `renderTicketsBlock(index, effort, language)` returns the generated `## Tickets` lines, so
       `wf` and lint compare against one rendering.
2. **Store** (new, Node-only). It reads the vault into `notes`, holds the lock, reserves NN, writes files and
   commits. This is the only module that touches the filesystem or git.
3. **`wf` CLI** (new). It parses arguments, dispatches verbs, and formats text or `--json` output. It maps errors
   to exit codes.
4. **Dataview pages** (rewritten): Dashboard, Efforts, Effort Tickets and Picks.
   - Every page loads the core through one shared loader view. Their copy-pasted index code, `blockState`, cfg
     helpers and DQL frontier copies are deleted.
   - Presentation code (tables, SVG graph, colours, labels) stays per page.
5. **Hooks, `doctor` and `bootstrap`** (rewritten):
   - The new autocommit and the new frontmatter guard hook.
   - `doctor` keeps the install checks and gains a content section that comes from `lint`.
   - `bootstrap` gains a migrate step and new wiring.

### Loading the core in Obsidian (from ticket 01)

- The loader is a `dv.view` script. It loads the core with a dynamic `import()` of the URL from
  `app.vault.adapter.getResourcePath(<core>)`.
  - Never use a `file://` URL or a raw filesystem path.
  - Never use `require`: it is desktop-only and caches the module for the whole process.
- The loader wraps the import in `try/catch`. On failure it renders its own message, which names the core file
  and tells the user to run `doctor`. Dataview's own error box doesn't name the failing file.
- Adapter on the Dataview side: `dv.pages().map(p => ({ path: p.file.path, frontmatter: p.file.frontmatter }))`.
  Nothing more is needed.
- Fallback, kept documented but not built: load the core as CommonJS with `dv.io.load` + `new Function`. This
  passed in 01 and is the route to take if dynamic import fails on Obsidian mobile.
- Each page's code is a view of its own under `_tools/views/` (`dashboard`, `efforts`, `effort-tickets`,
  `picks`), which reads the core through the loader with a nested `dv.view`. A `dataviewjs` block in a page note
  is a one-line stub that calls its view; the Dashboard's stubs also name a section (`{ block: "frontier" }`).
  See *Sandbox grant (Q2)* for why. `lib/page-views.mjs` holds the page-to-view map and the stub's shape.
- No view's text contains the word `await`, not even in a comment. Dataview wraps such a view in an async IIFE
  and drops its promise, so the block would finish before the view rendered. Views chain promises instead.
- No index JSON is ever written by `wf` for the pages to read (Q35). That would go stale whenever someone edits
  a note in Obsidian.

### Frontmatter schema (vault schema version 2)

Ticket:

| Field | Required | Shape | Written by |
| --- | --- | --- | --- |
| `type` | yes | `research \| prototype \| grilling \| task` | `new` |
| `status` | yes | `open \| claimed \| waiting \| resolved` | every transition |
| `status_since` | yes | `YYYY-MM-DD` | every transition |
| `title` | yes | string | `new` (and `migrate`) |
| `blockers` | yes | list of wikilink strings (`[]` when none) | `new`, `block` |
| `status_note` | when `waiting` | string | `wait`; cleared by `release` and `resolve` |
| `wait_until` | no | `YYYY-MM-DD` | `wait --until`; cleared on leaving `waiting` |
| `claimed_by` | when `claimed` | string (see below) | `claim`; cleared by `release` and `resolve` |
| `target_repo` | no | repo name | `new --target-repo` |

Map: `kind: map`, `title`, `status` (`draft | active | paused | done | dropped`), `status_since`. Optional fields:

- `status_note` — required for `paused` and `dropped`.
- `runs` — owned by `bump-runs`.
- `repos` — descriptive only.
- `blocked_by`, `superseded_by`, `base_branch`, `created`.

Rules:

- `repo` and `effort` are not fields (Q4, Q13). Identity is `<repo>/<effort>` from the path.
- Frontmatter is a YAML subset: flat scalars and lists of strings. Anything else (nested maps, anchors, multi-line
  scalars) makes `wf` exit 2 and name the file and line. It never guesses.
- Verbs rewrite only the keys they own. Every other line is preserved byte-for-byte, including unknown keys and
  their order. Lint reports an unknown key as `warn`.
- The vault schema version is recorded once, in the template manifest. The manifest gets a field separate from
  its own `schema`. `wf` exits 2 with "run `wf migrate`" when the vault's version is older than it supports.

### `claimed_by` value (closes *Not yet specified* #1)

`wf claim` stamps the first of these that applies:

1. `--by <name>` when given.
2. **The git branch of the caller's working directory, when that directory is a linked git worktree.** A linked
   worktree is one whose git dir differs from its common dir. Claude Code and `/wayfinder-next` chips run each
   session in its own worktree on a unique branch, and that branch is the name the owner sees in the session
   list. A main checkout's branch (`main`, `develop`) is not unique per session, so it is never used.
3. `session:<first 8 chars of CLAUDE_CODE_SESSION_ID>`, when the variable is set. Claude Code exposes it to every
   Bash command, and hooks receive the same id as `session_id`.
4. Otherwise exit 2: "cannot tell who is claiming — pass `--by`".

A claim whose `status_since` is older than `claim_stale_days` is reported. `claim_stale_days` is a new
*Wayfinder Config* key with default `3`, spelled in Config's lowercase style (Q17's `CLAIM_STALE_DAYS`).

### Verbs

All verbs:

- Accept refs as `repo/effort#NN`, a vault path, or a wikilink, and print refs as `repo/effort#NN`.
- Support `--json`.
- Exit `0` on success; `1` when an invariant is violated (the message states the invariant and the fixing
  command); `2` on usage or environment errors. A write that fails with `EPERM`/`EACCES` says the vault is
  probably outside the sandbox's writable paths.
- Write CLI messages in English. Text written into notes follows `language:` in *Wayfinder Config* (Q36).

Ticket transitions (Q24):

| Verb | From → to | Invariants and side effects |
| --- | --- | --- |
| `new <repo/effort> --type T --title "…" [--question "…" \| stdin] [--blocker ref]… [--target-repo R]` | — → `open` | Map exists and is not `done` / `dropped`. NN = highest + 1, reserved under the lock with an exclusive create. Writes the `## Question` / `## Answer` skeleton. Blockers must resolve and must not form a cycle. |
| `claim <ref> [--by name]` | `open` → `claimed` | Re-read under the lock. Not blocked; map `active`. Stamps `claimed_by`. |
| `release <ref>` | `claimed`/`waiting` → `open` | Clears `claimed_by`, `status_note`, `wait_until`. |
| `wait <ref> --note "…" [--until YYYY-MM-DD]` | `open`/`claimed` → `waiting` | Note required. |
| `resolve <ref> --gist "…"` | `claimed`/`waiting` → `resolved` | `## Answer` non-empty and not the placeholder. Appends `- [[NN-slug]]: <gist>` to *Decisions so far*, re-reading the map under the lock. |
| `resolve <ref> --out-of-scope --gist "…"` | `open`/`claimed` → `resolved` | Appends to `## Out of scope` instead. |

An `open` ticket can't be resolved directly unless `--out-of-scope` is given.

Map transitions (Q25):

| Verb | Rule |
| --- | --- |
| `chart <repo/effort> --title "…"` | Creates `map.md` in `draft` with the standard section skeleton. Refuses if the map exists. |
| `map-status <repo/effort> active` | Requires a non-empty `## Destination`. |
| `map-status <repo/effort> paused\|dropped --note "…" [--superseded-by <repo/effort>]` | `--note` is required. |
| `map-status <repo/effort> done` | Requires no ticket in `open`/`claimed`/`waiting`. Prints a reminder to run `/retro`. |

Every map transition clears or replaces `status_note`.

Other verbs:

- `block <ref> <blocker-ref> [--remove]` adds or removes one edge. It writes a bare wikilink within an effort and
  a full-path wikilink across efforts, and rejects cycles.
- `bump-runs <repo/effort> [--count k]` allocates `runs+1 … runs+k` and prints the range.
- `frontier [--repo R] [--from repo/effort] [--json]` returns open, unblocked tickets on active maps, ordered by
  the Picks rules. `--repo` matches the home repo or `target_repo`. `--from` gives `same_effort` its context.
- `lint [repo/effort…] [--rule <rule>] [--json] [--fix]` prints findings for the whole vault or the named efforts.
  `--fix` only regenerates derived blocks; it never changes state. The text report (and `doctor`'s) folds a rule
  with 5 or more warnings into one line that names `wf lint --rule <rule>`, and prints errors last, so a
  terminal that keeps only the tail still shows them. `--rule` and `--json` list every finding.
- `migrate [--yes]` prints a unified diff by default and writes only with `--yes`.

What every write verb does, in order:

1. Take the lock.
2. Re-read the notes it needs.
3. Check invariants.
4. Write each touched file atomically (temporary file + rename).
5. Regenerate the `## Tickets` block of every effort whose rendering changed. A resolve can change the ⛔ marks
   in another effort.
6. Commit only the files it touched, with message `wf(<verb>): <ref>`.
7. Release the lock.
8. Run lint on the touched efforts and print findings as warnings (Q27). Lint findings never fail a verb that
   succeeded.

### Locking and commits (Q14)

- `wf` always operates on the vault's **main checkout**. It resolves that from `git --git-common-dir`, so it works
  from any vault worktree or any repo, given the vault's absolute path.
- The lock is `mkdir` of a directory inside the vault's git dir.
  - A lock older than a stale threshold is broken, with a warning.
  - `wf` waits for a bounded time, then exits 2 naming the lock.
  - Both durations are named constants (proposed: 30 s stale, 10 s wait).
  - When git reports `index.lock`, `wf` retries with backoff before giving up.
- If the main checkout is mid-merge, mid-rebase or similar, `wf` exits 2 and writes nothing.
- The worktree-to-main sync function is deleted. Vault worktrees are no longer used for tracker work.

### Generated `## Tickets` block (Q5)

- It sits after `## Notes`, between `<!-- wf:tickets -->` and `<!-- /wf:tickets -->`. A marker counts only alone on
  its line and outside fenced code, so a map may quote the markers in prose or a code block.
- Each ticket is one line, in NN order: `- [[NN-slug]] · <type> · <status> · <title>`, plus ` ⛔` when blocked.
- `wf` rewrites it on every state change. A hand edit inside the markers is overwritten. A block that differs from
  the rendering (for example, after frontmatter was changed in Obsidian) is a `warn` lint finding, fixed by
  `wf lint --fix`.

### Pick order is data (Q6, Q19, Q30)

- *Wayfinder Picks* frontmatter holds `sort: [unblocks desc, nn asc]`, which is also the default when the key is
  missing.
- Sort vocabulary:
  - `unblocks` — the number of open tickets whose `blockers` include this one; inlinks don't count.
  - `afk_first` — `research` before the other types.
  - `same_effort` — tickets in the `--from` effort first; ignored without `--from`.
  - `nn` — ticket number.
- Each key takes `asc` or `desc`. An unknown key is a lint `error` and is ignored when sorting.
- `wayfinder-next` takes candidates in `wf frontier` order. The agent only decides whether two candidates
  collide (same files or same repo), walking the list from the top.

### Dashboard lint panel (closes *Not yet specified* #2)

01 proved the core loads in Obsidian, so the panel renders the core's `lint()` directly:

- It is the first block on the Dashboard, loaded through the shared loader view.
- It is a table with columns Severity · Note (link) · Rule · Message · Fix. `error` rows come before `warn` rows.
  The Fix column shows the `wf` command as copyable code.
- When there are no findings it collapses to one line: "✅ lint clean".
- It shows only what the pure core can see: frontmatter and block state. Install, git and hook checks stay in
  `doctor`, because Dataview can't see git or settings. `wf lint` and the panel therefore show the same findings
  for the same notes, and `doctor` is a superset.
- There is no SessionStart lint, because of token cost (Q27).

### Lint rules (initial set, all in the core)

**error:**

- Invalid enum value.
- Missing required field.
- `waiting` without `status_note`.
- Blocker that doesn't resolve (dangling).
- Blocker cycle.
- Duplicate NN in an effort.
- `done` map with pending tickets.
- Unknown pick-sort key.
- YAML outside the subset.

**warn:**

- Stale claim (`claim_stale_days`).
- Overdue `wait_until`.
- Active map idle for more than `stale_days`, unless every pending ticket is `waiting`.
- Map `paused` for more than `paused_stale_days`.
- "Lying" map status: `paused`, `dropped` or `done`, but tickets moved after `status_since`.
- Active map with no pending tickets ("→ done").
- `## Tickets` block drift.
- Unknown frontmatter key.
- A `.md` file directly in an effort's `issues/` whose name doesn't start with `NN-` (`unindexed-ticket`): the
  index can't read it, so every view and verb would skip it silently.
- Legacy `repo`/`effort` fields still present ("run `wf migrate`").

### Frontmatter guard hook (Q15)

A new PreToolUse hook on Write|Edit, scoped to ticket and map files inside the vault:

- Edit is denied when `old_string` overlaps the frontmatter block.
- Write is denied when it creates a new ticket or map file, or when it changes the existing frontmatter.
- The denial reason names the verb to use, for example: "use `wf claim <ref>` to change status".
- Prose edits below the frontmatter pass through.
- Bash is not inspected. `doctor` and `wf lint` catch what slips through.

### New autocommit (Q7)

- It stays a PostToolUse hook on Write|Edit, and still commits each prose edit in the repository that contains
  the file.
- The Bash matcher and its multi-file scoping are removed: `wf` commits its own writes, and stray Bash writes show
  up in `doctor`'s clean-tree check.
- It has no worktree-to-main sync and no `|| true`.
- On failure it still exits 0, so it doesn't block. Instead it:
  - prints hook JSON with `additionalContext` stating what failed and how to fix it, which the agent reads in
    the same turn;
  - appends a line to a failure log inside the vault's git dir, which `doctor` reports until it's cleared.

### `doctor`

- Install checks stay: git, `.gitignore`, Dataview, graph, pages, hooks, manifest.
- Hook checks now look for the guard hook and the new autocommit, and flag the old one if it is still wired.
- The content section is replaced by one call to the core's `lint()`, the same schema `wf` uses.
- New checks: the autocommit failure log, and the vault schema version.
- It checks the sandbox grant: when `sandbox.filesystem.allowWrite` in `~/.claude/settings.json` covers the vault,
  every *Sandbox grant* deny must be in `denyWrite`, or the check fails and names the missing entries.

### Sandbox grant (Q2)

`wf` runs in sandboxed Bash. It writes notes under `<repo>/<effort>/`, the three seed notes at the vault root, and
`.git` (objects, refs, the index, and its `wf.lock`). So the owner grants the vault root in
`sandbox.filesystem.allowWrite`.

Some things run outside the sandbox with the owner's full rights and load code or config from inside the vault:
the hooks, the git that the autocommit hook runs, Obsidian, and a Claude Code session started in the vault. If a
sandboxed command can write one of those paths, it escapes the sandbox at the next Write/Edit. So the grant
always comes with a `denyWrite` entry for each path below (`lib/sandbox.mjs` holds the list):

| Path | What runs it outside the sandbox |
| --- | --- |
| `_tools` | Claude Code, which runs the guard and autocommit hooks on every Write/Edit; also the libraries they import |
| `.git/hooks` | The autocommit hook's `git commit`, and the owner's git |
| `.git/config` | The same, through `core.hooksPath`, `core.fsmonitor`, and filter drivers |
| `.git/modules` | A plain `git status`, which reads a submodule's config |
| `.obsidian` | Obsidian, which runs plugin code when it starts |
| `.claude`, `.mcp.json` | A Claude Code session started in the vault (its settings, hooks, and MCP servers) |

The vault-root `CLAUDE.md` stays writable. It is instructions, not code, so it is prompt injection for a session
started in the vault, not a sandbox escape.

- Claude Code's own protected paths don't cover these. It protects `.git/hooks`, `.git/config`, and `.claude` only
  in the session's working directory and the directories above it, and the vault is usually neither. This was
  checked on macOS: sandboxed Bash could write `.git/hooks` and `.git/config` in a repository outside the working
  directory.
- `denyWrite` takes precedence over `allowWrite` (settings schema). In the same macOS check, the directory above a
  denied path could not be renamed, so a deny can't be dodged by moving `.git` or `_tools` aside.
- `bootstrap` prints the grant for the vault it installed, spelled through `~/` the way INSTALL writes it. `doctor`
  checks it.
- `doctor` doesn't count the following, so the owner keeps them in line with the printed grant:
  - wildcard entries;
  - entries from other settings scopes;
  - `Edit` allow rules, which also grant sandbox writes.
- `doctor` also flags an allow narrower than the vault (for example `<vault>/.git`) that reaches one of these
  paths without its deny.
- Dataview JS in a note runs when the owner opens that note in Obsidian, with the owner's full rights. The pages
  depend on it (`enableDataviewJs`), and notes are what `wf` writes, so no grant can close this. INSTALL tells the
  owner. What narrows it:
  - The pages' code lives in `_tools/views/`, which is denied. Each block in a page note is a one-line stub that
    calls its view (*Loading the core in Obsidian*), so a sandboxed command can't change what a page runs
    without leaving a block `doctor` refuses.
  - `doctor` fails a template page (Dashboard, Efforts, Effort Tickets) unless its blocks are exactly its stubs:
    each calls that page's view, and the Dashboard names every section once. It counts every fence Dataview
    might run, so a block written with `~~~`, an indent, inside a callout, or on a list-item line counts too.
    The count isn't anchored to the line start, because counting too many is safe and too few is a false green.
  - On *Wayfinder Picks*, the user's note, the old inline block is only a warning that names `wf migrate`. Any
    other block that isn't the stub fails, because the sandbox can write that note.
  - `doctor` warns about a `dataviewjs` block in any other note, naming it, so the owner can look before opening
    it. The scan skips only dot folders and `_tools`, so a root `_` folder the sandbox can write is covered.
    Nothing `wf` writes has such a block. It's a warning because the owner may use Dataview JS in notes of
    their own.
  - Inline JS queries (`$=`) are off (`enableInlineDataviewJs: false`). No page uses them. The setting lives under
    `.obsidian`, which is denied. It's seed-once, so an older vault keeps it on until the owner turns it off;
    `doctor` warns until then.
  - What stays open: a sandboxed command can still add a block to a note. `doctor` reports it, but only when
    someone runs `doctor`, and Obsidian runs the block as soon as the note is opened.
- Out of scope: a vault whose `.git` is a file (a linked worktree or a separate git dir). There, git reads hooks
  and config from somewhere else, and `.git/worktrees/*/config.worktree` applies once `extensions.worktreeConfig`
  is set. Q14 ended tracker work in vault worktrees.
- Only macOS was checked. There, a deny on a path that doesn't exist yet (`.git/modules`, `.mcp.json`) still
  blocks creating it. Linux and WSL2 are unchecked.

### `bootstrap` and release (Q20, Q21)

- `0.5.0` is a breaking release under 0.x. CHANGELOG lists the break, and INSTALL gains the migrate step.
- On update:
  - `bootstrap --plan` prints the `wf migrate` diff together with its own plan.
  - `--yes` applies both.
- `bootstrap` writes the agent-instruction block into the user's global CLAUDE.md.
  - The block says that state changes go through `node <absolute path to wf> <verb>` by absolute path, and that
    prose is written with Write/Edit.
  - It replaces the old "leave committing to autocommit" block, and is detected and updated when it's stale.
- `bootstrap` adds a permission allow rule for exactly that `node <absolute path to wf>` command prefix. It never
  touches `PATH`.
- `bootstrap` wires the guard hook and the new autocommit, and removes the old autocommit entries.
- *Wayfinder Picks* and *Wayfinder Config* are seed-once files, so `bootstrap` doesn't own them; `wf migrate`
  updates them (Q28).

### `wf migrate` (Q28, Q29)

For each item, `wf migrate` does the following:

- **Tickets:**
  - Removes `repo` and `effort`.
  - When the old `repo` differs from the path's repo, writes it as `target_repo`. This fixes the 34-ticket class.
  - Adds `title` when missing: the text after the last ` — ` in the map's hand-written `## Tickets` line for that
    ticket, otherwise derived from the slug.
- **Maps:**
  - Removes `repo` and `effort`; adds `title` from the `# H1` when missing.
  - Replaces a hand-written `## Tickets` section with the generated block. The original list is kept whole
    directly under the block, in a folded callout `> [!quote]- Original list (before wf)`, with the title
    localised.
  - A map without the section gets the block inserted after `## Notes`.
- ***Wayfinder Picks*:**
  - Converts the DQL `SORT` rule into the `sort:` key when it maps onto the vocabulary. Otherwise it writes the
    default and keeps the old rule in a folded callout.
  - Replaces the body with the loader view: a stub that calls `_tools/views/picks`.
  - On a page already off DQL, swaps the inline loader block that 0.5.0 seeded for the stub, when it is there
    unedited. An edited block is the user's, so `wf migrate` leaves it and `doctor` warns.
- ***Wayfinder Config*:** adds missing keys with defaults, such as `claim_stale_days`.
- **Manifest:** sets the vault schema version.

How it runs:

- `--plan` writes nothing.
- `--yes` applies under the lock as one commit, `wf(migrate): vault schema 2`.
- A second run plans nothing.

### README (Q33)

- § Wayfinding operations becomes:
  - a verb table: verb · transition · what it guarantees;
  - concepts: frontier, blocked vs waiting, identity from the path, read model, pick rules;
  - the upstream→vault translation table, pointing at verbs.
- Incident narratives shrink to a one-line reason per rule.
- § NN reservation and the stub protocol are deleted.
- § Spec & ticket operations is unchanged apart from verb references.

## Locked Decisions

These were decided with the owner in the grilling sessions on 2026-10-14 (map *Decisions so far*, Q1–Q36, and
the answers to tickets 01 and 02). Implementers must not reopen them; questions go to the owner as PR or issue
comments.

**Scope and where work lives**

- **Q1** — This spec covers candidates A + B + G. Build tickets are GitHub issues on this repo.
- **Q34** — The tracker is GitHub issues with no Project board. Ticket headings are Problem · Context · Fix · AC ·
  Risk (one-way/two-way door) · Blocked by. Specs are files in this repo, published as a PR labelled `spec`; tickets
  are labelled `build`. (Ticket 02 put this config in the repo; there is no triage label, so `build`/`spec` are
  used in its place.)
- **Q20** — Ships as `0.5.0`, breaking under 0.x. `bootstrap --plan` shows the `wf migrate` diff; `--yes`
  applies. CHANGELOG and INSTALL document the migrate step.

**`wf` interface**

- **Q3** — `wf` is the only way to change tracker state in frontmatter: status, status_since, blockers, claim,
  creating tickets and maps. Body content is still written with Write/Edit.
- **Q16** — One verb per transition: `chart` · `new` · `claim` · `release` · `resolve` · `wait` · `map-status` ·
  `block` · `bump-runs` · `frontier` · `lint` · `migrate`. There is no generic `wf set key=value`.
- **Q24** — Ticket transitions are as in the *Verbs* table above. An `open` ticket can't be resolved directly
  except out of scope.
- **Q25** — Map transitions are as in the *Verbs* table above. Every map transition clears `status_note`.
- **Q21** — `wf` is invoked as `node <absolute path to wf>` by absolute path, written into the CLAUDE.md block, with a
  permission allow rule for that prefix. `PATH` is not touched.
- **Q36** — CLI messages are always English. Text written into notes follows `language:`.
- **Defaults the owner accepted:**
  - Node ≥ 18, ESM, zero dependencies.
  - YAML subset; anything else fails loudly.
  - `node --test`, a fixture vault, and CI.
  - Text output plus `--json`.
  - Exit codes 0 / 1 / 2.
  - Refs as `repo/effort#NN`, a path or a wikilink.
  - `wf new` writes the skeleton.
  - No verb creates several tickets at once (YAGNI).

**Schema and identity**

- **Q4, Q13** — `repo` and `effort` are removed from ticket and map frontmatter; identity comes from the path. A
  `repos: [...]` field is still allowed on maps, as description only.
- **Q12** — A ticket that changes another repo uses the optional `target_repo`. `wf frontier --repo X` matches
  the home repo or the target repo.
- **Q17** — `wf claim` writes `claimed_by`. Claims older than the Config threshold (default 3 days) are reported.
- **Q18, Q26** — Tickets have `title`. `wait --until` writes an optional `wait_until`, which is reported once the
  date has passed.
- The schema version lives in the template manifest, not in every file.

**Read model**

- **Q5** — `## Tickets` is a generated block between markers, after `## Notes`, rewritten on every state change.
  Lines have the form `- [[NN-slug]] · type · status · title`, with ⛔ when blocked.
- **Q6, Q19** — The pick rule is data in the *Wayfinder Picks* frontmatter: `sort: [unblocks desc, nn asc]`. The
  vocabulary is `unblocks` (counted from real `blockers`, not inlinks) · `afk_first` · `same_effort` · `nn`.
- **Q30** — `wayfinder-next` uses the order from `wf frontier`. The agent only judges collisions, walking from the
  top.
- Cross-effort blockers are always judged by their real status.
- **Q35 + ticket 01** — One pure ESM core is loaded by Node with `import` and by Obsidian with
  `import(getResourcePath(…))`. The two-codebase fallback is not needed. **An index JSON written by `wf` is
  forbidden.**

**Writing and enforcement**

- **Q2** — The owner adds the vault path to the sandbox's writable paths themselves; agents can't.
  - The grant is the vault root, plus a `denyWrite` for every path in the vault that holds code run outside the
    sandbox: `_tools`, `.git/hooks`, `.git/config`, `.git/modules`, `.obsidian`, `.claude`, and `.mcp.json`. See
    *Sandbox grant (Q2)*.
  - This was chosen over moving the hook scripts out of the vault, for example into `~/.claude/`. That move
    would protect `_tools`, but git's hooks and config would stay writable, because `wf` must write `.git`. So
    the denies are needed either way. Once they are in place, moving the scripts adds nothing and would cost a
    second install location for `bootstrap` and `doctor` to keep in sync.
- **Q14** — `wf` writes and commits in the main checkout (`git --git-common-dir`). It uses an `mkdir` lock with a
  stale-lock timeout and retries on `index.lock`. It commits only the files the verb touched, as
  `wf(<verb>): repo/effort#NN`. The worktree-to-main sync is deleted, and vault worktrees are no longer used for
  tracker work.
- **Q15** — Enforcement has two layers:
  - A PreToolUse hook denies frontmatter Edits, and Writes that change frontmatter or create a ticket or map file.
    The message names the verb.
  - Bash is not checked; `doctor` catches it.
- **Q7** — The remaining autocommit returns `additionalContext` on failure (it doesn't block) and writes a log
  that `doctor` reports. It still commits each prose Write/Edit.
- **Q27** — Every verb lints the efforts it touched. The Dashboard has a lint panel driven by the read model.
  There is no SessionStart lint.
- `doctor` keeps the install checks and calls the same lint for content; there is one schema.

**Migration and README**

- **Q28** — `wf migrate` may edit seed-once files: Picks (rule moves to frontmatter, body becomes the loader view)
  and Config (missing keys added). Always previewed with `--plan`.
- **Q29** — For a hand-written `## Tickets` list:
  - The text after the last ` — ` becomes the `title` of tickets that don't have one; with no gist, the title
    comes from the slug.
  - The generated block is created.
  - The old list is kept whole in a folded `[!quote]-` callout under the block.
- **Q33** — The README wayfinding section becomes a verb table plus concepts. Narratives are reduced to one line
  of reasoning per rule. The NN-reservation and stub protocol sections are deleted.
- **Q31** — Cleaning up the owner's vault is ticket 05's work on the vault, not this template. See Out of Scope.

Q8–Q11 and Q32 belong to candidate C, which is out of scope. Q22 and Q23 are not recorded in the map, so this
spec locks nothing under those numbers.

## Testing Decisions

What makes a good test here: **a test drives a public interface and asserts on observable results** — exit code,
stdout and `--json`, file contents, git log. It never asserts on internal functions of the store or the CLI, so
that the internals can be refactored freely. There are three test surfaces, and nothing is tested below them.

1. **`wf` through its CLI against a fixture vault.**
   - Each test builds a fresh temporary vault: `git init`, maps and tickets written from a compact description,
     and a manifest at schema version 2. It then runs `wf` as a child process.
   - Every verb gets a happy path and a test for each refused invariant (exit 1 plus the fix hint). Also covered:
     the `--json` shape, usage errors (exit 2), a not-writable vault (exit 2 with the sandbox hint), and an old
     vault schema (exit 2).
   - Concurrency:
     - Two `wf new` processes started together get different NN.
     - Two `wf claim` processes on one ticket: exactly one succeeds.
     - Two `wf resolve` processes on different tickets in one map keep both *Decisions so far* lines.
     - A stale lock is broken; a held lock times out with exit 2.
   - Commits: one commit per verb with the right message, containing only the touched files; written to the main
     checkout when `wf` runs from a vault worktree; nothing written when main is mid-merge.
   - Preservation: unknown keys and key order survive every verb byte-for-byte.
   - `claimed_by` precedence, using an injected env and a fixture git worktree.
2. **The read model through the core.** Pure, in-memory `notes` arrays, no filesystem.
   - Frontier, blocked, stale claims and maps, overdue waits, `unblocks`, pick order for each sort key, every
     lint rule, the map `blocked_by` states, and the rendered tickets block.
   - The prototype's fixture cases are carried over: cross-effort blocker, paused map, a dangling blocker that
     fails closed, a stale claim. Prior art: the ticket-01 prototype tests and its fixture builder.
   - One test loads the core the way Obsidian does (a URL import of the same file) and asserts the same results.
     This guards the "single ESM file, no imports" constraint.
3. **`wf migrate` against a scrubbed snapshot of the owner's real vault.**
   - The fixture keeps real shapes and replaces every repo, effort, slug, title and body text with neutral names:
     34 cross-repo tickets, 31 maps, hand-written `## Tickets` lists with and without gists, a customised Picks
     page, and a Config missing keys.
   - Assertions:
     - A golden `--plan` diff.
     - After `--yes`: zero lint errors of the identity class, `target_repo` set on exactly the 34 tickets, every
       map with a generated block plus its folded original list, Picks with `sort:`.
     - The frontier is equal to the old rule's result wherever the old pages agreed.
     - A second run plans nothing.
     - `--plan` changes nothing on disk.
   - The snapshot is produced by a scrubbing script committed with the tests. The raw vault is never committed.

**Manual acceptance in Obsidian** (listed in `doctor`'s manual section; 01 left these open):

- Every page renders through its stub, its view in `_tools/views/`, and the shared loader (a `dv.view` inside a
  `dv.view`). 01 tested `import()` only in an inline `dataviewjs` block.
- After the core file in the vault is edited, the next render picks up the change without restarting Obsidian.
  This relies on `getResourcePath` adding an mtime query, which is inferred, not yet tested.
- A deliberately broken core shows the loader's own message naming the core file and `doctor`.
- The four pages and `wf frontier` list the same frontier on the fixture vault opened in Obsidian.

**Hooks** are tested as processes: hook JSON goes to stdin, and the tests assert the decision JSON, the
`additionalContext` and the failure log.

**CI:** a GitHub Actions workflow runs `node --test` on every PR and on push to `main`, on Node 18, 20 and 22.
release-please stays as it is.

## Out of Scope

- **Candidate C** (`yarn verify` in the api repo), and **D, E, F** from the architecture review. `wf where` (E)
  can build on `wf` once this ships.
- **Work on the owner's vault**, which is ticket 05:
  - running `wf migrate` on the real vault;
  - deleting the stale setup note, the tracked backup files and an untitled base;
  - removing a dead vault branch and unused vault worktrees (Q31, each listed for
    owner confirmation);
  - the owner's sandbox change (Q2).
- **Bringing other repos' build cards or specs under `wf`.** `wf` manages vault maps and tickets only; cards stay
  in each repo's tracker.
- **Inspecting Bash commands for frontmatter writes.** `doctor` and lint cover this.
- **An index cache or JSON read model** (forbidden, Q35).
- **Mobile Obsidian support** beyond documenting the CommonJS fallback.
- **A verb that creates several tickets at once.**

## Further Notes

- The work spans more than two PRs (core, store and CLI, pages, hooks, migrate, README), so it continues through
  `/to-tickets`. Expected one-way doors:
  - the schema change and `wf migrate`, because they rewrite users' notes;
  - the CLAUDE.md block and the hook rewiring, because they change other people's installs.
  
  These tickets should come after the core and CLI tickets they depend on. The core, CLI and page tickets are
  two-way doors.
- Removing the autocommit's Bash matcher is a choice this spec makes, not a recorded owner decision. Q7 keeps
  per-Write/Edit commits and says nothing about Bash. Reason: once `wf` commits its own writes, the Bash path's
  only remaining job is to catch writes that `doctor`'s clean-tree check already catches. The owner can
  overrule this in review.
- The lock and stale durations are proposals and become named constants. Re-tune them only with evidence.
- Ticket 01's prototype is CommonJS. The production core is ESM and must have no import statements. The
  prototype's `isoDate` tolerance for Luxon and Date values is kept.
