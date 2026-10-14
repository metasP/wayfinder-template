// Running git for the store. wf finds the vault from its own path, so the variables that point git
// at another repository (set inside hooks or `git rebase -x`) are dropped from its environment.
import { spawnSync } from "node:child_process"

const GIT_LOCATION_VARS = ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY"]
const gitEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !GIT_LOCATION_VARS.includes(k)))

/** `git …args` in `cwd` (`input` on stdin): `{ ok, stdout, stderr, why }`, never throws. `why` says what failed. */
export function runGit(cwd, args, { input } = {}) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: gitEnv(), input })
  const ok = !r.error && r.status === 0
  const why = r.error ? `git is not runnable (${r.error.message})` : (r.stderr ?? "").trim()
  return { ok, stdout: r.stdout ?? "", stderr: r.stderr ?? "", why: ok ? "" : why }
}
