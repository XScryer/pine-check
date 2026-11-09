# Pine Check

Local validator for **Pine Script v6** — syntax, undeclared identifiers,
parameter names, and semantic lints — calibrated against **TradingView's own
compiler** (its `pine-facade` translator, the same endpoint the web editor
uses). No account, no API key, runs fully offline by default.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)
[![Engines](https://img.shields.io/badge/engines-3%20merged-orange.svg)](#what-it-catches)
[![Oracle](https://img.shields.io/badge/oracle-TradingView%20facade-red.svg)](#the-oracle-table-dataparamsjson)

```bash
npm install
node bin/pine-check.mjs my-script.pine          # or: npm run check -- my-script.pine
node bin/pine-check.mjs my-script.pine --remote # also ask TradingView live
npm test                                        # differential corpus vs oracle
```

Exit code: `0` clean · `1` errors found · `2` usage/IO error.

Options: `--remote` · `--json` · `--stdin` · `--engine=npm,oracle-params,pinets`
· `--quiet` — details via `--help`.

## What it catches

Three engines run on every file and their findings are merged:

| Engine | Source | Catches |
|---|---|---|
| `npm` | [`pinescript-v6-validator`](https://www.npmjs.com/package/pinescript-v6-validator) | syntax errors, undefined namespaces/variables/functions, missing/extra arguments (where its table is curated), semantic lints (repaint risk, `plot()` inside blocks, scope violations…) |
| `oracle-params` | `data/params.json` — **1,208 parameter names verified against TradingView's translator** | named arguments the oracle explicitly rejects (`CE10120`), and *any* keyword argument on variable-argument functions (`CE10119`: `math.max`, `str.format`, `array.from`, `log.*`) |
| `pinets` | [PineTS](https://github.com/LuxAlgo/PineTS) transpiler (vendored, AGPL) | undeclared identifiers, syntax errors, compile-time `input.*()` checks (non-constant arguments, `defval` outside `options` — info only, TradingView accepts it) |

## Measured agreement (test/corpus, 34 cases)

- **32/34 verdicts agree with TradingView's compiler (94.1%)**
- **0 false positives** on 22 valid scripts, including 5 real-world indicators (250–1,100 lines each)
- The 2 disagreements are *misses*, not false alarms — see below.

## What it does NOT catch (honest limits)

- **Unknown named-argument names.** The oracle table only records names that
  were probed; a name absent from it is *unknown*, not invalid — so typos on
  functions outside the npm validator's curated list pass silently. (The npm
  engine covers ~10 curated functions like `plot`, `label.new`, `line.new`.)
- **Overload-relative name validity.** `line.new(x1=…)` / `box.new(left=…)`
  are legal *only* in the coordinate overload; mixing forms is rejected by
  TradingView but not flagged here (`test/corpus/bad-line-new-mixed.pine`).
- **Arity gaps in the npm table.** e.g. `ta.vwap()` requires `anchor` in v6 —
  TradingView rejects a call without it, the npm table doesn't know
  (`bad-vwap-missing-anchor.pine`).
- **Type errors.** `plot(close + "x")`-class mistakes are not type-checked.
- **PineTS coverage.** If PineTS can't transpile a valid v6 construct, it may
  report an error TradingView wouldn't — the corpus is the guard against this;
  report divergences as issues.
- **`//@version=5` and older.** The oracle table is v6-only (v5 parameter
  names differ — `line.new(x1=)` is legal in v5). v5 scripts get a warning,
  not param checks.

## The oracle table (`data/params.json`)

Built by probing TradingView's facade once per candidate parameter:
`fn(param=0)` → `CE10120` naming `param` means rejected; anything else means
the name is accepted. Results: **473 functions, 1,208 names verified ok,
2 verified rejected, 53 unverified** (probe inconclusive — never flagged),
8 varargs functions. Nothing enters the table without an oracle verdict;
the two rejections that survived context re-probing are `time(timezone=)`
and `time_close(timezone=)`.

Caveat discovered the hard way: per-parameter probes are **overload-
sensitive** — `box.new(left=0)` alone is rejected but
`box.new(left=0,top=0,right=0,bottom=0)` compiles. The 9 names that showed
this pattern were downgraded to `unverified` rather than flagged.

The `--remote` flag sends each file to the live facade and reports whether
local and remote verdicts agree — useful for auditing, not needed for
validation.

## Layout

```
src/check.ts        engine orchestration + de-duplication
src/calls.ts        Pine call scanner (strings/comments/multi-line safe)
src/oracleParams.ts params.json checker
src/pinets.ts       PineTS transpile wrapper → diagnostics
src/cli.ts          CLI
bin/pine-check.mjs  bin entry (loads TS via tsx)
tools/oracle.mjs    pine-facade client
tools/harvest-*.mjs params-table harvesters
tools/corpus-oracle.mjs  refresh oracle-baseline.json
test/corpus/        34 differential cases + manifest + oracle baseline
test/run.ts         `npm test`
data/params.json    oracle-verified parameter table
vendor/pinets/      PineTS transpiler (AGPL-3.0, unmodified)
```

## License

AGPL-3.0 — the vendored PineTS transpiler is AGPL; see `LICENSE`.
