## Agent skills

### Issue tracker

Build tickets are GitHub issues on `metasP/wayfinder-template` labelled `build` (no Project board); specs are
`docs/specs/<slug>.md` opened as a PR labelled `spec`. See `docs/agents/issue-tracker.md`.

### Trying template changes in the vault — `/implement`

When a ticket changes anything the template owns (`template/_tools/**`, the root notes, `skills/**`), show it in
the real vault before asking for review — never copy files into the vault by hand:

1. From the worktree: `npm run try-in-vault` — makes every template-owned file in the vault match this worktree
   (uncommitted edits included; a vault behind `main` gets `main`'s files too, so the doctor never lags the
   views), rendered like the installer; backs up what was there under `<vault>/.git/wayfinder-try/` and keeps
   the tried files out of the vault's autocommit; then runs the vault's doctor against this worktree and prints
   the by-eye checklist.
2. Fix any ❌ from the doctor, then hand the user the printed checklist (plus the ticket's AC) to check in Obsidian.
3. After the user has looked: `npm run try-in-vault -- --undo` — or, once the branch is merged into `main`,
   `-- --forget` (keeps the files, drops the backups; never `--undo` after a template update, it would bring
   back the old files). `--status` shows what is on trial; a second worktree is refused until the first is
   undone or forgotten.
