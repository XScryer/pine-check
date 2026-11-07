#!/usr/bin/env node
// pine-check — local Pine Script v6 validator CLI.
//
//   pine-check <file.pine> [more.pine ...]
//   pine-check --stdin < file.pine
//   pine-check file.pine --remote      # also ask TradingView's compiler
//   pine-check file.pine --json        # machine-readable output
//   pine-check file.pine --engine=npm,pinets
//
// Exit codes: 0 = no error-severity diagnostics, 1 = errors found, 2 = usage/IO.

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pineCheck, pineVersion } from './check';
import type { Diagnostic, Engine } from './types';
import { oracleCheck, oracleErrors } from '../tools/oracle.mjs';

const USAGE = `Usage: pine-check <file.pine> [...] [options]
       pine-check --stdin < file.pine

Options:
  --remote          Also query TradingView's compiler (pine-facade) and
                    report whether local and remote verdicts agree.
  --json            Emit diagnostics as JSON.
  --engine=a,b,c    Run only the listed engines: npm, oracle-params, pinets.
  --quiet           Only print files with diagnostics.
  -h, --help        Show this help.
`;

interface Args {
  files: string[];
  remote: boolean;
  json: boolean;
  quiet: boolean;
  engines?: Engine[];
  stdin: boolean;
}

function parseArgs(argv: string[]): Args | { help: true } {
  const a: Args = { files: [], remote: false, json: false, quiet: false, stdin: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '-h' || t === '--help') return { help: true };
    else if (t === '--remote') a.remote = true;
    else if (t === '--json') a.json = true;
    else if (t === '--quiet') a.quiet = true;
    else if (t === '--stdin') a.stdin = true;
    else if (t === '--engine') {
      const v = argv[++i] ?? '';
      a.engines = v.split(',').map(s => s.trim()) as Engine[];
    } else if (t.startsWith('--engine=')) {
      a.engines = t.slice(9).split(',').map(s => s.trim()) as Engine[];
    } else if (t.startsWith('--')) {
      throw new Error(`unknown option ${t}`);
    } else {
      a.files.push(t);
    }
  }
  return a;
}

const SEV_ICON: Record<string, string> = { error: 'error  ', warning: 'warning', info: 'info   ' };

function printDiagnostics(name: string, diags: Diagnostic[], notes: string[] = []) {
  console.log(`\n${name}`);
  for (const n of notes) console.log(`  note: ${n}`);
  for (const d of diags) {
    const loc = d.line > 0 ? `L${d.line}:${d.column}`.padEnd(9) : ' '.repeat(9);
    console.log(`  ${loc} ${SEV_ICON[d.severity] ?? d.severity} [${d.engine}] ${d.message}`);
  }
  const errs = diags.filter(d => d.severity === 'error').length;
  const warns = diags.filter(d => d.severity === 'warning').length;
  console.log(`  → ${errs} error(s), ${warns} warning(s)`);
}

async function remoteVerdict(src: string): Promise<{ ok: boolean; errors: number; detail: string }> {
  const r = await oracleCheck(src, { retries: 1, timeoutMs: 25000 });
  if (!r.ok) return { ok: false, errors: -1, detail: `oracle unreachable (${r.status} ${r.error ?? ''})` };
  const errs = oracleErrors(r);
  return { ok: true, errors: errs.length, detail: `${errs.length} oracle error(s)` };
}

export async function main(argv: string[]): Promise<number> {
  let args: Args | { help: true };
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error((e as Error).message);
    console.error(USAGE);
    return 2;
  }
  if ('help' in args) {
    console.log(USAGE);
    return 0;
  }

  const sources: { name: string; src: string }[] = [];
  if (args.stdin) {
    sources.push({ name: '<stdin>', src: readFileSync(0, 'utf8') });
  }
  for (const f of args.files) {
    try {
      sources.push({ name: f, src: readFileSync(f, 'utf8') });
    } catch (e) {
      console.error(`cannot read ${f}: ${(e as Error).message}`);
      return 2;
    }
  }
  if (sources.length === 0) {
    console.error(USAGE);
    return 2;
  }

  let anyError = false;
  const jsonOut: Record<string, unknown>[] = [];

  for (const { name, src } of sources) {
    const { diagnostics, meta } = pineCheck(src, { engines: args.engines });
    const errs = diagnostics.filter(d => d.severity === 'error').length;
    if (errs > 0) anyError = true;

    if (args.remote) {
      const rv = await remoteVerdict(src);
      const localBad = errs > 0;
      const remoteBad = rv.ok ? rv.errors > 0 : null;
      const agree = remoteBad === null ? 'n/a' : localBad === remoteBad ? 'AGREE' : 'DISAGREE';
      meta.remote = { ...rv, localErrors: errs, agree };
      if (!args.json) {
        console.log(`  remote: ${rv.detail} — local ${errs} error(s) → ${agree}`);
      }
    }

    if (args.json) {
      jsonOut.push({
        file: name,
        pineVersion: pineVersion(src),
        meta,
        diagnostics,
      });
    } else if (!args.quiet || diagnostics.length > 0 || meta.oracleParamsSkipped || meta.pinetsSkipped) {
      const notes: string[] = [];
      if (meta.oracleParamsSkipped) notes.push(String(meta.oracleParamsSkipped));
      if (meta.pinetsSkipped) notes.push(`pinets skipped — ${meta.pinetsSkipped}`);
      printDiagnostics(name, diagnostics, notes);
      if (meta.pinetsTranspiled === false && diagnostics.every(d => d.engine !== 'pinets')) {
        // transpile failed but produced no diagnostic — shouldn't happen; surface it.
      }
    }
  }

  if (args.json) console.log(JSON.stringify(jsonOut, null, 2));
  return anyError ? 1 : 0;
}

// Run when executed directly (`tsx src/cli.ts` / `npm run check`); the bin
// wrapper imports main() instead, so this guard must not fire there.
const invoked = process.argv[1] ? realpathSync(process.argv[1]) : '';
const self = realpathSync(fileURLToPath(import.meta.url));
if (invoked && invoked === self) {
  main(process.argv.slice(2)).then(code => {
    // exitCode, not exit(): process.exit() while undici keep-alive sockets are
    // still closing crashes Node on Windows (libuv UV_HANDLE_CLOSING assert).
    // The sockets time out on their own and the process then exits cleanly.
    process.exitCode = code;
  });
}
