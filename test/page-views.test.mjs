// The stub shape and the fence count doctor holds the pages to (spec *Sandbox grant (Q2)*): a stub is the
// whole block, and every fence Dataview might run as JS counts, however it is written.
import { test } from "node:test"
import assert from "node:assert/strict"
import { jsFenceCount, stubOf } from "../template/_tools/lib/page-views.mjs"

test("a stub is one call line and nothing else", () => {
  assert.deepEqual(stubOf('await dv.view("_tools/views/picks")\n'), { view: "picks", block: null })
  assert.deepEqual(stubOf('await dv.view("_tools/views/dashboard", { block: "lint" })\n'), { view: "dashboard", block: "lint" })
  for (const src of [
    'await dv.view("_tools/views/picks")\nfetch("x")\n',
    'await dv.view("_tools/views/picks") // x\n',
    'await dv.view("_tools/views/picks"); fetch("x")\n',
    'await dv.view("other/picks")\n',
    'await dv.view("_tools/views/picks", { render: () => 1 })\n',
  ])
    assert.equal(stubOf(src), null, src)
})

test("every fence Dataview might run as JS counts: tildes, long fences, any case, indents, quotes, list items", () => {
  const shapes = ["```dataviewjs", "~~~dataviewjs", "````DataviewJS", "   ```dataviewjs", "> ```dataviewjs",
    "> > ~~~ dataviewjs", "- ```dataviewjs", "1. ```dataviewjs", "> - ```dataviewjs", "    - ```dataviewjs"]
  for (const fence of shapes) assert.equal(jsFenceCount(`text\n${fence}\nx\n\`\`\`\n`), 1, fence)
  assert.equal(jsFenceCount("```dataview\n```\n```js\n```\n```dataviewjsx\n```\n"), 0)
})
