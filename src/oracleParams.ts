// Oracle-verified parameter table (data/params.json).
// Harvested by probing TradingView's own pine-facade translator: for each
// candidate param `p` of function `f`, `f(p=0)` answers CE10120 naming `p`
// when the name is rejected, anything else when accepted. Verdicts:
//   ok          — TradingView accepts the name
//   rejected    — TradingView rejects the name (CE10120 verified)
//   unverified  — probe inconclusive (http error / oracle crash / masked)
//   varargs     — fn answers CE10119: variable-arg functions take NO keyword args
// Absence of a name proves NOTHING — the harvest only tested candidates, so an
// unlisted name may still be a real parameter. Only 'rejected' is flagged.

import paramsJson from '../data/params.json';
import type { Diagnostic } from './types';
import { scanCalls } from './calls';

interface FnEntry {
  params: Record<string, string>;
  varargs?: boolean;
}

const TABLE = paramsJson as unknown as Record<string, FnEntry>;

/**
 * Emit diagnostics for oracle-verified parameter rejections.
 * `toPos` maps an absolute source offset to 1-based {line, column}.
 */
export function checkOracleParams(
  src: string,
  toPos: (offset: number) => { line: number; column: number },
): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const call of scanCalls(src)) {
    const entry = TABLE[call.fn];
    if (!entry) continue;
    if (entry.varargs) {
      for (const na of call.namedArgs) {
        const p = toPos(na.nameOffset);
        out.push({
          severity: 'error',
          engine: 'oracle-params',
          line: p.line,
          column: p.column,
          length: na.name.length,
          message: `Functions that accept a variable number of arguments cannot accept keyword arguments ('${call.fn}').`,
        });
      }
      continue;
    }
    for (const na of call.namedArgs) {
      if (entry.params[na.name] !== 'rejected') continue;
      const p = toPos(na.nameOffset);
      out.push({
        severity: 'error',
        engine: 'oracle-params',
        line: p.line,
        column: p.column,
        length: na.name.length,
        message: `The "${call.fn}" function does not have an argument with the name "${na.name}".`,
      });
    }
  }
  return out;
}

/** Exposed for tests: is `fn` covered by the oracle table at all? */
export function isCoveredFn(fn: string): boolean {
  return fn in TABLE;
}

/** Exposed for tests: verdict for fn.param, or undefined when unknown. */
export function paramVerdict(fn: string, param: string): string | undefined {
  return TABLE[fn]?.params?.[param];
}
