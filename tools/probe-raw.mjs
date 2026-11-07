import { oracleCheck } from './oracle.mjs';
for (const [name, src] of [
  ['no-version', 'indicator("T")\nplot(close)\n'],
  ['v4', '//@version=4\nstudy("T")\nplot(close)\n'],
  ['deprecated-v5', '//@version=5\nstudy("T")\nplot(close)\n'],
]) {
  const r = await oracleCheck(src);
  console.log(`===== ${name} =====`);
  console.log(JSON.stringify(r.json, null, 1).slice(0, 1800));
}
