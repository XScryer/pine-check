// Surface mapping of the TradingView pine-facade API.
// Run: node tools/probe-api.mjs
import { oracleCheck, oracleErrors } from './oracle.mjs';

const BROKEN = `//@version=6
indicator("T", overlay=true, borderwidth=3)
plotcandle(open, high, low, close, borderwidth=3)
plot(UNDEFINED_CONST)
y = zzz + 1
plot(y)
plot(nonexistent_function(close))
`;
const CLEAN = '//@version=6\nindicator("T", overlay=true)\nplot(close, color=color.red)\n';

function summarize(resp) {
  if (!resp.ok) return `HTTP ${resp.status} ${resp.error ?? resp.raw ?? ''}`;
  const j = resp.json;
  const errs = oracleErrors(resp);
  const keys = j?.result ? Object.keys(j.result) : [];
  return `success=${j?.success} errors=${errs.length} resultKeys=[${keys}]` +
    (errs.length ? ' first=' + JSON.stringify(errs[0]).slice(0, 160) : '');
}

const probes = [
  ['light+file broken', () => oracleCheck(BROKEN, { endpoint: 'light', mode: 'file' })],
  ['light+field broken', () => oracleCheck(BROKEN, { endpoint: 'light', mode: 'field' })],
  ['full+file broken', () => oracleCheck(BROKEN, { endpoint: 'full', mode: 'file' })],
  ['full+field broken', () => oracleCheck(BROKEN, { endpoint: 'full', mode: 'field' })],
  ['light clean', () => oracleCheck(CLEAN, { endpoint: 'light' })],
  ['full clean', () => oracleCheck(CLEAN, { endpoint: 'full' })],
  ['light no-version', () => oracleCheck('indicator("T")\nplot(close)\n', { endpoint: 'light' })],
  ['light v4', () => oracleCheck('//@version=4\nstudy("T")\nplot(close)\n', { endpoint: 'light' })],
  ['light v5', () => oracleCheck('//@version=5\nindicator("T")\nplot(close)\n', { endpoint: 'light' })],
  ['light empty', () => oracleCheck('', { endpoint: 'light' })],
  ['light whitespace', () => oracleCheck('   \n\n', { endpoint: 'light' })],
];

for (const [name, fn] of probes) {
  const r = await fn();
  console.log(`${name.padEnd(24)} -> ${summarize(r)}`);
}
