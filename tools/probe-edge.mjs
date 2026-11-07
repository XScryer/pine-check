import { oracleCheck, oracleErrors } from './oracle.mjs';
const cases = [
  ['clean v6', '//@version=6\nindicator("T", overlay=true)\nplot(close, color=color.red)\n'],
  ['no-version', 'indicator("T")\nplot(close)\n'],
  ['v4 study', '//@version=4\nstudy("T")\nplot(close)\n'],
  ['v5', '//@version=5\nindicator("T")\nplot(close)\n'],
  ['empty', ''],
  ['comment-only', '// hello\n'],
  ['syntax-error', '//@version=6\nindicator("T"\nplot(close)\n'],
  ['deprecated', '//@version=5\nstudy("T")\nplot(close)\n'],
];
for (const [name, src] of cases) {
  const r = await oracleCheck(src);
  if (!r.ok) { console.log(`${name.padEnd(16)} -> HTTP ${r.status} ${r.error ?? ''}`); continue; }
  const errs = oracleErrors(r);
  const j = r.json;
  console.log(`${name.padEnd(16)} -> success=${j?.success} errors=${errs.length}` +
    (errs.length ? ' | ' + errs.map(e => e.code + ':' + e.message.slice(0, 60)).join(' ;; ').slice(0, 300) : ''));
}
