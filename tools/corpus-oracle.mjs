// Query the oracle once per corpus case; write test/corpus/oracle-baseline.json
import { oracleCheck, oracleErrors, POLITE_DELAY_MS, sleep } from './oracle.mjs';
import { readFileSync, readdirSync, writeFileSync } from 'fs';

const dir = new URL('../test/corpus/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const files = readdirSync(dir).filter(f => f.endsWith('.pine')).sort();
const out = {};
for (const f of files) {
  const src = readFileSync(dir + f, 'utf8');
  const r = await oracleCheck(src, { retries: 2, timeoutMs: 30000 });
  if (!r.ok) { out[f] = { unreachable: true, status: r.status, detail: r.error ?? '' }; console.log(f, 'UNREACHABLE', r.status); }
  else {
    const errs = oracleErrors(r);
    out[f] = {
      errors: errs.length,
      codes: errs.map(e => e.code).filter(Boolean),
      messages: errs.slice(0, 6).map(e => String(e.message ?? e.msg ?? '').slice(0, 100)),
    };
    console.log(f.padEnd(34), 'errs=' + errs.length, errs.map(e=>e.code).join(',') || '-');
  }
  await sleep(POLITE_DELAY_MS);
}
writeFileSync(dir + 'oracle-baseline.json', JSON.stringify({ date: new Date().toISOString().slice(0,10), cases: out }, null, 1));
console.log('wrote oracle-baseline.json');
