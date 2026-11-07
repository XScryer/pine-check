import { oracleCheck, oracleErrors, sleep, POLITE_DELAY_MS } from './oracle.mjs';
import { appendFileSync } from 'fs';
const OUT = new URL('../data/params-extra.jsonl', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DECL = new Set(['indicator','strategy','library','study']);
async function probeParam(fn, param) {
  const call = `${fn}(${param}=0)`;
  const src = `//@version=6\nindicator("T")\n${DECL.has(fn) ? call : 'x = ' + call}\n`;
  const resp = await oracleCheck(src);
  if (!resp.ok) return 'http-error';
  const j = resp.json;
  if (j?.success === false) return 'precompile';
  for (const e of oracleErrors(resp)) {
    if (e.code === 'CE10119') return 'varargs';
    if (e.code === 'CE10120' && e.ctx?.name === param) return 'rejected';
  }
  return 'accepted';
}
const cases = [
  ['math.round', 'precision'], ['str.tostring', 'format'],
  ['ta.vwap', 'stdev_mult'], ['ticker.kagi', 'param'], ['ticker.kagi', 'style'],
];
for (const [fn, p] of cases) {
  const v = await probeParam(fn, p);
  appendFileSync(OUT, JSON.stringify({ fn, param: p, verdict: v }) + '\n');
  console.log(`${fn}(${p}=) -> ${v}`);
  await sleep(POLITE_DELAY_MS);
}
