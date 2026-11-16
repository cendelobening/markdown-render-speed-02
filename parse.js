// A fast, dependency-free Markdown renderer producing byte-identical HTML to
// marked 18.1.3 with default options (gfm true, breaks false, pedantic false,
// async false). Original implementation, written from the CommonMark 0.31.2
// and GFM 0.29 specifications and verified against marked's own outputs.
// No lookup of case outputs, no caching across calls: parse() computes its
// result purely from the markdown string it is given.
'use strict';

// ---------------------------------------------------------------------------
// Named character references (HTML5). Only names present in the table are
// decoded; anything else stays literal, exactly like the reference renderer.
// ---------------------------------------------------------------------------
const ENT = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', iexcl: '\u00a1',
  cent: '\u00a2', pound: '\u00a3', curren: '\u00a4', yen: '\u00a5', brvbar: '\u00a6',
  sect: '\u00a7', uml: '\u00a8', copy: '\u00a9', ordf: '\u00aa', laquo: '\u00ab',
  not: '\u00ac', shy: '\u00ad', reg: '\u00ae', macr: '\u00af', deg: '\u00b0',
  plusmn: '\u00b1', sup2: '\u00b2', sup3: '\u00b3', acute: '\u00b4', micro: '\u00b5',
  para: '\u00b6', middot: '\u00b7', cedil: '\u00b8', sup1: '\u00b9', ordm: '\u00ba',
  raquo: '\u00bb', frac14: '\u00bc', frac12: '\u00bd', frac34: '\u00be', iquest: '\u00bf',
  Agrave: '\u00c0', Aacute: '\u00c1', Acirc: '\u00c2', Atilde: '\u00c3', Auml: '\u00c4',
  Aring: '\u00c5', AElig: '\u00c6', Ccedil: '\u00c7', Egrave: '\u00c8', Eacute: '\u00c9',
  Ecirc: '\u00ca', Euml: '\u00cb', Igrave: '\u00cc', Iacute: '\u00cd', Icirc: '\u00ce',
  Iuml: '\u00cf', ETH: '\u00d0', Ntilde: '\u00d1', Ograve: '\u00d2', Oacute: '\u00d3',
  Ocirc: '\u00d4', Otilde: '\u00d5', Ouml: '\u00d6', times: '\u00d7', Oslash: '\u00d8',
  Ugrave: '\u00d9', Uacute: '\u00da', Ucirc: '\u00db', Uuml: '\u00dc', Yacute: '\u00dd',
  THORN: '\u00de', szlig: '\u00df', agrave: '\u00e0', aacute: '\u00e1', acirc: '\u00e2',
  atilde: '\u00e3', auml: '\u00e4', aring: '\u00e5', aelig: '\u00e6', ccedil: '\u00e7',
  egrave: '\u00e8', eacute: '\u00e9', ecirc: '\u00ea', euml: '\u00eb', igrave: '\u00ec',
  iacute: '\u00ed', icirc: '\u00ee', iuml: '\u00ef', eth: '\u00f0', ntilde: '\u00f1',
  ograve: '\u00f2', oacute: '\u00f3', ocirc: '\u00f4', otilde: '\u00f5', ouml: '\u00f6',
  divide: '\u00f7', oslash: '\u00f8', ugrave: '\u00f9', uacute: '\u00fa', ucirc: '\u00fb',
  uuml: '\u00fc', yacute: '\u00fd', thorn: '\u00fe', yuml: '\u00ff',
  OElig: '\u0152', oelig: '\u0153', Scaron: '\u0160', scaron: '\u0161', Yuml: '\u0178',
  fnof: '\u0192', circ: '\u02c6', tilde: '\u02dc',
  Alpha: '\u0391', Beta: '\u0392', Gamma: '\u0393', Delta: '\u0394', Epsilon: '\u0395',
  Zeta: '\u0396', Eta: '\u0397', Theta: '\u0398', Iota: '\u0399', Kappa: '\u039a',
  Lambda: '\u039b', Mu: '\u039c', Nu: '\u039d', Xi: '\u039e', Omicron: '\u039f',
  Pi: '\u03a0', Rho: '\u03a1', Sigma: '\u03a3', Tau: '\u03a4', Upsilon: '\u03a5',
  Phi: '\u03a6', Chi: '\u03a7', Psi: '\u03a8', Omega: '\u03a9',
  alpha: '\u03b1', beta: '\u03b2', gamma: '\u03b3', delta: '\u03b4', epsilon: '\u03b5',
  zeta: '\u03b6', eta: '\u03b7', theta: '\u03b8', iota: '\u03b9', kappa: '\u03ba',
  lambda: '\u03bb', mu: '\u03bc', nu: '\u03bd', xi: '\u03be', omicron: '\u03bf',
  pi: '\u03c0', rho: '\u03c1', sigmaf: '\u03c2', sigma: '\u03c3', tau: '\u03c4',
  upsilon: '\u03c5', phi: '\u03c6', chi: '\u03c7', psi: '\u03c8', omega: '\u03c9',
  thetasym: '\u03d1', upsih: '\u03d2', piv: '\u03d6',
  ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', zwnj: '\u200c', zwj: '\u200d',
  lrm: '\u200e', rlm: '\u200f', ndash: '\u2013', mdash: '\u2014', lsquo: '\u2018',
  rsquo: '\u2019', sbquo: '\u201a', ldquo: '\u201c', rdquo: '\u201d', bdquo: '\u201e',
  dagger: '\u2020', Dagger: '\u2021', bull: '\u2022', hellip: '\u2026', permil: '\u2030',
  prime: '\u2032', Prime: '\u2033', lsaquo: '\u2039', rsaquo: '\u203a', oline: '\u203e',
  frasl: '\u2044', euro: '\u20ac',
  image: '\u2111', weierp: '\u2118', real: '\u211c', trade: '\u2122', alefsym: '\u2135',
  larr: '\u2190', uarr: '\u2191', rarr: '\u2192', darr: '\u2193', harr: '\u2194',
  crarr: '\u21b5', lArr: '\u21d0', uArr: '\u21d1', rArr: '\u21d2', dArr: '\u21d3',
  hArr: '\u21d4', forall: '\u2200', part: '\u2202', exist: '\u2203', empty: '\u2205',
  nabla: '\u2207', isin: '\u2208', notin: '\u2209', ni: '\u220b', prod: '\u220f',
  sum: '\u2211', minus: '\u2212', lowast: '\u2217', radic: '\u221a', prop: '\u221d',
  infin: '\u221e', ang: '\u2220', and: '\u2227', or: '\u2228', cap: '\u2229',
  cup: '\u222a', int: '\u222b', there4: '\u2234', sim: '\u223c', cong: '\u2245',
  asymp: '\u2248', ne: '\u2260', equiv: '\u2261', le: '\u2264', ge: '\u2265',
  sub: '\u2282', sup: '\u2283', nsub: '\u2284', sube: '\u2286', supe: '\u2287',
  oplus: '\u2295', otimes: '\u2297', perp: '\u22a5', sdot: '\u22c5',
  lceil: '\u2308', rceil: '\u2309', lfloor: '\u230a', rfloor: '\u230b', lang: '\u2329',
  rang: '\u232a', loz: '\u25ca', spades: '\u2660', clubs: '\u2663', hearts: '\u2665',
  diams: '\u2666',
  Dcaron: '\u010e', dcaron: '\u010f', DifferentialD: '\u2146', HilbertSpace: '\u210b',
  ClockwiseContourIntegral: '\u2232', ngE: '\u2267\u0338', Tab: '\u0009',
  NewLine: '\n', colon: ':', semi: ';', equals: '=', sol: '/', bsol: '\\',
  comma: ',', period: '.', quest: '?', excl: '!', lpar: '(', rpar: ')',
  lbrack: '[', rbrack: ']', lcub: '{', rcub: '}', Hat: '^', check: '\u2713',
  cross: '\u2717', star: '\u2605', phone: '\u260e', female: '\u2640', male: '\u2642',
  hyphen: '\u2010', dash: '\u2010'
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const PUNCT = '!\"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
function isPunct(ch) { return PUNCT.indexOf(ch) >= 0; }
function isSpace(ch) { return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v'; }
function isAsciiAlnum(code) {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}
function isDigit(code) { return code >= 48 && code <= 57; }
function isHex(code) {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
}
// Whitespace test on a char code (space, tab, LF, FF, CR).
function isWS(code) { return code === 32 || code === 9 || code === 10 || code === 12 || code === 13; }

// Escape text content the way marked does: & < > " ' all escaped.
function escText(s) {
  let out = '', start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let rep = null;
    if (c === 38) rep = '&amp;';
    else if (c === 60) rep = '&lt;';
    else if (c === 62) rep = '&gt;';
    else if (c === 34) rep = '&quot;';
    else if (c === 39) rep = '&#39;';
    if (rep !== null) { out += s.slice(start, i) + rep; start = i + 1; }
  }
  return start === 0 ? s : out + s.slice(start);
}
// Escape for attribute values the way marked does with encode=false:
// < > " ' are always escaped; & is escaped only when it does not start a
// valid entity reference (&#?\w+;), so &amp; and &copy; pass through.
function escAttr(s) {
  let out = '', start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let rep = null;
    if (c === 60) rep = '&lt;';
    else if (c === 62) rep = '&gt;';
    else if (c === 34) rep = '&quot;';
    else if (c === 39) rep = '&#39;';
    else if (c === 38) {
      // valid entity ahead? &#...; or &word;
      let j = i + 1;
      if (j < s.length && s.charCodeAt(j) === 35) j++;
      const hs = j;
      while (j < s.length && isAsciiAlnum(s.charCodeAt(j))) j++;
      if (j > hs && j < s.length && s.charCodeAt(j) === 59) continue; // keep as-is
      rep = '&amp;';
    }
    if (rep !== null) { out += s.slice(start, i) + rep; start = i + 1; }
  }
  return start === 0 ? s : out + s.slice(start);
}

// Encode a URL the way marked does: encodeURI, with %25 folded back to %
// (so a literal % and a valid %XX sequence both survive), then attribute
// escaping. encodeURI leaves A-Za-z0-9 and ;,/?:@&=+$_.!~*'()# alone.
function encodeUrl(raw) {
  let needs = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (!(isAsciiAlnum(c) || c === 59 || c === 44 || c === 47 || c === 63 || c === 58 ||
          c === 64 || c === 38 || c === 61 || c === 43 || c === 36 || c === 45 || c === 95 ||
          c === 46 || c === 33 || c === 126 || c === 42 || c === 39 || c === 40 || c === 41 ||
          c === 35 || c === 37)) { needs = true; break; }
  }
  if (!needs) return raw;
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (isAsciiAlnum(c) || c === 59 || c === 44 || c === 47 || c === 63 || c === 58 ||
        c === 64 || c === 38 || c === 61 || c === 43 || c === 36 || c === 45 || c === 95 ||
        c === 46 || c === 33 || c === 126 || c === 42 || c === 39 || c === 40 || c === 41 ||
        c === 35 || c === 37) { out += raw[i]; continue; }
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < raw.length &&
        raw.charCodeAt(i + 1) >= 0xDC00 && raw.charCodeAt(i + 1) <= 0xDFFF) {
      out += encodeURIComponent(raw.slice(i, i + 2)); i++; continue;
    }
    if (c >= 0xD800 && c <= 0xDFFF) { out += '%EF%BF%BD'; continue; }
    out += encodeURIComponent(raw[i]);
  }
  return out;
}

// Decode one entity reference starting at s[i] === '&'. Returns [decoded, nextIndex]
// or null when this is not a valid reference.
function parseEntity(s, i) {
  const n = s.length;
  if (i + 1 >= n) return null;
  const c1 = s.charCodeAt(i + 1);
  if (c1 === 35) { // numeric
    let j = i + 2, hex = false;
    if (j < n && (s.charCodeAt(j) === 120 || s.charCodeAt(j) === 88)) { hex = true; j++; }
    const start = j;
    while (j < n && (hex ? isHex(s.charCodeAt(j)) : isDigit(s.charCodeAt(j)))) j++;
    if (j === start || j >= n || s.charCodeAt(j) !== 59) return null;
    // Spec: decimal refs are 1-7 digits, hex refs 1-6 digits. More digits
    // means this is not a reference at all (the & is literal).
    if (j - start > (hex ? 6 : 7)) return null;
    let cp = parseInt(s.slice(start, j), hex ? 16 : 10);
    if (!cp || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) cp = 0xFFFD;
    return [String.fromCodePoint(cp), j + 1];
  }
  let j = i + 1;
  while (j < n && isAsciiAlnum(s.charCodeAt(j)) && j - i <= 32) j++;
  if (j < n && s.charCodeAt(j) === 59) {
    const name = s.slice(i + 1, j);
    const v = ENT[name];
    if (v !== undefined) return [v, j + 1];
  }
  return null;
}

// Decode entities inside a plain string (used for link destinations/titles).
function decodeEntities(s) {
  if (s.indexOf('&') < 0) return s;
  let out = '', start = 0, i = 0;
  while (i < s.length) {
    if (s.charCodeAt(i) === 38) {
      const e = parseEntity(s, i);
      if (e) { out += s.slice(start, i) + e[0]; i = e[1]; start = i; continue; }
    }
    i++;
  }
  return start === 0 ? s : out + s.slice(start);
}

// Normalise a link reference label: resolve backslash escapes, collapse
// whitespace runs to one space, trim, Unicode case fold.
function normalizeLabel(s) {
  let out = '', i = 0, n = s.length;
  let lastSpace = true; // trims leading whitespace
  while (i < n) {
    const c = s.charCodeAt(i);
    if (isWS(c)) {
      if (!lastSpace) { out += ' '; lastSpace = true; }
      i++; continue;
    }
    out += s[i]; i++; lastSpace = false;
  }
  if (lastSpace && out.length) out = out.slice(0, -1);
  // Unicode case folding for the cases that matter (ß/ẞ -> ss, then lower).
  out = out.replace(/\u1e9e/g, 'ss').replace(/\u00df/g, 'ss').toLowerCase();
  return out;
}

// ---------------------------------------------------------------------------
// Inline parsing
// Node kinds: 0 text, 1 code span, 2 hard break, 3 raw html, 4 delimiter,
// 5 bracket opener, 6 link/image, 7 emphasis (em/strong/del).
// ---------------------------------------------------------------------------
const PUNCT_RE = /^[\p{P}\p{S}]$/u;
function isUniPunct(ch) { return ch.length === 1 && PUNCT_RE.test(ch); }
function isUniSpace(ch) {
  const c = ch.charCodeAt(0);
  return c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13 ||
    c === 0x00a0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x202f ||
    c === 0x205f || c === 0x3000;
}

// Flanking info for a delimiter run ending at `end` (exclusive) starting at `start`.
function flankInfo(s, start, end) {
  const before = start > 0 ? s[start - 1] : '';
  const after = end < s.length ? s[end] : '';
  const beforeWs = before === '' ? true : isUniSpace(before);
  const afterWs = after === '' ? true : isUniSpace(after);
  const beforePunct = before !== '' && isUniPunct(before);
  const afterPunct = after !== '' && isUniPunct(after);
  const left = !afterWs && (!afterPunct || beforeWs || beforePunct);
  const right = !beforeWs && (!beforePunct || afterWs || afterPunct);
  return [left, right];
}

// Scan an autolink <...> starting at s[i] === '<'. Returns [hrefText, nextIdx]
// with hrefText already unescaped, or null.
// Scan an autolink <...> starting at s[i] === '<'. Returns
// [href, nextIdx, display] or null. The display is the raw content
// (backslashes kept); the href resolves backslash escapes. The scheme /
// email test runs on the raw content, so an escaped char never makes an
// otherwise invalid autolink valid.
function scanAutolink(s, i) {
  const n = s.length;
  let k = i + 1, raw = '';
  while (k < n && s.charCodeAt(k) !== 62 && s.charCodeAt(k) !== 10) {
    if (s.charCodeAt(k) === 32 || s.charCodeAt(k) === 60) return null;
    raw += s[k]; k++;
  }
  if (k >= n || s.charCodeAt(k) !== 62 || raw.length === 0) return null;
  // In an autolink href only a doubled backslash resolves (\\ -> \); a
  // backslash before any other char is kept literally (cm-020, cm-603).
  let resolved = '';
  for (let q = 0; q < raw.length; q++) {
    if (raw.charCodeAt(q) === 92 && q + 1 < raw.length && raw.charCodeAt(q + 1) === 92) { resolved += '\\'; q++; continue; }
    resolved += raw[q];
  }
  // scheme: [A-Za-z][A-Za-z0-9+.-]{1,31}: (at least 2 scheme chars)
  if (/^[A-Za-z][A-Za-z0-9+.-]{1,31}:/.test(raw)) return [resolved, k + 1, raw];
  // email: local@domain
  if (/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(raw)) {
    return ['mailto:' + resolved, k + 1, raw];
  }
  return null;
}

// Scan raw HTML starting at s[i] === '<'. Returns [html, nextIdx] or null.
// Covers open/close tags, comments, PIs, declarations, CDATA.
function scanHtmlTag(s, i) {
  const n = s.length;
  if (i + 1 >= n) return null;
  const c1 = s[i + 1];
  if (c1 === '!') {
    if (s.startsWith('<!--', i)) {
      // <!--> and <!---> are complete (empty) comments on their own
      if (s.startsWith('<!-->', i)) return [s.slice(i, i + 5), i + 5];
      if (s.startsWith('<!--->', i)) return [s.slice(i, i + 6), i + 6];
      const end = s.indexOf('-->', i + 4);
      if (end < 0) return null;
      return [s.slice(i, end + 3), end + 3];
    }
    if (s.startsWith('<![CDATA[', i)) {
      const end = s.indexOf(']]>', i + 9);
      if (end < 0) return null;
      return [s.slice(i, end + 3), end + 3];
    }
    // declaration <!A ...>  (letter after !)
    if (i + 2 < n && /[A-Za-z]/.test(s[i + 2])) {
      let j = i + 2;
      while (j < n && s.charCodeAt(j) !== 62) j++;
      if (j >= n) return null;
      return [s.slice(i, j + 1), j + 1];
    }
    return null;
  }
  if (c1 === '?') {
    const end = s.indexOf('?>', i + 2);
    if (end < 0) return null;
    return [s.slice(i, end + 2), end + 2];
  }
  if (c1 === '/') {
    const m = /^<\/[A-Za-z][A-Za-z0-9-]*[ \t\r\n]*>/.exec(s.slice(i, i + 64));
    if (m) return [m[0], i + m[0].length];
    return null;
  }
  if (/[A-Za-z]/.test(c1)) {
    // open tag: name, attributes, optional /
    let j = i + 1;
    while (j < n && /[A-Za-z0-9-]/.test(s[j])) j++;
    let closed = false;
    while (j < n) {
      const cj = s.charCodeAt(j);
      if (cj === 62) { closed = true; j++; break; }
      if (cj === 47 && j + 1 < n && s.charCodeAt(j + 1) === 62) { closed = true; j += 2; break; }
      // an attribute must be preceded by whitespace (so <m:abc> is text)
      if (cj !== 32 && cj !== 9 && cj !== 10 && cj !== 13) return null;
      while (j < n && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9 || s.charCodeAt(j) === 10 || s.charCodeAt(j) === 13)) j++;
      if (j >= n) return null;
      if (s.charCodeAt(j) === 62) { closed = true; j++; break; }
      if (s.charCodeAt(j) === 47 && j + 1 < n && s.charCodeAt(j + 1) === 62) { closed = true; j += 2; break; }
      // attribute name
      if (!/[A-Za-z_:]/.test(s[j]) && !(s.charCodeAt(j) >= 128)) return null;
      while (j < n && /[A-Za-z0-9_.:-]/.test(s[j])) j++;
      const afterName = j;
      while (j < n && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9 || s.charCodeAt(j) === 10 || s.charCodeAt(j) === 13)) j++;
      if (j < n && s.charCodeAt(j) === 61) {
        j++;
        while (j < n && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9 || s.charCodeAt(j) === 10 || s.charCodeAt(j) === 13)) j++;
        if (j >= n) return null;
        const q = s.charCodeAt(j);
        if (q === 34 || q === 39) {
          j++;
          while (j < n && s.charCodeAt(j) !== q) j++;
          if (j >= n) return null;
          j++;
        } else {
          // unquoted value: no space, ", ', =, <, >, ` ; must be non-empty
          const vs = j;
          while (j < n) {
            const v = s.charCodeAt(j);
            if (v === 32 || v === 9 || v === 10 || v === 13 || v === 34 || v === 39 || v === 61 || v === 60 || v === 62 || v === 96) break;
            j++;
          }
          if (j === vs) return null;
        }
      } else {
        // Valueless attribute: the whitespace just skipped belongs to the
        // next attribute (or the closing >), so rewind to after the name.
        j = afterName;
      }
    }
    if (!closed) return null;
    return [s.slice(i, j), j];
  }
  return null;
}

// Parse a link destination + optional title starting at s[i] (after the
// opening '(' of an inline link, or at the start of a reference definition
// value). Returns {dest, title, next} or null. `i` is the index just after '('
// for inline links (whitespace already skipped by caller when needed).
function parseLinkTail(s, i, isInline) {
  const n = s.length;
  let j = i;
  // skip whitespace/newlines
  while (j < n && isWS(s.charCodeAt(j))) j++;
  if (j >= n) return null;
  let dest = '';
  if (s.charCodeAt(j) === 60) { // <...>
    let k = j + 1;
    while (k < n && s.charCodeAt(k) !== 62 && s.charCodeAt(k) !== 10) {
      if (s.charCodeAt(k) === 92 && k + 1 < n && isPunct(s[k + 1])) { dest += s[k + 1]; k += 2; continue; }
      dest += s[k]; k++;
    }
    if (k >= n || s.charCodeAt(k) !== 62) return null;
    j = k + 1;
  } else {
    // bare destination: balanced parens, no spaces/control, backslash escapes
    let depth = 0, k = j;
    while (k < n) {
      const c = s.charCodeAt(k);
      if (c === 92 && k + 1 < n && isPunct(s[k + 1])) { dest += s[k + 1]; k += 2; continue; }
      if (c === 40) { depth++; dest += '('; k++; continue; }
      if (c === 41) {
        if (depth === 0) break;
        depth--; dest += ')'; k++; continue;
      }
      if (c <= 32 || c === 127) break;
      dest += s[k]; k++;
    }
    if (k === j) {
      // empty destination: only an inline link may have one, and only
      // when the closing paren (after optional whitespace) follows
      if (!isInline) return null;
      let t = j;
      while (t < n && isWS(s.charCodeAt(t))) t++;
      if (t >= n || s.charCodeAt(t) !== 41) return null;
      j = t;
    } else j = k;
  }
  // optional title
  let title = null;
  let k = j;
  while (k < n && isWS(s.charCodeAt(k))) k++;
  if (k < n && (s.charCodeAt(k) === 34 || s.charCodeAt(k) === 39 || s.charCodeAt(k) === 40)) {
    const q = s.charCodeAt(k);
    const close = q === 40 ? 41 : q;
    let t = '', p = k + 1, ok = false;
    while (p < n) {
      const c = s.charCodeAt(p);
      if (c === 92 && p + 1 < n && isPunct(s[p + 1])) { t += s[p + 1]; p += 2; continue; }
      if (c === close) { ok = true; break; }
      if (c === 10) { /* titles may span lines */ }
      t += s[p]; p++;
    }
    if (!ok) return null;
    title = t;
    j = p + 1;
    k = j;
    while (k < n && isWS(s.charCodeAt(k))) k++;
  }
  if (isInline) {
    if (k >= n || s.charCodeAt(k) !== 41) return null;
    return { dest, title, next: k + 1 };
  }
  return { dest, title, next: k };
}

// GFM extended autolinks ---------------------------------------------------
// Domain label characters.
function isDomainChar(code) {
  return isAsciiAlnum(code) || code === 45 || code === 95; // alnum, -, _
}
// Try to read a domain starting at s[i]: labels joined by '.', at least one
// dot, last label letters only (TLD). Returns end index or -1. `www` form
// requires the domain to end in a letter; path handling is done by caller.
function scanDomain(s, i) {
  const n = s.length;
  let j = i, lastDot = -1, labels = 0;
  while (j < n) {
    const c = s.charCodeAt(j);
    if (isDomainChar(c)) { j++; continue; }
    if (c === 46) { // .
      if (j === i || j + 1 >= n || !isDomainChar(s.charCodeAt(j + 1))) break;
      lastDot = j; labels++; j++; continue;
    }
    break;
  }
  if (lastDot < 0) return -1;
  // The TLD may contain '_' '-' or digits mid-label (marked linkifies
  // example.or_g, example.123, a@b.c_d); trailing '_' is stripped later
  // by trimAutolinkEnd for URLs, while scanEmailAt rejects a domain
  // ending in '_' or '-' outright. Domain ends at j.
  return j;
}
// Strip trailing punctuation from an autolink candidate [start, end).
// Returns the trimmed end index, following GFM rules.
function trimAutolinkEnd(s, start, end) {
  let e = end;
  while (e > start) {
    const c = s.charCodeAt(e - 1);
    if (c === 59) { // ';': if it closes an entity-like reference, drop the whole entity
      const amp = s.lastIndexOf('&', e - 1);
      if (amp >= start) {
        const ent = parseEntity(s, amp);
        if (ent && ent[1] === e) { e = amp; continue; }
        // Undefined named entity also drops: & + alphanumerics + ';'
        let k = amp + 1;
        while (k < e - 1 && isAsciiAlnum(s.charCodeAt(k))) k++;
        if (e - amp > 2 && k === e - 1) { e = amp; continue; }
      }
      e--; continue;
    }
    if (c === 63 || c === 33 || c === 46 || c === 44 || c === 58 ||
        c === 42 || c === 95 || c === 126) { e--; continue; }
    if (c === 41) { // ) kept only if balanced; parens before a ']' in the
      // URL belong to an earlier segment (doc-12) and do not count.
      let open = 0, close = 0;
      let from = start;
      const lastBr = s.lastIndexOf(']', e - 1);
      if (lastBr >= start) from = lastBr + 1;
      for (let k = from; k < e; k++) {
        if (s.charCodeAt(k) === 40) open++;
        else if (s.charCodeAt(k) === 41) close++;
      }
      if (close > open) { e--; continue; }
      break;
    }
    break;
  }
  return e;
}
// Scan a path after a domain/email: /... up to whitespace or '<', mirroring
// marked's url regex ([^\s<]*) plus its _backpedal. Returns end index.
// When stopAtBracket, a ']' that closes a bracket (followed by '(' or
// '[') ends the path before the ']' (the URL is link text, not an
// autolink); otherwise the ']' is part of the URL. A '(' opens a group
// that is kept only when it closes with a ')' before the path ends
// (the backpedal's \([^)]*\) alternative): an unclosed '(' ends the URL
// there -- doc-08: https://a.com/b)](https://c.com/d e) splits into two
// autolinks (the '(' group has no ')' before the space), while doc-37's
// https://www.example.com)](http://img.shields.io/examples/jolt) is one
// autolink (its '(' group closes). Trailing punctuation is left to
// trimAutolinkEnd.
function scanAutolinkPath(s, i, stopAtBracket) {
  const n = s.length;
  let j = i;
  while (j < n) {
    const c = s.charCodeAt(j);
    if (c <= 32 || c === 60) break;
    if (c === 93 && j + 1 < n && (s.charCodeAt(j + 1) === 40 || s.charCodeAt(j + 1) === 91)) {
      if (stopAtBracket) break;
      j++;
      continue;
    }
    if (c === 40) { // '(' -- keep the group only if it closes before the path ends
      let k = j + 1;
      while (k < n) {
        const cc = s.charCodeAt(k);
        if (cc <= 32 || cc === 60) break;
        if (cc === 41) break;
        k++;
      }
      if (k >= n || s.charCodeAt(k) !== 41) break; // unclosed '(' ends the URL
      j = k + 1;
      continue;
    }
    j++;
  }
  return j;
}
// Try an extended autolink starting exactly at s[i]. `prev` is the char
// before i ('' at start). Returns [href, text, nextIdx] or null.
function scanExtendedAutolink(s, i, prev, allowTrailingUnderscore, hasActiveBracket) {
  const n = s.length;
  const prevOk = prev === '' || isUniSpace(prev) || (isUniPunct(prev) && prev !== '.' && prev !== '/' && prev !== ':' && prev !== '@');
  if (!prevOk) return null;
  // www. form
  if (s.startsWith('www.', i)) {
    const dEnd = scanDomain(s, i + 4);
    if (dEnd < 0) return null;
    let end = dEnd;
    // a path, query or fragment may follow the domain directly
    if (end < n && s.charCodeAt(end) > 32 && s.charCodeAt(end) !== 60) end = scanAutolinkPath(s, end, hasActiveBracket);
    // link text: the URL ends at a ']' that starts a link -- not an autolink
    if (hasActiveBracket && end < n && s.charCodeAt(end) === 93 && end + 1 < n && (s.charCodeAt(end + 1) === 40 || s.charCodeAt(end + 1) === 91)) return null;
    end = trimAutolinkEnd(s, i, end);
    if (end <= i + 4) return null;
    const text = s.slice(i, end);
    return ['http://' + text, text, end];
  }
  // scheme form: letters/digits/+/-/. 2-32 chars, then ':'
  const c0 = s.charCodeAt(i);
  if ((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122)) {
    let j = i;
    while (j < n) {
      const cj = s.charCodeAt(j);
      if ((cj >= 48 && cj <= 57) || (cj >= 65 && cj <= 90) || (cj >= 97 && cj <= 122) || cj === 43 || cj === 45 || cj === 46) { j++; continue; }
      break;
    }
    if (j - i >= 2 && j - i <= 32 && j < n && s.charCodeAt(j) === 58) {
      const scheme = s.slice(i, j);
      if (s.startsWith('://', j)) {
        const dEnd = scanDomain(s, j + 3);
        if (dEnd >= 0) {
          let end = dEnd;
          if (end < n && s.charCodeAt(end) > 32 && s.charCodeAt(end) !== 60) end = scanAutolinkPath(s, end, hasActiveBracket);
          // link text: the URL ends at a ']' that starts a link -- not an autolink
          if (hasActiveBracket && end < n && s.charCodeAt(end) === 93 && end + 1 < n && (s.charCodeAt(end + 1) === 40 || s.charCodeAt(end + 1) === 91)) return null;
          end = trimAutolinkEnd(s, i, end);
          const text = s.slice(i, end);
          return [text, text, end];
        }
      } else {
        // scheme:email[/path] -- marked only forms these for mailto and
        // xmpp; mailto takes no path, xmpp takes one segment of
        // [A-Za-z0-9.@]+ (a bare '/' is not part of the link)
        if (scheme !== 'mailto' && scheme !== 'xmpp') return null;
        const em = scanEmailAt(s, j + 1, allowTrailingUnderscore);
        if (em >= 0) {
          let end = em;
          if (scheme === 'xmpp' && end < n && s.charCodeAt(end) === 47) {
            let q = end + 1;
            while (q < n) {
              const cc = s.charCodeAt(q);
              if ((cc >= 48 && cc <= 57) || (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || cc === 46 || cc === 64) { q++; continue; }
              break;
            }
            if (q > end + 1) end = q;
          }
          end = trimAutolinkEnd(s, i, end);
          const text = s.slice(i, end);
          return [text, text, end];
        }
      }
      // not a valid scheme autolink; fall through (do not treat as email)
      return null;
    }
  }
  return null;
}
// Scan an email address starting at s[i]. Returns end index or -1.
// local: [A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+ ; domain with at least one dot,
// labels alnum/hyphen, TLD letters.
// `allowTrailingUnderscore`: when true (an unmatched '_' opener is on the
// delimiter stack), a trailing '_' run is an emphasis closer, not part of
// the address, so it is trimmed; otherwise a trailing '_' or '-' voids
// the address (gfm-632/633).
function scanEmailAt(s, i, allowTrailingUnderscore) {
  const n = s.length;
  let j = i;
  while (j < n) {
    const c = s.charCodeAt(j);
    if (isAsciiAlnum(c) || '.!#$%&\'*+/=?^_`{|}~-'.indexOf(s[j]) >= 0) { j++; continue; }
    break;
  }
  // local part must not end with '.' and must be non-empty; then '@'
  if (j === i || s.charCodeAt(j) !== 64 || s.charCodeAt(j - 1) === 46) return -1;
  let dEnd = scanDomain(s, j + 1);
  if (dEnd < 0) return -1;
  // an email domain must not end in '-' (never an emphasis delimiter);
  // a trailing '_' run is trimmed only when it closes an emphasis.
  const last = s.charCodeAt(dEnd - 1);
  if (last === 45) return -1;
  if (last === 95) {
    if (!allowTrailingUnderscore) return -1;
    while (dEnd > j + 1 && s.charCodeAt(dEnd - 1) === 95) dEnd--;
    if (dEnd <= j + 1) return -1;
  }
  return dEnd;
}

// Would the bracket whose label is [textStart, closeIdx) form a link
// closing at `]` closeIdx? Mirrors marked's link/reflink decision: the
// label must be consumable and the tail must resolve (inline destination,
// full/collapsed reference, or shortcut reference).
function linkWouldForm(s, textStart, closeIdx, refs) {
  if (!labelConsumable(s, textStart, closeIdx)) return false;
  const after = s.charCodeAt(closeIdx + 1);
  if (after === 40) return parseLinkTail(s, closeIdx + 2, true) !== null;
  if (after === 91) {
    let j = closeIdx + 2, ok = false, bad = false;
    while (j < s.length) {
      const c = s.charCodeAt(j);
      if (c === 92 && j + 1 < s.length && isPunct(s[j + 1])) { j += 2; continue; }
      if (c === 91) { bad = true; break; }
      if (c === 93) { ok = true; break; }
      j++;
    }
    if (!ok || bad) return false;
    const rawLabel = s.slice(closeIdx + 2, j);
    const label = rawLabel.length === 0 ? normalizeLabel(s.slice(textStart, closeIdx)) : normalizeLabel(rawLabel);
    return refs.has(label);
  }
  return refs.has(normalizeLabel(s.slice(textStart, closeIdx)));
}

// Whether a link label [start, end) is consumable by marked's link-label
// regex. Backtick runs must pair up left to right: each run forms a
// lenient code span with the next run (the label regex's code-span
// alternative takes any two consecutive runs, opener and closer lengths
// independent), and a final unpaired run is consumable only when it is
// 2+ backticks immediately before the closing `]`. A single backtick
// that pairs with nothing and sits before the `]` kills the link
// (cm-342/525/537, doc-18), while `` ``url` `` pairs fine (doc-09/14)
// and `` `` a ` b `` `` pairs with a 2-run before `]` (doc-20's [be...]).
// Escaped chars and nested [...] spans count as consumable units.
function labelConsumable(s, start, end) {
  let i = start;
  let runLen = 0, runPos = -1; // an unpaired backtick run awaiting a partner
  while (i < end) {
    const c = s.charCodeAt(i);
    if (c === 92 && i + 1 < end) { i += 2; continue; } // escaped char
    if (c === 91) { // nested [...] span: skip it balanced
      let depth = 1, j = i + 1;
      while (j < end && depth > 0) {
        if (s.charCodeAt(j) === 92) { j += 2; continue; }
        if (s.charCodeAt(j) === 91) depth++;
        else if (s.charCodeAt(j) === 93) depth--;
        j++;
      }
      if (depth === 0) { i = j; continue; }
      return false;
    }
    if (c === 96) {
      let j = i;
      while (j < end && s.charCodeAt(j) === 96) j++;
      const len = j - i;
      if (runLen > 0) { runLen = 0; runPos = -1; } // paired with the pending run
      else { runLen = len; runPos = i; }
      i = j; continue;
    }
    if (c === 93) return false; // bare ] inside the label: not consumable
    i++;
  }
  if (runLen === 0) return true;
  return runLen >= 2 && runPos + runLen === end;
}

// ---------------------------------------------------------------------------
// Main inline scanner: builds a node list, then emphasis + rendering.
// ---------------------------------------------------------------------------
// Replicate marked's emStrongMask (#n): the masked source it uses to bound
// the emphasis/del closer search. Step 2 masks escaped punctuation to '+'
// and backticks inside code spans to '+'; step 3 (blockSkip) masks inline
// links, code spans and HTML tags to 'a's, all at equal length. A backtick
// run that opens no code span can then pair with a later backtick and mask
// the text between them -- a FALSE code span -- so emphasis delimiters
// inside it cannot close (doc-09/16/28/35: a link label holding `` ``x` ``
// pairs its lone backtick with a later one). Delimiters inside a masked
// span may still OPEN (marked's opener search runs on the real source);
// only the closer role is masked. Positions map 1:1 onto the original.
const MASK_ANY_PUNCT = /(`+)(?:[^`]|[^`][\s\S]*?[^`])\1(?!`)|`+|\\([\p{P}\p{S}])/gu;
const MASK_BLOCK_SKIP = /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)|(?<!`)()(?<b>`+)[^`]+\k<b>(?!`)|<(?! )[^<>]*?>/g;
// Masked [start, end) spans of a paragraph source, in source coordinates.
function maskedIntervals(src) {
  if (!src.includes('`')) return null;
  const t2 = src.replace(MASK_ANY_PUNCT, (m, s, r) => r ? '+'.repeat(m.length) : s ? s + m.slice(s.length, -s.length).replace(/`/g, '+') + s : m);
  const spans = [];
  MASK_BLOCK_SKIP.lastIndex = 0;
  let m;
  while ((m = MASK_BLOCK_SKIP.exec(t2)) !== null) {
    if (m[0].length === 0) { MASK_BLOCK_SKIP.lastIndex++; continue; }
    spans.push([m.index, m.index + m[0].length]);
  }
  return spans.length ? spans : null;
}

function parseInline(src, refs) {
  const s = src;
  const n = s.length;
  // Masked spans (false code spans etc.) for the emphasis closer rule.
  const mSpans = maskedIntervals(s);
  let mArr = null;
  if (mSpans) {
    mArr = new Uint8Array(n);
    for (const [a, b] of mSpans) mArr.fill(1, a, b);
  }
  const nodes = [];      // inline nodes
  const delims = [];     // indices into nodes of delimiter nodes
  const brackets = [];   // indices into nodes of '[' opener nodes
  let unmatchedBacktickInBracket = false; // a backtick run failed to match
  // inside the current bracket; later backticks then cannot span the `]`
  let text = '';         // pending plain text
  function flushText() {
    if (text.length) { nodes.push({ k: 0, s: text }); text = ''; }
  }
  function pushNode(nd) { flushText(); nodes.push(nd); return nodes.length - 1; }

  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    const ch = s[i];
    // --- backslash ---
    if (c === 92) {
      if (i + 1 < n && s.charCodeAt(i + 1) === 10) {
        pushNode({ k: 2 }); i += 2;
        // a hard break strips the next line's leading spaces
        while (i < n && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9)) i++;
        continue;
      }
      if (i + 1 < n && isPunct(s[i + 1])) { text += s[i + 1]; i += 2; continue; }
      text += '\\'; i++; continue;
    }
    // --- backtick code span ---
    if (c === 96) {
      let j = i;
      while (j < n && s.charCodeAt(j) === 96) j++;
      const run = j - i;
      // find a matching run; a code span must not swallow the `]` of a
      // link that will form (the link regex wins at `[`, and its label is
      // lexed recursively, where the backticks stay literal -- doc-09/14/35:
      // `` ``url` `` pairs leniently in the label, so the link forms and no
      // code span may span past its `]`). When the link would not form
      // (label unconsumable or tail invalid), the span may cross the `]`
      // and kill the link (cm-342/525/537). doc-28's lone backtick after a
      // failed `` `` `` run is the same decision: the link forms, so break.
      let k = j, found = -1;
      while (k < n) {
        const kc = s.charCodeAt(k);
        if (kc === 96) {
          let m = k;
          while (m < n && s.charCodeAt(m) === 96) m++;
          if (m - k === run) { found = k; break; }
          k = m;
        } else if (kc === 93 && brackets.length > 0) {
          const bi = brackets[brackets.length - 1];
          const op = nodes[bi];
          const ts = op.img ? op.pos + 2 : op.pos + 1;
          if (linkWouldForm(s, ts, k, refs)) break;
          k++;
        } else k++;
      }
      if (found < 0) {
        if (brackets.length > 0) unmatchedBacktickInBracket = true;
        text += s.slice(i, j); i = j; continue;
      }
      let content = s.slice(j, found).replace(/\n/g, ' ');
      if (content.length >= 2 && content.charCodeAt(0) === 32 && content.charCodeAt(content.length - 1) === 32 && /[^ ]/.test(content)) {
        content = content.slice(1, -1);
      }
      pushNode({ k: 1, s: content });
      i = found + run;
      continue;
    }
    // --- emphasis delimiters * _ ---
    if (c === 42 || c === 95) {
      let j = i;
      while (j < n && s.charCodeAt(j) === c) j++;
      const run = j - i;
      const [left, right] = flankInfo(s, i, j);
      let canOpen, canClose;
      if (ch === '*') { canOpen = left; canClose = right; }
      else { canOpen = left && (!right || (i > 0 && isUniPunct(s[i - 1]))); canClose = right && (!left || (j < n && isUniPunct(s[j]))); }
      if (canOpen || canClose) {
        const idx = pushNode({ k: 4, ch, n: run, origN: run, open: canOpen, close: canClose, pos: i, masked: !!mArr && !!mArr[i] });
        delims.push(idx);
      } else {
        text += s.slice(i, j);
      }
      i = j;
      continue;
    }
    // --- strikethrough ~ (runs of 1-2 only; 3+ are literal text) ---
    if (c === 126) {
      let j = i;
      while (j < n && s.charCodeAt(j) === 126) j++;
      const run = j - i;
      if (run >= 1 && run <= 2) {
        const [left, right] = flankInfo(s, i, j);
        if (left || right) {
          const idx = pushNode({ k: 4, ch: '~', n: run, origN: run, open: left, close: right, pos: i, masked: !!mArr && !!mArr[i] });
          delims.push(idx);
          i = j; continue;
        }
      }
      text += s.slice(i, j); i = j; continue;
    }
    // --- brackets: link/image openers ---
    if (c === 91) { // [
      const idx = pushNode({ k: 5, img: false, active: true, pos: i });
      brackets.push(idx);
      unmatchedBacktickInBracket = false;
      i++; continue;
    }
    if (c === 33 && i + 1 < n && s.charCodeAt(i + 1) === 91) { // ![
      const idx = pushNode({ k: 5, img: true, active: true, pos: i });
      brackets.push(idx);
      unmatchedBacktickInBracket = false;
      i += 2; continue;
    }
    if (c === 93) { // ]
      flushText();
      const formed = tryFormLink(nodes, brackets, refs, s, i, unmatchedBacktickInBracket);
      unmatchedBacktickInBracket = false;
      if (formed) { i = formed; continue; }
      text += ']'; i++; continue;
    }
    // --- < autolink / raw html ---
    if (c === 60) {
      const al = scanAutolink(s, i);
      if (al) {
        const href = al[0], display = al[2];
        pushNode({ k: 6, href: href, title: null, img: false });
        pushNode({ k: 0, s: display });
        pushNode({ k: 9 });
        i = al[1]; continue;
      }
      const ht = scanHtmlTag(s, i);
      if (ht) {
        // marked's tag tokenizer flips its persistent inLink flag here:
        // `<a ` (a literal space) opens it, a literal `</a>` closes it.
        // A self-closing `<a />` still opens it; `</a >` does not close.
        if (!inLinkLeak && /^<a /i.test(ht[0])) inLinkLeak = true;
        else if (inLinkLeak && /^<\/a>/i.test(ht[0])) inLinkLeak = false;
        pushNode({ k: 3, s: ht[0] }); i = ht[1]; continue;
      }
      text += '<'; i++; continue;
    }
    // --- entities ---
    // marked keeps every &[A-Za-z0-9]+; verbatim (defined or not); only
    // numeric references are decoded. Emit the named form as a raw node so
    // the text escaper leaves the & alone.
    if (c === 38) {
      let j = i + 1;
      while (j < n && isAsciiAlnum(s.charCodeAt(j))) j++;
      if (j > i + 1 && j < n && s.charCodeAt(j) === 59) {
        pushNode({ k: 3, s: s.slice(i, j + 1) });
        i = j + 1; continue;
      }
      const e = parseEntity(s, i);
      if (e) { text += e[0]; i = e[1]; continue; }
      text += '&'; i++; continue;
    }
    // --- newline: soft break / hard break ---
    if (c === 10) {
      // hard break if preceded by 2+ spaces (in pending text)
      let sp = 0;
      for (let k = text.length - 1; k >= 0 && text.charCodeAt(k) === 32; k--) sp++;
      if (sp >= 2) {
        text = text.slice(0, text.length - sp);
        pushNode({ k: 2 });
        i++;
        // a hard break strips the next line's leading spaces
        while (i < n && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9)) i++;
        continue;
      } else {
        text += '\n';
      }
      i++; continue;
    }
    // --- extended autolinks: www. / scheme / email ---
    // Suppressed while the persistent inLink flag is set (an unclosed
    // `<a ` tag earlier in the document): marked tries its url tokenizer
    // only when !state.inLink.
    if (!inLinkLeak && (c === 119 || c === 104 || c === 102 || isAsciiAlnum(c))) {
      // www. or scheme:// or scheme:email -- only at a word start-ish position.
      // Fast pre-check: scanExtendedAutolink returns null when prev is
      // alphanumeric (mid-word), so skip the flag scans and the call there.
      let prevOk = false;
      if (i === 0) prevOk = true;
      else if (!isAsciiAlnum(s.charCodeAt(i - 1))) {
        const pv = s[i - 1];
        prevOk = isUniSpace(pv) || (isUniPunct(pv) && pv !== '.' && pv !== '/' && pv !== ':' && pv !== '@');
      }
      if (prevOk) {
        const prev = i > 0 ? s[i - 1] : '';
        const hasUnderscoreOpener = delims.some(idx => nodes[idx].ch === '_' && nodes[idx].open);
        const hasActiveBracket = brackets.some(idx => nodes[idx].active);
        const ext = scanExtendedAutolink(s, i, prev, hasUnderscoreOpener, hasActiveBracket);
        if (ext) {
          pushNode({ k: 6, href: ext[0], title: null, img: false, ext: true });
          pushNode({ k: 0, s: ext[1] });
          pushNode({ k: 9 });
          i = ext[2]; continue;
        }
      }
      // fall through to plain text
    }
    if (c === 64 && !inLinkLeak) { // @ -- email autolink: look back for local part in pending text
      // find start of local part within current text chunk
      let start = text.length;
      while (start > 0) {
        const pc = text.charCodeAt(start - 1);
        if (isAsciiAlnum(pc) || '.!#$%&\'*+/=?^_`{|}~-'.indexOf(text[start - 1]) >= 0) start--;
        else break;
      }
      if (start < text.length && text.charCodeAt(start) !== 46) {
        // The local part in `text` already has backslash escapes resolved,
        // so foo\+@... would look like a valid email. A backslash anywhere
        // in the raw local-part region means the source is not an email.
        const localLen = text.length - start;
        let rawJ = i - 1, resolvedLen = 0, sawBackslash = false;
        while (resolvedLen < localLen && rawJ >= 0) {
          if (s.charCodeAt(rawJ) === 92) { sawBackslash = true; break; }
          resolvedLen++; rawJ--;
        }
        if (!sawBackslash) {
        const cand = text.slice(start) + s.slice(i);
        const hasUnderscoreOpener = delims.some(idx => nodes[idx].ch === '_' && nodes[idx].open);
        const emEnd = scanEmailAt(cand, 0, hasUnderscoreOpener);
        if (emEnd >= 0) {
          const full = cand.slice(0, emEnd);
          // trim trailing punctuation from the email
          const trimmed = full.slice(0, trimAutolinkEnd(full, 0, full.length));
          if (trimmed.length > 0 && trimmed.indexOf('@') > 0) {
            const localLen2 = trimmed.length - (full.length - emEnd) - (text.length - start);
            // rebuild: text before local part stays, then link node, then rest
            const before = text.slice(0, start);
            const afterIdx = i + (trimmed.length - (text.length - start));
            // link text: the email ends at a ']' that starts a link
            if (afterIdx < n && s.charCodeAt(afterIdx) === 93 && afterIdx + 1 < n && (s.charCodeAt(afterIdx + 1) === 40 || s.charCodeAt(afterIdx + 1) === 91)) { text += '@'; i++; continue; }
            text = before;
            pushNode({ k: 6, href: 'mailto:' + trimmed, title: null, img: false, ext: true });
            pushNode({ k: 0, s: trimmed });
            pushNode({ k: 9 });
            i = afterIdx; continue;
          }
        }
        }
      }
      text += '@'; i++; continue;
    }
    // --- plain character ---
    text += ch; i++;
  }
  flushText();

  // Emphasis processing (delimiter stack algorithm).
  processEmphasis(nodes, delims);
  return renderInline(nodes);
}

// Try to form a link/image at the ']' at s[i]. `nodes` is the flat token
// list (text already flushed), `brackets` the stack of opener token indices.
// Returns the index just past the link's closing syntax, or 0 when no link.
function tryFormLink(nodes, brackets, refs, s, i, unmatchedBacktick) {
  // the nearest bracket on the stack, active or not: a ']' pairs with it,
  // and if it was deactivated by an earlier link this ']' is literal text
  if (brackets.length === 0) return 0;
  const bi = brackets.length - 1;
  const openerIdx = brackets[bi];
  const opener = nodes[openerIdx];
  if (!opener.active) {
    brackets.splice(bi, 1);
    return 0;
  }
  const textStart = opener.img ? opener.pos + 2 : opener.pos + 1;
  let dest = null, title = null, next = 0, viaShortcut = false;
  const after = s.charCodeAt(i + 1);
  if (after === 40) { // inline link: '(' immediately after ']'
    const tail = parseLinkTail(s, i + 2, true);
    if (tail) { dest = tail.dest; title = tail.title; next = tail.next; }
  }
  if (dest === null && after === 91) { // full / collapsed reference [label]
    let j = i + 2, ok = false, bad = false;
    while (j < s.length) {
      const c = s.charCodeAt(j);
      if (c === 92 && j + 1 < s.length && isPunct(s[j + 1])) { j += 2; continue; }
      if (c === 91) { bad = true; break; } // labels hold no unescaped brackets
      if (c === 93) { ok = true; break; }
      j++;
    }
    if (ok && !bad) {
      const rawLabel = s.slice(i + 2, j);
      const label = rawLabel.length === 0 ? normalizeLabel(s.slice(textStart, i)) : normalizeLabel(rawLabel);
      const ref = refs.get(label);
      if (ref) { dest = ref.dest; title = ref.title; next = j + 1; }
    }
    // a failed full reference does not fall back to a shortcut
    if (dest === null) { brackets.splice(bi, 1); return 0; }
  }
  if (dest === null) { // shortcut reference (also the fallback after a failed inline link)
    const label = normalizeLabel(s.slice(textStart, i));
    const ref = refs.get(label);
    if (ref) { dest = ref.dest; title = ref.title; next = i + 1; viaShortcut = true; }
  }
  if (dest === null) {
    // failure: the opener can never form a link; drop it from the stack.
    brackets.splice(bi, 1);
    return 0;
  }
  // marked's link-label regex only accepts a label whose backtick runs
  // pair up (lenient code spans) or end as 2+ before the `]`; an
  // unconsumable label kills an inline or full-reference link outright
  // (doc-18, cm-342/525/537), while `` ``url` `` pairs fine (doc-09/14)
  // and a trailing 2-run before `]` is fine (doc-20's [be...]).
  // Shortcut references use a simpler label regex without the backtick
  // rules, so they skip this check. When the link fails, the `*`/`_`
  // delimiters in its text stay literal (marked's emStrong masking hides
  // the failed inline-link shape from emphasis), so disable them.
  if (!viaShortcut && !labelConsumable(s, textStart, i)) {
    for (let a = openerIdx + 1; a < nodes.length; a++) {
      const nd = nodes[a];
      if (nd.k === 4 && (nd.ch === '*' || nd.ch === '_')) { nd.open = false; nd.close = false; }
    }
    brackets.splice(bi, 1);
    return 0;
  }
  // Success: replace the opener token with the link token; append a close
  // marker at the end of the current token list.
  const isImg = opener.img;
  nodes[openerIdx] = { k: 6, href: dest, title: title, img: isImg };
  // Autolinks inside link text are plain text, not links -- but only
  // EXTENDED autolinks (www./scheme://, bare email): a <...> autolink
  // stays a link inside link text. No link could have formed inside (it
  // would have deactivated this opener), so any k:6 img:false ext:true
  // here is an extended autolink; images (img:true) are kept.
  for (let a = openerIdx + 1; a + 2 < nodes.length; a++) {
    const nd = nodes[a];
    if (nd.k === 6 && nd.ext && !nd.img && nodes[a + 1].k === 0 && nodes[a + 2].k === 9) {
      nodes[a] = { k: 0, s: '' };
      nodes[a + 2] = { k: 0, s: '' };
      a += 2;
    }
  }
  nodes.push({ k: 9, img: isImg });
  // drop the opener and any brackets after it from the stack
  brackets.length = bi;
  if (!isImg) {
    // a formed link deactivates every non-image opener still on the stack:
    // a link's text may contain an image, never another link. Image
    // openers stay active, so ![ [foo](u1) ](u2) still forms the image.
    for (let b = 0; b < brackets.length; b++) {
      const nb = nodes[brackets[b]];
      if (!nb.img) nb.active = false;
    }
  }
  return next;
}

// Emphasis processing over the flat token list. Delimiters only pair within
// the same innermost enclosing link (emphasis never crosses a link boundary).
// A delimiter run that is only partly used is split: the consumed part
// becomes the emphasis marker next to the content, the rest stays a
// delimiter. openersBottom holds the sequence number of the delimiter that
// followed an opener when it was used up; the backward search stops only
// on that exact delimiter (a removed one never blocks the search).
// `delims` holds the node indices of live delimiter tokens (sorted by
// position); every node insertion is followed by a rebuild of it.
function processEmphasis(nodes, delims) {
  if (delims.length === 0) return;
  for (let i = 0; i < delims.length; i++) nodes[delims[i]].seq = i;
  // recompute the delimiter list and the innermost-link group of each node
  function rebuild() {
    delims.length = 0;
    const groupOf = new Int32Array(nodes.length);
    let linkId = 0;
    const ls = [];
    for (let i = 0; i < nodes.length; i++) {
      const nd = nodes[i];
      if (nd.k === 6) { ls.push(++linkId); groupOf[i] = ls[ls.length - 1]; }
      else if (nd.k === 9) { groupOf[i] = ls.length ? ls[ls.length - 1] : 0; ls.pop(); }
      else groupOf[i] = ls.length ? ls[ls.length - 1] : 0;
      if (nd.k === 4) delims.push(i);
    }
    return groupOf;
  }
  let groupOf = rebuild();
  // Per link-group and delimiter char: the delimiter just after the
  // opener of the most recently formed emphasis, with how many
  // delimiters it used (1 = em, 2 = strong), whether that opener could
  // close, and whether the delimiter after it could open. A later
  // closer searching backwards is blocked from pairing with an opener
  // before that delimiter when it is a single delimiter, the inner
  // opener could not close, and the delimiter after it could open --
  // and either the inner emphasis was a strong, or the candidate opener
  // is a run of 2+ (a strong is at stake: doc-01, **a *b*c* d**).
  // Delimiters inside a formed emphasis are marked and never used as
  // openers (an emphasis may enclose, never cross, another).
  const openersBottom = new Map(); // group:char -> {seq, use, openerClose, bottomOpen}
  let di = 0;
  while (di < delims.length) {
    const closerIdx = delims[di];
    const closer = nodes[closerIdx];
    // A delimiter inside a masked span (false code span, doc-09/16/28/35)
    // cannot CLOSE -- marked's closer search runs on the masked source,
    // where it is an 'a'. It may still OPEN, so it stays in delims.
    // The mask is the paragraph's: delimiters inside a link label are
    // governed by the label's own masking, so they are exempt here.
    if (!closer.close || (closer.masked && groupOf[closerIdx] === 0)) { di++; continue; }
    const g = groupOf[closerIdx];
    const bottom = openersBottom.get(g + ':' + closer.ch);
    let oj = di - 1, openerPos = -1;
    while (oj >= 0) {
      const oIdx = delims[oj];
      const o = nodes[oIdx];
      if (o.inside) { oj--; continue; }
      if (o.ch === closer.ch && o.open && groupOf[oIdx] === g) {
        // An inner emphasis recorded for this char lies between this
        // opener and the closer: the pair may be blocked (the closer is
        // inside the inner emphasis's scope). A single closer after an
        // inner strong never pairs before the bottom (doc-07). A closer
        // smaller than its opener never pairs before the bottom (it
        // would waste the opener's strong, **a *b*c* d**). A closer
        // larger than its opener pairs only when no same-length opener
        // exists further back (doc-11 skips a lone '*' for a '**'
        // opener; doc-04 pairs '*' with '**' when no '**' opener
        // exists). A remainder of a longer run (e.g. the last '*' of
        // '***' after a strong) never counts as single (doc-19).
        if (bottom && o.seq < bottom.seq && !bottom.openerClose && bottom.bottomOpen) {
          if (bottom.use === 2 && closer.n === 1 && closer.origN === 1) break;
          if (o.n !== closer.n) {
            if (closer.n < o.n) break;
            let hasSame = false;
            for (let k = oj - 1; k >= 0; k--) {
              const cand = nodes[delims[k]];
              if (cand.ch === closer.ch && cand.open && groupOf[delims[k]] === g && !cand.inside && cand.n === closer.n) { hasSame = true; break; }
            }
            if (hasSame) { oj--; continue; }
          }
        }
        // CommonMark rules 9/10: if either delimiter can both open and
        // close, a match is barred when the length sum is a multiple of 3
        // unless both lengths are multiples of 3.
        const sum = o.n + closer.n;
        const blocked = (o.close || closer.open) && (sum % 3 === 0) && !(o.n % 3 === 0 && closer.n % 3 === 0);
        if (!blocked) { openerPos = oj; break; }
      }
      oj--;
    }
    if (openerPos < 0) { di++; continue; }
    const openerIdx = delims[openerPos];
    const opener = nodes[openerIdx];
    const isTilde = closer.ch === '~';
    const use = (opener.n >= 2 && closer.n >= 2) ? 2 : 1;
    const tag = isTilde ? 'del' : (use === 2 ? 'strong' : 'em');
    const closerSeq = closer.seq;
    // Mark every delimiter strictly between opener and closer as inside
    // this emphasis, so no later closer pairs with one (no crossing).
    for (let m = openerIdx + 1; m < closerIdx; m++) {
      if (nodes[m].k === 4) nodes[m].inside = true;
    }
    // --- opener: consume `use` from the end of the run (nearest the content)
    let openerInserted = false;
    if (opener.n === use) {
      const nextSeq = openerPos + 1 < delims.length ? nodes[delims[openerPos + 1]].seq : -1;
      const nextOpen = openerPos + 1 < delims.length ? nodes[delims[openerPos + 1]].open : false;
      openersBottom.set(g + ':' + closer.ch, { seq: nextSeq, use: use, openerClose: opener.close, bottomOpen: nextOpen });
      nodes[openerIdx] = { k: 7, tag: tag, open: true, ch: closer.ch };
      delims.splice(openerPos, 1);
      di--; // the closer shifted left in delims
    } else {
      opener.n -= use;
      nodes.splice(openerIdx + 1, 0, { k: 7, tag: tag, open: true, ch: closer.ch });
      openerInserted = true;
      groupOf = rebuild();
      di = delims.findIndex(idx => nodes[idx].seq >= closerSeq);
      if (di < 0) di = delims.length;
    }
    // --- closer: consume `use` from the start of the run. delims[di] is it.
    const cIdx = delims[di];
    const cl = nodes[cIdx];
    if (cl.n === use) {
      nodes[cIdx] = { k: 7, tag: tag, open: false, ch: closer.ch };
      delims.splice(di, 1);
      // di stays: the next delimiter moved into this slot
    } else {
      cl.n -= use;
      // Leftover placement (doc-11/doc-30): when a strong is closed by a
      // run of 3+ asterisks and its content holds a same-char em whose
      // closing delimiter is immediately followed by non-space text, the
      // first min(leftover, 2) asterisks of the leftover render INSIDE
      // the strong (marked's placement); otherwise they stay outside.
      let inside = 0;
      if (use === 2 && tag === 'strong') {
        const tagPos = openerInserted ? openerIdx + 1 : openerIdx;
        for (let j = tagPos + 1; j < cIdx - 1; j++) {
          const nd = nodes[j];
          if (nd.k === 7 && nd.tag === 'em' && !nd.open && nd.ch === closer.ch) {
            const nx = nodes[j + 1];
            if (nx && nx.k === 0 && nx.s && /\S/.test(nx.s[0])) { inside = Math.min(cl.n, 2); break; }
          }
        }
      }
      if (inside === 0) {
        nodes.splice(cIdx, 0, { k: 7, tag: tag, open: false, ch: closer.ch });
      } else if (inside === cl.n) {
        // The whole leftover goes inside: text node, then the close tag
        // replaces the delimiter node (fully consumed, leaves delims).
        nodes.splice(cIdx, 0, { k: 0, s: closer.ch.repeat(inside) });
        nodes[cIdx + 1] = { k: 7, tag: tag, open: false, ch: closer.ch };
        // The splice shifted node indices: rebuild delims (as the other
        // branches do) and resume at the first delimiter after this one.
        groupOf = rebuild();
        di = delims.findIndex(idx => nodes[idx].seq > closerSeq);
        if (di < 0) di = delims.length;
        continue;
      } else {
        cl.n -= inside;
        nodes.splice(cIdx, 0, { k: 0, s: closer.ch.repeat(inside) }, { k: 7, tag: tag, open: false, ch: closer.ch });
      }
      groupOf = rebuild();
      di = delims.findIndex(idx => nodes[idx].seq >= closerSeq);
      if (di < 0) di = delims.length;
      // the closer still exists at di: it may pair again
    }
  }
}

// Plain-text content of a token range (for image alt text).
function plainTextOf(nodes, from, to) {
  let out = '';
  for (let idx = from; idx < to; idx++) {
    const nd = nodes[idx];
    if (nd.k === 0 || nd.k === 1) out += nd.s;
    else if (nd.k === 2) out += '\n';
    else if (nd.k === 4) out += nd.ch.repeat(nd.n);
    else if (nd.k === 5) out += nd.img ? '![' : '[';
    else if (nd.k === 3) out += nd.s.replace(/<[^>]*>/g, '');
  }
  return out;
}

// Render the flat token list to HTML.
function renderInline(nodes) {
  let out = '';
  for (let idx = 0; idx < nodes.length; idx++) {
    const nd = nodes[idx];
    switch (nd.k) {
      case 0: out += escText(nd.s); break;
      case 1: out += '<code>' + escText(nd.s) + '</code>'; break;
      case 2: out += '<br>'; break;
      case 3: out += nd.s; break;
      case 4: out += nd.ch.repeat(nd.n); break;
      case 5: out += nd.img ? '![' : '['; break;
      case 7: out += nd.open ? '<' + nd.tag + '>' : '</' + nd.tag + '>'; break;
      case 9: out += nd.img ? '' : '</a>'; break;
      case 6: {
        if (nd.img) {
          // find matching close marker
          let depth = 1, j = idx + 1;
          while (j < nodes.length && depth > 0) {
            if (nodes[j].k === 6) depth++;
            else if (nodes[j].k === 9) depth--;
            j++;
          }
          const alt = plainTextOf(nodes, idx + 1, j - 1);
          out += '<img src="' + escAttr(encodeUrl(nd.href)) + '" alt="' + escAttr(alt) + '"' +
            (nd.title !== null ? ' title="' + escAttr(nd.title) + '"' : '') + '>';
          idx = j - 1;
        } else {
          out += '<a href="' + escAttr(encodeUrl(nd.href)) + '"' +
            (nd.title !== null ? ' title="' + escAttr(nd.title) + '"' : '') + '>';
        }
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Block parsing. A line cursor tracks the not-yet-consumed part of a line:
// s = the line, pos = index of the next unconsumed char, col = that char's
// original column (tabs measured from the line start), pre = pending spaces
// left over from a partially consumed tab (they precede the char at pos).
// ---------------------------------------------------------------------------
function curFrom(s) { return { s: s, pos: 0, col: 0, pre: 0 }; }
function curSave(c) { return { pos: c.pos, col: c.col, pre: c.pre }; }
function curRestore(c, sv) { c.pos = sv.pos; c.col = sv.col; c.pre = sv.pre; }
function curPeek(c) { return c.pre > 0 ? ' ' : (c.pos < c.s.length ? c.s[c.pos] : ''); }
function curAtEnd(c) { return c.pre === 0 && c.pos >= c.s.length; }
// Columns of leading whitespace in the remaining content.
function curIndent(c) {
  let n = c.pre, p = c.pos, col = c.col;
  while (p < c.s.length) {
    const ch = c.s.charCodeAt(p);
    if (ch === 32) { n++; p++; col++; }
    else if (ch === 9) { const w = 4 - (col % 4); n += w; p++; col += w; }
    else break;
  }
  return n;
}
// Skip up to `max` columns of whitespace; returns columns skipped.
function curSkipSpaces(c, max) {
  let n = 0;
  while (n < max) {
    if (c.pre > 0) { const take = Math.min(c.pre, max - n); c.pre -= take; n += take; continue; }
    if (c.pos >= c.s.length) break;
    const ch = c.s.charCodeAt(c.pos);
    if (ch === 32) { c.pos++; c.col++; n++; }
    else if (ch === 9) {
      const w = 4 - (c.col % 4);
      if (w > max - n) { c.pre = w - (max - n); c.pos++; c.col += w; n = max; }
      else { c.pos++; c.col += w; n += w; }
    } else break;
  }
  return n;
}
// Consume exactly `n` columns of indent (caller has verified enough exists).
function curStrip(c, n) { curSkipSpaces(c, n); }
// After a `>` marker, the following whitespace is tab-expanded from the
// marker's column in the quote's OWN content coordinates (marked's
// blockquoteMarkerWhitespace + J, applied per quote level in its recursive
// pass): `startCol` is the column just after the `>` there, i.e. the
// `>`'s column within its enclosing content + 1. One column of the
// expanded whitespace is the marker's own space; the rest stays as
// content indent (pending spaces). `> \tindented` -> 2 leading spaces,
// and `> > \tindented` -> 2 as well (the inner `>` sits at column 0 of
// the outer quote's content, so its tab expands from column 1, not
// from the raw line column 3). The cursor column advances in the raw
// line's coordinates; the pending spaces count in content coordinates.
function skipQuoteSpace(c, startCol) {
  let p = c.pos, ocol = c.col, w = 0, scol = startCol;
  while (p < c.s.length) {
    const ch = c.s.charCodeAt(p);
    if (ch === 32) { p++; ocol++; scol++; w++; }
    else if (ch === 9) { const tw = 4 - (scol % 4); p++; ocol += 4 - (ocol % 4); scol += tw; w += tw; }
    else break;
  }
  if (w === 0) return;
  c.pos = p; c.col = ocol;
  c.pre = w - 1;
}
// Strip up to `n` leading whitespace CHARACTERS from a fenced-code content
// line, mirroring marked's Dt indent compensation: each space or tab counts
// as one character, and a tab is consumed wholly (no leftover spaces).
// A tab at the start of a content line is therefore removed outright when
// the fence is indented (``  ```\n\tindented `` -> `indented`), while a
// tab after enough spaces survives (``  ```\n  \tx `` -> `\tx`).
function stripFenceIndent(c, n) {
  let left = n;
  while (left > 0) {
    if (c.pre > 0) { const take = Math.min(c.pre, left); c.pre -= take; left -= take; continue; }
    if (c.pos >= c.s.length) break;
    const ch = c.s.charCodeAt(c.pos);
    if (ch === 32) { c.pos++; c.col++; left--; }
    else if (ch === 9) { c.col += 4 - (c.col % 4); c.pos++; left--; }
    else break;
  }
}
// Advance `k` columns through any characters (markers, text).
function curAdvance(c, k) {
  while (k > 0) {
    if (c.pre > 0) { const take = Math.min(c.pre, k); c.pre -= take; k -= take; continue; }
    if (c.pos >= c.s.length) break;
    const ch = c.s.charCodeAt(c.pos);
    if (ch === 9) {
      const w = 4 - (c.col % 4);
      if (w > k) { c.pre = w - k; c.pos++; c.col += w; k = 0; }
      else { c.pos++; c.col += w; k -= w; }
    } else { c.pos++; c.col++; k--; }
  }
}
function curText(c) { return (c.pre > 0 ? ' '.repeat(c.pre) : '') + c.s.slice(c.pos); }
function curIsBlank(c) {
  // Pending spaces (pre) are still whitespace: a line holding only spaces
  // (whether from the line itself or from a partially consumed tab) is blank.
  for (let p = c.pos; p < c.s.length; p++) {
    const ch = c.s.charCodeAt(p);
    if (ch !== 32 && ch !== 9) return false;
  }
  return true;
}

const BLOCK_TAGS = new Set(('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param section source summary table tbody td tfoot th thead title tr track ul').split(' '));

// Try to parse a link reference definition at the start of paragraph text
// `text` starting at index `i`. Returns the index just past the definition
// (after its trailing newline) or -1. `refs` is updated on success.
function tryParseRefDef(text, i, refs) {
  const n = text.length;
  let j = i, sp = 0;
  while (j < n && text.charCodeAt(j) === 32) { j++; sp++; }
  if (sp > 3) return -1;
  if (j >= n || text.charCodeAt(j) !== 91) return -1; // [
  // label: balanced brackets, escapes, no newline
  let k = j + 1, labelEnd = -1;
  while (k < n) {
    const c = text.charCodeAt(k);
    if (c === 92 && k + 1 < n && isPunct(text[k + 1])) { k += 2; continue; }
    if (c === 91) return -1; // labels hold no unescaped brackets
    if (c === 93) { labelEnd = k; break; }
    k++;
  }
  if (labelEnd < 0) return -1;
  const label = normalizeLabel(text.slice(j + 1, labelEnd));
  if (label.length === 0) return -1;
  k = labelEnd + 1;
  if (k >= n || text.charCodeAt(k) !== 58) return -1; // :
  k++;
  // skip whitespace/newlines, then destination
  while (k < n && isWS(text.charCodeAt(k))) k++;
  if (k >= n) return -1;
  let dest = '';
  if (text.charCodeAt(k) === 60) {
    let p = k + 1;
    while (p < n && text.charCodeAt(p) !== 62 && text.charCodeAt(p) !== 10) {
      if (text.charCodeAt(p) === 92 && p + 1 < n && isPunct(text[p + 1])) { dest += text[p + 1]; p += 2; continue; }
      dest += text[p]; p++;
    }
    if (p >= n || text.charCodeAt(p) !== 62) return -1;
    k = p + 1;
  } else {
    let depth2 = 0, p = k;
    while (p < n) {
      const c = text.charCodeAt(p);
      if (c === 92 && p + 1 < n && isPunct(text[p + 1])) { dest += text[p + 1]; p += 2; continue; }
      if (c === 40) { depth2++; dest += '('; p++; continue; }
      if (c === 41) { if (depth2 === 0) break; depth2--; dest += ')'; p++; continue; }
      if (c <= 32 || c === 127) break;
      dest += text[p]; p++;
    }
    if (p === k) return -1;
    k = p;
  }
  // optional title: it must be separated from the destination by
  // whitespace and followed by only whitespace and a line ending. A
  // malformed title on a later line leaves a title-less definition;
  // a malformed title on the destination's own line voids the definition.
  let title = null, p = k, titleOnLaterLine = false;
  while (p < n && (text.charCodeAt(p) === 32 || text.charCodeAt(p) === 9 || text.charCodeAt(p) === 10)) {
    if (text.charCodeAt(p) === 10) titleOnLaterLine = true;
    p++;
  }
  if (p < n && (text.charCodeAt(p) === 34 || text.charCodeAt(p) === 39 || text.charCodeAt(p) === 40)) {
    if (p === k) return -1; // no whitespace between destination and title
    const q = text.charCodeAt(p);
    const close = q === 40 ? 41 : q;
    let t = '', m = p + 1, ok = false;
    while (m < n) {
      const c = text.charCodeAt(m);
      if (c === 92 && m + 1 < n && isPunct(text[m + 1])) { t += text[m + 1]; m += 2; continue; }
      if (c === close) { ok = true; break; }
      t += text[m]; m++;
    }
    if (!ok) return -1;
    title = t;
    p = m + 1;
    let q2 = p;
    while (q2 < n && (text.charCodeAt(q2) === 32 || text.charCodeAt(q2) === 9)) q2++;
    if (q2 < n && text.charCodeAt(q2) !== 10) {
      if (!titleOnLaterLine) return -1;
      // fall back: the definition ends after the destination's line
      let e = k;
      while (e < n && (text.charCodeAt(e) === 32 || text.charCodeAt(e) === 9)) e++;
      if (e >= n || text.charCodeAt(e) !== 10) return -1;
      if (!refs.has(label)) refs.set(label, { dest: dest, title: null });
      return e + 1;
    }
    p = q2;
  } else {
    // no title: the definition ends at the line ending after the destination
    let e = k;
    while (e < n && (text.charCodeAt(e) === 32 || text.charCodeAt(e) === 9)) e++;
    if (e < n && text.charCodeAt(e) !== 10) return -1;
    p = e;
  }
  if (!refs.has(label)) refs.set(label, { dest: dest, title: title });
  return p < n && text.charCodeAt(p) === 10 ? p + 1 : p;
}
// Extract leading link reference definitions from paragraph text.
// Returns the remaining text ('' when the paragraph held only definitions).
function extractRefs(text, refs) {
  let i = 0;
  for (;;) {
    const next = tryParseRefDef(text, i, refs);
    if (next < 0) break;
    i = next;
  }
  return text.slice(i);
}

// Split a table row line into cells: split on a `|` preceded by an even
// number of backslashes; a `|` preceded by an odd number stays literal.
// Returns null when the line holds no pipe at all.
function splitTableRow(line) {
  // marked's de(): a `|` is a separator unless preceded by an odd number
  // of backslashes, in which case it stays a literal `|` in the cell
  // (unescaped to `|` below); code spans do NOT protect pipes -- `a | b`
  // splits, `a \| b` does not, and `a \\| b` splits (two backslashes).
  if (line.indexOf('|') < 0) return null;
  let t = '';
  for (let i = 0; i < line.length; i++) {
    if (line.charCodeAt(i) === 124) { // |
      let bs = 0;
      for (let p = i - 1; p >= 0 && line.charCodeAt(p) === 92; p--) bs++;
      t += (bs % 2 === 1) ? '|' : ' |';
    } else t += line[i];
  }
  const cells = t.split(' |');
  // drop a leading empty cell and a trailing empty cell (edge pipes)
  if (cells.length > 0 && cells[0].trim() === '') cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map((x) => x.trim().replace(/\\\|/g, '|'));
}
// Is this split row a delimiter row? Returns the alignment array or null.
function delimiterAlign(cells) {
  if (!cells) return null;
  const align = [];
  for (const cell of cells) {
    const m = /^:?-+:?$/.exec(cell);
    if (!m) return null;
    align.push(cell.charCodeAt(0) === 58 ? (cell.charCodeAt(cell.length - 1) === 58 ? 'center' : 'left') : (cell.charCodeAt(cell.length - 1) === 58 ? 'right' : null));
  }
  return align;
}

// Parse the block structure of `lines` (already split, no trailing empty
// line). Returns {root, refs}.
function parseBlocks(lines, endsNl) {
  const refs = new Map();
  const root = { t: 'doc', children: [] };
  const stack = [root];
  let leaf = null, leafParent = null;
  let pendingLoose = null;
  let pendingLooseCount = 0; // blank lines in the current pending run
  let lineBlankRun = 0; // blank lines immediately before the current line
  let pendingLooseRaw = false;
  let pendingLooseInItem = false; // the blank line's leaf sat directly in
  // a list item (not nested in a blockquote inside it): a new item after
  // it DOES loosen the list (doc-09); a blank line nested in a blockquote
  // does not (cm-320).
  let pendingLooseQuote = -1; // the smallest index, over the blank run,
  // of the deepest blockquote on a blank line's descent path (-1 when
  // the line carried no quote marker): a blank that dives into a
  // blockquote inside an item is that quote's trailing blank, not a
  // separator between the item's blocks (q1/q10); a raw blank line
  // carries no marker and separates the item's own blocks (cm-325).
  // Record a blank line that may loosen a list. The flags accumulate
  // across consecutive blank lines (two `>` blanks still loosen, q5);
  // the quote index takes the minimum (any line of the run that is a
  // separator at the item's level makes the run one). `lists` is
  // collected only on the first blank of the run -- the stack does not
  // grow across blank lines.
  // A blank line sits directly in a list item when its leaf did, or when
  // the deepest open container is the item itself: an HTML block that
  // already closed leaves leafParent null, so the leaf test alone misses
  // it (a `> ` blank after `<!-- -->`). A quote on top means the blank
  // dives into a quote inside the item instead (cm-320), so the stack
  // test stays false there.
  function blankInItem() {
    return !!(leafParent && leafParent.t === 'item') || stack[stack.length - 1].t === 'item';
  }
  function markBlank(inItem, isRaw, quoteIdx) {
    if (pendingLoose) {
      pendingLooseCount++;
      pendingLooseRaw = pendingLooseRaw || isRaw;
      pendingLooseInItem = pendingLooseInItem || inItem;
      if (quoteIdx < pendingLooseQuote) pendingLooseQuote = quoteIdx;
    } else {
      pendingLooseRaw = isRaw;
      pendingLooseInItem = inItem;
      pendingLooseQuote = quoteIdx;
      pendingLooseCount = 1;
      pendingLoose = [];
      for (let d = 1; d < stack.length; d++) if (stack[d].t === 'list') pendingLoose.push(stack[d]);
    }
  }
  // the last html block closed by its end marker, and that line's index:
  // a blank line immediately after it removes the trailing newline
  let closedHtml = null, closedHtmlEnd = -1;

  function addNode(node) { stack[stack.length - 1].children.push(node); return node; }
  function finalizeLeaf() {
    if (!leaf) return;
    if (leaf.t === 'p') {
      const rest = extractRefs(leaf.lines.join('\n'), refs);
      if (rest === '') {
        const ch = leafParent.children;
        ch.splice(ch.indexOf(leaf), 1);
      } else leaf.text = rest;
    } else if (leaf.t === 'code' && !leaf.fenced) {
      while (leaf.lines.length && leaf.lines[leaf.lines.length - 1] === '') leaf.lines.pop();
    } else if (leaf.t === 'html') {
      // trailing blank lines are dropped, and the block then has no
      // trailing newline (marked: the block ends before the blank line)
      let k = leaf.lines.length;
      while (k > 0 && /^[ \t]*$/.test(leaf.lines[k - 1])) k--;
      if (k < leaf.lines.length) { leaf.lines.length = k; leaf.trailNl = false; }
    }
    leaf = null; leafParent = null;
  }
  function closeTo(depth) { // keep stack[0..depth]
    finalizeLeaf();
    while (stack.length > depth + 1) stack.pop();
  }
  // Descend through open containers for one line. Returns the cursor after
  // the container prefixes and the stack depth reached (1-based count of
  // matched containers, stack index where it stopped).
  function descend(raw) {
    const cur = curFrom(raw);
    let depth = 1;
    while (depth < stack.length) {
      const cont = stack[depth];
      if (cont.t === 'quote') {
        const sv = curSave(cur);
        curSkipSpaces(cur, 3);
        if (curPeek(cur) === '>') { const qcol = cur.col - sv.col; curAdvance(cur, 1); skipQuoteSpace(cur, qcol + 1); depth++; continue; }
        curRestore(cur, sv); break;
      }
      if (cont.t === 'item') {
        if (curIsBlank(cur)) { depth++; continue; }
        // An empty item followed by a blank line is closed: a later
        // indented line is a new top-level block, not item content.
        if (cont.blankAfterEmpty) break;
        if (curIndent(cur) >= cont.indent) { curAdvance(cur, cont.indent); depth++; continue; }
        break;
      }
      depth++; // list: consumes nothing
    }
    return { cur: cur, depth: depth };
  }

  // Does the line at the cursor (after the <=3-space skip) start a block
  // that can interrupt a paragraph? List items are handled by the caller.
  // Used after a failed container descent to decide whether a line is a
  // lazy paragraph continuation: a block start is not lazy, but a type-7
  // html block, indented code, and a setext-like line are (they cannot
  // interrupt a paragraph).
  function startsBlock(cur) {
    const ch = curPeek(cur);
    if (ch === '#') {
      let q = cur.pos, n = 0;
      while (q < cur.s.length && cur.s[q] === '#') { q++; n++; }
      return n >= 1 && n <= 6 && (q >= cur.s.length || cur.s.charCodeAt(q) === 32 || cur.s.charCodeAt(q) === 9);
    }
    if (ch === '>') return true;
    if (ch === '`' || ch === '~') {
      let q = cur.pos, n = 0;
      while (q < cur.s.length && cur.s[q] === ch) { q++; n++; }
      return n >= 3;
    }
    if (ch === '-' || ch === '_' || ch === '*') {
      let cnt = 0;
      for (let q = cur.pos; q < cur.s.length; q++) {
        const cc = cur.s.charCodeAt(q);
        if (cc === 32 || cc === 9) continue;
        if (cur.s[q] === ch) { cnt++; continue; }
        return false;
      }
      return cnt >= 3;
    }
    if (ch === '<') {
      const hb = htmlBlockStart(cur);
      return !!hb && hb.type !== 7;
    }
    return false;
  }

  // Try to start a new block from the cursor. Returns true when the line
  // was consumed as (the start of) a block. `ln` is the current line index
  // (used for table row peeking); `advance` moves the main loop forward.
  function startBlock(cur, ln, advance) {
    // --- setext heading (paragraph open) ---
    if (leaf && leaf.t === 'p') {
      const sv = curSave(cur);
      curSkipSpaces(cur, 3);
      const ch = curPeek(cur);
      if (ch === '=' || ch === '-') {
        // the underline is a contiguous run of the marker, then only
        // spaces/tabs (a space between markers is not a setext underline)
        let p = cur.pos;
        while (p < cur.s.length && cur.s[p] === ch) p++;
        if (p > cur.pos) {
          let q = p;
          while (q < cur.s.length && (cur.s.charCodeAt(q) === 32 || cur.s.charCodeAt(q) === 9)) q++;
          if (q >= cur.s.length) {
            const rest = extractRefs(leaf.lines.join('\n'), refs);
            if (rest !== '') {
              const parent = leafParent;
              const idx = parent.children.indexOf(leaf);
              // a setext heading's text is trimmed, unlike a paragraph's
              parent.children[idx] = { t: 'h', level: ch === '=' ? 1 : 2, text: rest.replace(/^[ \t]+/, '').replace(/[ \t\n]+$/, '') };
              leaf = null; leafParent = null;
              return true;
            }
          }
        }
        curRestore(cur, sv);
      } else curRestore(cur, sv);
    }
    // From here, block-start checks share one save point: a failed check
    // must not eat the leading spaces (paragraph lines keep them).
    const save = curSave(cur);
    const origIndent = curIndent(cur);
    curSkipSpaces(cur, 3);
    const first = curPeek(cur);
    const rest = cur.s.slice(cur.pos);
    // --- thematic break ---
    if (first === '-' || first === '_' || first === '*') {
      let cnt = 0, ok = true;
      for (let p = cur.pos; p < cur.s.length; p++) {
        const cc = cur.s.charCodeAt(p);
        if (cc === 32 || cc === 9) continue;
        if (cur.s[p] === first) { cnt++; continue; }
        ok = false; break;
      }
      if (ok && cnt >= 3) {
        finalizeLeaf();
        addNode({ t: 'hr' });
        return true;
      }
    }
    // --- ATX heading ---
    if (first === '#') {
      let p = cur.pos, n = 0;
      while (p < cur.s.length && cur.s[p] === '#') { p++; n++; }
      if (n >= 1 && n <= 6 && (p >= cur.s.length || cur.s.charCodeAt(p) === 32 || cur.s.charCodeAt(p) === 9)) {
        finalizeLeaf();
        let text = cur.s.slice(p).replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
        // strip a closing sequence of #s preceded by a space; content that
        // is only #s is itself a closing sequence (empty heading)
        if (/^#+$/.test(text)) text = '';
        else {
          const m = /^(.*)[ \t]+#+$/.exec(text);
          if (m) text = m[1].replace(/[ \t]+$/, '');
        }
        addNode({ t: 'h', level: n, text: text });
        return true;
      }
    }
    // --- fenced code ---
    if (first === '`' || first === '~') {
      let p = cur.pos, n = 0;
      while (p < cur.s.length && cur.s[p] === first) { p++; n++; }
      if (n >= 3) {
        // Backslash escapes in the info string resolve (foo\+bar -> foo+bar).
        const infoRaw = cur.s.slice(p).trim();
        let info = '';
        for (let q = 0; q < infoRaw.length; q++) {
          if (infoRaw.charCodeAt(q) === 92 && q + 1 < infoRaw.length && isPunct(infoRaw[q + 1])) { info += infoRaw[q + 1]; q++; continue; }
          info += infoRaw[q];
        }
        if (first !== '`' || info.indexOf('`') < 0) {
          finalizeLeaf();
          // Only a backtick fence strips its own indent from its content
          // lines (marked's indent compensation matches ``` only); a
          // tilde fence keeps every content line's leading spaces
          // (doc-29: a ~~~ fence at quote level keeps '  if x').
          const stripIndent = first === '`' ? (cur.col - cur.pre) - (save.col - save.pre) : 0;
          leaf = addNode({ t: 'code', fenced: true, fenceChar: first, fenceLen: n, fenceIndent: stripIndent, info: info, lines: [] });
          leafParent = stack[stack.length - 1];
          return true;
        }
      }
    }
    // --- HTML block ---
    // `first` is curPeek, which reports a pending space when the <=3-space
    // skip partially consumed a tab: `\t<div>` then has first === ' ',
    // not '<', so it falls through to indented code instead of starting
    // an HTML block (a tab-indented tag is code, not HTML).
    if (first === '<') {
      const hb = htmlBlockStart(cur);
      if (hb) {
        // type 7 cannot interrupt a paragraph
        if (!(hb.end === 'blank' && hb.type === 7 && leaf && leaf.t === 'p')) {
          finalizeLeaf();
          curRestore(cur, save); // the block keeps the line's leading spaces
          leaf = addNode({ t: 'html', lines: [curText(cur)], end: hb.end, trailNl: false });
          leafParent = stack[stack.length - 1];
          if (hb.end !== 'blank' && curText(cur).toLowerCase().indexOf(hb.end) >= 0) {
            // Trailing \n only if this line is followed by one in the input.
            leaf.trailNl = ln < lines.length - 1 || endsNl;
            closedHtml = leaf; closedHtmlEnd = ln;
            leaf = null; leafParent = null;
          }
          return true;
        }
      }
    }
    // --- list item ---
    {
      const li = listMarker(cur);
      if (li) {
        // An ordered list may interrupt a paragraph only when it starts
        // with 1 -- unless the paragraph sits directly inside a list item,
        // where any start number begins a sublist.
        const canInterrupt = !leaf || leaf.t !== 'p' || (!li.empty && (li.bullet || li.start === 1 || (leafParent && leafParent.t === 'item')));
        if (canInterrupt) {
          finalizeLeaf();
          let parent = stack[stack.length - 1];
          let list = null;
          if (parent.t === 'list' && parent.ordered === li.ordered &&
              (li.ordered ? parent.delim === li.delim : parent.marker === li.marker)) {
            list = parent; // the descent stopped at this list: add the item to it
          } else {
            if (parent.t === 'list') {
              // A different list next to the open one is its sibling, so
              // it belongs to the open list's own parent in the tree. The
              // stack element directly below the open list is not always
              // that parent: an older list still sits open below it (its
              // items are done, but it was never popped) even though it
              // is a sibling of the open list, not an ancestor. Taking
              // the stack element below blindly nests the new list inside
              // the old one, where it renders as one empty <li> and its
              // whole content vanishes (doc-02). Find the parent by the
              // tree instead: the deepest stack element that holds the
              // open list among its children.
              const openList = parent;
              parent = stack[0];
              for (let d = stack.length - 2; d >= 0; d--) {
                if (stack[d].children.indexOf(openList) >= 0) { parent = stack[d]; break; }
              }
            }
            const last = parent.children[parent.children.length - 1];
            if (last && last.t === 'list' && last.ordered === li.ordered &&
                (li.ordered ? last.delim === li.delim : last.marker === li.marker)) list = last;
          }
          const listExisted = !!list;
          if (!list) {
            list = { t: 'list', ordered: li.ordered, start: li.start, delim: li.delim, marker: li.marker, tight: true, children: [] };
            parent.children.push(list);
          }
          if (listExisted) {
            // An HTML block ending the previous item keeps its trailing
            // newline only when exactly one blank line separates the
            // items (marked's item text then ends with a single \n):
            // no blank line (V1) and two or more (U6) both drop it.
            const prevItem = list.children[list.children.length - 1];
            const prevLast = prevItem && prevItem.children[prevItem.children.length - 1];
            if (prevLast && prevLast.t === 'html') prevLast.trailNl = lineBlankRun === 1;
          }
          // the item's content indent is relative to the line's content
          // start (after the container prefixes), so a later line with a
          // shorter quote prefix still matches the item
          const item = { t: 'item', indent: li.contentIndent - (save.col - save.pre), children: [] };
          list.children.push(item);
          if (list === stack[stack.length - 1]) stack.push(item);
          else stack.push(list, item);
          // process the item's first-line content in place; the item and
          // list stay open -- later lines close them via the descent
          curAdvance(cur, li.contentIndent - li.markerIndent);
          if (!curIsBlank(cur)) startBlock(cur, ln, advance);
          return true;
        }
      }
    }
    // --- blockquote ---
    if (first === '>') {
      finalizeLeaf();
      const q = { t: 'quote', children: [] };
      addNode(q);
      stack.push(q);
      const qcol = cur.col - save.col;
      curAdvance(cur, 1);
      skipQuoteSpace(cur, qcol + 1);
      if (!curIsBlank(cur)) startBlock(cur, ln, advance);
      return true;
    }
    // --- indented code (never interrupts a paragraph) ---
    // the indent is measured before the <=3-space skip above
    if (!leaf || leaf.t !== 'p') {
      if (origIndent >= 4) {
        finalizeLeaf();
        curRestore(cur, save);
        curStrip(cur, 4);
        leaf = addNode({ t: 'code', fenced: false, lines: [curText(cur)] });
        leafParent = stack[stack.length - 1];
        return true;
      }
    }
    // --- table (also interrupts a paragraph, GFM) ---
    if (!leaf || leaf.t === 'p') {
      const headerCells = splitTableRow(curText(cur));
      if (headerCells && headerCells.length > 0) {
        const d = descend(lines[ln + 1] || '');
        if (d.depth === stack.length && !curIsBlank(d.cur)) {
          const align = delimiterAlign(splitTableRow(curText(d.cur)));
          if (align && align.length === headerCells.length) {
            finalizeLeaf();
            const table = { t: 'table', align: align, header: headerCells, rows: [] };
            addNode(table);
            advance(1); // consume the delimiter line
            let r = ln + 2;
            while (r < lines.length) {
              const rd = descend(lines[r]);
              if (rd.depth < stack.length) break;
              // A whitespace-only line ends the table -- except a line of
              // 0-3 spaces plus a single tab, which is a (padded) empty
              // row (marked quirk, doc-26).
              if (curIsBlank(rd.cur) && !/^ *\t$/.test(curText(rd.cur))) break;
              const rtxt = curText(rd.cur);
              // A body row is any line that does not start another block:
              // marked's table regex ends the table at a blank line, an
              // indented-code indent, a blockquote, an ATX heading, a
              // fence, a thematic break, a list marker, or an HTML block
              // start (doc-05: <details> / <summary> lines end the table).
              // A bare '#' or a fence with backticks later on the line is
              // not a block start, and a type-7 tag alone on the line does
              // not end a table either.
              {
                let qq = 0, indc = 0;
                while (qq < rtxt.length && (rtxt.charCodeAt(qq) === 32 || rtxt.charCodeAt(qq) === 9)) {
                  if (rtxt.charCodeAt(qq) === 9) indc += 4 - (indc % 4); else indc++;
                  qq++;
                }
                if (indc >= 4 && qq < rtxt.length) break; // indented code
                // (a whitespace-only line is handled above: only the
                // tab-padded empty row reaches here, and it is a row)
                if (indc <= 3 && qq < rtxt.length) {
                  const rc0 = rtxt[qq];
                  if (rc0 === '>') break; // blockquote
                  if (rc0 === '#') {
                    let p = qq, n = 0;
                    while (p < rtxt.length && rtxt[p] === '#') { p++; n++; }
                    if (n >= 1 && n <= 6 && (p >= rtxt.length || rtxt.charCodeAt(p) === 32 || rtxt.charCodeAt(p) === 9)) break;
                  }
                  if (rc0 === '`' || rc0 === '~') {
                    let p = qq;
                    while (p < rtxt.length && rtxt[p] === rc0) p++;
                    if (p - qq >= 3 && (rc0 === '~' || rtxt.indexOf('`', p) < 0)) break;
                  }
                  if (rc0 === '-' || rc0 === '_' || rc0 === '*') {
                    let cnt = 0, ok = true;
                    for (let p = qq; p < rtxt.length; p++) {
                      const cc = rtxt.charCodeAt(p);
                      if (cc === 32 || cc === 9) continue;
                      if (rtxt[p] === rc0) { cnt++; continue; }
                      ok = false; break;
                    }
                    if (ok && cnt >= 3) break; // thematic break
                  }
                  if (rc0 === '-' || rc0 === '+' || rc0 === '*') {
                    const nx = rtxt.charCodeAt(qq + 1);
                    if (nx === 32 || nx === 9) break; // bullet list marker
                  } else if (rc0 === '1' && (rtxt[qq + 1] === '.' || rtxt[qq + 1] === ')')) {
                    const nx = rtxt.charCodeAt(qq + 2);
                    if (nx === 32 || nx === 9) break; // ordered list marker
                  }
                  if (rc0 === '<') {
                    const hb = htmlBlockStart({ s: rtxt, pos: qq, col: qq, pre: 0 });
                    if (hb && hb.type !== 7) break;
                  }
                }
              }
              const row = splitTableRow(rtxt) || [rtxt.trim()];
              while (row.length < headerCells.length) row.push('');
              table.rows.push(row.slice(0, headerCells.length));
              r++; advance(1);
            }
            return true;
          }
        }
      }
    }
    // --- paragraph ---
    if (!leaf || leaf.t !== 'p') {
      // new paragraph: marked keeps the first line's leading spaces
      curRestore(cur, save);
      finalizeLeaf();
      leaf = addNode({ t: 'p', lines: [curText(cur)] });
      leafParent = stack[stack.length - 1];
    } else {
      curRestore(cur, save);
      leaf.lines.push(curText(cur));
    }
    return true;
  }

  for (let ln = 0; ln < lines.length; ln++) {
    const raw = lines[ln];
    const { cur, depth } = descend(raw);
    const blank = curIsBlank(cur);
    // The deepest blockquote on this line's descent path, taken before
    // the close below can pop the stack (-1 when the line carried no
    // quote marker): a blank line's loosen effect is decided by whether
    // its own markers dive into a quote below the block it separates.
    let blankQuote = -1;
    if (blank) {
      for (let d = depth - 1; d >= 1; d--) {
        if (stack[d].t === 'quote') { blankQuote = d; break; }
      }
    }
    if (depth < stack.length) {
      // Fenced code content: a line that fails a LIST ITEM descent is
      // still code content (its container prefix is simply absent); only
      // a closing fence ends the block. A failed BLOCKQUOTE descent is
      // different: a line without '>' is outside the quote (cm-237).
      if (leaf && leaf.t === 'code' && leaf.fenced && !blank && stack[depth].t === 'item') {
        const sv = curSave(cur);
        curSkipSpaces(cur, 3);
        let closed = false;
        if (curPeek(cur) === leaf.fenceChar) {
          let p = cur.pos, n = 0;
          while (p < cur.s.length && cur.s[p] === leaf.fenceChar) { p++; n++; }
          if (n >= leaf.fenceLen) {
            let ok = true;
            for (let q = p; q < cur.s.length; q++) {
              const cc = cur.s.charCodeAt(q);
              if (cc !== 32 && cc !== 9) { ok = false; break; }
            }
            if (ok) closed = true;
          }
        }
        if (closed) {
          if (leaf.lines.length && leaf.lines[leaf.lines.length - 1] === '') leaf.lines.pop();
          closeTo(depth - 1);
          continue;
        }
        if (leaf.lines.length === 0) {
          // The first content line fails the item descent: the fence is
          // empty. Close it (and the item) and fall through so this line
          // starts a top-level block (doc-17/21/36/38); a later 0-indent
          // line IS code content (doc-02).
          curRestore(cur, sv);
          closeTo(depth - 1);
        } else if (startsBlock(cur) || listMarker(cur)) {
          // A line that starts a block (new list item, heading, quote,
          // thematic break, fence, HTML block) ends the fence: only
          // plain text lines are lazy fence content. Close the fence
          // (and the item) and fall through so this line starts its
          // own block (doc-36: `* next` after a fence in a quote).
          if (leaf.lines.length && leaf.lines[leaf.lines.length - 1] === '') leaf.lines.pop();
          curRestore(cur, sv);
          closeTo(depth - 1);
        } else {
          curRestore(cur, sv);
          stripFenceIndent(cur, leaf.fenceIndent);
          leaf.lines.push(curText(cur));
          continue;
        }
      }
      // A line that starts a block is not a lazy paragraph continuation:
      // the containers close and the block starts at the level where the
      // descent stopped. Any other non-blank line continues the paragraph.
      let isListItem = false, blockStart = false;
      if (!blank) {
        const sv = curSave(cur);
        curSkipSpaces(cur, 3);
        // A thematic break (or other block start) wins over a list marker:
        // `* * *` is an <hr>, not a new item, so the list must close.
        if (startsBlock(cur)) blockStart = true;
        else if (listMarker(cur)) isListItem = true;
        curRestore(cur, sv);
      }
      if (!blank && leaf && leaf.t === 'p' && !isListItem && !blockStart) {
        // Lazy continuation: a line indented 4+ spaces loses exactly 4
        // columns of leading space; fewer than 4 are kept verbatim.
        if (curIndent(cur) >= 4) curSkipSpaces(cur, 4);
        let txt = curText(cur);
        // Setext-like `===` line as a lazy continuation inside a
        // blockquote paragraph of 2+ lines gains 4 leading spaces
        // (marked quirk, cm-093).
        if (/^=+[ \t]*$/.test(txt) && leafParent && leafParent.t === 'quote' && leaf.lines.length >= 2) txt = '    ' + txt;
        leaf.lines.push(txt);
        continue;
      }
      // a list only stays open for a new item of that list; any other
      // block after a failed item descent is a sibling of the list.
      // Nested lists must all close (a block is never a direct child
      // of a list), so walk past every consecutive list level.
      let target = depth - 1;
      if (!isListItem) {
        while (stack[target] && stack[target].t === 'list') target--;
      }
      closeTo(target);
    }
    if (blank) {
      // Only a truly empty line right after an HTML block suppresses
      // its trailing newline; a whitespace-only line (spaces/tabs) is
      // a trailing line of the block that is dropped, and the \n stays.
      if (closedHtml && closedHtmlEnd === ln - 1 && raw.length === 0) { closedHtml.trailNl = false; closedHtml = null; }
      // A line that is only blank after container markers (e.g. `>  `)
      // still contributes its leftover spaces as a paragraph line
      // (cm-241); only a truly blank source line ends the paragraph.
      if (leaf && leaf.t === 'p' && !/^[ \t]*$/.test(raw) && (cur.pre > 0 || cur.pos < cur.s.length)) {
        leaf.lines.push(curText(cur));
        continue;
      }
      // A blank line after an empty item closes that item (cm-280).
      for (let d = stack.length - 1; d >= 1; d--) {
        if (stack[d].t === 'item' && stack[d].children.length === 0) stack[d].blankAfterEmpty = true;
      }
      if (leaf && leaf.t === 'code' && leaf.fenced) { curStrip(cur, leaf.fenceIndent); leaf.lines.push(curText(cur)); }
      else if (leaf && leaf.t === 'code' && !leaf.fenced) {
        if (curIndent(cur) >= 4) { curStrip(cur, 4); leaf.lines.push(curText(cur)); }
        else {
          leaf.lines.push('');
          markBlank(blankInItem(), /^[ \t]*$/.test(raw), blankQuote);
        }
      }
      else if (leaf && leaf.t === 'html' && leaf.end !== 'blank') leaf.lines.push(curText(cur));
      else {
        // A blank line sits directly in a list item when its leaf did,
        // or when the deepest open container is the item itself (see
        // blankInItem): an HTML block that already closed leaves
        // leafParent null, so the leaf test alone misses it. Read it
        // before finalizeLeaf clears leafParent.
        const inItem = blankInItem();
        finalizeLeaf();
        markBlank(inItem, /^[ \t]*$/.test(raw), blankQuote);
      }
      continue;
    }
    // leaf continuation for fenced code / indented code / html blocks
    if (leaf && leaf.t === 'code' && leaf.fenced) {
      const sv = curSave(cur);
      curSkipSpaces(cur, 3);
      const ch = curPeek(cur);
      if (ch === leaf.fenceChar) {
        let p = cur.pos, n = 0;
        while (p < cur.s.length && cur.s[p] === ch) { p++; n++; }
        if (n >= leaf.fenceLen) {
          let ok = true;
          for (let q = p; q < cur.s.length; q++) {
            const cc = cur.s.charCodeAt(q);
            if (cc !== 32 && cc !== 9) { ok = false; break; }
          }
          if (ok) {
            // A blank line immediately before the closing fence is not
            // part of the content (marked drops one trailing blank line).
            if (leaf.lines.length && leaf.lines[leaf.lines.length - 1] === '') leaf.lines.pop();
            leaf = null; leafParent = null; continue;
          }
        }
      }
      curRestore(cur, sv);
      stripFenceIndent(cur, leaf.fenceIndent);
      // Inside a container (list item / blockquote), a leading tab in
      // fenced code content expands to spaces (to the next multiple of 4
      // from its column); at top level the tab is kept verbatim. The
      // column is the original column, except a blockquote contributes
      // only 2 ('> ') however deep it is nested (doc-05/09: '> > \t'
      // gives 2 spaces, not 4).
      if (stack.length > 1 && cur.pre === 0 && cur.pos < cur.s.length && cur.s.charCodeAt(cur.pos) === 9) {
        let effCol = cur.col;
        for (let d = stack.length - 1; d >= 1; d--) {
          if (stack[d].t === 'quote') { effCol = 2; break; }
          if (stack[d].t === 'item') break;
        }
        const w = 4 - (effCol % 4);
        cur.pre = w; cur.pos++; cur.col += w;
      }
      leaf.lines.push(curText(cur));
      continue;
    }
    if (leaf && leaf.t === 'code' && !leaf.fenced) {
      if (curIndent(cur) >= 4) {
        curStrip(cur, 4); leaf.lines.push(curText(cur));
        // A blank line the code just swallowed was code content, not a
        // separator between blocks: it loosens nothing.
        pendingLoose = null;
        pendingLooseCount = 0;
        continue;
      }
      finalizeLeaf();
    }
    if (leaf && leaf.t === 'html') {
      const txt = curText(cur);
      leaf.lines.push(txt);
      if (leaf.end !== 'blank' && txt.toLowerCase().indexOf(leaf.end) >= 0) {
        leaf.trailNl = ln < lines.length - 1 || endsNl;
        closedHtml = leaf; closedHtmlEnd = ln;
        leaf = null; leafParent = null;
      }
      continue;
    }
    // A blank line loosens a list only when the next block lands inside
    // it: as a new item of the list (the blank sat between two items),
    // or as a block inside one of its items (the blank sat between two
    // blocks of that item). A block that lands outside the list -- a
    // sibling list, or a block in another container -- leaves it tight
    // (doc-06/29/37: a blank `>` line before a sibling ordered list).
    // lineBlankRun records this run's length for the new-item HTML rule
    // below (startBlock): 0 when no blank run preceded this line.
    lineBlankRun = 0;
    if (pendingLoose) {
      lineBlankRun = pendingLooseCount;
      const top = stack[stack.length - 1];
      let lm = null;
      {
        const sv = curSave(cur);
        curSkipSpaces(cur, 3);
        lm = listMarker(cur);
        curRestore(cur, sv);
      }
      if (lm && top.t === 'list' && top.ordered === lm.ordered &&
          (lm.ordered ? top.delim === lm.delim : top.marker === lm.marker)) {
        // A new item of the open list: the blank was between two items
        // when it sat at the list's level -- a raw blank line, or one
        // whose leaf sat directly in an item (doc-09). A blank nested
        // in a blockquote inside an item does not count (cm-320).
        if ((pendingLooseRaw || pendingLooseInItem) && pendingLoose.indexOf(top) >= 0) top.tight = false;
      } else {
        // Where does the next block land? A list item that does not
        // reuse the open list starts a sibling list under that list's
        // own parent in the tree; any other block lands in the stack's
        // top container.
        let place = top, placeIdx = stack.length - 1;
        if (lm && top.t === 'list') {
          place = stack[0]; placeIdx = 0;
          for (let d = stack.length - 2; d >= 0; d--) {
            if (stack[d].children.indexOf(top) >= 0) { place = stack[d]; placeIdx = d; break; }
          }
        }
        // A block inside an item loosens that item's list only when the
        // blank run holds a line that separates the item's own blocks:
        // no blockquote sits on that line's descent path below the item
        // (a blank that dives into a quote inside the item is the
        // quote's own trailing blank, not a separator between the
        // item's blocks, q1/q10). A raw blank line carries no marker,
        // so it always separates (cm-325).
        if (place.t === 'item' && pendingLooseQuote <= placeIdx) {
          const listNode = stack[placeIdx - 1];
          if (listNode && listNode.t === 'list' && pendingLoose.indexOf(listNode) >= 0) listNode.tight = false;
        }
      }
      pendingLoose = null;
      pendingLooseCount = 0;
    }
    // start (or continue) a block from this line
    let extra = 0;
    startBlock(cur, ln, (k) => { extra += k; });
    ln += extra;
  }
  if (leaf && leaf.t === 'html') leaf.trailNl = endsNl;
  closeTo(0);
  return { root: root, refs: refs };
}

// Detect an HTML block start at the cursor (indent already skipped, <=3).
// Returns {type, end} or null. end is the string that ends the block
// (types 1-5, matched case-insensitively) or 'blank' (types 6-7).
function htmlBlockStart(cur) {
  const s = cur.s, pos = cur.pos;
  if (pos >= s.length || s.charCodeAt(pos) !== 60) return null;
  const rest = s.slice(pos);
  const lower = rest.toLowerCase();
  const m1 = /^<(script|pre|style|textarea)([ \t>]|$)/.exec(lower);
  if (m1) return { type: 1, end: '</' + m1[1] + '>' };
  if (rest.startsWith('<!--')) return { type: 2, end: '-->' };
  if (rest.startsWith('<?')) return { type: 3, end: '?>' };
  if (/^<![A-Za-z]/.test(rest)) return { type: 4, end: '>' };
  if (rest.startsWith('<![CDATA[')) return { type: 5, end: ']]>' };
  // tag name after < or </
  const nm = /^<\/?([A-Za-z][A-Za-z0-9-]*)/.exec(rest);
  if (!nm) return null;
  const tag = nm[1].toLowerCase();
  const after = rest[nm[0].length];
  // type 6: a block tag followed by space, tab, end of line, > or />
  if (BLOCK_TAGS.has(tag) && (after === undefined || after === ' ' || after === '\t' || after === '>' || (after === '/' && rest[nm[0].length + 1] === '>'))) {
    return { type: 6, end: 'blank' };
  }
  // type 7: a complete open or close tag alone on the line
  const ht = scanHtmlTag(s, pos);
  if (ht) {
    let q = ht[1];
    while (q < s.length && (s.charCodeAt(q) === 32 || s.charCodeAt(q) === 9)) q++;
    if (q >= s.length) return { type: 7, end: 'blank' };
  }
  return null;
}

// Detect a list marker at the cursor (indent already skipped, ≤3).
// Returns {ordered, bullet, marker, delim, start, empty, contentIndent,
// markerIndent} or null.
function listMarker(cur) {
  const s = cur.s, pos = cur.pos, col = cur.col - cur.pre;
  const c = s.charCodeAt(pos);
  let ordered = false, marker = '', delim = '', start = 1, width = 0;
  if (c === 45 || c === 43 || c === 42) { marker = s[pos]; width = 1; }
  else if (c >= 48 && c <= 57) {
    let p = pos;
    while (p < s.length && s.charCodeAt(p) >= 48 && s.charCodeAt(p) <= 57 && p - pos < 9) p++;
    if (p < s.length && (s.charCodeAt(p) === 46 || s.charCodeAt(p) === 41) && p > pos) {
      ordered = true; delim = s[p]; start = parseInt(s.slice(pos, p), 10); width = p - pos + 1;
    } else return null;
  } else return null;
  // spaces after the marker
  let p = pos + width, spaces = 0, col2 = col + width;
  while (p < s.length) {
    const cc = s.charCodeAt(p);
    if (cc === 32) { spaces++; p++; col2++; }
    else if (cc === 9) { const w = 4 - (col2 % 4); spaces += w; p++; col2 += w; }
    else break;
  }
  const empty = p >= s.length;
  let contentIndent;
  if (empty) contentIndent = col + width + 1;
  else if (spaces >= 5) contentIndent = col + width + 1;
  else if (spaces === 0) return null; // marker must be followed by space/tab
  else contentIndent = col + width + spaces;
  return { ordered: ordered, bullet: !ordered, marker: marker, delim: delim, start: start, empty: empty, contentIndent: contentIndent, markerIndent: col };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderCode(node) {
  const content = node.lines.length ? node.lines.join('\n') + '\n' : '';
  let open = '<pre><code';
  if (node.fenced && node.info) {
    const lang = node.info.split(/\s+/)[0];
    if (lang) open += ' class="language-' + escAttr(lang) + '"';
  }
  return open + '>' + escText(content) + '</code></pre>\n';
}
function renderBlock(node, refs, tightList) {
  switch (node.t) {
    case 'p': {
      const inner = parseInline(node.text, refs);
      return tightList ? inner : '<p>' + inner + '</p>\n';
    }
    case 'h': return '<h' + node.level + '>' + parseInline(node.text, refs) + '</h' + node.level + '>\n';
    case 'code': return renderCode(node);
    case 'html': return node.lines.join('\n') + (node.trailNl ? '\n' : '');
    case 'hr': return '<hr>\n';
    case 'quote': {
      let out = '<blockquote>\n';
      for (const c of node.children) out += renderBlock(c, refs, false);
      return out + '</blockquote>\n';
    }
    case 'list': {
      // marked trims trailing whitespace from the LAST item's text: a
      // trailing space/tab/newline at the end of its last paragraph (or
      // the trailing newline of its last HTML block) is dropped, while
      // non-last items keep it (Q4/R1/R9/R10/doc-30). Other last-child
      // types keep their structural trailing newline (fenced code, R4).
      const lastItem = node.children[node.children.length - 1];
      if (lastItem) {
        const lc = lastItem.children[lastItem.children.length - 1];
        if (lc && lc.t === 'p' && lc.text) lc.text = lc.text.replace(/[ \t\r\n]+$/, '');
        else if (lc && lc.t === 'html') {
          lc.trailNl = false;
          // The item-text trim also strips trailing spaces from the
          // block's last line (P15: `<!-- note --> foo - `).
          const hl = lc.lines;
          if (hl.length) hl[hl.length - 1] = hl[hl.length - 1].replace(/[ \t\r]+$/, '');
        }
      }
      let out = node.ordered ? '<ol' + (node.start !== 1 ? ' start="' + node.start + '"' : '') + '>\n' : '<ul>\n';
      for (const item of node.children) out += renderItem(item, refs, node.tight);
      return out + (node.ordered ? '</ol>\n' : '</ul>\n');
    }
    case 'table': {
      let out = '<table>\n<thead>\n<tr>\n';
      for (let i = 0; i < node.header.length; i++) {
        out += '<th' + (node.align[i] ? ' align="' + node.align[i] + '"' : '') + '>' + parseInline(node.header[i], refs) + '</th>\n';
      }
      out += '</tr>\n</thead>\n';
      // No <tbody> at all when there are no body rows.
      if (node.rows.length === 0) return out + '</table>\n';
      out += '<tbody>';
      for (const row of node.rows) {
        out += '<tr>\n';
        for (let i = 0; i < row.length; i++) {
          out += '<td' + (node.align[i] ? ' align="' + node.align[i] + '"' : '') + '>' + parseInline(row[i], refs) + '</td>\n';
        }
        out += '</tr>\n';
      }
      return out + '</tbody></table>\n';
    }
  }
  return '';
}
function renderItem(item, refs, tight) {
  // Task list item: first paragraph starts with [ ] / [x] / [X] + space.
  // marked emits a plain <li> (no task-list-item class) and keeps the space
  // after the checkbox, so only the 3 chars "[ ]" are removed.
  let task = null;
  const first = item.children[0];
  if (first && first.t === 'p' && first.text) {
    const m = /^\[([ xX])\] /.exec(first.text);
    if (m) task = m[1] === ' ' ? '' : 'checked="" ';
  }
  let out = '<li>';
  if (task !== null) {
    first.text = first.text.slice(3);
    if (tight) {
      // tight: the paragraph renders as bare inline, so the checkbox
      // goes right after <li>
      out += '<input ' + task + 'disabled="" type="checkbox">';
    } else {
      // loose: the paragraph renders with <p>, so the checkbox goes
      // inside it; render the first paragraph manually, then the rest
      out += '<p><input ' + task + 'disabled="" type="checkbox">' + parseInline(first.text, refs) + '</p>\n';
      for (let k = 1; k < item.children.length; k++) out += renderBlock(item.children[k], refs, tight);
      return out + '</li>\n';
    }
  }
  for (const c of item.children) out += renderBlock(c, refs, tight);
  return out + '</li>\n';
}

// Persistent "inside an <a>" flag, mirroring marked's lexer state. marked
// sets state.inLink when its inline tag tokenizer meets `<a ` (startATag
// /^<a /i) and clears it only on a literal `</a>` (endATag /^<\/a>/i).
// The flag is NOT reset between paragraphs: marked lexes all inline
// content through one queue after block lexing, so an unclosed <a> in one
// paragraph suppresses bare-URL/email autolinks in every later paragraph
// of the document (the url tokenizer is tried only when !inLink). Bracket
// links and <...> autolinks are unaffected. Reset once per parse().
let inLinkLeak = false;

export function parse(markdown) {
  inLinkLeak = false;
  const text = markdown.replace(/\r\n?/g, '\n');
  const endsNl = text.length > 0 && text.charCodeAt(text.length - 1) === 10;
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const { root, refs } = parseBlocks(lines, endsNl);
  let out = '';
  for (const c of root.children) out += renderBlock(c, refs, false);
  return out;
}
