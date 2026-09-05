# Install & update

> **🚧 Stub — this file is written by ticket `08-install-doc-bilingual`.**
> It depends on `bootstrap.mjs` (ticket `03`), which is still being written. Do not
> guess the command from this page — there isn't one here yet, on purpose.

What this page will cover:

1. **Clone** this repo, then point an agent at it: *"install wayfinder from this repo"*.
2. The installer asks before touching anything outside the vault — following the
   5-step protocol: inspect → report → ask → act only on what you chose → verify and summarise.
   It also asks **where to put the skills** (default `~/.claude/skills/`; if it finds a
   symlink there it follows it and writes to the real destination).
3. It creates `Wayfinder Config.md` and `Wayfinder Picks.md` — **your** files, never
   touched again by any later update.
4. It adds a wayfinder paragraph to `~/.claude/CLAUDE.md`. **This is the only thing that
   tells `/wayfinder` where the vault is.** Skip it and the skill will follow whatever
   issue-tracker convention the currently-open repo has, and your maps will not land in
   the vault.
5. **Update:** `git pull` here, then tell the agent *"update"*. `template/` is replaced
   wholesale; your efforts and the two files above are not touched.

Health checks and troubleshooting for an already-installed vault live in the vault's own
`SETUP.md` (shipped as `template/SETUP.md`).

Thai: [`INSTALL.th.md`](INSTALL.th.md)
