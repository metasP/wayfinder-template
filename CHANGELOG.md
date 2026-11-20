# Changelog

Each version is the `version` in [`package.json`](package.json); an `npx` install records it in
the vault manifest as `template_version`. Every release is a git tag `vX.Y.Z` (there was never a
0.2.3).

Releases after 0.4.0 are cut by [release-please](https://github.com/googleapis/release-please):
it reads the conventional-commit messages merged to `main`, keeps a release PR open that bumps
`package.json` and adds the next section here, and merging that PR tags the release and drafts its
GitHub release notes. `feat` bumps the minor version, `fix` the patch, and while the version is
below 1.0.0 a breaking change (`feat!`) bumps the minor too.

## [0.7.0](https://github.com/metasP/wayfinder-template/compare/v0.6.0...v0.7.0) (2026-11-20)


### Features

* bootstrap stops before overwriting vault-only changes; stale-pr warning (merge-route-fixes[#03](https://github.com/metasP/wayfinder-template/issues/03)) ([779cc04](https://github.com/metasP/wayfinder-template/commit/779cc048408889cfebab0e7ba5c6414400d9b4f5))
* bootstrap update stops before overwriting vault-only changes; resolve warns about stale PRs ([9394f92](https://github.com/metasP/wayfinder-template/commit/9394f92752468d575ebce3ce3e161a688fe3c7e5))
* chip prompt carries the ticket, decisions and a wf cheat sheet; one go-ahead merges ([7e9153f](https://github.com/metasP/wayfinder-template/commit/7e9153fc79b3e0c2c3cffe260ec3e89b91885844))
* chip prompt carries the ticket, decisions and a wf cheat sheet; one go-ahead merges ([4f465a8](https://github.com/metasP/wayfinder-template/commit/4f465a86c01a6977b5d2d93a93d3e0546c0de646))
* closing a map leaves a /retro side-session card ([10bf349](https://github.com/metasP/wayfinder-template/commit/10bf34970d24acc6de91a5742b4df699092331c6))
* closing a map leaves a /retro side-session card, not a reminder ([08afe70](https://github.com/metasP/wayfinder-template/commit/08afe70724ae0ba5711e968ccc2e2c0c8dcaee58))
* Dashboard folds with remembered state + sticky summary bar ([cc55d6b](https://github.com/metasP/wayfinder-template/commit/cc55d6b30fac411a92cf66579c3b9e2b9faae103))
* Dashboard folds with remembered state and a sticky summary bar ([d91e33d](https://github.com/metasP/wayfinder-template/commit/d91e33dcc9684661baac667444781fe81ade0ad2)), closes [#79](https://github.com/metasP/wayfinder-template/issues/79)
* Effort Tickets keeps its effort per tab; Efforts focuses or opens a tab ([d955b9f](https://github.com/metasP/wayfinder-template/commit/d955b9f79a9182364ffa5df58c4bae557e05f67f)), closes [#81](https://github.com/metasP/wayfinder-template/issues/81)
* Effort Tickets keeps its effort per tab; Efforts focuses or opens a tab ([#81](https://github.com/metasP/wayfinder-template/issues/81)) ([0ccd220](https://github.com/metasP/wayfinder-template/commit/0ccd220084795b68d9515dfec2f23fd467b03091))
* npm run try-in-vault — try the worktree's template in the vault in one undoable command ([5d678a3](https://github.com/metasP/wayfinder-template/commit/5d678a3440c0932065e53e8e5ebf4f9df6a0cb62))
* npm run try-in-vault puts the worktree's template into the vault in one undoable command ([7f3d1bb](https://github.com/metasP/wayfinder-template/commit/7f3d1bb91b4c24b9ca8ac8fcd8203d3b649e367d))
* README names the template-owned files; doctor --template flags drift ([fd3265a](https://github.com/metasP/wayfinder-template/commit/fd3265a4214575703e80e6cf235bc38226a9fe2b))
* README names the template-owned files; doctor --template flags drift ([247431d](https://github.com/metasP/wayfinder-template/commit/247431da5c9dfee10367afffcaee218d94756847))
* ticket session offers the next chip after resolve; the last one closes the map ([1ac5475](https://github.com/metasP/wayfinder-template/commit/1ac547591fe99c372a65f1175013ad2b825e4be0))
* tickets declare touches:, wf frontier deals the frontier into rounds that don't collide ([11c3992](https://github.com/metasP/wayfinder-template/commit/11c39928f2d0282cf77d8caa6fb7c5bc7056c556))
* unmerged-branch — the ticket's session owns the merge into main ([914f2b5](https://github.com/metasP/wayfinder-template/commit/914f2b5aebbdd5113a440de14fa7098c2c86142c))
* unmerged-branch — the ticket's session owns the merge into main ([f396bfc](https://github.com/metasP/wayfinder-template/commit/f396bfc53b8915ac3c7dd3b09d13e135605088d8))
* wf resolve ticks the ticket's ## Build board line; lint flags unticked lines ([ad2777e](https://github.com/metasP/wayfinder-template/commit/ad2777e525202e8cad8b7f895898bc8de93ee2d3))
* wf resolve ticks the ticket's ## Build board line; lint flags unticked lines ([68f09cf](https://github.com/metasP/wayfinder-template/commit/68f09cf18985223ab13e2728940d3f829b836bb9))
* wf takes a ticket ref as repo/effort NN too; help and bad-ref errors list the forms ([f0b0183](https://github.com/metasP/wayfinder-template/commit/f0b01834f01aed68e3b53649365d04f5c621f439))


### Bug Fixes

* chip leaves its EnterWorktree folder before git -C &lt;main checkout&gt; at the merge ([fa31770](https://github.com/metasP/wayfinder-template/commit/fa317704d4d16c36ec39832c8ab387c1325daadb))
* chip moves itself into a &lt;effort&gt;-&lt;NN&gt; worktree before it claims ([7d050eb](https://github.com/metasP/wayfinder-template/commit/7d050ebd32c9a706ac563f720933e28abd2593e2))
* chips merge one way (PR); unmerged-branch measures origin/main; doctor warns when main leaves origin ([e5638e9](https://github.com/metasP/wayfinder-template/commit/e5638e9b7e9b49476c89bc09c968102bf9eaee33))
* chips merge one way (PR); unmerged-branch measures origin/main; doctor warns when main leaves origin ([d6b56d5](https://github.com/metasP/wayfinder-template/commit/d6b56d54d25d187968a6c32a8c7f6de74c48088c))
* guard skips dropped skills the prune keeps; stale-pr matches the PR's head oid, not its branch name ([c2ba898](https://github.com/metasP/wayfinder-template/commit/c2ba898a430e6e6dec1b975cb3e6eb7dc51c566c))
* touches overlap expands braces (nested, across /), reads broken patterns conservatively, ignores case ([5e0896a](https://github.com/metasP/wayfinder-template/commit/5e0896abd1cce1fa4d6197de5e3dcf52932fcdf7))
* unmerged PR fix fetches first and sets --base; doctor drift quotes paths and reads each claim dir once ([2bd9d64](https://github.com/metasP/wayfinder-template/commit/2bd9d64f0a4f0951020b0efaf49775fb5cf4116b))
* unmerged PR fix pushes without force; chip prompt names the no-origin route ([020fd12](https://github.com/metasP/wayfinder-template/commit/020fd121c94bc0fcc694795ce782e44a66935ce8))
* unmerged-branch checks the branch recorded at claim, not the worktree's HEAD ([c89c758](https://github.com/metasP/wayfinder-template/commit/c89c7586b0cc3c9886d9d8e8621e39de4307daa9))
* unmerged-branch finds a claim's branch by name when the claim has no Branch: ([3f185bf](https://github.com/metasP/wayfinder-template/commit/3f185bfe8a552b91e89de215ad6a428d3e03b2bb))
* unmerged-branch finds a claim's branch by name when the claim has no Branch: ([74f4db8](https://github.com/metasP/wayfinder-template/commit/74f4db8d5f9061e51f06db608bff46da5631f529))
* wf retro papercuts — waiting resolves directly, short resolve line, frontier --effort ([bc7893e](https://github.com/metasP/wayfinder-template/commit/bc7893ed489423b9635b7859ed1280a49910bf6c))


### Documentation

* chips take the go-ahead only from the user in their own page ([7f2cecb](https://github.com/metasP/wayfinder-template/commit/7f2cecb3995194fc0d7991dcf8da4370b10e8e5a))
* chips take the go-ahead only from the user in their own page; the conductor points at the chip instead of relaying ([a905ef5](https://github.com/metasP/wayfinder-template/commit/a905ef5821cf7fb7e8275b1b042ad7e730a884f2))
* collapse Dashboard and Efforts page headers into an [!info]- callout ([b685044](https://github.com/metasP/wayfinder-template/commit/b685044de371b5da3553436c2758f81485803e75))
* collapse Dashboard and Efforts page headers into an [!info]- callout ([6ac9758](https://github.com/metasP/wayfinder-template/commit/6ac9758de3a312db9e8690d54a20e45ee1b1649d)), closes [#80](https://github.com/metasP/wayfinder-template/issues/80)
* spec — dashboard navigation (folding, summary bar, per-tab Effort Tickets) ([b0d7266](https://github.com/metasP/wayfinder-template/commit/b0d7266b56c291a805593ee3bd5353f90235f0f4))
* spec for dashboard navigation — folding, summary bar, per-tab Effort Tickets ([dbf0157](https://github.com/metasP/wayfinder-template/commit/dbf0157880d96f0fb8a3b27f97b6c39498842dc7))

## [0.6.0](https://github.com/metasP/wayfinder-template/compare/v0.5.0...v0.6.0) (2026-10-30)


### Features

* **guard:** deny main-checkout edits from a desktop worktree with the recipe that works ([9533f59](https://github.com/metasP/wayfinder-template/commit/9533f5937e8672b48178482bd4a173fc0cd3bc81))
* lint what a note's body says, and refuse done while the effort has lint errors ([2212a2b](https://github.com/metasP/wayfinder-template/commit/2212a2bf1f35308b05bc2656b0ce1879cb55f0f2))
* wf claim records the session in its commit; wayfinder-next checks where sessions landed ([84980c9](https://github.com/metasP/wayfinder-template/commit/84980c929716ebb6856183859e4bcec527911f60))
* **wf:** add wf show — a ticket plus the map lines that bear on it ([841ccb3](https://github.com/metasP/wayfinder-template/commit/841ccb3985045c64487be06b418dbc8573f84425))
* **wf:** add wf stats — a map's span minus waiting and long gaps ([b2b3ed4](https://github.com/metasP/wayfinder-template/commit/b2b3ed48e407c91d95946ca597bf114845c07ca6))
* **wf:** release and wait refuse a claim someone else holds ([217576f](https://github.com/metasP/wayfinder-template/commit/217576fab2bb14748e345157037857f61e9e4ab9))
* **wf:** resolve --answer-file, and warn when a worktree's ticket differs from main ([a909f40](https://github.com/metasP/wayfinder-template/commit/a909f40e46c6388bc2d8d811d26fc156a6755b4f))
* **wf:** serial maps — claim refuses a second claimed ticket unless --force ([198c95e](https://github.com/metasP/wayfinder-template/commit/198c95e58ef3fbc0e9c53865d1ae8f886470e0d5))
* **wf:** take type letters, repo/effort/NN refs, and say --from only sorts ([042d674](https://github.com/metasP/wayfinder-template/commit/042d6741494ef8433ad668504fc5c49fdce7567d))


### Bug Fixes

* fold a flood of lint warnings and print errors last ([a0febc0](https://github.com/metasP/wayfinder-template/commit/a0febc0c30c7ca7ab6ca0c44847115784c7c72be))
* give tickets claimed before wf a placeholder claimed_by on migrate ([262dd88](https://github.com/metasP/wayfinder-template/commit/262dd88ebbe22da2b842edd90f3c0981dbc6467d))
* read wf:tickets markers only on their own line, and lint unindexed issue files ([06cf3f5](https://github.com/metasP/wayfinder-template/commit/06cf3f58298628a9e9c878327309c1f50a852ecd))
* wayfinder-next starts sessions with start_session, named after the ticket ([56061fb](https://github.com/metasP/wayfinder-template/commit/56061fbfdd16121c98b5657a4d45bd550b1bcdd8))


### Documentation

* **wf:** list wf show after wf lint in the verb tables ([979f913](https://github.com/metasP/wayfinder-template/commit/979f913b0e393551131630a19de1623337ed8c56))

## [0.5.0](https://github.com/metasP/wayfinder-template/compare/v0.4.0...v0.5.0) (2026-10-14)


### ⚠ BREAKING CHANGES

* a 0.4.x vault must be migrated once, to vault schema 2, with `wf migrate`. Tickets and maps lose `repo` and `effort` (the folder is the identity; a ticket that changes another repo keeps it as `target_repo`) and gain `title`, a map's hand-written `## Tickets` list becomes a block that `wf` generates, *Wayfinder Picks* keeps its order as a `sort:` key, *Wayfinder Config* gains its new keys, and agents change tracker state with `node <vault>/_tools/wf.mjs <verb>` instead of editing frontmatter. That is so the invariants hand edits kept breaking (tickets vanishing from the Dashboard, drifting ticket lists, pages disagreeing on the frontier) are checked on every write, and the Dataview pages and `wf` share one core. To upgrade, run `npx https://github.com/metasP/wayfinder-template --plan` (not the vault's own `_tools/bootstrap.mjs`), review the `wf migrate` diff, rerun with `--yes`, add the vault path to Claude Code's sandbox writable paths, then run `node <vault>/_tools/doctor.mjs`. See INSTALL.md § Upgrading from 0.4.x.
* an update applies only with `--yes`; without it, it is a dry run that exits 2. From 0.4.x, update with npx or the repo's bootstrap, not the vault's own copy.

### Features

* add core lint() with every content rule as findings ([32cfb05](https://github.com/metasP/wayfinder-template/commit/32cfb055162cf816f701b3af1d8b98af1ffb5da9))
* add core lint() with every content rule as findings ([9bf0388](https://github.com/metasP/wayfinder-template/commit/9bf0388a424b4920fe64e5486631a91cad8ef979)), closes [#13](https://github.com/metasP/wayfinder-template/issues/13)
* add frontmatter guard hook that names the wf verb ([57c394f](https://github.com/metasP/wayfinder-template/commit/57c394f89661e2bc20cd1ed873f511e5680009dc))
* add frontmatter guard hook that names the wf verb ([8aa2a0a](https://github.com/metasP/wayfinder-template/commit/8aa2a0a7f6e6bcfa01420dd2bb071b9c6515a60e)), closes [#20](https://github.com/metasP/wayfinder-template/issues/20)
* add pure read-model core with frontier, pick order and CI ([a5e9cb2](https://github.com/metasP/wayfinder-template/commit/a5e9cb248ba5979e8bd7e795c44788600c9a77d4))
* add wf read path with store reader, frontier and lint ([6f5363a](https://github.com/metasP/wayfinder-template/commit/6f5363a876c979b02199384e04de43a4d2acc011))
* add wf read path with store reader, frontier and lint ([398b976](https://github.com/metasP/wayfinder-template/commit/398b97602ab2f4db42d7a0ab733b8174cbb2ca85)), closes [#14](https://github.com/metasP/wayfinder-template/issues/14)
* add wf write pipeline with claim, release, wait and lint --fix ([6e68e64](https://github.com/metasP/wayfinder-template/commit/6e68e64b7976c926ee0d77e2290bc425a8b940dd))
* add wf write pipeline with claim, release, wait and lint --fix ([0820c34](https://github.com/metasP/wayfinder-template/commit/0820c341d9f8189a6b5064966a8cfb9bc944cd50))
* bootstrap applies wf migrate and wires wf into ~/.claude ([3d62615](https://github.com/metasP/wayfinder-template/commit/3d62615122a138704dd44022392eb2841b97b509)), closes [#24](https://github.com/metasP/wayfinder-template/issues/24)
* doctor lints content through the core, checks the new hooks, failure log and vault schema ([801ce7f](https://github.com/metasP/wayfinder-template/commit/801ce7f94037af04f86f5edd5148531a23a08973))
* doctor lints content through the core, checks the new hooks, failure log and vault schema ([2ade466](https://github.com/metasP/wayfinder-template/commit/2ade46682fe0e831ecd980242e1161867c384747)), closes [#22](https://github.com/metasP/wayfinder-template/issues/22)
* Efforts, Effort Tickets and Picks pages on the shared core ([ba48c4c](https://github.com/metasP/wayfinder-template/commit/ba48c4cfc57bea68dce620a1c8be5399f1178295))
* Efforts, Effort Tickets and Picks pages on the shared core ([d093ff1](https://github.com/metasP/wayfinder-template/commit/d093ff120f0f7d71d5d9ee247dd36fa5f5089e08)), closes [#19](https://github.com/metasP/wayfinder-template/issues/19)
* load the core through a shared dv.view loader; Dashboard on the core with a lint panel ([fc26a76](https://github.com/metasP/wayfinder-template/commit/fc26a76e8a491d8b7a6b1ad5bdd35ffad69d5dde)), closes [#18](https://github.com/metasP/wayfinder-template/issues/18)
* move specs and build tickets out of the vault into the work repo's tracker ([4e121d9](https://github.com/metasP/wayfinder-template/commit/4e121d9ae56677885c5bc869f1f4ce3589181ea7))
* move specs and build tickets out of the vault into the work repo's tracker ([a23ca69](https://github.com/metasP/wayfinder-template/commit/a23ca69dcc915bdb492ebc2bbb9f271676599d11))
* new autocommit — no worktree-to-main sync, fails loudly to the agent and to a log ([8bd2e5e](https://github.com/metasP/wayfinder-template/commit/8bd2e5ed923c320067ece43db840ed7083fa3ced))
* new autocommit — no worktree-to-main sync, fails loudly to the agent and to a log ([14ad041](https://github.com/metasP/wayfinder-template/commit/14ad0413583ee71a8b7326fd133f3c852ecd6093)), closes [#21](https://github.com/metasP/wayfinder-template/issues/21)
* read-model core — schema, index, frontier and pick order in one pure ESM module (+ CI) ([0ca64f3](https://github.com/metasP/wayfinder-template/commit/0ca64f31f89202e6247faf60838c4b82ec685241))
* shared core loader view + Dashboard on the core, with a lint panel ([d5f0d7b](https://github.com/metasP/wayfinder-template/commit/d5f0d7b365492e425e150e7eba02b74498f47fbc))
* wayfinder-next commissions a fog ticket with wf new ([85eaa90](https://github.com/metasP/wayfinder-template/commit/85eaa900d6860d1af59168a4b7f9479ffc1bc2dc))
* wayfinder-next commissions a fog ticket with wf new ([912ebe8](https://github.com/metasP/wayfinder-template/commit/912ebe8767daf7e1fb2d04c2114c15c8ef046134))
* wayfinder-next ranks from wf frontier, allocates runs with wf bump-runs ([a009ced](https://github.com/metasP/wayfinder-template/commit/a009cedd9d7f7f8b45e650d8c5eacbf2dce8103e))
* wayfinder-next ranks from wf frontier, allocates runs with wf bump-runs ([4c52a08](https://github.com/metasP/wayfinder-template/commit/4c52a08fd3d18cee7e3dfba0d571ffe744166730)), closes [#25](https://github.com/metasP/wayfinder-template/issues/25)
* wf chart / map-status / bump-runs ([5a383ac](https://github.com/metasP/wayfinder-template/commit/5a383acc32ce38131a9ccc3efb1e28e02741b2c8))
* wf chart / map-status / bump-runs — map transitions under the lock ([64f5ae9](https://github.com/metasP/wayfinder-template/commit/64f5ae9ec89c45b9f95eb8e4d64543856e046390))
* wf migrate takes a vault to schema 2, and the template seeds are schema 2 ([208c223](https://github.com/metasP/wayfinder-template/commit/208c22360782ac784dc6cc0b3ccee9f2cc8883f6))
* wf migrate takes a vault to schema 2, and the template seeds are schema 2 ([d767e6f](https://github.com/metasP/wayfinder-template/commit/d767e6fe279e82533fee04b863dac436c62620e7)), closes [#23](https://github.com/metasP/wayfinder-template/issues/23)
* wf new / resolve / block — atomic NN, Decisions append under lock, cycle-checked blockers ([d433f67](https://github.com/metasP/wayfinder-template/commit/d433f670b9e4cf827799797ef56b7345fdc40dd6))
* wf new / resolve / block — atomic NN, Decisions append under lock, cycle-checked blockers ([03dd5ae](https://github.com/metasP/wayfinder-template/commit/03dd5ae0e069cc547f809d45afd5179d7221fe79)), closes [#16](https://github.com/metasP/wayfinder-template/issues/16)


### Bug Fixes

* bootstrap keeps the first .bak, rereads ~/.claude files before writing, and knows more spellings of its hooks ([5e72c12](https://github.com/metasP/wayfinder-template/commit/5e72c1226bfda958e3fb4adc984cedf098affdf1)), closes [#47](https://github.com/metasP/wayfinder-template/issues/47)
* bootstrap keeps the first .bak, rereads ~/.claude files, knows more hook spellings; split bootstrap.mjs ([7926395](https://github.com/metasP/wayfinder-template/commit/7926395d6955d1d533ef6e5f792bcbe5643d18cf))
* bootstrap's closing manual steps add the sandbox allowWrite step ([7930d51](https://github.com/metasP/wayfinder-template/commit/7930d51455e1c63cb16789e6c0308fedde199459))
* bootstrap's closing manual steps add the sandbox allowWrite step ([cc9b582](https://github.com/metasP/wayfinder-template/commit/cc9b582e35a091595d9569d780d91b179c210b28))
* declare STALE_MEMORY_HEADING before report() uses it ([84ddaac](https://github.com/metasP/wayfinder-template/commit/84ddaac96892a5f21008aa82f05562005aed6c44))
* declare STALE_MEMORY_HEADING before report() uses it ([1084877](https://github.com/metasP/wayfinder-template/commit/10848771f7af17803249f4ab60e7042d86abe39c))
* **hook:** autocommit Bash path reads the session cwd from the payload ([8d7e499](https://github.com/metasP/wayfinder-template/commit/8d7e4997bed3a3ac08bb25a02b78f3a1fb76a260))
* **hook:** autocommit Bash path reads the session cwd from the payload ([f42c27b](https://github.com/metasP/wayfinder-template/commit/f42c27b4eb1ddcddeb3bddd25eee47dc10d1107b))
* keep all-waiting maps off the stale clock and close review gaps ([d1d5b98](https://github.com/metasP/wayfinder-template/commit/d1d5b9814baab5d5b93785c97fda4d8c1df3442c))
* page code moves out of the notes into _tools/views, which the sandbox can't write ([c5a5f42](https://github.com/metasP/wayfinder-template/commit/c5a5f42bd4c29540bc6e1bd17a1394df743e168a))
* page code moves out of the notes into _tools/views, which the sandbox can't write ([268a917](https://github.com/metasP/wayfinder-template/commit/268a917f3da7ed5b317edb7964666113817ebcaa))
* the vault's sandbox grant denies the paths that hold code run outside the sandbox ([49e2160](https://github.com/metasP/wayfinder-template/commit/49e21601aa0127f0678fddae07450c4d9f6ae8c5))
* the vault's sandbox grant denies the paths that hold code run outside the sandbox ([84e8375](https://github.com/metasP/wayfinder-template/commit/84e837541e4a77530e8805dd7e0b0ede9c8c1e33))
* wf new refuses a done or dropped map ([1ce81c3](https://github.com/metasP/wayfinder-template/commit/1ce81c386390866b94f073142868448963568717))
* wf new refuses a done or dropped map ([a3a82c9](https://github.com/metasP/wayfinder-template/commit/a3a82c9356706857183e5905bf0fc68e0b5b7424)), closes [#43](https://github.com/metasP/wayfinder-template/issues/43)


### Documentation

* add issue tracker config for /to-spec and /to-tickets ([0990e6b](https://github.com/metasP/wayfinder-template/commit/0990e6bbbf1265cb421832a211dd1b43ae4207a2))
* add issue tracker config for /to-spec and /to-tickets ([dabcc8c](https://github.com/metasP/wayfinder-template/commit/dabcc8c54cd508829a902e639fc2c686baf39e16))
* add ticket store (wf) + read model + autocommit spec ([5d02ad5](https://github.com/metasP/wayfinder-template/commit/5d02ad5ba7b4337f8adea8b95ea22f5647b648b7))
* INSTALL gains the upgrade path from 0.4.x ([0ec7c99](https://github.com/metasP/wayfinder-template/commit/0ec7c99b9a290d450b1410fb5586ce22854d14d8)), closes [#27](https://github.com/metasP/wayfinder-template/issues/27)
* INSTALL says the .bak is the oldest copy and the hook wiring rereads settings.json ([84073e6](https://github.com/metasP/wayfinder-template/commit/84073e6a99dd9f6767946c2ebd8376e51299a8e3)), closes [#47](https://github.com/metasP/wayfinder-template/issues/47)
* name the dataviewjs risk the sandbox denies leave open ([2494fc0](https://github.com/metasP/wayfinder-template/commit/2494fc07dfb58757b7460f77ea6e1273d85286ca)), closes [#27](https://github.com/metasP/wayfinder-template/issues/27)
* spec — ticket store (wf) + shared read model + autocommit ([fbb2e1e](https://github.com/metasP/wayfinder-template/commit/fbb2e1e153c51bba80f70a473aadacf6cf1f9c70))
* upgrade step 3 also denies .claude and .mcp.json ([885e665](https://github.com/metasP/wayfinder-template/commit/885e6653c968702e1e33e444d8766ce509a584eb)), closes [#27](https://github.com/metasP/wayfinder-template/issues/27)
* upgrade step 3 denies sandbox writes where code runs outside it ([c20881d](https://github.com/metasP/wayfinder-template/commit/c20881da116c831e6086d64a7632b31d6db0e858)), closes [#27](https://github.com/metasP/wayfinder-template/issues/27)
* vault README wayfinding section becomes a wf verb table plus concepts ([04e60cf](https://github.com/metasP/wayfinder-template/commit/04e60cf34fd5eade67481dc16d0b4f724f8ad253))
* vault README wayfinding section becomes a wf verb table plus concepts ([7c8db2b](https://github.com/metasP/wayfinder-template/commit/7c8db2b04dacd9bcbbce0b6844a269f3d2b03128)), closes [#26](https://github.com/metasP/wayfinder-template/issues/26)

## 0.4.0 — 2026-10-05

**Changed (CLI):** `bootstrap.mjs` and `doctor.mjs` now reject what they do not understand,
before reading the manifest or touching any file.

- `--help` / `-h` print usage and exit 0. They used to fall through to a real run — on an
  installed vault, a full update plus a commit to `main`.
- An unknown flag (`--pln`), a stray word, a value on a boolean (`--yes=1`), or a value flag
  with no value (`--parts`) exits 2. Boolean flags no longer swallow the next word.
- A value that starts with `-` must be written `--flag=value`.
- `doctor.mjs` takes no arguments and now says so instead of silently checking the vault next
  to itself.

**Added**

- `language:` in `Wayfinder Config.md` (ISO 639-1, default `en`): the language `/wayfinder-next`
  and `/wayfinder` write chips, maps and tickets in.
- The vault README carries § Wayfinding operations and § Spec & ticket operations — the sections
  `/wayfinder` and the build skills read — and `doctor.mjs` checks both headings are still there.
- The `~/.claude/CLAUDE.md` paragraph is now a pointer to those README sections instead of a
  copy of the format. A paragraph from v0.3.0 or earlier is left alone with a warning: delete it
  and re-run with `--wire-memory`.

## 0.3.0 — 2026-10-05

**Breaking:** `/wayfinder` is no longer bundled. It comes from Matt Pocock's
`mattpocock-skills` plugin, now a prerequisite (see [`INSTALL.md`](INSTALL.md)).

- The installer reports whether the plugin is installed.
- An update deletes the old bundled `<skills-dir>/wayfinder/SKILL.md` only while it is still
  byte for byte what the installer placed; an edited copy is left in place with a warning.

## 0.2.5 — 2026-09-06

- The remembered effort no longer crosses between vaults.

## 0.2.4 — 2026-09-06

- Every ticket must carry a `blockers` key, even an empty one, and `doctor.mjs` insists. The
  example ticket has one.
- The README shows the dashboards.

## 0.2.2 — 2026-09-06

- The `npx` one-liner is documented for updating too, not just installing.

## 0.2.1 — 2026-09-05

- The bundled `/wayfinder` skill is credited to Matt Pocock (MIT) in `THIRD-PARTY.md` and inside
  the skill file itself. No installer behaviour changed.

## 0.2.0 — 2026-09-05

- Install with one command: `npx https://github.com/metasP/wayfinder-template`. Not published
  to npm.
- `template/.gitignore` ships as `template/_gitignore` and is renamed on placement, because npm
  drops that filename from tarballs.

## 0.1.0 — 2026-09-05

- First public release: install onto a new or existing vault, update from the vault's own copy,
  `doctor.mjs` health check.
