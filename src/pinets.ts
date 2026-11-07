// PineTS engine wrapper. Runs LuxAlgo's PineTS transpiler (vendored, AGPL) in
// "validation mode": we only care whether transpile() throws, and what it says.
// It catches what the other engines cannot: undeclared identifiers (via the
// closed-world verifier on the generated JS) and compile-time input checks
// (constant-type arguments, defval-in-options).
//
// Known limit: PineTS is a transpiler, not the TradingView compiler — a throw
// can mean "PineTS doesn't support this v6 construct" rather than "invalid
// Pine". The differential corpus (test/) measures how often that happens.

import { transpile } from '../vendor/pinets/src/transpiler/index.ts';
import type { Diagnostic } from './types';
import { blankStringsAndComments } from './calls';

const UNDECLARED_RE = /Undeclared identifier "([^"]+)"(?:\s+at (\d+):(\d+))?/;

/**
 * Locate `name` in Pine source as a likely *use* (not a declaration):
 * word-boundary match outside strings/comments, not preceded by '.', and not
 * in `name =` declaration position. Returns the first candidate offset, or -1.
 */
function locateIdentifier(src: string, name: string): number {
  const clean = blankStringsAndComments(src);
  const re = new RegExp(`(?<![A-Za-z0-9_.])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`, 'g');
  let fallback = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    const i = m.index;
    if (fallback === -1) fallback = i;
    // member access obj.name — not our identifier
    // (the lookbehind already excludes '.', this is belt & braces)
    // declaration position: `name =` (but not `name ==`)
    let j = i + name.length;
    while (j < clean.length && clean[j] === ' ') j++;
    if (clean[j] === '=' && clean[j + 1] !== '=') continue; // looks like `name = ...` decl
    return i;
  }
  return fallback;
}

function toPos(src: string, offset: number): { line: number; column: number } {
  let line = 1, lineStart = 0;
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src[i] === '\n') { line++; lineStart = i + 1; }
  }
  return { line, column: offset - lineStart + 1 };
}

/**
 * Run the PineTS transpiler over `src`. Returns diagnostics (usually empty)
 * plus a flag saying whether transpilation succeeded.
 */
export function checkPinets(src: string): { diagnostics: Diagnostic[]; transpiled: boolean } {
  try {
    transpile(src);
    return { diagnostics: [], transpiled: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { diagnostics: normalizePinetsError(src, msg), transpiled: false };
  }
}

function normalizePinetsError(src: string, msg: string): Diagnostic[] {
  const base = { engine: 'pinets' as const, length: 0 };

  // `Failed to transpile Pine Script version V: <inner>` — inner is a
  // pineToJS lexer/parser error, usually carrying `at L:C`.
  const failed = msg.match(/^Failed to transpile Pine Script version \d+:\s*(.*)$/s);
  const inner = failed ? failed[1] : msg;

  // Position: PineTS errors carry `at L:C` either at the end of the message
  // or mid-message ("Indentation error at 5:5 - ..."). Take the first one.
  const posMatch = inner.match(/\bat (\d+):(\d+)\b/);
  let line = 0, column = 0, length = 0;
  let text = inner;
  if (posMatch) {
    line = parseInt(posMatch[1], 10);
    column = parseInt(posMatch[2], 10);
    text = inner.replace(/\s*at \d+:\d+/, '').trim();
  }

  const und = inner.match(UNDECLARED_RE);
  if (und) {
    const name = und[1];
    if (und[2]) {
      line = parseInt(und[2], 10);
      column = parseInt(und[3], 10);
      length = name.length;
    } else {
      const off = locateIdentifier(src, name);
      if (off !== -1) {
        const p = toPos(src, off);
        line = p.line; column = p.column; length = name.length;
      }
    }
    return [{
      ...base, severity: 'error', line, column, length,
      message: `Undeclared identifier "${name}".`,
    }];
  }

  if (/version marker required|Unsupported Pine Script version/i.test(msg)) {
    return [{ ...base, severity: 'warning', line: 1, column: 1,
      message: `${msg} (pine-check validates Pine v6 only).` }];
  }

  if (/Unresolved Pine Script import/i.test(msg)) {
    // We can't resolve `import user/lib/1` locally — TradingView might. Warn,
    // don't error: the rest of the file was still validated by other engines.
    return [{ ...base, severity: 'warning', line: 0, column: 0, message: `${msg} — import not resolved locally; validation may be incomplete.` }];
  }

  // TradingView accepts a defval outside `options` (verified against the
  // oracle) — PineTS is stricter than the real compiler here. Info, not error.
  const severity = /defval should be in options/i.test(text) ? 'info' : 'error';

  return [{
    ...base, severity, line, column, length,
    message: text || msg,
  }];
}
