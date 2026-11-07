# Changelog

## [0.1.1] — 2026-11-07

### Fixed
- `--engine=<name>` with an unknown or empty engine list now exits 2 with a
  clear error, instead of running zero engines and reporting a false "clean".
- `tsx` moved to `dependencies`: `bin/pine-check.mjs` imports it at runtime,
  so `npm i -g` / `npm install --omit=dev` no longer crash with
  `ERR_MODULE_NOT_FOUND`.
- `test/run.ts` sets `process.exitCode` instead of `process.exit()` — avoids
  the Windows UV_HANDLE_CLOSING crash when `--remote` leaves fetch sockets
  closing (same fix the CLI already had).

### Added
- `.gitattributes` pinning LF line endings.
- README: `--json`, `--stdin`, `--engine`, `--quiet` documented.

### Internal
- `tsc --noEmit` is now clean (`@types/node`, `allowImportingTsExtensions`,
  `noEmit`).

## [0.1.0] — 2026-11-07

Initial release: three-engine validator (npm / oracle-params / pinets),
473-function oracle-verified parameter table, 34-case differential corpus
at 94.1% agreement with TradingView's compiler.
