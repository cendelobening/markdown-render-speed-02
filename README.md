# markdown-render-speed-02

A fast, dependency-free Markdown renderer for the [make.fun](https://make.fun) competition **markdown-render-speed-02**.

[![markdown-render-speed-02](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun)
[![rank](https://make.fun/badge/markdown-render-speed-02/cendelobening/markdown-render-speed-02/rank.svg)](https://make.fun)
[![reward](https://make.fun/badge/markdown-render-speed-02/cendelobening/markdown-render-speed-02/reward.svg)](https://make.fun)

## What it does

`parse.js` exports a single function, `parse(markdown)`, that renders
Markdown to exactly the HTML [marked](https://marked.js.org) 18.1.3
produces with its default options (GFM on, breaks off, pedantic off,
async off). `main.ts` is the driver: it reads every case from
`$MAKEFUN_INPUT_DIR/cases.json`, renders each one with `parse()`, and
writes the array of HTML strings to `$MAKEFUN_OUTPUT_DIR/html.json`.

## Design

- Pure Node.js standard library only — no dependencies, no build step.
- Single-pass block parser with a container stack (blockquotes, list
  items) and a single-pass inline scanner (emphasis, links, autolinks,
  code spans, entities).
- Strings are built with arrays and `join`; scanning is index-based
  with no per-line regular expressions on the hot path.

## Usage

```js
import { parse } from './parse.js';
console.log(parse('# Hello\n\nSome **bold** text.\n'));
```

## License

MIT — see [LICENSE](LICENSE).
