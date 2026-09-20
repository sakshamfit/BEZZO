#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * BEZZO database CLI entry point.
 *
 * Usage:
 *   bezzo-db migrate [--to 0007] [--dry-run]
 *   bezzo-db status
 *   bezzo-db seed --env reference|development|test
 *   bezzo-db reset --yes
 *   bezzo-db verify
 *   bezzo-db create add_something
 */
const path = require('node:path');

function resolveEntry() {
  const distEntry = path.join(__dirname, '..', 'dist', 'cli.js');
  const srcEntry = path.join(__dirname, '..', 'src', 'cli.ts');
  const fs = require('node:fs');
  if (fs.existsSync(distEntry)) return distEntry;
  // Development fallback: run the TypeScript source through ts-node/register when available.
  try {
    require.resolve('ts-node/register');
    require('ts-node/register');
    return srcEntry;
  } catch {
    console.error(
      'bezzo-db: build the package first (`pnpm --filter @bezzo/database build`) or run via ts-node.',
    );
    process.exit(1);
  }
}

require(resolveEntry()).runCli(process.argv.slice(2)).catch((error) => {
  console.error(`bezzo-db failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
