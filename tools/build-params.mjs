// Merge probe results into data/params.json — the distilled, oracle-verified table.
import { readFileSync, writeFileSync, existsSync } from 'fs';
const J = p => JSON.parse(readFileSync(p, 'utf8'));
const lines = p => readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);

const out = {};
for (const r of lines('data/params-probe.jsonl')) {
  const params = {};
  for (const [p, v] of Object.entries(r.params ?? {})) {
    params[p] = v === true ? 'ok' : v === false ? 'rejected'
      : v === 'varargs' ? 'varargs' : 'unverified';
  }
  out[r.fn] = { params, ...(r.varargs ? { varargs: true } : {}) };
}
if (existsSync('data/params-extra.jsonl')) {
  for (const r of lines('data/params-extra.jsonl')) {
    (out[r.fn] ??= { params: {} }).params[r.param] =
      r.verdict === 'accepted' ? 'ok' : r.verdict === 'rejected' ? 'rejected' : 'unverified';
  }
}
writeFileSync('data/params.json', JSON.stringify(out, null, 1));
const stats = { fns: Object.keys(out).length, ok: 0, rejected: 0, unverified: 0, varargs: 0 };
for (const f of Object.values(out)) for (const v of Object.values(f.params))
  stats[{ ok: 'ok', rejected: 'rejected', unverified: 'unverified', varargs: 'varargs' }[v] ?? 'unverified']++;
console.log(stats);
