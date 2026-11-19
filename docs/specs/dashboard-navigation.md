# Spec: dashboard navigation — folding, a summary bar, per-tab Effort Tickets

Status: draft for owner review · origin: a grill session on the three Wayfinder pages (*Dashboard*, *Efforts*,
*Effort Tickets*) and a survey of what Obsidian can do for dashboards

## Problem Statement

The three Wayfinder pages were built for a vault with a handful of maps. With many maps and tickets they are
hard to use:

- **Dashboard.** Every section is fully expanded, and each starts with several lines of explanation. With a
  long Frontier, Blocked list and paused/draft tables the page scrolls a long way, and the vault owner can't
  find the section for a given state (🔥 / 🚧 / ⏳ / 🖐 / ⏸ / ✏️ …) without scrolling and reading headings.
- **Dashboard and Efforts headers.** Both pages open with a block of explanatory prose and end with a
  blockquote of rules. It is useful the first time and noise every time after. *Effort Tickets* already folds
  its rules into a collapsed callout; the other two don't.
- **Effort Tickets.** The selected effort is one value per vault, in `localStorage`. Every open copy of the
  page shows the same effort, and clicking a ticket count on *Efforts* broadcasts an event that switches
  **every** open Effort Tickets pane. The owner can't keep two efforts side by side.
- **Folding doesn't stick.** The groups that already fold (paused/draft on *Efforts*, ✅ on *Effort Tickets*)
  reset whenever Dataview redraws the page, which happens on every vault change, including each `wf` write.

## Solution

Keep the stack as it is (Dataview plus what Obsidian ships with; no new community plugin) and change three
things:

1. **One folding behaviour on all three pages.** A section or group folds. Its open/closed state is remembered
   per vault and survives redraws and restarts. Until the owner touches it, a section starts open if it has
   anything in it and closed if it is empty. The low-traffic sections (paused, draft, dropped, decisions) start
   closed.
2. **A summary bar on the Dashboard.** A compact row at the top, sticky while scrolling, with one entry per
   section and its count (lint split into errors and warnings, errors in red, zero counts dimmed). Clicking an
   entry scrolls to that section and opens it if it was folded. Each section heading becomes one line with its
   count. The section's explanation moves into a collapsed `[!info]-` callout under the heading.
3. **Collapsed page headers.** *Dashboard* and *Efforts* keep one or two lines saying what the page is, plus
   the navigation links to the other pages, which stay visible. Everything else moves into a collapsed
   `[!info]-` callout, in the same shape *Effort Tickets* already uses. That includes the rules blockquotes
   at the end of each page.
4. **Effort Tickets per tab.** Each tab showing *Effort Tickets* remembers its own effort. Clicking a ticket
   count on *Efforts* focuses the tab already showing that effort, or opens a new tab if none is. The tab's
   title names its effort (`Tickets · <repo>/<effort>`). A tab opened any other way starts on the effort that
   was selected most recently.

## User Stories

1. As the vault owner, I want a summary bar at the top of the Dashboard with a count per section, so that I
   see at a glance where the work is without scrolling.
2. As the vault owner, I want the summary bar to stay visible while I scroll, so that I can jump between
   sections from anywhere on the page.
3. As the vault owner, I want clicking a summary entry to scroll to that section and open it if folded, so
   that one click always lands on visible content.
4. As the vault owner, I want lint shown as separate error and warning counts with errors in red, so that a
   broken vault is the loudest thing on the page.
5. As the vault owner, I want sections with nothing in them dimmed in the bar, so that the eye skips them.
6. As the vault owner, I want to fold any Dashboard section, so that the page is as short as my current
   focus.
7. As the vault owner, I want each section heading to carry its count, so that a folded section still tells
   me whether it matters.
8. As the vault owner, I want each section's explanation hidden in a collapsed callout, so that headings sit
   close together but the explanation is one click away.
9. As the vault owner, I want empty sections to start folded and non-empty ones to start open, so that the
   default view shows only what has content.
10. As the vault owner, I want paused, draft, dropped and decisions to start folded, so that low-traffic
    sections don't push active work down the page.
11. As the vault owner, I want what I fold or open to stay that way across redraws, `wf` writes and app
    restarts, so that the page doesn't fight me.
12. As the vault owner with two vaults open, I want fold state kept separate per vault, so that one vault's
    layout doesn't leak into the other.
13. As the vault owner, I want the paused/draft groups on *Efforts* and the ✅ group on *Effort Tickets* to
    fold and remember state the same way as the Dashboard, so that all three pages behave alike.
14. As the vault owner, I want the *Dashboard* and *Efforts* headers reduced to what the page is plus
    navigation links, with the rest in a collapsed callout, so that the page starts with data, not prose.
15. As the vault owner, I want the rules blockquotes at the end of *Dashboard* and *Efforts* (including "core
    won't load") inside that same callout, so that the guidance stays findable without taking space.
16. As the vault owner, I want two *Effort Tickets* tabs showing two different efforts, so that I can compare
    or work two efforts side by side.
17. As the vault owner, I want each *Effort Tickets* tab to keep its effort across redraws and app restarts,
    so that my workspace comes back the way I left it.
18. As the vault owner, I want clicking a ticket count on *Efforts* to focus the tab already showing that
    effort, so that I don't pile up duplicate tabs.
19. As the vault owner, I want that click to open a new tab when no tab shows the effort, so that it never
    hijacks a tab I'm using for another effort.
20. As the vault owner, I want changing the effort in one tab to leave other tabs alone, so that tabs are
    independent.
21. As the vault owner, I want each *Effort Tickets* tab titled with its effort, so that I can tell tabs apart.
22. As the vault owner, I want a tab I open by hand to start on the most recently selected effort, so that the
    plain "open the page" path still works as it does today.
23. As the vault owner, I want the tab-title change to fail quietly to the normal title if Obsidian changes its
    internals, so that an Obsidian update never breaks the page.
24. As the vault owner, I want state for tabs that no longer exist cleaned up, so that `localStorage` doesn't
    grow forever.
25. As the vault owner running `doctor`, I want its Efforts ↔ Effort Tickets coupling check to match the new
    per-tab storage, so that it still catches the two pages drifting apart and doesn't flag the new scheme.
26. As an agent changing these pages, I want the fold-default rule, summary counts and per-tab selection rules
    as pure, tested functions, so that I can change them without opening Obsidian.
27. As the vault owner, I want every count in the summary bar to be the same number the section below it
    shows, so that the bar never disagrees with the page.

## Implementation Decisions

### Constraints kept

- **No new plugin.** Dataview plus Obsidian built-ins (callouts, `<details>`, CSS injected by the views). Bases,
  Datacore, Meta Bind, Homepage and similar were surveyed and left out (see *Out of Scope*).
- **The pages keep no rules of their own.** Counts come from the same core functions the sections already
  render through the shared loader. A section's count is the length of what it renders. The `PAGE_LOGIC`
  guard (no own index, no raw-status judging, no clock) still applies to every view touched here.
- **Edit the template, not the vault.** The updater rewrites the three pages and `_tools/` in each vault;
  *Wayfinder Config* and *Wayfinder Picks* stay owner-owned and are not touched.

### Modules

1. **Fold state (new, shared by all three views).** It does two things:
   - **Decide the open state:** given a section id, whether the section has content, and a stored override (if
     any), return open or closed. The rule: a stored override wins. Otherwise the always-folded set (paused,
     draft, dropped, decisions) is closed. Otherwise it is open if it has content, closed if empty.
   - **Remember the state:** store an override only when the owner toggles a section. The key is namespaced
     by page, vault name and section id, the same way the existing selection key is namespaced by vault.
   - The view side renders `<details>` with a `▸/▾` marker in the style *Effort Tickets* already uses, and
     records `toggle` events. A view loads it the way it loads the core today (through the loader path), not
     by copying it.
   - It is not configurable in *Wayfinder Config*: the remembered override already covers personal preference.
2. **Dashboard summary bar (new Dashboard section).** It is a block of its own, first on the page.
   - It renders one entry per Dashboard section, using the section's emoji and count. Lint shows
     `🔴 n · 🟡 m`, and errors are red. A zero count is dimmed.
   - It uses `position: sticky` in reading view.
   - A click scrolls to the section's heading and opens its fold, writing the override as if the owner
     had opened it.
   - The counts come from a pure function that takes the same core outputs the sections render, so the bar
     and the sections can't disagree.
3. **Dashboard sections.** Each section renders inside its fold, with the count in the summary/heading line.
   Its prose explanation moves into a collapsed `[!info]-` callout under the `##` heading. The list of
   Dashboard sections that the page/view wiring checks gains the summary block.
4. **Page headers (Dashboard, Efforts).** The prose header and the closing rules blockquotes are reworked as
   described in *Solution* §3. This is a markdown-only change to the two page notes.
5. **Effort Tickets per-tab selection.** It has a pure part and a view part.
   - **Pure:**
     - Resolving the effort for a tab works in this order: the tab's own stored effort, then the most
       recently selected effort, then the default the page uses today. A stored effort that no longer
       exists falls through to the next step.
     - Pruning drops stored tab entries whose tab id isn't among the live tabs.
     - Finding the tab already showing a given effort, if any.
   - **View:**
     - The tab is identified by its workspace leaf id, which Obsidian saves in its workspace layout, so it
       survives restarts.
     - A selection made in a tab writes that tab's entry and the "most recent" entry. The cross-pane
       `SELECT_EVENT` broadcast that switches every pane is removed.
6. **Efforts → Effort Tickets click.**
   - If a tab already shows the clicked effort, focus it.
   - Otherwise open a new tab on *Effort Tickets* and tell that tab which effort to show. The new tab gets
     the effort the same way a tab opened by hand does: write it as the "most recent" selection before the
     new tab first renders. This keeps the two views coupled through one shared key name, which `doctor`
     already guards.
7. **Tab title.** After rendering, the *Effort Tickets* view sets its tab header to
   `Tickets · <repo>/<effort>`. This goes through Obsidian's internal tab-header element, wrapped so that any
   failure leaves the default title and raises no error.
8. **`doctor`.** The `LS_KEY` / `SELECT_EVENT` coupling check is updated:
   - `SELECT_EVENT` is no longer required.
   - The selection key must still be declared identically in both views and still be namespaced by vault.
   - The per-tab key must derive from that same declaration.

## Testing Decisions

- A good test drives the views or pure functions from the outside, with a fixture vault and the Dataview
  stand-in, and asserts what the owner would see: counts, which folds are open, which effort a tab shows. It
  never asserts internal call order.
- **Pure functions** get unit tests with `node --test`, Arrange-Act-Assert, and names that describe behaviour:
  - fold default and override resolution, including the always-folded set and the empty/non-empty rule;
  - summary counts (each count equals its section's rendered length, and the lint error/warn split);
  - per-tab effort resolution, pruning, and finding an existing tab.
- **Dashboard wiring.** Extend the existing Dashboard test (Dataview stand-in over a fixture vault) so that:
  - the summary block exists and its counts match the sections for the same scenario;
  - every section still renders through the core.
- **Page-logic guard.** The existing `PAGE_LOGIC` check runs over the changed views and must stay clean.
- **`doctor`.** Extend its existing coupling-check tests:
  - matching per-tab declarations pass;
  - a mismatched key fails;
  - a leftover raw `LS_KEY` use still fails.
- **UI by eye in Obsidian** (not automatable here):
  - the bar is sticky, and clicking an entry scrolls to the section and opens it;
  - folds survive a `wf` write and a restart;
  - two tabs hold two efforts;
  - clicking from *Efforts* focuses an existing tab or opens a new one;
  - the tab title is set.
- Prior art: the Dashboard, Efforts and Effort Tickets view tests, the page-logic guard, and the `doctor`
  tests in `test/`.

## Out of Scope

- New community plugins (Meta Bind, Homepage, Style Settings, Kanban, Charts, Iconize) and moving pages to
  **Bases** or **Datacore**. These are candidates for a later effort.
- A summary bar on *Efforts* (the page is already short) or on *Effort Tickets*.
- Fold defaults configurable from *Wayfinder Config*.
- Opening *Effort Tickets* for an effort through its `map.md` (embedding the view in each map).
- Any change to what a section contains, how it sorts, or the core's rules.

## Further Notes

- Suggested split into build tickets, independent of each other:
  1. fold state, the summary bar, and Dashboard sections, including adoption on *Efforts* and
     *Effort Tickets*;
  2. the collapsed headers on *Dashboard* and *Efforts*;
  3. *Effort Tickets* per tab, the *Efforts* click, the tab title, and `doctor`.

  Ticket 2 is markdown-only. Tickets 1 and 3 both touch the *Effort Tickets* view (fold adoption vs.
  selection), so whichever lands second rebases on the first.
- `localStorage` in Obsidian belongs to the whole app, not the vault. Every key this spec adds is namespaced
  by vault name, following the existing selection key.
