# Third-party components

This repository **vendors** one third-party component. It is not a dependency you
install — the files ship inside `template/` so that a fresh vault is complete on disk
**before** Obsidian first opens it.

> Why vendored instead of "install it from the plugin browser": Obsidian reads
> `.obsidian/` when it adopts a folder as a vault. A plugin added afterwards needs a
> full restart (`Cmd+Q`) to be picked up — a step an agent cannot perform for the user
> mid-install. Shipping the plugin on disk removes that step entirely.

---

## Dataview

| | |
|---|---|
| **Version** | 0.5.68 |
| **Author** | Michael Brenan (`blacksmithgu`) |
| **License** | MIT |
| **Homepage** | https://github.com/blacksmithgu/obsidian-dataview |
| **Docs** | https://blacksmithgu.github.io/obsidian-dataview/ |

Vendored files:

```
template/.obsidian/plugins/dataview/main.js        (bundle, ~1.3 MB)
template/.obsidian/plugins/dataview/manifest.json
template/.obsidian/plugins/dataview/styles.css
template/.obsidian/plugins/dataview/data.json      ← settings, not upstream code
```

`data.json` is **our** configuration, not part of the upstream release. It is tracked on
purpose (and explicitly un-ignored in `template/.gitignore`) because `enableDataviewJs: true`
must travel with the vault — without it the three Wayfinder notes render as raw code
instead of tables and charts.

### License text (upstream `LICENSE.txt`)

```
MIT License

Copyright (c) 2021 Michael Brenan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Bundled dependencies inside `main.js`

`main.js` is a release **bundle**: it already contains Dataview's own dependencies
(Luxon, CodeMirror bindings, and others) with their MIT notices preserved inline in the
file. We ship that file byte-for-byte as published — no repackaging, no stripping — so
those notices travel with it.

---

Everything else in this repository is original work, MIT-licensed — see [`LICENSE`](LICENSE).
