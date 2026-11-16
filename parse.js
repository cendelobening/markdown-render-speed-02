// A fast, dependency-free Markdown renderer.
//
// parse(markdown) returns the HTML that marked 18.1.3 produces with its
// default options (GFM on, breaks off, pedantic off, async off).
// Written from the CommonMark 0.31.2 and GFM 0.29 specifications, with the
// output shapes verified against marked's own example set.
//
// Structure: a container-stack block parser (block quotes, lists, leaf
// blocks) that builds a small tree, then an inline parser (delimiter
// stack for emphasis, bracket stack for links) that renders each leaf.

const ASCII_PUNCT = '!\"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

function isSpaceCh(c) {
  return c === ' ' || c === '\t';
}

function isDigitCh(c) {
  return c >= '0' && c <= '9';
}

function isAlphaCh(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}

function isAlnumCh(c) {
  return isAlphaCh(c) || isDigitCh(c);
}

function isPunctCh(c) {
  return ASCII_PUNCT.indexOf(c) !== -1;
}

function isWhitespaceCh(c) {
  return c === ' ' || c === '\t' || c === '\n' || c === '\v' || c === '\f' || c === '\r';
}

// Unicode-aware checks used by the emphasis flanking rules.
// CommonMark counts Unicode punctuation (P) and symbols (S) alike.
const UNICODE_PUNCT_RE = /[\p{P}\p{S}]/u;
const UNICODE_SPACE_RE = /\s/;

function isUnicodePunct(c) {
  return c !== '' && UNICODE_PUNCT_RE.test(c);
}

function isUnicodeSpace(c) {
  return c !== '' && UNICODE_SPACE_RE.test(c);
}

// Escape a single character for HTML text or attribute values.
function escChar(c) {
  if (c === '&') return '&amp;';
  if (c === '<') return '&lt;';
  if (c === '>') return '&gt;';
  if (c === '"') return '&quot;';
  if (c === "'") return '&#39;';
  return c;
}

// Escape text, but leave an &-sequence that already looks like an entity
// (&name; or &#123;) untouched. This is the escaping marked uses for
// ordinary text, link destinations, titles and fenced-code info strings.
function escText(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '&') {
      let j = i + 1;
      if (s[j] === '#') j++;
      let k = j;
      while (k < s.length && /[A-Za-z0-9_]/.test(s[k])) k++;
      if (k > j && s[k] === ';') {
        out += s.slice(i, k + 1);
        i = k;
        continue;
      }
      out += '&amp;';
    } else {
      out += escChar(c);
    }
  }
  return out;
}

// Escape text fully: every & becomes &amp;. Used for code spans and
// code blocks, where entity-looking text is literal.
function escCode(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) out += escChar(s[i]);
  return out;
}

// Clean a link destination the way marked does: encodeURI, but keep
// already-encoded %XX sequences intact. Returns null when the value
// cannot be encoded (lone surrogates), in which case no link is made.
function cleanUrl(href) {
  try {
    return encodeURI(href).replace(/%25/g, '%');
  } catch (e) {
    return null;
  }
}

// Decode one numeric character reference body (the part after &# or &#x).
// Returns the replacement string, or null when the reference is invalid.
function decodeNumeric(body, hex) {
  if (body.length === 0) return null;
  let cp;
  if (hex) {
    if (!/^[0-9a-fA-F]+$/.test(body)) return null;
    cp = parseInt(body, 16);
  } else {
    if (!/^[0-9]+$/.test(body)) return null;
    cp = parseInt(body, 10);
  }
  if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
    return cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) ? '\uFFFD' : null;
  }
  return String.fromCodePoint(cp);
}

// ---- line helpers (tabs advance to the next multiple of 4 columns) ----

function lineIndent(line) {
  let col = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === ' ') col++;
    else if (c === '\t') col += 4 - (col % 4);
    else break;
  }
  return col;
}

function lineIsBlank(line) {
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c !== ' ' && c !== '\t') return false;
  }
  return true;
}

// Index of the first character that is not a space or tab.
function firstNonSpace(line, from) {
  let i = from || 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  return i;
}

// Column of the character at index i (tabs expand to multiples of 4).
function colAt(line, i) {
  let col = 0;
  for (let k = 0; k < i && k < line.length; k++) {
    if (line[k] === '\t') col += 4 - (col % 4);
    else col++;
  }
  return col;
}

// Remove the first n columns of a line. A tab straddling the boundary
// turns into the spaces needed to reach column n.
function stripCols(line, n) {
  let col = 0;
  let i = 0;
  while (i < line.length && col < n) {
    const c = line[i];
    if (c === ' ') { col++; i++; }
    else if (c === '\t') {
      const next = col + (4 - (col % 4));
      if (next <= n) { col = next; i++; }
      else return ' '.repeat(next - n) + line.slice(i + 1);
    } else break;
  }
  return line.slice(i);
}

// Drop the first n columns of a line whatever they are (marker characters
// included). A tab straddling the boundary turns into spaces.
function dropCols(line, n) {
  let col = 0;
  let i = 0;
  while (i < line.length && col < n) {
    const c = line[i];
    if (c === '\t') {
      const next = col + (4 - (col % 4));
      if (next <= n) { col = next; i++; }
      else return ' '.repeat(next - n) + line.slice(i + 1);
    } else { col++; i++; }
  }
  return line.slice(i);
}

// Consume the first n columns of a line that starts at column baseCol and
// return the remainder with its leading whitespace expanded to spaces, so
// later tab widths are measured from the right columns. Used when a
// container (quote, list item) is stripped: the remainder is re-parsed for
// block structure, and a tab left behind must keep its original width.
function consumeCols(line, n, baseCol) {
  let col = baseCol;
  let i = 0;
  let out = '';
  const target = baseCol + n;
  while (i < line.length) {
    const c = line[i];
    if (c === ' ') {
      if (col >= target) out += ' ';
      col++;
      i++;
    } else if (c === '\t') {
      const next = col + (4 - (col % 4));
      if (next <= target) { col = next; i++; }
      else if (col < target) { out += ' '.repeat(next - target); col = next; i++; }
      else { out += ' '.repeat(next - col); col = next; i++; }
    } else if (col < target) {
      // A marker character (or '>') inside the stripped columns.
      col++;
      i++;
    } else break;
  }
  return out + line.slice(i);
}

// ---- block nodes ----

function mkPara() { return { t: 'para', lines: [] }; }
function mkHeading(level, text) { return { t: 'heading', level, text }; }
function mkCode() {
  return { t: 'code', lang: null, lines: [], fenced: false, fenceCh: '', fenceLen: 0, fenceInd: 0 };
}

// Strip the fence indent from a fenced-code content line. A tab that
// straddles the strip boundary is dropped outright (marked keeps no
// spaces for it), rather than turning into the spaces to the boundary.
function stripFenceLine(rem, fenceInd) {
  const n = Math.min(fenceInd, lineIndent(rem));
  if (n > 0 && rem[0] === '\t' && n < 4) return rem.slice(1);
  return stripCols(rem, n);
}
function mkHtml(kind, closer) { return { t: 'html', kind, closer, lines: [], trailingNL: false }; }
function mkQuote() { return { t: 'quote', children: [] }; }
function mkList(ordered, start, delim, bullet) {
  return { t: 'list', ordered, start, delim, bullet, children: [], tight: true };
}
function mkItem(contentIndent) {
  return { t: 'item', contentIndent, children: [], sawBlank: false, blankDirect: false, internalBlank: false, blankBeforeNext: false };
}
function mkHr() { return { t: 'hr' }; }
function mkTable(aligns, header) { return { t: 'table', aligns, header, rows: [] }; }

// Whether a true blank line (no '>' marker) has occurred since the last
// block-level content was added. A new list item reads this to decide
// whether the previous item is separated from it by a blank line.
let pendingBlank = false;

function addChild(parent, node) {
  parent.children.push(node);
  // Adding any block consumes a pending blank line: the blank was inside
  // the block's container, not between two list items.
  pendingBlank = false;
  // A new block inside an item, after a blank line, makes the list loose
  // — but only when the item already had a child: a blank line before an
  // item's first block does not loosen it. A child added to the item also
  // consumes any blank line that was directly in it, so it no longer
  // counts as a blank line before the next item.
  if (parent.t === 'item' && parent.sawBlank) {
    if (parent.children.length > 1) parent.internalBlank = true;
    parent.sawBlank = false;
  }
  if (parent.t === 'item') parent.blankDirect = false;
}

// ---- link reference definitions ----

// Normalize a link label: resolve backslash escapes, collapse runs of
// whitespace to one space, trim, and fold case.
// True when s contains a '[' that is not part of a backslash escape.
function hasUnescapedOpenBracket(s) {
  for (let k = 0; k < s.length; k++) {
    if (s[k] === '\\' && k + 1 < s.length) { k++; continue; }
    if (s[k] === '[') return true;
  }
  return false;
}

function normalizeLabel(raw) {
  // Labels match on the raw text: backslash escapes are NOT resolved here
  // (so foo\! does not match foo!), whitespace is collapsed and the label
  // is case-folded. Full case folding differs from lowercasing for a few
  // characters: the sharp s (both cases) folds to "ss".
  let s = raw.replace(/[\u00DF\u1E9E]/g, 'ss');
  s = s.replace(/\s+/g, ' ').trim().toLowerCase().replace(/\u03C2/g, '\u03C3');
  return s;
}

// Try to parse a link reference definition starting at text[i] (which
// must be '['). Returns {label, dest, title, end} or null.
function parseRefDef(text, i) {
  const n = text.length;
  // Label: no unescaped '[' inside, backslash escapes kept verbatim.
  let j = i + 1;
  let rawLabel = '';
  while (j < n) {
    const c = text[j];
    if (c === '\\' && j + 1 < n && isPunctCh(text[j + 1])) { rawLabel += text.slice(j, j + 2); j += 2; continue; }
    if (c === '[') return null;
    if (c === ']') break;
    rawLabel += c;
    j++;
  }
  if (j >= n || text[j] !== ']') return null;
  if (rawLabel.length > 999) return null;
  const label = normalizeLabel(rawLabel);
  if (label.length === 0) return null;
  j++; // past ]
  if (text[j] !== ':') return null;
  j++;
  // Skip spaces, tabs and line ends before the destination.
  while (j < n && (text[j] === ' ' || text[j] === '\t' || text[j] === '\n')) j++;
  if (j >= n) return null;
  // Destination.
  let dest = '';
  if (text[j] === '<') {
    j++;
    let closed = false;
    while (j < n) {
      const c = text[j];
      if (c === '\n') return null;
      if (c === '\\' && j + 1 < n && isPunctCh(text[j + 1])) { dest += text[j + 1]; j += 2; continue; }
      if (c === '>') { closed = true; j++; break; }
      if (c === '<') return null;
      dest += c;
      j++;
    }
    if (!closed) return null;
  } else {
    let depth2 = 0;
    let got = false;
    while (j < n) {
      const c = text[j];
      if (c === ' ' || c === '\t' || c === '\n' || c < ' ') {
        if (!got) return null;
        break;
      }
      if (c === '\\' && j + 1 < n && isPunctCh(text[j + 1])) { dest += text[j + 1]; j += 2; got = true; continue; }
      if (c === '(') { depth2++; dest += c; j++; got = true; continue; }
      if (c === ')') {
        if (depth2 === 0) break;
        depth2--; dest += c; j++; got = true; continue;
      }
      dest += c;
      j++;
      got = true;
    }
    if (!got) return null;
    if (depth2 !== 0) return null;
  }
  // Optional title, on this line or the next. A title on the same line
  // must be separated from the destination by whitespace; a title on the
  // next line that does not parse cleanly is simply dropped, leaving a
  // definition with no title.
  let title = null;
  let endPos = j;
  let k = j;
  while (k < n && (text[k] === ' ' || text[k] === '\t')) k++;
  const sameLineTitle = k < n && (text[k] === '"' || text[k] === "'" || text[k] === '(');
  if (sameLineTitle) {
    // A title opener with no whitespace before it is not a title at all.
    if (k === j) return null;
    const t = parseTitle(text, k);
    if (!t) return null;
    let e = t.end;
    while (e < n && (text[e] === ' ' || text[e] === '\t')) e++;
    if (e < n && text[e] !== '\n') return null;
    title = t.title;
    endPos = e;
  } else if (k < n && text[k] === '\n') {
    let m = k + 1;
    while (m < n && (text[m] === ' ' || text[m] === '\t')) m++;
    if (m < n && (text[m] === '"' || text[m] === "'" || text[m] === '(')) {
      const t = parseTitle(text, m);
      if (t) {
        let e = t.end;
        while (e < n && (text[e] === ' ' || text[e] === '\t')) e++;
        if (e >= n || text[e] === '\n') { title = t.title; endPos = e; }
      }
    }
    if (title === null) endPos = k;
  } else {
    if (k < n && text[k] !== '\n') return null;
    endPos = k;
  }
  return { label, dest, title, end: endPos };
}

// Parse a link title starting at text[i] (the opening quote/paren).
// Returns {title, end} with end past the closing delimiter, or null.
function parseTitle(text, i) {
  const n = text.length;
  const open = text[i];
  const close = open === '(' ? ')' : open;
  let k = i + 1;
  let t = '';
  while (k < n) {
    const c = text[k];
    if (c === '\\' && k + 1 < n && isPunctCh(text[k + 1])) { t += text[k + 1]; k += 2; continue; }
    if (c === close) return { title: t, end: k + 1 };
    if (open === '(' && c === '(') return null;
    if (c === '\n') {
      // A title may span lines, but not a blank line.
      if (text[k + 1] === '\n') return null;
    }
    t += c;
    k++;
  }
  return null;
}

// Strip leading link reference definitions from a paragraph. Returns the
// index of the first remaining line (all lines are defs when it returns
// lines.length).
// Scan the leading lines of a paragraph for link reference definitions.
// A definition must start the paragraph (cm-213: a definition on a later
// line of a paragraph is literal text, not a definition).
function extractRefDefs(para, refs) {
  const lines = para.lines;
  const text = lines.join('\n');
  // Offsets of each line start inside text.
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  let li = 0;
  while (li < lines.length) {
    const ls = starts[li];
    // The '[' must sit within 3 columns of the line start.
    let p = ls;
    let cols = 0;
    while (p < text.length && (text[p] === ' ' || text[p] === '\t')) {
      if (text[p] === ' ') cols += 1;
      else cols += 4 - (cols % 4);
      if (cols > 3) break;
      p++;
    }
    if (cols > 3 || text[p] !== '[') break;
    const def = parseRefDef(text, p);
    if (!def) break;
    if (!refs.has(def.label)) refs.set(def.label, { dest: def.dest, title: def.title });
    // Advance past the lines the definition consumed.
    let nl = 0;
    for (let q = ls; q < def.end; q++) if (text[q] === '\n') nl++;
    li += nl + 1;
  }
  return li;
}

// ---- table helpers ----

// Split a table row line into cells. Pipes escaped with a backslash and
// pipes inside code spans do not split. A backtick run with no closer
// is literal text and poisons the rest of its cell: no later backtick in
// that cell may open a span, so a pipe after it still splits.
function splitTableCells(line) {
  const cells = [];
  let cur = '';
  let i = 0;
  const n = line.length;
  let poisoned = false;
  while (i < n) {
    const c = line[i];
    if (c === '\\' && i + 1 < n) { cur += line.slice(i, i + 2); i += 2; continue; }
    if (c === '`' && !poisoned) {
      let run = 0;
      while (i + run < n && line[i + run] === '`') run++;
      // Find a closing run of exactly this length.
      let k = i + run;
      let found = -1;
      while (k < n) {
        if (line[k] === '`') {
          let r2 = 0;
          while (k + r2 < n && line[k + r2] === '`') r2++;
          if (r2 === run) { found = k; break; }
          k += r2;
        } else k++;
      }
      if (found !== -1) { cur += line.slice(i, found + run); i = found + run; }
      else { cur += line.slice(i, i + run); i += run; poisoned = true; }
      continue;
    }
    if (c === '`') { cur += c; i++; continue; }
    if (c === '|') { cells.push(cur); cur = ''; i++; poisoned = false; continue; }
    cur += c;
    i++;
  }
  cells.push(cur);
  // A leading or trailing pipe makes an empty edge cell; drop those.
  let start = 0;
  let end = cells.length;
  if (cells.length > 0 && cells[0].trim() === '') start = 1;
  if (end > start && cells[end - 1].trim() === '') end--;
  const out = [];
  // An escaped pipe was only there to keep the cell together; once the
  // cell is cut out the escape is dropped (even inside a code span).
  for (let k = start; k < end; k++) out.push(cells[k].trim().replace(/\\\|/g, '|'));
  return out;
}

// Parse a table delimiter row. Returns the alignment per column, or null.
function parseDelimiterRow(line) {
  const cells = splitTableCells(line);
  if (cells.length === 0) return null;
  const aligns = [];
  for (const cell of cells) {
    const t = cell.trim();
    let left = false;
    let right = false;
    let s = t;
    if (s.startsWith(':')) { left = true; s = s.slice(1); }
    if (s.endsWith(':')) { right = true; s = s.slice(0, -1); }
    if (s.length === 0 || !/^-+$/.test(s)) return null;
    aligns.push(left && right ? 'center' : right ? 'right' : left ? 'left' : null);
  }
  return aligns;
}

// ---- block-start detection ----

const BLOCK_TAGS = new Set(('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul').split(' '));
const TYPE1_TAGS = new Set(['script', 'pre', 'style', 'textarea']);

// Index just past the '>' closing a tag that starts at s[i] ('<'), or -1
// when the tag is not complete on this line. Quoted attribute values are
// skipped so a '>' inside them does not close the tag.
// End index (past '>') of a valid open or closing tag starting at s[i],
// or -1. Attribute names and values follow the HTML rules: a closing tag
// takes no attributes, and a quoted value must be followed by whitespace,
// '/' or '>'.
function tagEnd(s, i) {
  const n = s.length;
  let j = i + 1;
  let closing = false;
  if (s[j] === '/') { closing = true; j++; }
  if (!isAlphaCh(s[j] || '')) return -1;
  while (j < n && (isAlnumCh(s[j]) || s[j] === '-')) j++;
  // The tag name must be followed by whitespace, '/' or '>': a ':' or
  // '\\' right after it is not a tag (so <m:abc> and <foo\> are text).
  if (s[j] !== undefined && s[j] !== ' ' && s[j] !== '\t' && s[j] !== '\n' && s[j] !== '>' && s[j] !== '/') return -1;
  if (closing) {
    while (j < n && (s[j] === ' ' || s[j] === '\t')) j++;
    return s[j] === '>' ? j + 1 : -1;
  }
  while (true) {
    while (j < n && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n')) j++;
    if (s[j] === '>') return j + 1;
    if (s[j] === '/' && s[j + 1] === '>') return j + 2;
    // Attribute name: letter, '_' or ':' first, then letters, digits,
    // '_', ':', '.' or '-'.
    const a0 = j;
    if (j < n && (isAlphaCh(s[j]) || s[j] === '_' || s[j] === ':')) {
      j++;
      while (j < n && (isAlnumCh(s[j]) || s[j] === '_' || s[j] === ':' || s[j] === '.' || s[j] === '-')) j++;
    }
    if (j === a0) return -1;
    while (j < n && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n')) j++;
    if (s[j] === '=') {
      j++;
      while (j < n && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n')) j++;
      const q = s[j];
      if (q === '"' || q === "'") {
        j++;
        const k = s.indexOf(q, j);
        if (k === -1) return -1;
        j = k + 1;
        // After a quoted value, only whitespace, '/' or '>' may follow.
        if (j < n && s[j] !== ' ' && s[j] !== '\t' && s[j] !== '\n' && s[j] !== '>' && s[j] !== '/') return -1;
      } else {
        const v0 = j;
        while (j < n) {
          const c = s[j];
          if (c === ' ' || c === '\t' || c === '\n' || c === '"' || c === "'" || c === '=' || c === '<' || c === '>' || c === '`' || c < ' ') break;
          j++;
        }
        if (j === v0) return -1;
      }
    }
  }
}

// After up to three columns of indent, does the line start an HTML block?
// Returns {kind, closer} or null. Kind 1 ends at its closing tag, 2-5 at
// their closer, 6-7 at a blank line.
function htmlBlockStart(s) {
  if (s[0] !== '<') return null;
  if (s.startsWith('<!--')) return { kind: 2, closer: '-->' };
  if (s.startsWith('<?')) return { kind: 3, closer: '?>' };
  if (s.startsWith('<![CDATA[')) return { kind: 5, closer: ']]>' };
  if (s.startsWith('<!') && isAlphaCh(s[2] || '')) return { kind: 4, closer: '>' };
  let i = 1;
  if (s[i] === '/') i++;
  let j = i;
  if (!isAlphaCh(s[j] || '')) return null;
  while (j < s.length && (isAlnumCh(s[j]) || s[j] === '-')) j++;
  const name = s.slice(i, j).toLowerCase();
  const next = s[j];
  if (next !== undefined && next !== ' ' && next !== '\t' && next !== '>' && next !== '/') return null;
  // Only an opening tag starts a type-1 block; a closing </pre> is text.
  if (s[1] !== '/' && TYPE1_TAGS.has(name)) return { kind: 1, closer: '</' + name + '>' };
  if (BLOCK_TAGS.has(name)) return { kind: 6, closer: '' };
  // Kind 7: a complete open or closing tag on a line by itself, except
  // for the type-1 tag names (pre, script, style, textarea).
  const e = tagEnd(s, 0);
  if (e !== -1 && s.slice(e).trim() === '' && !TYPE1_TAGS.has(name)) return { kind: 7, closer: '' };
  return null;
}

function isThematicBreak(s) {
  let ch = '';
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === ' ' || c === '\t') continue;
    if (c === '*' || c === '-' || c === '_') {
      if (ch === '') ch = c;
      else if (c !== ch) return false;
      count++;
    } else return false;
  }
  return ch !== '' && count >= 3;
}

// 1 for '=', 2 for '-', 0 when the line is not a setext underline.
// The underline is one run of the same character, with only surrounding
// whitespace allowed (no spaces inside the run).
function setextLevel(s) {
  const ind = lineIndent(s);
  if (ind > 3) return 0;
  const t = stripCols(s, ind).replace(/[ \t]+$/, '');
  if (!t) return 0;
  const c = t[0];
  if (c !== '=' && c !== '-') return 0;
  for (let k = 1; k < t.length; k++) {
    if (t[k] !== c) return 0;
  }
  return c === '=' ? 1 : 2;
}

// Parse an ATX heading from the line content (leading spaces stripped).
// Returns {level, text} or null.
function parseAtx(s) {
  let i = 0;
  while (i < s.length && s[i] === '#') i++;
  if (i === 0 || i > 6) return null;
  if (i < s.length && s[i] !== ' ' && s[i] !== '\t') return null;
  let text = s.slice(i);
  text = text.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
  if (/^#+$/.test(text)) text = '';
  else {
    const m = text.match(/^(.*?)[ \t]+#+$/);
    if (m) text = m[1].replace(/[ \t]+$/, '');
  }
  return { level: i, text };
}

// Parse a fenced-code opener from the line content (leading spaces stripped).
// Returns {ch, len, info} or null.
function parseFence(s) {
  const ch = s[0];
  if (ch !== '`' && ch !== '~') return null;
  let i = 0;
  while (i < s.length && s[i] === ch) i++;
  if (i < 3) return null;
  const info = s.slice(i).trim();
  if (ch === '`' && info.indexOf('`') !== -1) return null;
  return { ch, len: i, info };
}

// Parse a list marker at the start of the line content. `col` is the
// column where the content starts. Returns marker info or null.
function parseListMarker(s, col) {
  const ind = lineIndent(s);
  if (ind > 3) return null;
  const m = firstNonSpace(s);
  const markerCol = col + ind;
  const c = s[m];
  let ordered = false;
  let delim = '';
  let bullet = '';
  let width = 0;
  let start = 1;
  if (c === '-' || c === '+' || c === '*') {
    bullet = c;
    width = 1;
  } else if (isDigitCh(c || '')) {
    let k = m;
    while (k < s.length && isDigitCh(s[k])) k++;
    if (k - m > 9) return null;
    if (s[k] !== '.' && s[k] !== ')') return null;
    ordered = true;
    delim = s[k];
    width = (k - m) + 1;
    start = parseInt(s.slice(m, k), 10);
  } else return null;
  const after = s[m + width];
  if (after !== undefined && after !== ' ' && after !== '\t') return null;
  // Columns of whitespace after the marker.
  let p = m + width;
  let cc = markerCol + width;
  while (p < s.length && (s[p] === ' ' || s[p] === '\t')) {
    if (s[p] === ' ') { cc++; p++; }
    else { cc += 4 - (cc % 4); p++; }
  }
  const gap = cc - (markerCol + width);
  let contentIndent;
  let empty = false;
  if (p >= s.length) {
    empty = true;
    contentIndent = markerCol + width + 1;
  } else if (gap >= 1 && gap <= 4) {
    contentIndent = cc;
  } else {
    contentIndent = markerCol + width + 1;
  }
  return { ordered, delim, bullet, start, contentIndent, empty, markerCol, width };
}

// What block, if any, does this line start? `paraOpen` says whether a
// paragraph is currently open (some blocks cannot interrupt one).
// Returns {kind, ...} or null.
function detectBlockStart(rem, col, paraOpen) {
  const ind = lineIndent(rem);
  if (ind > 3) return null;
  const s = stripCols(rem, ind);
  if (s === '') return null;
  if (s[0] === '>') return { kind: 'quote' };
  const atx = parseAtx(s);
  if (atx) return { kind: 'atx', level: atx.level, text: atx.text };
  const fence = parseFence(s);
  if (fence) return { kind: 'fence', ch: fence.ch, len: fence.len, info: fence.info, ind };
  if (s[0] === '<') {
    const hb = htmlBlockStart(s);
    if (hb && (hb.kind !== 7 || !paraOpen)) return { kind: 'html', hb };
  }
  if (isThematicBreak(s)) return { kind: 'hr' };
  const marker = parseListMarker(rem, col);
  if (marker) return { kind: 'list', marker };
  return null;
}

// Can a list with this marker interrupt an open paragraph?
// Whether a list marker may interrupt a paragraph. An ordered list must
// start at 1 — unless the paragraph sits inside a list item, where the
// new list nests inside that item and any start number interrupts.
function listCanInterrupt(marker, inItem) {
  if (marker.empty) return false;
  if (marker.ordered) return inItem || marker.start === 1;
  return true;
}

// ---- block parsing ----

function listMatches(list, marker) {
  if (list.ordered !== marker.ordered) return false;
  if (list.ordered) return list.delim === marker.delim;
  return list.bullet === marker.bullet;
}

function parseBlocks(src) {
  const lines = src.split('\n');
  // A source ending in a newline leaves a final empty piece that is not a
  // real line; drop it so it is never read as a blank content line.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const srcEndsNL = src.endsWith('\n');
  const refs = new Map();
  const doc = { t: 'doc', children: [] };
  const stack = [doc];
  let atEOF = false;
  let curLi = 0;
  pendingBlank = false;

  // True when the source line after index li is empty (zero characters).
  // A following empty line is what strips an html block's trailing
  // newline; a whitespace-only line (spaces or a tab) does not strip it
  // (doc-22: a tab line after </pre> keeps the newline, while cm-183's
  // truly empty line drops it).
  function nextSrcBlank(li) {
    if (li + 1 >= lines.length) return false;
    return lines[li + 1] === '';
  }

  function top() { return stack[stack.length - 1]; }

  function finalizeList(list) {
    let tight = true;
    const items = list.children;
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      if (it.internalBlank) tight = false;
      if (k < items.length - 1 && it.blankBeforeNext) tight = false;
    }
    list.tight = tight;
  }

  // Pop nodes down to the given stack depth. Any html block popped gets
  // its trailing-newline flag set to tNL: an html block keeps the newline
  // after its last line unless the line that follows it is blank.
  function closeFrom(depth, tNL) {
    while (stack.length > depth) {
      const node = stack.pop();
      const parent = stack[stack.length - 1];
      if (node.t === 'para') {
        const first = extractRefDefs(node, refs);
        if (first >= node.lines.length) parent.children.pop();
        else if (first > 0) node.lines = node.lines.slice(first);
      } else if (node.t === 'code') {
        // Trailing blank lines are not code content, except inside a fence
        // that was closed by a fence line: there the empty line just before
        // the closing fence is dropped, but earlier blanks (and a trailing
        // whitespace-only line) are content.
        if (!node.fenced || !node.closed) {
          while (node.lines.length > 0 && lineIsBlank(node.lines[node.lines.length - 1])) node.lines.pop();
        } else if (node.lines.length > 0 && node.lines[node.lines.length - 1] === '') {
          node.lines.pop();
        }
      } else if (node.t === 'html') {
        // Kinds 6-7 keep the trailing newline only when the block runs to
        // the end of the document; kinds 1-5 keep it whenever the next
        // line is not blank.
        node.trailingNL = node.kind >= 6 ? (!!tNL && atEOF) : !!tNL;
      } else if (node.t === 'list') {
        finalizeList(node);
      }
    }
  }

  // Walk the open containers for one line. Returns the number of stack
  // entries that continue, the unprocessed remainder and its column, and
  // whether a '>' marker was consumed (a line like '>  ' leaves a space
  // behind, which is paragraph content, not a blank line).
  function walk(line) {
    let rem = line;
    let col = 0;
    let sawQuote = false;
    let cdepth = 0;
    while (cdepth < stack.length) {
      const t = stack[cdepth].t;
      if (t === 'doc' || t === 'quote' || t === 'list' || t === 'item') cdepth++;
      else break;
    }
    let d = 1;
    while (d < cdepth) {
      const node = stack[d];
      if (node.t === 'list') { d++; continue; }
      if (node.t === 'quote') {
        let p = 0;
        let c = col;
        while (p < rem.length && (rem[p] === ' ' || rem[p] === '\t')) {
          const nc = rem[p] === ' ' ? c + 1 : c + (4 - (c % 4));
          if (nc - col > 3) break;
          p++;
          c = nc;
        }
        // A blank remainder has no '>' marker, so it does not match the
        // quote: the quote ends at a blank line without a marker.
        if (rem[p] !== '>') return { matched: d, cdepth, rem, col, sawQuote };
        // Consume '>' plus one column: a tab after the marker only gives
        // up one of its columns, the rest stays as spaces.
        const total = (c - col) + 1 + ((rem[p + 1] === ' ' || rem[p + 1] === '\t') ? 1 : 0);
        rem = consumeCols(rem, total, 0);
        col += total;
        sawQuote = true;
        d++;
        continue;
      }
      if (node.t === 'item') {
        // A blank line still belongs to the item: it makes the list loose,
        // it does not end the item. The item's content indent is stored
        // relative to the column after its parent containers, so the
        // continuation test compares the line's own indent against it
        // (a quote marker may swallow a space, shifting absolute columns).
        if (lineIsBlank(rem)) { d++; continue; }
        const ind = lineIndent(rem);
        if (ind >= node.contentIndent) {
          rem = consumeCols(rem, node.contentIndent, col);
          col += node.contentIndent;
          d++;
          continue;
        }
        return { matched: d, cdepth, rem, col, sawQuote };
      }
      return { matched: d, cdepth, rem, col, sawQuote };
    }
    return { matched: cdepth, cdepth, rem, col, sawQuote };
  }

  function handleBlank(w) {
    const leaf = stack.length > w.cdepth ? top() : null;
    if (leaf && leaf.t === 'code' && w.matched >= w.cdepth) {
      // A blank line inside code keeps its whitespace past the code indent.
      leaf.lines.push(stripCols(w.rem, leaf.fenced ? Math.min(leaf.fenceInd, lineIndent(w.rem)) : 4));
      return;
    }
    // A blank line that does not match a code block's containers ends the
    // block (and the quote around it); it falls through to the close below.
    if (leaf && leaf.t === 'html' && leaf.kind >= 1 && leaf.kind <= 5) { leaf.lines.push(w.rem); return; }
    // Close the leaf and any container the blank line did not match
    // (a quote ends here; a list or item does not, and walk already
    // counts those as matched for a blank line). A true blank line (no
    // '>' marker) leaves a pending blank until content is added.
    if (!w.sawQuote) pendingBlank = true;
    closeFrom(Math.min(w.matched, w.cdepth), false);
    // A blank line marks every item that contains it (a later child added
    // to any of them makes that list loose), but only the innermost
    // container it matched counts as a blank line directly in that item
    // (which is what separates one item from the next).
    for (let d = 1; d < stack.length; d++) {
      const node = stack[d];
      if (node.t === 'item') node.sawBlank = true;
    }
    if (w.matched >= 1) {
      const inner = stack[w.matched - 1];
      if (inner && inner.t === 'item') inner.blankDirect = true;
    }
    const t = top();
    if (t && t.t === 'item' && t.children.length === 0) closeFrom(stack.length - 1, false);
  }

  function convertParaToHeading(para, level) {
    // Reference definitions are pulled out before the heading is made:
    // they belong to the definition list, not to the heading text.
    const first = extractRefDefs(para, refs);
    if (first > 0) para.lines = para.lines.slice(first);
    if (para.lines.length === 0) return false;
    const parent = stack[stack.length - 2];
    parent.children[parent.children.length - 1] = mkHeading(level, para.lines.join('\n').trim());
    stack.pop();
    return true;
  }

  // Add a line to an open paragraph, handling tables. `lazy` marks a line
  // that did not match the paragraph's containers.
  function addParaLine(para, rem, lazy) {
    if (lazy) {
      // A lazy continuation line keeps a short leading indent (a paragraph
      // continuation preserves its spaces), but an indent of four or more
      // is dropped, as in cm-238/291/312, where the lazy line would
      // otherwise read as indented code. A setext underline cannot be a
      // lazy continuation: it stays literal text, indented so it reads
      // as text.
      const ind = lineIndent(rem);
      const stripped = ind >= 4 ? stripCols(rem, 4) : rem;
      if (setextLevel(rem)) { para.lines.push('    ' + stripCols(rem, Math.min(4, ind))); return true; }
      para.lines.push(stripped);
      return true;
    }
    if (para.lines.length === 1 && lineIndent(rem) <= 3) {
      const aligns = parseDelimiterRow(rem);
      if (aligns) {
        const header = splitTableCells(para.lines[0]);
        if (aligns.length === header.length && header.length > 0) {
          const parent = stack[stack.length - 2];
          const table = mkTable(aligns, header);
          parent.children[parent.children.length - 1] = table;
          stack.pop();
          stack.push(table);
          return true;
        }
      }
    }
    para.lines.push(rem);
    return true;
  }

  function canInterrupt(bs, inItem) {
    if (!bs) return false;
    if (bs.kind === 'atx' || bs.kind === 'fence' || bs.kind === 'hr' || bs.kind === 'html' || bs.kind === 'quote') return true;
    if (bs.kind === 'list') return listCanInterrupt(bs.marker, inItem);
    return false;
  }

  function openNewBlocks(rem0, col0) {
    let rem = rem0;
    let col = col0;
    while (true) {
      const cur = top();
      const ind = lineIndent(rem);
      const s = ind <= 3 ? stripCols(rem, ind) : null;
      if (cur.t === 'list') {
        // A thematic break is not a list item, even when it looks like one.
        if (s !== null && isThematicBreak(s)) { closeFrom(stack.length - 1, true); continue; }
        const m = parseListMarker(rem, col);
        if (!m || !listMatches(cur, m)) {
          closeFrom(stack.length - 1, true);
          continue;
        }
      }
      if (ind <= 3) {
        if (s[0] === '>') {
          const q = mkQuote();
          addChild(top(), q);
          stack.push(q);
          const total = ind + 1 + ((s[1] === ' ' || s[1] === '\t') ? 1 : 0);
          rem = consumeCols(rem, total, 0);
          col += total;
          if (lineIsBlank(rem)) return;
          continue;
        }
        const atx = parseAtx(s);
        if (atx) { addChild(top(), mkHeading(atx.level, atx.text)); return; }
        const fence = parseFence(s);
        if (fence) {
          const code = mkCode();
          code.fenced = true;
          code.fenceCh = fence.ch;
          code.fenceLen = fence.len;
          code.fenceInd = ind;
          const info = fence.info.replace(/\\([!-/:-@\[-`{-~])/g, '$1');
          code.lang = info === '' ? null : info.split(/[ \t]+/)[0];
          addChild(top(), code);
          stack.push(code);
          return;
        }
        if (s[0] === '<') {
          const hb = htmlBlockStart(s);
          if (hb) {
            const html = mkHtml(hb.kind, hb.closer);
            html.lines.push(rem);
            addChild(top(), html);
            stack.push(html);
            // The block ends on its opening line when the closer is on it
            // (kind 1's closing tag matches case-insensitively).
            const closedNow = hb.kind === 1
              ? rem.toLowerCase().indexOf(hb.closer) !== -1
              : (hb.kind >= 2 && hb.kind <= 5 && rem.indexOf(hb.closer) !== -1);
            if (closedNow) closeFrom(stack.length - 1, !nextSrcBlank(curLi));
            return;
          }
        }
        if (isThematicBreak(s)) { addChild(top(), mkHr()); return; }
        const marker = parseListMarker(rem, col);
        if (marker) {
          let list = top().t === 'list' ? top() : null;
          if (list && !listMatches(list, marker)) { closeFrom(stack.length - 1, true); continue; }
          if (!list) {
            list = mkList(marker.ordered, marker.start, marker.delim, marker.bullet);
            addChild(top(), list);
            stack.push(list);
          }
          if (list.children.length > 0) {
            const prev = list.children[list.children.length - 1];
            // A blank line separates the previous item from this one
            // whether it was a true blank (pendingBlank) or a blank
            // line directly inside the previous item — including a
            // quote blank line, which sets blankDirect but not
            // pendingBlank (doc-22: '>' blanks between items 17/18).
            // blankDirect is cleared when a child is added to the
            // item, so it only fires when the blank was the last thing
            // in the previous item.
            prev.blankBeforeNext = pendingBlank || prev.blankDirect;
          }
          const item = mkItem(marker.contentIndent - col);
          addChild(list, item);
          stack.push(item);
          rem = consumeCols(rem, marker.contentIndent - col, col);
          col = marker.contentIndent;
          if (lineIsBlank(rem)) return;
          continue;
        }
      }
      if (ind >= 4) {
        const code = mkCode();
        code.lines.push(stripCols(rem, 4));
        addChild(top(), code);
        stack.push(code);
        return;
      }
      const para = mkPara();
      para.lines.push(rem);
      addChild(top(), para);
      stack.push(para);
      return;
    }
  }

  for (let li = 0; li < lines.length; li++) {
    curLi = li;
    const line = lines[li];
    const w = walk(line);
    const rem = w.rem;
    const col = w.col;
    // An empty remainder is a blank line. A whitespace-only remainder
    // left behind by a '>' marker is paragraph content, but only as a
    // continuation of an open paragraph: it never starts one.
    if (rem === '') { handleBlank(w); continue; }
    if (lineIsBlank(rem)) {
      const leaf0 = stack.length > w.cdepth ? top() : null;
      // A whitespace-only line continues a table as an empty row only when
      // it holds a tab (a spaces-only line ends the table), and continues
      // an open paragraph inside a quote; otherwise it is blank.
      if (leaf0 && leaf0.t === 'table' && rem.indexOf('\t') !== -1) {
        // Falls through to the table branch below.
      } else if (!w.sawQuote || !leaf0 || leaf0.t !== 'para') { handleBlank(w); continue; }
    }
    const leaf = stack.length > w.cdepth ? top() : null;

    if (leaf && leaf.t === 'code' && leaf.fenced) {
      // A line that misses a '>' marker is outside the quote that holds
      // the fence, so the fence ends; a line that merely misses a list
      // item's indent is lazy code content and the fence swallows it —
      // except on the very first content line, where a missed item
      // indent means the fence never took hold and closes empty
      // (doc-17: the ```toml fence's first line is at column 0, while
      // doc-02's first lines match the item and only a later line is
      // lazy). A line that misses the item's indent but starts a list
      // item of its own is not lazy content: the fence ends so the new
      // item can start.
      const missedItem = w.matched < w.cdepth && stack[w.matched].t === 'item';
      const startsItem = missedItem && parseListMarker(rem, col) !== null;
      if (w.matched < w.cdepth && (stack[w.matched].t === 'quote' || startsItem || (stack[w.matched].t === 'item' && leaf.lines.length === 0))) {
        closeFrom(w.matched, true);
        openNewBlocks(rem, col);
        continue;
      }
      const ind = lineIndent(rem);
      let closed = false;
      if (ind <= 3) {
        const s = stripCols(rem, ind);
        if (s[0] === leaf.fenceCh) {
          let k = 0;
          while (k < s.length && s[k] === leaf.fenceCh) k++;
          if (k >= leaf.fenceLen && s.slice(k).trim() === '') closed = true;
        }
      }
      if (closed) { leaf.closed = true; closeFrom(w.matched < w.cdepth ? w.matched : w.cdepth, true); continue; }
      leaf.lines.push(stripFenceLine(rem, leaf.fenceInd));
      continue;
    }

    if (leaf && leaf.t === 'code' && !leaf.fenced) {
      if (w.matched < w.cdepth) { closeFrom(w.matched, true); openNewBlocks(rem, col); continue; }
      if (lineIndent(rem) >= 4) { leaf.lines.push(stripCols(rem, 4)); continue; }
      closeFrom(w.cdepth, true);
      openNewBlocks(rem, col);
      continue;
    }

    if (leaf && leaf.t === 'html') {
      if (w.matched < w.cdepth) { closeFrom(w.matched, true); openNewBlocks(rem, col); continue; }
      leaf.lines.push(rem);
      const closedNow = leaf.kind === 1
        ? rem.toLowerCase().indexOf(leaf.closer) !== -1
        : (leaf.kind >= 2 && leaf.kind <= 5 && rem.indexOf(leaf.closer) !== -1);
      if (closedNow) closeFrom(w.cdepth, !nextSrcBlank(li));
      continue;
    }

    if (leaf && leaf.t === 'table') {
      if (w.matched < w.cdepth) { closeFrom(w.matched, true); openNewBlocks(rem, col); continue; }
      // A whitespace-only line is a table row of empty cells, not an
      // indented-code block (a lone tab counts as indent 4 otherwise).
      const bs = detectBlockStart(rem, col, false);
      if (!lineIsBlank(rem) && ((bs && (bs.kind === 'atx' || bs.kind === 'fence' || bs.kind === 'hr' || bs.kind === 'html' || bs.kind === 'quote' || bs.kind === 'list')) || lineIndent(rem) >= 4)) {
        closeFrom(w.cdepth, true);
        openNewBlocks(rem, col);
        continue;
      }
      const cells = splitTableCells(rem);
      while (cells.length < leaf.header.length) cells.push('');
      leaf.rows.push(cells.slice(0, leaf.header.length));
      continue;
    }

    if (leaf && leaf.t === 'para') {
      if (w.matched < w.cdepth) {
        // A line that does not match the paragraph's containers is a lazy
        // continuation, unless it starts a block: then the paragraph ends.
        // Any list marker ends it (even an empty one, or an ordered list
        // not starting at 1), because the line is outside the item.
        const bs = detectBlockStart(rem, col, true);
        if (!canInterrupt(bs, false) && !(bs && bs.kind === 'list')) { addParaLine(leaf, rem, true); continue; }
        closeFrom(w.matched, true);
        openNewBlocks(rem, col);
        continue;
      }
      const sl = setextLevel(rem);
      if (sl) {
        if (convertParaToHeading(leaf, sl)) continue;
        // The paragraph was only reference definitions: the underline is
        // plain text in the (now empty) paragraph.
        addParaLine(leaf, rem, false);
        continue;
      }
      const bs = detectBlockStart(rem, col, true);
      // A paragraph inside a list item may be interrupted by a nested
      // ordered list starting at any number.
      let inItem = false;
      for (let d = 1; d < stack.length; d++) if (stack[d].t === 'item') { inItem = true; break; }
      if (bs && canInterrupt(bs, inItem)) {
        closeFrom(w.cdepth, true);
        openNewBlocks(rem, col);
        continue;
      }
      addParaLine(leaf, rem, false);
      continue;
    }

    if (w.matched < stack.length) closeFrom(w.matched, true);
    openNewBlocks(rem, col);
  }

  atEOF = true;
  closeFrom(1, srcEndsNL);
  return { doc, refs };
}

// ---- inline parsing (rewritten) ----
//
// Design: a single left-to-right scanner builds a flat node list. Link
// labels are resolved at the closing ']' by resolveBracket, which reads
// the label straight out of the nodes gathered so far. Code spans are
// opened only when a matching closer exists before any ']' that would
// close a live bracket with a valid link tail, so a lone backtick inside
// a label can never swallow the link. Emphasis is resolved afterwards by
// resolveDelims over the delimiter nodes in the list.

// Raw source text of one node (used to rebuild link labels).
function nodeRaw(node) {
  if (node.t === 'text' || node.t === 'code' || node.t === 'html' || node.t === 'delim' || node.t === 'bracket') return node.raw;
  if (node.t === 'br') return '\n';
  if (node.t === 'link' || node.t === 'image' || node.t === 'em' || node.t === 'strong' || node.t === 'del') {
    let s = '';
    for (const ch of node.children) s += nodeRaw(ch);
    return s;
  }
  return '';
}

// Raw label text of the nodes after bracket node at index nidx.
function labelRawOf(nodes, nidx) {
  let s = '';
  for (let k = nidx + 1; k < nodes.length; k++) s += nodeRaw(nodes[k]);
  return s;
}

// Is there an active (still linkable) bracket on the stack?
function anyLiveBracket(brackets) {
  for (let k = brackets.length - 1; k >= 0; k--) if (brackets[k].active) return true;
  return false;
}

// Index of the most recent active bracket, or -1.
function topBracket(brackets) {
  for (let k = brackets.length - 1; k >= 0; k--) if (brackets[k].active) return k;
  return -1;
}

// Does the ']' at text[j] close a live bracket whose link tail is valid?
// Used to keep a code-span search from crossing it. `openAt` is the index
// of the backtick run that started the search, so a shortcut label can be
// rebuilt from the nodes plus the literal source up to j.
function bracketHasLinkTail(text, j, openAt, brackets, nodes, refs) {
  const bi = topBracket(brackets);
  if (bi === -1) return false;
  const opener = brackets[bi];
  if (text[j + 1] === '(') {
    return readLinkTail(text, j + 1) !== null;
  }
  if (text[j + 1] === '[') {
    if (text[j + 2] === ']') {
      const lab = normalizeLabel(labelRawOf(nodes, opener.idx));
      return lab.length > 0 && lab.length <= 999 && refs.has(lab);
    }
    const lr = readRefLabel(text, j + 2);
    if (!lr) return false;
    const lab = normalizeLabel(lr.label);
    return lab.length > 0 && lab.length <= 999 && refs.has(lab);
  }
  const lab = normalizeLabel(labelRawOf(nodes, opener.idx) + text.slice(openAt, j));
  return lab.length > 0 && lab.length <= 999 && refs.has(lab);
}

// Does the label gathered so far (nodes after bracket nidx) hold a
// backtick run, either as literal backtick text or as a code span?
function labelHasBacktick(nodes, nidx) {
  for (let k = nidx + 1; k < nodes.length; k++) {
    const nd = nodes[k];
    if (nd.t === 'code') return true;
    if (nd.raw && nd.raw.indexOf('`') !== -1) return true;
  }
  return false;
}

// Find the closer for a backtick run of length `run` starting the search
// at `from`. Returns the closer index, or -1. The search stops at a ']'
// that closes a live bracket with a valid link tail, but only when the
// label gathered so far already holds a backtick run: a lone backtick
// inside a label that already has one is literal, while the only
// backtick run in a label may still close across the bracket.
function codeCloseAt(text, from, run, openAt, brackets, nodes, refs) {
  const n = text.length;
  let k = from;
  while (k < n) {
    const c = text[k];
    if (c === '`') {
      let r = 0;
      while (k + r < n && text[k + r] === '`') r++;
      if (r === run) return k;
      k += r;
    } else if (c === ']' && anyLiveBracket(brackets)) {
      const bi = topBracket(brackets);
      // The label holds a backtick if one is already in the gathered
      // nodes, or if one sits between this opener and the bracket.
      let hasTick = bi !== -1 && labelHasBacktick(nodes, brackets[bi].idx);
      if (!hasTick) {
        for (let q = openAt + run; q < k; q++) if (text[q] === '`') { hasTick = true; break; }
      }
      if (bi !== -1 && hasTick && bracketHasLinkTail(text, k, openAt, brackets, nodes, refs)) return -1;
      k++;
    } else {
      k++;
    }
  }
  return -1;
}

// Try a bracket autolink <scheme:...> or <email> at position i.
// Returns {node, end} or null.
function angleAutolink(text, i) {
  const n = text.length;
  let j = i + 1;
  if (j < n && isAlphaCh(text[j])) {
    let k = j;
    while (k < n && (isAlnumCh(text[k]) || text[k] === '+' || text[k] === '.' || text[k] === '-')) k++;
    if (k - j >= 2 && k - j <= 32 && text[k] === ':') {
      let m = k + 1;
      while (m < n && text[m] !== '>' && text[m] !== ' ' && text[m] !== '\t' && text[m] !== '\n' && text[m] !== '<' && text[m] > ' ') m++;
      if (m > k + 1 && text[m] === '>') {
        const raw = text.slice(i + 1, m);
        const href = cleanUrl(raw);
        if (href === null) return null;
        return { node: { t: 'link', auto: 'angle', children: [{ t: 'text', raw, html: escText(raw) }], href, title: null }, end: m + 1 };
      }
    }
  }
  const em = matchEmailAt(text, i + 1);
  if (em !== -1 && text[em] === '>') {
    const raw = text.slice(i + 1, em);
    const href = cleanUrl('mailto:' + raw);
    if (href === null) return null;
    return { node: { t: 'link', auto: 'angle', children: [{ t: 'text', raw, html: escText(raw) }], href, title: null }, end: em + 1 };
  }
  return null;
}

// Try raw HTML starting at position i. Returns the end index or -1.
function rawHtmlEnd(text, i) {
  if (text.startsWith('<!--', i)) {
    if (text.startsWith('<!-->', i) || text.startsWith('<!--->', i)) return i + (text.startsWith('<!-->', i) ? 5 : 6);
    const k = text.indexOf('-->', i + 4);
    return k === -1 ? -1 : k + 3;
  }
  if (text.startsWith('<?', i)) {
    const k = text.indexOf('?>', i + 2);
    return k === -1 ? -1 : k + 2;
  }
  if (text.startsWith('<![CDATA[', i)) {
    const k = text.indexOf(']]>', i + 9);
    return k === -1 ? -1 : k + 3;
  }
  if (text.startsWith('<!', i) && isAlphaCh(text[i + 2] || '')) {
    const k = text.indexOf('>', i + 2);
    return k === -1 ? -1 : k + 1;
  }
  return tagEnd(text, i);
}

// Flanking of a delimiter run at index i with length run in text.
// The start and end of the string count as whitespace.
function delimFlanking(text, i, run) {
  const prevSpace = i === 0 || isUnicodeSpace(text[i - 1]);
  const prevPunct = i > 0 && isUnicodePunct(text[i - 1]);
  const j = i + run;
  const nextSpace = j >= text.length || isUnicodeSpace(text[j]);
  const nextPunct = j < text.length && isUnicodePunct(text[j]);
  return {
    leftFl: !nextSpace && (!nextPunct || prevSpace || prevPunct),
    rightFl: !prevSpace && (!prevPunct || nextSpace || nextPunct),
    prevPunct,
    nextPunct,
  };
}

// The inline scanner. Builds the node list for one block of inline text.
function parseInline(text, refs) {
  const n = text.length;
  const nodes = [];
  const brackets = [];
  let inBracket = false;
  let rawBuf = '';
  let htmlBuf = '';

  function addText(raw, html) { rawBuf += raw; htmlBuf += html; }
  function flushText() {
    if (rawBuf !== '') {
      nodes.push({ t: 'text', raw: rawBuf, html: htmlBuf });
      rawBuf = '';
      htmlBuf = '';
    }
  }
  function pushNode(node) { flushText(); nodes.push(node); }

  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '\\') {
      if (i + 1 < n && text[i + 1] === '\n') {
        pushNode({ t: 'br', raw: '\n' });
        i += 2;
        while (i < n && (text[i] === ' ' || text[i] === '\t')) i++;
        continue;
      }
      if (i + 1 < n && isPunctCh(text[i + 1])) { addText(text.slice(i, i + 2), escChar(text[i + 1])); i += 2; continue; }
      addText('\\', '\\');
      i++;
      continue;
    }
    if (c === '\n') {
      let k = rawBuf.length;
      let cnt = 0;
      while (k > 0 && (rawBuf[k - 1] === ' ' || rawBuf[k - 1] === '\t')) { k--; cnt++; }
      if (cnt >= 2) {
        // rawBuf and htmlBuf differ in length when escapes are present
        // (an escape is 2 chars raw, 1 char html), so drop the trailing
        // whitespace from each by its own count, not a shared index.
        rawBuf = rawBuf.slice(0, k);
        htmlBuf = htmlBuf.slice(0, htmlBuf.length - cnt);
        pushNode({ t: 'br', raw: '\n' });
      } else {
        addText('\n', '\n');
      }
      i++;
      // A hard break swallows the next line's leading whitespace.
      if (cnt >= 2) while (i < n && (text[i] === ' ' || text[i] === '\t')) i++;
      continue;
    }
    if (c === '`') {
      let run = 0;
      while (i + run < n && text[i + run] === '`') run++;
      // Flush pending text so the label check sees the backticks
      // gathered so far.
      flushText();
      const found = codeCloseAt(text, i + run, run, i, brackets, nodes, refs);
      if (found !== -1) {
        let content = text.slice(i + run, found).replace(/\n/g, ' ');
        if (content.length > 1 && content[0] === ' ' && content[content.length - 1] === ' ' && /[^ ]/.test(content)) {
          content = content.slice(1, -1);
        }
        pushNode({ t: 'code', raw: content, html: escCode(content) });
        i = found + run;
        continue;
      }
      addText('`'.repeat(run), '`'.repeat(run));
      i += run;
      continue;
    }
    if (c === '&') {
      if (text[i + 1] === '#') {
        const m = text.slice(i + 2).match(/^(?:[xX]([0-9a-fA-F]+)|([0-9]+));/);
        if (m) {
          const dec = decodeNumeric(m[1] !== undefined ? m[1] : m[2], m[1] !== undefined);
          if (dec !== null) {
            addText(dec, escChar(dec));
            i += 2 + m[0].length;
            continue;
          }
        }
        addText('&', '&amp;');
        i++;
        continue;
      }
      const m = text.slice(i + 1).match(/^[A-Za-z][A-Za-z0-9]*;/);
      if (m) {
        addText('&' + m[0], '&' + m[0]);
        i += 1 + m[0].length;
        continue;
      }
      addText('&', '&amp;');
      i++;
      continue;
    }
    if (c === '<') {
      const al = angleAutolink(text, i);
      if (al) { pushNode(al.node); i = al.end; continue; }
      const he = rawHtmlEnd(text, i);
      if (he !== -1) {
        const raw = text.slice(i, he);
        pushNode({ t: 'html', raw, html: raw });
        i = he;
        continue;
      }
      addText('<', '&lt;');
      i++;
      continue;
    }
    if (c === '!' && text[i + 1] === '[') {
      flushText();
      const b = { t: 'bracket', image: true, active: true, raw: '![', idx: nodes.length };
      nodes.push(b);
      brackets.push(b);
      inBracket = true;
      i += 2;
      continue;
    }
    if (c === '[') {
      flushText();
      const b = { t: 'bracket', image: false, active: true, raw: '[', idx: nodes.length };
      nodes.push(b);
      brackets.push(b);
      inBracket = true;
      i++;
      continue;
    }
    if (c === ']') {
      flushText();
      const res = resolveBracket(text, i, nodes, brackets, refs);
      inBracket = anyLiveBracket(brackets);
      if (res) { i = res.end; continue; }
      addText(']', ']');
      i++;
      continue;
    }
    if (c === '*' || c === '_' || c === '~') {
      let run = 0;
      while (i + run < n && text[i + run] === c) run++;
      if (c === '~' && run >= 3) { addText('~'.repeat(run), '~'.repeat(run)); i += run; continue; }
      const fl = delimFlanking(text, i, run);
      let canOpen = fl.leftFl;
      let canClose = fl.rightFl;
      if (c === '_') {
        canOpen = fl.leftFl && (!fl.rightFl || fl.prevPunct);
        canClose = fl.rightFl && (!fl.leftFl || fl.nextPunct);
      }
      pushNode({ t: 'delim', ch: c, n: run, canOpen, canClose, raw: c.repeat(run) });
      i += run;
      continue;
    }
    const ext = tryExtendedAutolink(text, i, refs, inBracket);
    if (ext) { pushNode(ext.node); i = ext.end; continue; }
    addText(c, escChar(c));
    i++;
  }
  flushText();
  resolveDelims(nodes);
  return nodes;
}

// Read a link label starting at text[i] (after the '['). Returns
// {label, end} with end past the closing ']', or null. A '[' inside the
// label (unescaped) makes it fail.
function readRefLabel(text, i) {
  const n = text.length;
  let j = i;
  let label = '';
  while (j < n) {
    const c = text[j];
    if (c === '\\' && j + 1 < n && isPunctCh(text[j + 1])) { label += text.slice(j, j + 2); j += 2; continue; }
    if (c === '[') return null;
    if (c === ']') return { label, end: j + 1 };
    label += c;
    j++;
    if (label.length > 999) return null;
  }
  return null;
}

// Read an inline link destination/title starting at text[i] (the '(').
// Returns {href, title, end} with end past the closing ')', or null.
function readLinkTail(text, i) {
  const n = text.length;
  let j = i + 1;
  while (j < n && (text[j] === ' ' || text[j] === '\t' || text[j] === '\n')) j++;
  if (j >= n) return null;
  let dest = '';
  if (text[j] === '<') {
    j++;
    let closed = false;
    while (j < n) {
      const c = text[j];
      if (c === '\n') return null;
      if (c === '\\' && j + 1 < n && isPunctCh(text[j + 1])) { dest += text[j + 1]; j += 2; continue; }
      if (c === '>') { closed = true; j++; break; }
      if (c === '<') return null;
      dest += c;
      j++;
    }
    if (!closed) return null;
  } else if (text[j] === ')') {
    return { href: '', title: null, end: j + 1 };
  } else {
    let depth = 0;
    let got = false;
    while (j < n) {
      const c = text[j];
      if (c === ' ' || c === '\t' || c === '\n' || c < ' ') break;
      if (c === '\\' && j + 1 < n && isPunctCh(text[j + 1])) { dest += text[j + 1]; j += 2; got = true; continue; }
      if (c === '(') { depth++; dest += c; j++; got = true; continue; }
      if (c === ')') {
        if (depth === 0) break;
        depth--; dest += c; j++; got = true; continue;
      }
      dest += c;
      j++;
      got = true;
    }
    if (!got) return null;
    if (depth !== 0) return null;
  }
  let title = null;
  let k = j;
  while (k < n && (text[k] === ' ' || text[k] === '\t' || text[k] === '\n')) k++;
  if (k < n && (text[k] === '"' || text[k] === "'" || text[k] === '(')) {
    const open = text[k];
    const close = open === '(' ? ')' : open;
    k++;
    let t = '';
    let closed = false;
    while (k < n) {
      const c = text[k];
      if (c === '\\' && k + 1 < n && isPunctCh(text[k + 1])) { t += text[k + 1]; k += 2; continue; }
      if (c === close) { closed = true; k++; break; }
      if (open === '(' && c === '(') return null;
      t += c;
      k++;
    }
    if (!closed) return null;
    title = t;
    j = k;
    while (j < n && (text[j] === ' ' || text[j] === '\t' || text[j] === '\n')) j++;
  }
  if (text[j] !== ')') return null;
  return { href: dest, title, end: j + 1 };
}

// Replace extended-autolink nodes with their (recursively flattened)
// children. Bracket autolinks (auto 'angle') are kept as nested links.
function flattenAutoLinks(nodes) {
  const out = [];
  for (const nd of nodes) {
    if (nd.t === 'link' && nd.auto === true) out.push(...flattenAutoLinks(nd.children));
    else out.push(nd);
  }
  return out;
}

// A label fails to form a link when it holds a code span whose content
// contains a backtick, UNLESS that span is the last thing in the label:
// a trailing backtick span still links.
function labelHasBacktickCode(nodes, nidx) {
  let last = -1;
  for (let k = nidx + 1; k < nodes.length; k++) {
    const nd = nodes[k];
    if (nd.t === 'code' && nd.raw.indexOf('`') !== -1) last = k;
  }
  if (last === -1) return false;
  return last < nodes.length - 1;
}

// Try to resolve a ']' at position i into a link or image. On success
// the node is pushed onto nodes and {end} is returned; otherwise null.
function resolveBracket(text, i, nodes, brackets, refs) {
  const bi = topBracket(brackets);
  if (bi === -1) return null;
  const opener = brackets[bi];
  const nidx = opener.idx;
  const labelRaw = labelRawOf(nodes, nidx);
  // A label with an unescaped '[' in it never matches a definition.
  const badLabel = hasUnescapedOpenBracket(labelRaw);
  // A label holding a backtick code span never forms a link at all, and
  // the delimiters inside such a failed label stay literal too.
  if (labelHasBacktickCode(nodes, nidx)) {
    for (let k = nidx + 1; k < nodes.length; k++) if (nodes[k].t === 'delim') nodes[k].dead = true;
    opener.active = false;
    return null;
  }
  let href = null;
  let title = null;
  let end = -1;
  if (text[i + 1] === '(') {
    const r = readLinkTail(text, i + 1);
    if (r) {
      href = r.href;
      title = r.title;
      end = r.end;
    } else if (!badLabel) {
      // Not an inline link after all: try the shortcut reference instead.
      const lab = normalizeLabel(labelRaw);
      if (lab.length === 0 || lab.length > 999) { opener.active = false; return null; }
      const ref = refs.get(lab);
      if (!ref) { opener.active = false; return null; }
      href = ref.dest;
      title = ref.title;
      end = i + 1;
    } else { opener.active = false; return null; }
  } else if (text[i + 1] === '[') {
    if (text[i + 2] === ']') {
      if (badLabel) { opener.active = false; return null; }
      const lab = normalizeLabel(labelRaw);
      if (lab.length === 0 || lab.length > 999) { opener.active = false; return null; }
      const ref = refs.get(lab);
      if (!ref) { opener.active = false; return null; }
      href = ref.dest;
      title = ref.title;
      end = i + 3;
    } else {
      const lr = readRefLabel(text, i + 2);
      if (!lr) { opener.active = false; return null; }
      const lab = normalizeLabel(lr.label);
      if (lab.length === 0 || lab.length > 999) { opener.active = false; return null; }
      const ref = refs.get(lab);
      if (!ref) { opener.active = false; return null; }
      href = ref.dest;
      title = ref.title;
      end = lr.end;
    }
  } else {
    if (badLabel) { opener.active = false; return null; }
    const lab = normalizeLabel(labelRaw);
    if (lab.length === 0 || lab.length > 999) { opener.active = false; return null; }
    const ref = refs.get(lab);
    if (!ref) { opener.active = false; return null; }
    href = ref.dest;
    title = ref.title;
    end = i + 1;
  }
  const clean = cleanUrl(href);
  if (clean === null) { opener.active = false; return null; }
  if (!opener.image) {
    // A link may not contain a bracket-formed link, but an autolink
    // inside link text is flattened to plain text and the outer link
    // still forms.
    for (let k = nidx + 1; k < nodes.length; k++) {
      if (nodes[k].t === 'link' && !nodes[k].auto) { opener.active = false; return null; }
    }
  }
  const children = flattenAutoLinks(nodes.splice(nidx + 1));
  nodes.splice(nidx, 1);
  const node = opener.image
    ? { t: 'image', children, href: clean, title }
    : { t: 'link', children, href: clean, title };
  nodes.push(node);
  for (let k = bi + 1; k < brackets.length; k++) brackets[k].active = false;
  brackets.length = bi;
  return { end };
}

// ---- extended autolinks (www., scheme:, email) ----

function isEmailChar(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
    '.!#$%&\'*+/=?^_`{|}~-'.indexOf(c) !== -1;
}

// Match an email address starting at text[i]. Returns the end index, or -1.
function matchEmailAt(text, i) {
  const n = text.length;
  let j = i;
  while (j < n && isEmailChar(text[j])) j++;
  if (j === i || text[j] !== '@') return -1;
  let k = j + 1;
  if (k >= n || !isAlnumCh(text[k])) return -1;
  while (true) {
    let lastAlnum = k;
    let p = k;
    while (p < n && (isAlnumCh(text[p]) || text[p] === '-')) {
      if (isAlnumCh(text[p])) lastAlnum = p;
      p++;
    }
    if (text[p - 1] === '-') return lastAlnum + 1;
    k = p;
    if (text[k] === '.' && k + 1 < n && isAlnumCh(text[k + 1])) { k++; continue; }
    return k;
  }
}

// Plain email autolink starting at i. The character after the match must
// not be able to continue the address, apart from trailing punctuation.
function matchEmailExtended(text, i) {
  const end = matchEmailAt(text, i);
  if (end === -1) return -1;
  if (end < text.length) {
    const c = text[end];
    // A lone '_' after the address blocks the autolink (gfm-632), but
    // '__' is an emphasis closer, not part of the address (doc-04), and
    // so is a lone '_' that closes an emphasis: it is followed by
    // whitespace or punctuation, not by a word character or end of
    // text (doc-31: '_ ..._ write'; doc-34: '_ ..._:'). A '_' at end
    // of text, or followed by a word character, is part of the
    // address and blocks the autolink.
    if (c === '_' && text[end + 1] === '_') return end;
    if (c === '_') {
      const nx = text[end + 1];
      if (nx !== undefined && !isAlnumCh(nx) && nx !== '_') return end;
    }
    if (isEmailChar(c) && '.,;:!?*~'.indexOf(c) === -1) return -1;
  }
  return end;
}

// Trim trailing punctuation, unbalanced closing parens and a trailing
// entity reference from an autolink candidate.
function trimAutolink(raw) {
  let s = raw;
  while (true) {
    let changed = false;
    if (s.endsWith(';')) {
      const amp = s.lastIndexOf('&');
      if (amp !== -1 && /^&(#?[A-Za-z0-9]+);$/.test(s.slice(amp))) {
        s = s.slice(0, amp);
        changed = true;
      }
    }
    while (s.length > 0 && '?!.,:;*_~'.indexOf(s[s.length - 1]) !== -1) {
      s = s.slice(0, -1);
      changed = true;
    }
    while (s.endsWith(')')) {
      let open = 0;
      let close = 0;
      for (let k = 0; k < s.length; k++) {
        if (s[k] === '(') open++;
        else if (s[k] === ')') close++;
      }
      if (close > open) { s = s.slice(0, -1); changed = true; }
      else break;
    }
    if (!changed) break;
  }
  return s;
}

// Match a www. autolink starting at i. Returns the end index, or -1.
function matchWww(text, i, inBracket) {
  const n = text.length;
  let k = i + 4;
  if (k >= n || !isAlnumCh(text[k])) return -1;
  while (true) {
    let lastAlnum = k;
    let p = k;
    while (p < n && (isAlnumCh(text[p]) || text[p] === '-')) {
      if (isAlnumCh(text[p])) lastAlnum = p;
      p++;
    }
    if (text[p - 1] === '-') return lastAlnum + 1 > i + 4 ? i + trimAutolink(text.slice(i, lastAlnum + 1)).length : -1;
    k = p;
    if (text[k] === '.' && k + 1 < n && isAlnumCh(text[k + 1])) { k++; continue; }
    break;
  }
  if (text[k] === ':' && k + 1 < n && isDigitCh(text[k + 1])) {
    k++;
    while (k < n && isDigitCh(text[k])) k++;
  }
  if (text[k] === '/' || text[k] === '\\') {
    let p = k;
    // Inside link text the path stops at ']' so the outer bracket can close.
    // A '(' that opens a fresh scheme:// URL does NOT end the run: the
    // autolink continues through it and paren balancing trims the end.
    while (p < n && text[p] !== ' ' && text[p] !== '\t' && text[p] !== '\n' && text[p] !== '<' && text[p] !== '>' && !(inBracket && text[p] === ']')) {
      p++;
    }
    k = p;
  }
  const trimmed = trimAutolink(text.slice(i, k));
  if (trimmed.length <= 4) return -1;
  return i + trimmed.length;
}

// Match a scheme autolink whose colon is at text[colon]. Returns the end
// index, or -1.
function matchSchemeAutolink(text, i, colon, inBracket) {
  const n = text.length;
  const contentStart = colon + 1;
  let p = contentStart;
  // Inside link text the run stops at ']' so the outer bracket can close.
  // A '(' that opens a fresh scheme:// URL does NOT end the run: the
  // autolink continues through it and paren balancing trims the end.
  while (p < n && text[p] !== ' ' && text[p] !== '\t' && text[p] !== '\n' && text[p] !== '<' && text[p] !== '>' && !(inBracket && text[p] === ']')) {
    p++;
  }
  const runEnd = p;
  let at = -1;
  let slash = -1;
  for (let q = contentStart; q < runEnd; q++) {
    if (text[q] === '@' && at === -1) at = q;
    if (text[q] === '/' && slash === -1) slash = q;
  }
  if (at !== -1 && (slash === -1 || at < slash)) {
    const emEnd = matchEmailAt(text, contentStart);
    if (emEnd !== -1) {
      // An email followed by '-' or '_' is not an autolink at all.
      if (text[emEnd] === '-' || text[emEnd] === '_') return -1;
      let end = emEnd;
      if (text[end] === '/') {
        let s = end + 1;
        while (s < n && text[s] !== ' ' && text[s] !== '\t' && text[s] !== '\n' && text[s] !== '<' && text[s] !== '>' && text[s] !== '/') s++;
        if (s > end + 1) end = s;
      }
      const trimmed = trimAutolink(text.slice(i, end));
      if (trimmed.length <= colon - i + 1) return -1;
      return i + trimmed.length;
    }
  }
  const trimmed = trimAutolink(text.slice(i, runEnd));
  if (trimmed.length <= colon - i + 1) return -1;
  // The body after the colon must hold at least one alphanumeric
  // character: a bare '?' or ':' is not a link (a backslash alone is a
  // hard break, not a link either).
  const body = trimmed.slice(colon - i + 1);
  let hasAlnum = false;
  for (let q = 0; q < body.length; q++) if (isAlnumCh(body[q])) { hasAlnum = true; break; }
  if (!hasAlnum) return -1;
  return i + trimmed.length;
}

// Try an extended autolink (www., scheme:, email) starting at i.
function tryExtendedAutolink(text, i, refs, inBracket) {
  const n = text.length;
  // An autolink never starts in the middle of a word.
  if (i > 0 && isAlnumCh(text[i - 1])) return null;
  if (text.startsWith('www.', i)) {
    const end = matchWww(text, i, inBracket);
    if (end === -1) return null;
    const raw = text.slice(i, end);
    const href = cleanUrl('http://' + raw);
    if (href === null) return null;
    return { node: { t: 'link', auto: true, children: [{ t: 'text', raw, html: escText(raw) }], href, title: null }, end };
  }
  if (isAlphaCh(text[i])) {
    let k = i;
    while (k < n && (isAlnumCh(text[k]) || text[k] === '+' || text[k] === '.' || text[k] === '-')) k++;
    if (k - i >= 2 && k - i <= 32 && text[k] === ':' && k + 1 < n &&
        text[k + 1] !== ' ' && text[k + 1] !== '\t' && text[k + 1] !== '\n' &&
        text[k + 1] !== '<' && text[k + 1] !== '>') {
      const end = matchSchemeAutolink(text, i, k, inBracket);
      if (end !== -1) {
        const raw = text.slice(i, end);
        const href = cleanUrl(raw);
        if (href === null) return null;
        return { node: { t: 'link', auto: true, children: [{ t: 'text', raw, html: escText(raw) }], href, title: null }, end };
      }
    }
  }
  if (isEmailChar(text[i])) {
    const end = matchEmailExtended(text, i);
    if (end !== -1) {
      const raw = text.slice(i, end);
      const href = cleanUrl('mailto:' + raw);
      if (href === null) return null;
      return { node: { t: 'link', auto: true, children: [{ t: 'text', raw, html: escText(raw) }], href, title: null }, end };
    }
  }
  return null;
}

// Resolve emphasis, strong emphasis and strikethrough in one node list.
// Delimiters only pair within the same list, so link text is scoped.
//
// Two rules beyond the plain cmark odd-match rule:
//  - Barrier: when a both-flanking closer pairs with an open-only opener,
//    it becomes a barrier: later len-1 closers may not search past it
//    (len-2+ closers still may). That keeps an outer len-1 opener from
//    swallowing a run that already closed an inner emphasis.
//  - A closer run's leftover asterisks render INSIDE the emphasis it
//    closed (as trailing text), never after it.
function resolveDelims(nodes) {
  for (const node of nodes) {
    if (node.t === 'link' || node.t === 'image') resolveDelims(node.children);
  }
  const delims = [];
  for (const node of nodes) if (node.t === 'delim') delims.push(node);
  if (delims.length === 0) return;
  // Index in `delims` of the barrier closer, its character, and the
  // run length it used when it paired, or -1.
  let barrier = -1;
  let barrierCh = '';
  let barrierUse = 0;
  for (let ci = 0; ci < delims.length; ci++) {
    const closer = delims[ci];
    if (closer.n === 0 || !closer.canClose || closer.dead) continue;
    // Is there an unpaired strong opener of this character before the
    // barrier? A len-1 closer past the barrier must not steal from it.
    let strongPending = false;
    if (barrier !== -1 && closer.ch === barrierCh && closer.n === 1) {
      for (let bi = 0; bi < barrier; bi++) {
        const bd = delims[bi];
        if (bd.ch === closer.ch && bd.n >= 2 && bd.canOpen && !bd.dead) { strongPending = true; break; }
      }
    }
    let lastWrapped = null;
    let lastUse = 0;
    let formed = 0;
    while (closer.n > 0 && closer.canClose) {
      let opener = null;
      for (let oi = ci - 1; oi >= 0; oi--) {
        const cand = delims[oi];
        if (cand.n === 0 || !cand.canOpen || cand.ch !== closer.ch || cand.dead) continue;
        // A len-1 closer past a same-character barrier may not pair at
        // all while a strong opener of that character is still pending,
        // or while the barrier closer itself formed a strong; otherwise
        // it may pair with a len-1 opener there.
        if (closer.n === 1 && oi < barrier && closer.ch === barrierCh && (strongPending || barrierUse === 2)) continue;
        // Rule of 3s: when either delimiter can both open and close, a
        // match is barred when the run lengths sum to a multiple of 3,
        // unless both runs are themselves multiples of 3.
        if (((cand.canOpen && cand.canClose) || (closer.canOpen && closer.canClose)) && ((cand.n + closer.n) % 3 === 0) && !((cand.n % 3 === 0) && (closer.n % 3 === 0))) continue;
        opener = cand;
        break;
      }
      if (!opener) break;
      const use = (opener.n >= 2 && closer.n >= 2) ? 2 : 1;
      const oi = nodes.indexOf(opener);
      const cidx = nodes.indexOf(closer);
      if (oi === -1 || cidx === -1 || cidx <= oi) break;
      const type = closer.ch === '~' ? 'del' : (use === 2 ? 'strong' : 'em');
      const children = nodes.slice(oi + 1, cidx);
      const wrapped = { t: type, children };
      lastWrapped = wrapped;
      lastUse = use;
      formed++;
      // A both-flanking closer that pairs with an open-only opener sets
      // the barrier for later len-1 closers of the same character.
      if (closer.canOpen && closer.canClose && !(opener.canOpen && opener.canClose)) { barrier = ci; barrierCh = closer.ch; barrierUse = use; }
      opener.n -= use;
      closer.n -= use;
      const repl = [];
      if (opener.n > 0) { opener.raw = opener.ch.repeat(opener.n); repl.push(opener); }
      repl.push(wrapped);
      if (closer.n > 0) { closer.raw = closer.ch.repeat(closer.n); repl.push(closer); }
      nodes.splice(oi, cidx - oi + 1, ...repl);
      // Delimiters that ended up inside the new emphasis belong to it
      // now; an outer closer must not reach in and pair with them.
      for (const child of children) if (child.t === 'delim') child.dead = true;
    }
    // A closer run's leftover renders INSIDE the emphasis it closed, but
    // only when a strong was formed, it holds a nested emphasis, and this
    // closer formed exactly one of them; otherwise the leftover stays
    // outside.
    if (closer.n > 0 && lastWrapped && formed === 1 && lastUse === 2) {
      let nested = false;
      for (const ch of lastWrapped.children) {
        if (ch.t === 'em' || ch.t === 'strong' || ch.t === 'del') { nested = true; break; }
      }
      if (nested) {
        const cidx = nodes.indexOf(closer);
        if (cidx !== -1) {
          nodes.splice(cidx, 1);
          lastWrapped.children.push({ t: 'text', raw: closer.ch.repeat(closer.n), html: closer.ch.repeat(closer.n) });
          closer.n = 0;
        }
      }
    }
  }
  for (let k = nodes.length - 1; k >= 0; k--) {
    if (nodes[k].t === 'delim') {
      if (nodes[k].n === 0) nodes.splice(k, 1);
      else nodes[k] = { t: 'text', raw: nodes[k].raw, html: nodes[k].raw };
    }
  }
}

// Strip tags from rendered inline HTML (for image alt text).
function stripTags(html) {
  let out = '';
  let inTag = false;
  for (let i = 0; i < html.length; i++) {
    const c = html[i];
    if (c === '<') inTag = true;
    else if (c === '>') inTag = false;
    else if (!inTag) out += c;
  }
  return out;
}

// Plain text of inline nodes, for image alt attributes. An image inside
// contributes its own alt text; raw HTML contributes nothing.
function altText(nodes) {
  let out = '';
  for (const node of nodes) {
    if (node.t === 'text' || node.t === 'code') out += node.html;
    else if (node.t === 'em' || node.t === 'strong' || node.t === 'del' || node.t === 'link' || node.t === 'image') out += altText(node.children);
    else if (node.t === 'bracket') out += node.image ? '![' : '[';
    else if (node.t === 'delim') out += node.raw;
  }
  return out;
}

function renderInline(nodes) {
  const parts = [];
  for (const node of nodes) {
    if (node.t === 'text') parts.push(node.html);
    else if (node.t === 'code') parts.push('<code>' + node.html + '</code>');
    else if (node.t === 'br') parts.push('<br>');
    else if (node.t === 'html') parts.push(node.html);
    else if (node.t === 'em') parts.push('<em>' + renderInline(node.children) + '</em>');
    else if (node.t === 'strong') parts.push('<strong>' + renderInline(node.children) + '</strong>');
    else if (node.t === 'del') parts.push('<del>' + renderInline(node.children) + '</del>');
    else if (node.t === 'link') {
      let s = '<a href="' + escText(node.href) + '"';
      if (node.title !== null && node.title !== undefined) s += ' title="' + escText(node.title) + '"';
      s += '>' + renderInline(node.children) + '</a>';
      parts.push(s);
    } else if (node.t === 'image') {
      let s = '<img src="' + escText(node.href) + '" alt="' + altText(node.children) + '"';
      if (node.title !== null && node.title !== undefined) s += ' title="' + escText(node.title) + '"';
      s += '>';
      parts.push(s);
    } else if (node.t === 'bracket') {
      parts.push(node.image ? '![' : '[');
    } else if (node.t === 'delim') {
      parts.push(node.raw);
    }
  }
  return parts.join('');
}

// ---- block rendering ----

// A list item is a task item when its first paragraph begins with a
// checkbox followed by whitespace. Returns {checked, rest} or null.
function parseTaskPara(para) {
  const text = para.lines.join('\n');
  if (text.length < 3 || text[0] !== '[') return null;
  const m = text[1];
  if (m !== ' ' && m !== 'x' && m !== 'X') return null;
  if (text[2] !== ']') return null;
  if (text.length < 4) return null;
  const c = text[3];
  if (c !== ' ' && c !== '\t' && c !== '\n') return null;
  let j = 3;
  while (j < text.length && (text[j] === ' ' || text[j] === '\t' || text[j] === '\n')) j++;
  return { checked: m === 'x' || m === 'X', rest: text.slice(j) };
}

function renderNode(node, refs, tight) {
  switch (node.t) {
    case 'doc': {
      let s = '';
      for (const c of node.children) s += renderNode(c, refs, false);
      return s;
    }
    case 'para': {
      const html = renderInline(parseInline(node.lines.join('\n'), refs));
      return tight ? html : '<p>' + html + '</p>\n';
    }
    case 'heading': {
      return '<h' + node.level + '>' + renderInline(parseInline(node.text, refs)) + '</h' + node.level + '>\n';
    }
    case 'code': {
      const content = node.lines.join('\n') + (node.lines.length ? '\n' : '');
      const lang = node.lang ? ' class="language-' + escText(node.lang) + '"' : '';
      return '<pre><code' + lang + '>' + escCode(content) + '</code></pre>\n';
    }
    case 'html': {
      // An html block keeps the newline after its last line unless the
      // line that follows it is blank (decided when the block closes).
      return node.lines.join('\n') + (node.trailingNL ? '\n' : '');
    }
    case 'hr': {
      return '<hr>\n';
    }
    case 'quote': {
      let s = '<blockquote>\n';
      for (const c of node.children) s += renderNode(c, refs, false);
      return s + '</blockquote>\n';
    }
    case 'list': {
      let s = node.ordered
        ? '<ol' + (node.start !== 1 ? ' start="' + node.start + '"' : '') + '>\n'
        : '<ul>\n';
      for (const it of node.children) s += renderNode(it, refs, node.tight);
      return s + (node.ordered ? '</ol>\n' : '</ul>\n');
    }
    case 'item': {
      let s = '<li>';
      const kids = node.children;
      for (let k = 0; k < kids.length; k++) {
        const child = kids[k];
        if (k === 0 && child.t === 'para') {
          const task = parseTaskPara(child);
          if (task) {
            const inner = renderInline(parseInline(task.rest, refs));
            const box = task.checked
              ? '<input checked="" disabled="" type="checkbox"> '
              : '<input disabled="" type="checkbox"> ';
            s += tight ? box + inner : '<p>' + box + inner + '</p>\n';
            continue;
          }
        }
        s += renderNode(child, refs, tight);
      }
      return s + '</li>\n';
    }
    case 'table': {
      let s = '<table>\n<thead>\n<tr>\n';
      for (let k = 0; k < node.header.length; k++) {
        const a = node.aligns[k];
        s += '<th' + (a ? ' align="' + a + '"' : '') + '>' + renderInline(parseInline(node.header[k], refs)) + '</th>\n';
      }
      s += '</tr>\n</thead>\n';
      if (node.rows.length > 0) {
        s += '<tbody>';
        for (const row of node.rows) {
          s += '<tr>\n';
          for (let k = 0; k < row.length; k++) {
            const a = node.aligns[k];
            s += '<td' + (a ? ' align="' + a + '"' : '') + '>' + renderInline(parseInline(row[k], refs)) + '</td>\n';
          }
          s += '</tr>\n';
        }
        s += '</tbody>';
      }
      return s + '</table>\n';
    }
  }
  return '';
}

export function parse(src) {
  const normalized = src.replace(/\r\n?/g, '\n');
  const { doc, refs } = parseBlocks(normalized);
  return renderNode(doc, refs, false);
}
