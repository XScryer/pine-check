// Pine source scanner: finds function-call sites and their top-level named
// arguments, with source positions. Line-agnostic — Pine calls may wrap across
// lines inside () and [], so the whole file is scanned as one char stream over
// a "cleaned" copy where string/comment contents are blanked to spaces (length
// and newlines preserved, so offsets map straight back to the original).

export interface ArgSpan {
  /** Offset of the first character of the argument (leading whitespace included). */
  start: number;
  /** Offset just past the last character of the argument. */
  end: number;
  /** Trimmed argument text. */
  text: string;
}

export interface NamedArg {
  name: string;
  /** Absolute offset of the first character of the parameter name. */
  nameOffset: number;
}

export interface CallSite {
  /** Called name as written, e.g. "ta.sma", "plot", "obj.method". */
  fn: string;
  /** Absolute offset of the opening paren. */
  openParen: number;
  /** Absolute offset of the matching close paren, or -1 if unbalanced. */
  closeParen: number;
  args: ArgSpan[];
  namedArgs: NamedArg[];
}

const CALL_RE = /([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g;
const NAMED_ARG_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?![=>])/;

/**
 * Blank out string literals and comments, preserving every byte offset.
 * Handles "...", '...', triple-quoted """...""" / '''...''' (Pine v6 multiline
 * strings) and // line comments. The result has identical length and newline
 * positions, so offsets index into the original source unchanged.
 */
export function blankStringsAndComments(src: string): string {
  const out = src.split('');
  const blank = (i: number) => { if (out[i] !== '\n') out[i] = ' '; };
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = i + 1 < n ? src[i + 1] : '';
    const c3 = i + 2 < n ? src[i + 2] : '';

    // // line comment
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') { blank(i); i++; }
      continue;
    }
    // triple-quoted string """ or '''
    if ((c === '"' || c === "'") && c2 === c && c3 === c) {
      const q = c;
      blank(i); blank(i + 1); blank(i + 2);
      i += 3;
      while (i < n) {
        if (src[i] === q && src[i + 1] === q && src[i + 2] === q) {
          blank(i); blank(i + 1); blank(i + 2);
          i += 3;
          break;
        }
        blank(i);
        i++;
      }
      continue;
    }
    // single-line string "..." or '...'
    if (c === '"' || c === "'") {
      const q = c;
      blank(i);
      i++;
      while (i < n && src[i] !== '\n') {
        if (src[i] === '\\') { blank(i); blank(i + 1); i += 2; continue; }
        if (src[i] === q) { blank(i); i++; break; }
        blank(i);
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Find the offset of the ')' matching the '(' at `open`, counting only parens. */
function matchParen(clean: string, open: number): number {
  let depth = 0;
  for (let i = open; i < clean.length; i++) {
    const c = clean[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split `text` (the interior of a call's parens) on top-level commas. */
function splitArgs(clean: string, from: number, to: number): ArgSpan[] {
  const spans: ArgSpan[] = [];
  let depth = 0;
  let segStart = from;
  const flush = (end: number) => pushSpan(clean, segStart, end, spans);
  for (let i = from; i < to; i++) {
    const c = clean[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      flush(i);
      segStart = i + 1;
    }
  }
  flush(to);
  return spans.filter(s => s.text.length > 0);
}

function pushSpan(clean: string, start: number, end: number, spans: ArgSpan[]) {
  // Trim whitespace on both ends.
  let s = start, e = end;
  while (s < e && /\s/.test(clean[s])) s++;
  while (e > s && /\s/.test(clean[e - 1])) e--;
  spans.push({ start: s, end: e, text: clean.slice(s, e) });
}

/**
 * Extract every function-call site in `src` whose callee looks like
 * `name(` / `ns.name(` / `ns.sub.name(`. Calls inside strings/comments are
 * invisible (they were blanked). Unbalanced calls are returned with
 * closeParen = -1 and no args.
 */
export function scanCalls(src: string): CallSite[] {
  const clean = blankStringsAndComments(src);
  const calls: CallSite[] = [];
  CALL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CALL_RE.exec(clean)) !== null) {
    const fn = m[1];
    const openParen = m.index + m[0].length - 1;
    const closeParen = matchParen(clean, openParen);
    const site: CallSite = { fn, openParen, closeParen, args: [], namedArgs: [] };
    if (closeParen === -1) {
      calls.push(site);
      continue;
    }
    site.args = splitArgs(clean, openParen + 1, closeParen);
    for (const arg of site.args) {
      const nm = arg.text.match(NAMED_ARG_RE);
      if (!nm) continue;
      // Offset of the name inside the (already left-trimmed) arg text.
      const nameOffset = arg.start + nm[0].indexOf(nm[1]);
      site.namedArgs.push({ name: nm[1], nameOffset });
    }
    calls.push(site);
  }
  return calls;
}

/** Convert an absolute offset to a 1-based {line, column}. O(offset). */
export function offsetToLineCol(src: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src[i] === '\n') { line++; lineStart = i + 1; }
  }
  return { line, column: offset - lineStart + 1 };
}

/** Precompute newline offsets once; returns an O(log n) offset→{line,column}. */
export function makeOffsetConverter(src: string): (offset: number) => { line: number; column: number } {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return (offset: number) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - starts[lo] + 1 };
  };
}
