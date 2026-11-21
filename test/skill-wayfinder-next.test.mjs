// `wayfinder-next` against the `wf` CLI (spec docs/specs/ticket-store.md, user story 23; issue #25): the
// skill ranks from `wf frontier` and allocates run numbers with `wf bump-runs`, every `wf` command it
// spells out parses against the verb it names, and the output fields it reads exist — so a renamed verb,
// flag or field turns this red, not a chip run.
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { git, makeVault, map, read, seed, ticket, wf } from "./vault.mjs"
import { assertCommandsParse, wfCommands } from "./wf-doc.mjs"

const SKILL = readFileSync(new URL("../skills/wayfinder-next/SKILL.md", import.meta.url), "utf8")
const commands = wfCommands(SKILL)

describe("wayfinder-next skill", () => {
  test("runs wf frontier --json and wf bump-runs by absolute path", () => {
    assert.match(SKILL, /node __VAULT__\/_tools\/wf\.mjs frontier --effort \S+ --json/)
    assert.match(SKILL, /node __VAULT__\/_tools\/wf\.mjs bump-runs \S+ --count \S+ --json/)
  })

  test("every wf command it spells out parses against the real verb", () => {
    assertCommandsParse(commands)
  })

  // stylized-set-kit retro: chips resolved without merging, and the user had to say "merge into main" each time.
  // parallel-run-fixes#03: then "ผ่าน merge" was followed by a second "merge PR เลย" — one go-ahead covers it all.
  // merge-route-fixes#01: chips 04–07 fast-forwarded main in the main checkout while 01–03 merged PRs, so local
  // main went ahead 5 / behind 2 of origin, and a later `reset --hard origin/main` dropped a ticket's test.
  const mergeLines = (re) => [...SKILL.matchAll(re)].map((m) => m[0])
  const EN_MERGE = /^The merge is yours, on one go-ahead:[^\n]*/gm
  const TH_MERGE = /^การ merge เป็นหน้าที่ของ session นี้ และใช้ go-ahead ครั้งเดียว:[^\n]*/gm
  const prRoute = (lines) => lines.find((l) => l.includes("gh pr")) ?? ""
  const noRemoteRoute = (lines) => lines.find((l) => !l.includes("gh pr")) ?? ""

  test("every chip prompt makes the session own the merge, on one go-ahead, by one route: a PR, then pull --ff-only", () => {
    const en = prRoute(mergeLines(EN_MERGE))
    const th = prRoute(mergeLines(TH_MERGE))
    assert.match(en, /one route, a PR[^\n]*rebase origin\/main[^\n]*gh pr create[^\n]*CI is green[^\n]*gh pr merge[^\n]*pull --ff-only[^\n]*then resolve/)
    assert.match(th, /ทางเดียวคือ PR[^\n]*rebase origin\/main[^\n]*gh pr create[^\n]*CI เขียว[^\n]*gh pr merge[^\n]*pull --ff-only[^\n]*resolve/)
    for (const line of [en, th]) {
      assert.doesNotMatch(line, /if the work has a PR|ถ้างานมี PR/, "the PR is still optional")
      assert.match(line, /reset/, "the prompt does not forbid resetting main")
      assert.match(line, /origin\/main/, "unmerged-branch is not said to measure against origin/main")
    }
  })

  // nova-dance-retro-fixes#06: the blender repo has no remote, yet its chips got the PR line — five sessions ran
  // `git fetch origin`, got exit 128, and only then turned to rebase + merge --ff-only.
  test("a repo with no remote gets a merge line with no origin, no PR and no CI, picked by git remote", () => {
    const [start, end] = [SKILL.indexOf("## Chip prompt template"), SKILL.indexOf("## This session never works")]
    const template = SKILL.slice(start, end)
    assert.match(template, /`<merge line>`[^\n]*git -C <main checkout> remote/, "the skill does not say how to pick the merge line")
    const blocks = template.split(/^`th`:$/m)
    for (const block of blocks) {
      const prompt = block.slice(block.indexOf("/wayfinder work through the map"))
      assert.match(prompt, /^<merge line>$/m, "the chip prompt does not take the picked merge line")
    }
    for (const lines of [mergeLines(EN_MERGE), mergeLines(TH_MERGE)]) {
      assert.equal(lines.length, 2, "each language has a PR line and a no-remote line")
      const line = noRemoteRoute(lines)
      for (const gone of ["origin", "gh pr", "CI", "fetch", "push"])
        assert.ok(!line.includes(gone), `the no-remote line still says ${gone}`)
      assert.match(line, /git rebase main[^\n]*test[^\n]*git -C <main checkout> merge --ff-only <branch>[^\n]*resolve/)
      assert.match(line, /reset/, "the no-remote line does not forbid resetting main")
      assert.ok(line.length < prRoute(lines).length, "the no-remote line is not shorter")
    }
  })

  // merge-route-fixes#02: the conductor relayed "ผ่าน" to chips 01–07 by SendMessage, auto mode refused every
  // push/merge on it, and Tong typed the approval again in each chip.
  test("the go-ahead is the user's own words in the chip; a relayed approval doesn't count", () => {
    for (const en of mergeLines(EN_MERGE)) assert.match(en, /typed by the user in this session[^\n]*relayed[^\n]*doesn't count/)
    for (const th of mergeLines(TH_MERGE)) assert.match(th, /ผู้ใช้พิมพ์เองในหน้านี้[^\n]*ส่งต่อ[^\n]*ไม่นับ/)
    const notes = SKILL.slice(SKILL.indexOf("## Notes"))
    assert.match(notes, /\*\*Approval happens in the chip\.\*\*[^\n]*never relay/, "the starting session may still relay approvals")
  })

  // merge-route-fixes#03: tickets built on unmerged PR #73, copied its files into the vault by hand, and
  // `bootstrap --yes` from main wiped them; nobody had said "merge #73 first".
  test("a ticket that builds on an open PR is flagged, and its chip and the map's Notes say merge #NN first", () => {
    const validate = SKILL.slice(SKILL.indexOf("## Validate before spawning"), SKILL.indexOf("## Workflow"))
    assert.match(validate, /^\| \*\*PR ไม่ merge\*\* \|[^\n]*gh pr view NN --json state[^\n]*OPEN/m)
    assert.match(validate, /- `en`: `⚠️ This ticket builds on PR #73, which is not merged — merge #73 first/)
    assert.match(validate, /- `th`: `⚠️ ใบนี้ต่อยอดบน PR #73 ที่ยังไม่ merge — merge #73 ก่อน/)
    assert.match(validate, /`Notes` section doesn't say it yet, add the line `- ใบ <NN> ต่อยอดบน PR #<N> — merge #<N> ก่อน`/)
  })

  // parallel-run-fixes#03: every set-kit session spent 4–20 commands re-reading the map, the ticket and the README,
  // guessed the claim ref wrong, and opened with `echo ======` that the zsh hook refused.
  test("the chip prompt carries the ticket, the map's decisions and a wf cheat sheet", () => {
    const [start, end] = [SKILL.indexOf("## Chip prompt template"), SKILL.indexOf("## This session never works")]
    assert.ok(start >= 0 && end > start, "the chip prompt template section moved")
    const template = SKILL.slice(start, end)
    for (const block of template.split(/^`th`:$/m)) {
      assert.match(block, /<the ticket's `## Question` section, verbatim>/, "the prompt does not carry the ticket")
      assert.match(block, /<the map's `## Decisions so far` lines, verbatim/, "the prompt does not carry the decisions")
      for (const verb of ["claim", "show", "resolve", "wait", "release", "lint", "map-status"])
        assert.match(block, new RegExp(`node __VAULT__/_tools/wf\\.mjs ${verb} `), `the cheat sheet has no wf ${verb}`)
      assert.match(block, /resolve <ref> --gist "[^"]*" --answer-file /, "the cheat sheet does not resolve from a worktree")
      assert.match(block, /`echo ---`/, "the prompt does not say echo ---")
    }
    assert.match(template, /`<ref>`[^\n]*`data\.ref`/, "the skill does not say what fills <ref>")
  })

  // The desktop harness dropped spawn_task; an "offer" start shows a Do it here button that turned a
  // planning session into a build session, and an app-picked worktree name hid the session from a retro.
  test("starts sessions with start_session user_asked, on a branch named after the ticket", () => {
    assert.doesNotMatch(SKILL, /spawn_task/, "the skill still names spawn_task")
    assert.match(SKILL, /mcp__ccd_session__start_session/)
    assert.match(SKILL, /`initiation`: \*\*`"user_asked"`\*\*/)
    assert.match(SKILL, /`branch_name`: \*\*`<effort>-<NN>`\*\*/)
    assert.match(SKILL, /## This session never works the ticket/)
    assert.match(SKILL, /never runs `wf claim`/)
  })

  // set-kit-retro-fixes#09: after the map closed, /retro waited for the user to type it.
  test("closes a complete map with wf map-status done and leaves a /retro card from its retro_prompt", () => {
    assert.match(SKILL, /node __VAULT__\/_tools\/wf\.mjs map-status \S+ done --json/)
    assert.match(SKILL, /`data\.retro_prompt`/)
    assert.match(SKILL, /\*\*Close a complete map\.\*\*[^\n]*`"own_initiative"`/)
  })

  // The app names the branch from branch_name but picks or recycles the folder itself; the skill checks
  // the branch after starting and warns, and the claim commit's trailers keep the session findable.
  test("checks each started session's branch for <effort>-<NN>, and warns", () => {
    assert.match(SKILL, /\*\*Check where each session landed\.\*\*[^\n]*mcp__ccd_session_mgmt__list_sessions` `\{"linked": true\}`/)
    assert.match(SKILL, /branch should contain `<effort>-<NN>`[^\n]*\*\*warn\*\*/)
    assert.match(SKILL, /`Session:` \/ `Cwd:` \/ `Branch:` trailers/)
  })

  // parallel-run-fixes#05: start_session has no folder name — the app recycles folders. merge-route-fixes#04:
  // moving with EnterWorktree is what collided with the guard; chips that stayed put were refused 0 times.
  // So the chip checks its branch and works where it landed; the claim's trailers name the ticket.
  test("every chip prompt checks the branch before the claim and stays in the folder it got", () => {
    assert.match(SKILL, /`branch_name`[^\n]*names the branch only[^\n]*recycle/, "step 6 does not say the folder may be recycled")
    assert.match(SKILL, /\*\*Check where each session landed\.\*\*[^\n]*recycled[^\n]*leave it/, "step 7 does not say a recycled folder is left alone")
    const [start, end] = [SKILL.indexOf("## Chip prompt template"), SKILL.indexOf("## This session never works")]
    const blocks = SKILL.slice(start, end).split(/^`th`:$/m)
    assert.equal(blocks.length, 2)
    for (const block of blocks) {
      assert.match(block, /git branch --show-current/, "the prompt does not check the branch")
      assert.ok(block.indexOf("git branch --show-current") < block.indexOf("wf.mjs claim"), "the branch check comes after the claim")
      for (const gone of ["EnterWorktree", "ExitWorktree", "git worktree add", "switch --detach"])
        assert.ok(!block.includes(gone), `the prompt still moves worktrees (${gone})`)
    }
  })

  // parallel-run-fixes#07: the user typed /wayfinder-next after every ticket, and "close the map, open the retro"
  // after the last one, while the coordinating session reported "still waiting for 3" six times.
  test("after resolving, the ticket session offers the next chips in its wrap_up or closes the map itself", () => {
    const [start, end] = [SKILL.indexOf("## Chip prompt template"), SKILL.indexOf("## This session never works")]
    for (const block of SKILL.slice(start, end).split(/^`th`:$/m))
      assert.match(block, /wayfinder-next[^\n]*`after <NN>`/, "the chip prompt does not run the after-resolve step")
    assert.match(SKILL, /^\| `after <NN>` \|/m, "the arguments table has no after <NN> row")
    const after = SKILL.slice(SKILL.indexOf("### After a ticket resolves"), SKILL.indexOf("## Validate before spawning"))
    assert.match(after, /`wrap_up`[^\n]*`actions\[0\]`/, "next chips are not offered as a wrap_up button")
    assert.match(after, /Don't call `start_session`/, "the after step starts sessions without a click")
    assert.match(after, /\*\*claimed\*\* ticket/, "the walk ignores tickets other sessions are working")
    assert.match(after, /\*\*Map complete\*\*[^\n]*without asking[^\n]*map-status/, "the last ticket does not close the map")
    assert.match(SKILL, /\*\*The session that started the chips reports changes only\.\*\*[^\n]*never write "still waiting/)
  })

  test("takes the batch from the frontier's round 1 instead of judging collisions itself", () => {
    assert.match(SKILL, /\*\*The batch is the first 3 rows with `round: 1`\*\*/)
    assert.match(SKILL, /`collides_with`/)
    assert.match(SKILL, /wf\.mjs touches <ref> <glob>…/)
  })

  test("leaves runs to bump-runs and ranking to frontier", () => {
    assert.doesNotMatch(SKILL, /\bruns:/, "the skill still edits runs: itself")
    assert.doesNotMatch(SKILL, /urgen|unblocks the most|lowest[- ]number|tie-break|parallel-safe/i, "the skill still ranks")
  })

  // Issue #36: the fog ticket is commissioned with `wf new`, which takes NN under the lock and writes the
  // file — the guard refuses a hand-made create, and a guessed NN can collide.
  test("commissions a fog ticket with wf new, never a reserved NN or a hand-made file", () => {
    assert.match(SKILL, /node __VAULT__\/_tools\/wf\.mjs new \S+ --type \S+ --title "[^"`]*" --question "[^"`]*" --json/)
    assert.match(SKILL, /\*\*NN\*\* is the number after `#` in `data\.ref`/, "the chip's NN is not the one wf new printed")
    assert.doesNotMatch(SKILL, /reserv/i, "the skill still reserves an NN")
    assert.doesNotMatch(SKILL, /highest(?: existing NN)? \+ 1/, "the skill still computes NN = highest + 1")
    assert.doesNotMatch(SKILL, /แตกเป็น issues\/|สร้างไฟล์[^\n]*issues\//, "the skill still tells a session to create a ticket file")
    for (const [sentence] of SKILL.matchAll(/[^.\n]*\b(?:creat|writ)\w*\b[^.\n]*issues\/[^.\n]*/gi))
      assert.match(sentence, /\bnever\b/i, `the skill still tells a session to create a ticket file: ${sentence}`)
  })

  test("the chip prompt template has no fog-specific line", () => {
    const [start, end] = [SKILL.indexOf("## Chip prompt template"), SKILL.indexOf("## Notes")]
    assert.ok(start >= 0 && end > start, "the chip prompt template section moved")
    const template = SKILL.slice(start, end)
    assert.doesNotMatch(template, /fog|has no file yet|ยังไม่มีไฟล์/)
  })

  test("a map with every ticket resolved gets exactly one ticket file, written and committed by wf new", () => {
    const vault = seed(
      makeVault({
        notes: [
          map("r/e/map.md"),
          ticket("r/e/issues/01-one.md", { status: "resolved" }),
          ticket("r/e/issues/02-two.md", { status: "resolved" }),
        ],
      }),
    )
    const issues = () => readdirSync(join(vault, "r/e/issues")).sort()
    const before = issues()
    const frontier = wf(vault, ["frontier", "--effort", "r/e", "--json"])
    assert.equal(frontier.code, 0, frontier.stderr)
    assert.deepEqual(frontier.json.data.tickets, [], "an all-resolved map has no frontier row")

    // The skill's own `wf new` line, its placeholders filled in as the agent would.
    const line = commands.find((c) => c.verb === "new" && c.argv.length)?.text
    assert.ok(line, "the skill spells out no wf new command")
    const filled = line
      .replace("<repo/effort>", "r/e")
      .replace("<type>", "grilling")
      .replace('"<title>"', '"Pick the payment step"')
      .replace("<question>", "Which payment step goes first?")
    const argv = filled.match(/"[^"]*"|\S+/g).slice(1).map((arg) => arg.replace(/^"(.*)"$/, "$1"))
    const created = wf(vault, argv)
    assert.equal(created.code, 0, created.stderr)

    const nn = created.json.data.ref.split("#").pop()
    assert.equal(nn, "03")
    assert.deepEqual(issues(), [...before, created.json.data.path.split("/").pop()].sort(), "wf new wrote exactly one ticket file")
    assert.match(created.json.data.path, /^r\/e\/issues\/03-/)
    const note = read(vault, created.json.data.path)
    assert.match(note, /^type: "?grilling"?$/m)
    // The short title is read from the bold line under `## Question`.
    assert.match(note, /## Question\n\n\*\*Which payment step goes first\?\*\*\n/)
    assert.equal(git(vault, "status", "--porcelain"), "", "wf committed its own write; nothing was written by hand")
  })

  test("the output fields it reads are the ones wf prints", () => {
    const vault = makeVault({
      notes: [map("r/e/map.md"), ticket("r/e/issues/01-one.md", { target_repo: "lib" }), ticket("r/e/issues/02-two.md")],
    })
    const frontier = wf(vault, ["frontier", "--effort", "r/e", "--json"])
    assert.equal(frontier.code, 0, frontier.stderr)
    for (const key of ["ref", "repo", "effort", "nn", "type", "title", "target_repo", "round", "touches", "collides_with"])
      assert.ok(key in frontier.json.data.tickets[0], `frontier rows have no ${key}`)

    const bump = wf(vault, ["bump-runs", "r/e", "--count", "2", "--json"])
    assert.equal(bump.code, 0, bump.stderr)
    assert.deepEqual(
      { ref: bump.json.data.ref, from: bump.json.data.from, to: bump.json.data.to, runs: bump.json.data.runs },
      { ref: "r/e", from: 1, to: 2, runs: 2 },
    )

    const refused = wf(vault, ["bump-runs", "r/nowhere", "--json"])
    assert.equal(refused.code, 1)
    assert.match(refused.json.error.details.join("\n"), /^fix: /m, "an invariant refusal carries its fix in error.details")
  })
})
