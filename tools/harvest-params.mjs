// Harvest the authoritative parameter table from the TradingView oracle.
// Per-param probe: `x = fn(param=0)` — a CE10120 naming that param means the
// name is rejected; anything else means accepted (other errors are noise).
// Vararg functions answer CE10119 to named args — recorded and skipped.
//
// Output (resumable, one JSON object per function):
//   data/params-probe.jsonl
//
// Run:  node tools/harvest-params.mjs [--selftest] [--limit N] [--start K]
import { oracleCheck, oracleErrors, POLITE_DELAY_MS, sleep } from './oracle.mjs';
import { createRequire } from 'module';
import { appendFileSync, readFileSync, existsSync } from 'fs';

const require = createRequire(import.meta.url);
const { PINE_FUNCTIONS_MERGED } = require('pinescript-v6-validator');

const OUT = new URL('../data/params-probe.jsonl', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const args = process.argv.slice(2);
const SELFTEST = args.includes('--selftest');
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : Infinity;
const START = args.includes('--start') ? parseInt(args[args.indexOf('--start') + 1]) : 0;

// declaration functions must be called as statements, not assigned
const DECL_FNS = new Set(['indicator', 'strategy', 'library', 'study']);

function callFor(fn, param) {
  const call = `${fn}(${param}=0)`;
  return DECL_FNS.has(fn) ? call : `x = ${call}`;
}

async function probeParam(fn, param) {
  const src = `//@version=6\nindicator("T")\n${callFor(fn, param)}\n`;
  const resp = await oracleCheck(src);
  if (!resp.ok) return { verdict: 'http-error', detail: `${resp.status} ${resp.error ?? ''}` };
  const j = resp.json;
  if (j?.success === false) return { verdict: 'precompile', detail: j.reason ?? '' };
  const errs = oracleErrors(resp);
  for (const e of errs) {
    if (e.code === 'CE10119') return { verdict: 'varargs' };
    if (e.code === 'CE10120' && e.ctx?.name === param) return { verdict: 'rejected' };
    if (!e.code && /pinePos|TypeError/i.test(e.message ?? '')) return { verdict: 'oracle-crash' };
  }
  return { verdict: 'accepted' };
}

async function probeFn(fn, params) {
  const out = { fn, params: {} };
  for (const p of params) {
    const r = await probeParam(fn, p);
    out.params[p] = r.verdict === 'accepted' ? true : r.verdict === 'rejected' ? false : r.verdict;
    if (r.verdict === 'varargs') { out.varargs = true; break; }
    await sleep(POLITE_DELAY_MS);
  }
  return out;
}

if (SELFTEST) {
  for (const [fn, p] of [['ta.sma', 'source'], ['ta.sma', 'bogus'], ['plot', 'title'], ['plot', 'bogus'],
                        ['input.int', 'defval'], ['input.int', 'bogus'], ['math.max', 'number0'], ['array.push', 'id']]) {
    const r = await probeParam(fn, p);
    console.log(`${fn}(${p}=)`.padEnd(24), '->', r.verdict, r.detail ?? '');
    await sleep(POLITE_DELAY_MS);
  }
  process.exit(0);
}

const entries = Object.entries(PINE_FUNCTIONS_MERGED)
  .map(([k, v]) => ({ fn: v?.name ?? k, params: [...new Set([...(v?.requiredParams ?? []), ...(v?.optionalParams ?? [])])] }))
  .filter(e => e.fn && e.params.length > 0)
  .slice(START, START + LIMIT);

const totalProbes = entries.reduce((s, e) => s + e.params.length, 0);
console.log(`probing ${entries.length} functions / ~${totalProbes} params (start=${START})`);

const done = new Set();
if (existsSync(OUT)) {
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    if (line.trim()) { try { done.add(JSON.parse(line).fn); } catch {} }
  }
  console.log(`${done.size} functions already done, resuming`);
}

let n = 0;
const t0 = Date.now();
for (const e of entries) {
  if (done.has(e.fn)) continue;
  const rec = await probeFn(e.fn, e.params);
  appendFileSync(OUT, JSON.stringify(rec) + '\n');
  n++;
  if (n % 20 === 0) {
    const rate = n / ((Date.now() - t0) / 1000);
    console.log(`  ${n}/${entries.length - done.size} fns, ${rate.toFixed(1)} fn/s`);
  }
}
console.log(`done: ${n} functions -> ${OUT}`);
