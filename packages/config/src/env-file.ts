/**
 * Zero-dependency `.env` loader.
 *
 * BEZZO keeps configuration in the environment (12-factor) and ships `.env.example` as the
 * documented template. This loader lets a developer run `cp .env.example .env` and start the API
 * without pulling a dependency into the config package.
 *
 * Rules (deliberately conservative):
 *  - an already-set process variable ALWAYS wins — a `.env` file can never override a real secret
 *    injected by the platform/secret manager;
 *  - missing file is not an error (containers, CI and production pass environment variables);
 *  - values may be single/double quoted; `#` starts a comment only when unquoted at line start;
 *  - malformed lines are reported, never silently ignored.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface LoadEnvFileResult {
  path: string | null;
  loaded: string[];
  skipped: string[];
  errors: string[];
}

/**
 * Locate the environment file.
 *
 * An explicit path (option or `ENV_FILE`) is honoured exactly. Otherwise the file is searched from the
 * working directory upwards — a monorepo package such as `apps/api` started with `pnpm start` still
 * picks up the repository-level `.env` — with the closest file winning.
 */
export function resolveEnvFile(explicitPath?: string, maxLevels = 3): string | null {
  if (explicitPath) return resolve(explicitPath);

  let directory = process.cwd();
  for (let level = 0; level <= maxLevels; level += 1) {
    const candidate = join(directory, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

export function loadEnvFile(options: { path?: string; override?: boolean; silent?: boolean } = {}): LoadEnvFileResult {
  const filePath = resolveEnvFile(options.path ?? process.env.ENV_FILE);
  const result: LoadEnvFileResult = { path: null, loaded: [], skipped: [], errors: [] };

  if (!filePath) return result;
  result.path = filePath;

  const content = readFileSync(filePath, 'utf8');
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator <= 0) {
      result.errors.push(`line ${index + 1}: expected KEY=VALUE`);
      continue;
    }

    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      result.errors.push(`line ${index + 1}: invalid variable name "${key}"`);
      continue;
    }

    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const commentIndex = value.indexOf(' #');
      if (commentIndex >= 0) value = value.slice(0, commentIndex).trim();
    }

    if (process.env[key] !== undefined && !options.override) {
      result.skipped.push(key);
      continue;
    }
    process.env[key] = value;
    result.loaded.push(key);
  }

  if (!options.silent && result.errors.length > 0) {
    // The caller owns logging; this is a last-resort signal that the file is malformed.
    process.stderr.write(`BEZZO: problems in ${filePath}: ${result.errors.join('; ')}\n`);
  }
  return result;
}
