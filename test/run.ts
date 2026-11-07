// Differential test runner.
//
//   tsx test/run.ts            — local engines vs manifest expectations +
//                                stored oracle baseline (hermetic)
//   tsx test/run.ts --remote   — also re-query TradingView's compiler live and
//                                compare fresh oracle verdicts (network)
//
// Expectations come from test/corpus/manifest.json; oracle truth from
// test/corpus/oracle-baseline.json (refresh with tools/corpus-oracle.mjs).
// 'miss' cases are known gaps — reported, never failed; if pine-check starts
// catching one, the runner says so.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pineCheck } from '../src/check';
import { oracleCheck, oracleErrors, POLITE_DELAY_MS, sleep } from '../tools/oracle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, 'corpus');

interface ManifestCase { expect: 'clean' | 'error' | 'miss'; engines?: string[]; note?: string }
interface Manifest { cases: Record<string, ManifestCase> }
interface Baseline { date: string; cases: Record<string, { errors?: number; unreachable?: boolean }> }

const manifest = JSON.parse(readFileSync(join(CORPUS, 'manifest.json'), 'utf8')) as Manifest;
const baseline = JSON.parse(readFileSync(join(CORPUS, 'oracle-baseline.json'), 'utf8')) as Baseline;
const REMOTE = process.argv.includes('--remote');

let pass = 0, fail = 0, misses = 0, agreements = 0, disagreements = 0, total = 0;
const failures: string[] = [];
const disagreementsList: string[] = [];
const gapClosed: string[] = [];

for (const [file, mc] of Object.entries(manifest.cases).sort()) {
  total++;
  const src = readFileSync(join(CORPUS, file), 'utf8');
  const { diagnostics } = pineCheck(src);
  const errs = diagnostics.filter(d => d.severity === 'error');
  const localBad = errs.length > 0;
  const enginesHit = [...new Set(errs.map(d => d.engine))];

  // --- expectation ---
  let ok = true;
  if (mc.expect === 'clean' && localBad) ok = false;
  if (mc.expect === 'error' && !localBad) ok = false;
  if (mc.expect === 'miss') {
    misses++;
    if (localBad) { gapClosed.push(file); console.log(`  ~ ${file}: known gap now caught (${enginesHit.join('+')})`); }
  }
  if (ok) pass++; else { fail++; failures.push(`${file} [${mc.expect}] got ${errs.length} error(s)`); }

  // --- oracle agreement (baseline) ---
  const b = baseline.cases[file];
  let oracleBad: boolean | null = null;
  if (b && typeof b.errors === 'number') oracleBad = b.errors > 0;
  if (REMOTE) {
    const r = await oracleCheck(src, { retries: 1, timeoutMs: 30000 });
    oracleBad = r.ok ? oracleErrors(r).length > 0 : null;
    if (!r.ok) console.log(`  ! ${file}: oracle unreachable`);
    await sleep(POLITE_DELAY_MS);
  }
  if (oracleBad !== null) {
    if (oracleBad === localBad) agreements++;
    else {
      disagreements++;
      disagreementsList.push(`${file} (local=${localBad ? 'err' : 'clean'} oracle=${oracleBad ? 'err' : 'clean'})`);
    }
  }

  const mark = ok ? ' ' : 'X';
  const eng = enginesHit.length ? ` [${enginesHit.join('+')}]` : '';
  console.log(`${mark} ${file.padEnd(32)} expect=${mc.expect.padEnd(5)} local=${localBad ? errs.length + ' err' : 'clean'}${eng}`);
}

const judged = agreements + disagreements;
console.log(`\n${pass}/${total} expectations met (${fail} failed), ${misses} known gap(s) tracked`);
if (gapClosed.length) console.log(`  gaps now closed: ${gapClosed.join(', ')}`);
if (failures.length) for (const f of failures) console.log(`  FAIL ${f}`);
if (judged) {
  const pct = (100 * agreements / judged).toFixed(1);
  console.log(`oracle agreement: ${agreements}/${judged} = ${pct}%${REMOTE ? ' (live)' : ' (baseline ' + baseline.date + ')'}`);
  for (const d of disagreementsList) console.log(`  disagree ${d}`);
}
process.exit(fail ? 1 : 0);
