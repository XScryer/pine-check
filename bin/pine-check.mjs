#!/usr/bin/env node
// pine-check CLI entry. Loads the TypeScript sources through tsx (devDependency)
// so the vendored PineTS transpiler runs unmodified.
import { tsImport } from 'tsx/esm/api';

const { main } = await tsImport('../src/cli.ts', import.meta.url);
// exitCode, not exit(): see src/cli.ts — process.exit() with closing fetch
// sockets crashes Node on Windows.
process.exitCode = await main(process.argv.slice(2));
