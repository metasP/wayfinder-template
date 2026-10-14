#!/usr/bin/env bash
# Claude Code PostToolUse hook — the path `~/.claude/settings.json` wires on Write|Edit (bootstrap).
# It only hands the hook JSON to `_tools/autocommit.mjs`, which commits the edited prose file and,
# when it can't, tells the agent through `additionalContext` and appends to a failure log
# (spec docs/specs/ticket-store.md, *New autocommit (Q7)*). Bash events are ignored there.
#
# Manual test:
#   echo '{"tool_name":"Edit","tool_input":{"file_path":"<a file in the vault>"}}' | _tools/autocommit.sh

set -u

# `__VAULT__` is a placeholder the installer renders by replacing the **whole line**
# (`sed 's|^VAULT=.*|VAULT="<vault path>"|'`), so the fallback line below survives.
VAULT="__VAULT__"

# Not rendered (or rendered to the wrong place) ⇒ the standard install location from `SETUP.md`.
[ -d "$VAULT/.git" ] || VAULT="$HOME/Documents/Git/wayfinder-vault"

# settings.json discards stderr and the exit code, so a hook that can't start must say so on stdout
# as hook JSON — or every edit after this goes uncommitted without a word.
say() {
  local text=${1//\\/\\\\}
  text=${text//\"/\\\"}
  text=${text//[$'\t\n\r']/ }
  printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"wayfinder autocommit: this edit was not committed: %s"}}\n' "$text"
  exit 0
}

command -v node >/dev/null 2>&1 || say "node is not on the PATH of Claude Code hooks. Install Node 18+ (or put it on that PATH), then commit the file by hand."
[ -f "$VAULT/_tools/autocommit.mjs" ] || say "$VAULT/_tools/autocommit.mjs is missing. Re-run the wayfinder-template bootstrap for this vault, then commit the file by hand."

exec node "$VAULT/_tools/autocommit.mjs"
