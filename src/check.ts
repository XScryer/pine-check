// Integrated validator: combines three engines and merges their diagnostics.
//
//   npm           — pinescript-v6-validator: syntax, undefined namespaces/
//                   functions/variables, semantic checks (plot budget, request
//                   budget, …) and named-arg checks for its ~10 curated fns.
//   oracle-params — data/params.json, distilled from TradingView's own
//                   translator: flags named args the oracle verified as
//                   rejected (CE10120), and any keyword arg on varargs fns
//                   (CE10119). v6 only — v5 parameter names differ.
//   pinets        — LuxAlgo PineTS transpiler: undeclared identifiers and
//                   compile-time input checks. May reject valid v6 that
//                   PineTS doesn't support — see test/ corpus agreement.

import { validatePineScript } from 'pinescript-v6-validator';
import { checkPinets } from './pinets';
import { checkOracleParams } from './oracleParams';
import { makeOffsetConverter } from './calls';
import type { Diagnostic, CheckResult, Engine, Severity } from './types';

const SEV_MAP: Record<number, Severity> = { 0: 'error', 1: 'warning', 2: 'info', 3: 'info' };

export function pineVersion(src: string): number | null {
  // Same lenient shape PineTS/TradingView accept: `// @version = 6` with
  // optional whitespace, alone on its line.
  const m = src.match(/^\s*\/\/\s*@version\s*=\s*(\d+)\s*$/im);
  return m ? parseInt(m[1], 10) : null;
}

export interface PineCheckOptions {
  /** Which engines to run. Default: all. */
  engines?: Engine[];
}

export function pineCheck(src: string, opts: PineCheckOptions = {}): CheckResult {
  const engines = opts.engines ?? ['npm', 'oracle-params', 'pinets'];
  const diagnostics: Diagnostic[] = [];
  const meta: Record<string, unknown> = {};

  if (engines.includes('npm')) {
    for (const e of validatePineScript(src)) {
      let severity = SEV_MAP[e.severity] ?? 'info';
      // S5/S6 claim hard TradingView limits (64 plots / 40 requests) that do
      // NOT exist in Pine v6 — verified against the oracle: 300 plots and 60
      // request.* calls compile clean. Downgrade to info, keep the hint.
      if (/^\[S[56]\]/.test(e.message)) severity = 'info';
      diagnostics.push({
        severity,
        engine: 'npm',
        line: e.line,
        column: e.column,
        length: e.length,
        message: e.message,
      });
    }
  }

  const v = pineVersion(src);
  meta.pineVersion = v;
  // The params table is v6-verified: on v5 scripts `line.new(x1=…)` is legal.
  if (engines.includes('oracle-params') && v === 6) {
    diagnostics.push(...checkOracleParams(src, makeOffsetConverter(src)));
  } else if (engines.includes('oracle-params') && v !== null && v !== 6) {
    meta.oracleParamsSkipped = `//@version=${v} — params table is v6-only`;
  } else if (engines.includes('oracle-params') && v === null) {
    meta.oracleParamsSkipped = 'no //@version marker';
  }

  if (engines.includes('pinets')) {
    if (v !== null) {
      const p = checkPinets(src);
      meta.pinetsTranspiled = p.transpiled;
      diagnostics.push(...p.diagnostics);
    } else {
      // No //@version marker: PineTS would treat the source as raw JavaScript
      // (its PineTS-syntax mode) and "validate" nothing meaningful.
      meta.pinetsSkipped = 'no //@version marker';
    }
  }

  // De-dup: a pinets *syntax-class* error (Unexpected token/character,
  // Indentation, Unterminated…) on the same or adjacent line as an npm error
  // describes the same defect — keep the npm one (better message/position).
  // Semantic pinets findings (undeclared id, input constness, defval…) always
  // survive: npm cannot see those.
  const npmErrLines = new Set(
    diagnostics.filter(d => d.engine === 'npm' && d.severity === 'error').map(d => d.line),
  );
  const isPinetsSyntax = (d: Diagnostic) =>
    d.engine === 'pinets' &&
    !/Undeclared identifier|constant type|defval|options|minval|maxval|enum|Possible values/i.test(d.message);
  const deduped = diagnostics.filter(d => {
    if (!isPinetsSyntax(d) || d.line === 0) return true;
    for (let l = d.line - 1; l <= d.line + 1; l++) if (npmErrLines.has(l)) return false;
    return true;
  });

  deduped.sort((a, b) => a.line - b.line || a.column - b.column || a.engine.localeCompare(b.engine));
  return { diagnostics: deduped, meta };
}
