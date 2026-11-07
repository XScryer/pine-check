import { oracleCheck, oracleErrors, sleep, POLITE_DELAY_MS } from './oracle.mjs';
const EXPR = {
  'array.push': ['array.new<float>(0)', 'value'],
  'map.put': ['map.new<string,float>()', 'value'],
  'matrix.add_col': ['matrix.new<float>(0,0)', 'column'],
};
for (const [fn, [coll, p]] of Object.entries(EXPR)) {
  for (const [label, src] of [
    ['named-collection', `//@version=6\nindicator("T")\nx = ${fn}(${coll}, ${p}=0)\n`],
    ['named-first', `//@version=6\nindicator("T")\nx = ${fn}(id=${coll}, ${p}=0)\n`],
  ]) {
    const r = await oracleCheck(src);
    const errs = oracleErrors(r).map(e => e.code ?? 'nocode');
    console.log(`${fn} ${label}:`, errs.join(',') || 'CLEAN');
    await sleep(POLITE_DELAY_MS);
  }
}
