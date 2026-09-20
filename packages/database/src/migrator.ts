/**
 * BEZZO migration runner.
 *
 * Requirements (Bezzo_database_migration_seed_data_environment_setup_spec_v1.0.md §5–§15):
 *  - ordered, deterministic, version-controlled migrations with recorded history;
 *  - transaction per migration where possible;
 *  - forward-only in production (rollbacks are additive, never destructive);
 *  - checksums detect edited migrations, which must never silently apply;
 *  - concurrent runners are serialised with a PostgreSQL advisory lock.
 *
 * Migrations are plain `.sql` files named `NNNN_description.sql`. A migration may declare
 * `-- @transactional: false` at the top when it contains statements that cannot run inside a
 * transaction (for example `CREATE INDEX CONCURRENTLY`), in which case it is executed
 * statement-by-statement without a wrapping transaction.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from './pool';

export const MIGRATION_ADVISORY_LOCK_KEY = 982_451_653; // arbitrary stable BEZZO constant

export interface MigrationFile {
  version: string;
  name: string;
  fileName: string;
  sql: string;
  checksum: string;
  transactional: boolean;
}

export interface AppliedMigration {
  version: string;
  name: string;
  checksum: string;
  appliedAt: string;
  executionMs: number;
  appliedBy: string | null;
}

export interface MigrationStatus {
  applied: AppliedMigration[];
  pending: MigrationFile[];
  drift: Array<{ version: string; name: string; expectedChecksum: string; actualChecksum: string }>;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  durationMs: number;
}

const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version        TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  checksum       TEXT NOT NULL,
  applied_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  execution_ms   INTEGER NOT NULL DEFAULT 0,
  applied_by     TEXT
);
`;

export function migrationsDirectory(): string {
  const candidates = [
    join(__dirname, 'migrations'),
    join(__dirname, '..', 'migrations'),
    join(process.cwd(), 'migrations'),
    join(process.cwd(), 'packages', 'database', 'migrations'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Unable to locate the migrations directory (looked in: ${candidates.join(', ')})`);
}

export async function loadMigrationFiles(directory = migrationsDirectory()): Promise<MigrationFile[]> {
  const entries = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  const files: MigrationFile[] = [];
  for (const fileName of entries) {
    const sql = await readFile(join(directory, fileName), 'utf8');
    const match = /^(\d{4})_([a-z0-9_]+)\.sql$/i.exec(fileName);
    if (!match) {
      throw new Error(`Migration "${fileName}" does not follow the NNNN_lower_snake_case.sql convention`);
    }
    files.push({
      version: match[1] as string,
      name: match[2] as string,
      fileName,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
      transactional: !/^--\s*@transactional:\s*false/im.test(sql),
    });
  }
  const duplicates = files
    .map((file) => file.version)
    .filter((version, index, all) => all.indexOf(version) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate migration versions detected: ${[...new Set(duplicates)].join(', ')}`);
  }
  return files;
}

export async function ensureMigrationsTable(db: Database): Promise<void> {
  await db.query(MIGRATIONS_TABLE);
}

export async function getAppliedMigrations(db: Database): Promise<AppliedMigration[]> {
  await ensureMigrationsTable(db);
  const rows = await db.rows<{
    version: string;
    name: string;
    checksum: string;
    applied_at: Date;
    execution_ms: number;
    applied_by: string | null;
  }>('SELECT version, name, checksum, applied_at, execution_ms, applied_by FROM schema_migrations ORDER BY version');
  return rows.map((row) => ({
    version: row.version,
    name: row.name,
    checksum: row.checksum,
    appliedAt: row.applied_at.toISOString(),
    executionMs: row.execution_ms,
    appliedBy: row.applied_by,
  }));
}

export async function getStatus(db: Database, options: { directory?: string } = {}): Promise<MigrationStatus> {
  const [files, applied] = await Promise.all([loadMigrationFiles(options.directory), getAppliedMigrations(db)]);
  const appliedVersions = new Set(applied.map((migration) => migration.version));
  const pending = files.filter((file) => !appliedVersions.has(file.version));
  const drift = applied
    .map((migration) => {
      const file = files.find((candidate) => candidate.version === migration.version);
      if (!file) return null;
      if (file.checksum === migration.checksum) return null;
      return {
        version: migration.version,
        name: migration.name,
        expectedChecksum: migration.checksum,
        actualChecksum: file.checksum,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  return { applied, pending, drift };
}

export interface MigrateOptions {
  directory?: string;
  /** Apply only migrations up to and including this version. */
  to?: string;
  dryRun?: boolean;
  appliedBy?: string;
}

export async function migrate(db: Database, options: MigrateOptions = {}): Promise<MigrationResult> {
  const startedAt = Date.now();
  await ensureMigrationsTable(db);
  const files = await loadMigrationFiles(options.directory);
  const applied = await getAppliedMigrations(db);

  const drift = applied.filter((migration) => {
    const file = files.find((candidate) => candidate.version === migration.version);
    return file && file.checksum !== migration.checksum;
  });
  if (drift.length > 0) {
    throw new Error(
      `Migration drift detected for ${drift.map((d) => d.version).join(', ')}. ` +
        'Applied migrations must never be edited — add a new forward migration instead.',
    );
  }

  const appliedVersions = new Set(applied.map((migration) => migration.version));
  const candidates = files.filter(
    (file) => !appliedVersions.has(file.version) && (!options.to || file.version <= options.to),
  );

  if (options.dryRun) {
    return { applied: [], skipped: candidates.map((file) => file.fileName), durationMs: Date.now() - startedAt };
  }

  const executed: string[] = [];
  for (const file of candidates) {
    const migrationStartedAt = Date.now();
    if (file.transactional) {
      await db.transaction(async (client) => {
        await client.query(file.sql);
        await client.query(
          `INSERT INTO schema_migrations (version, name, checksum, execution_ms, applied_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [file.version, file.name, file.checksum, Date.now() - migrationStartedAt, options.appliedBy ?? null],
        );
      });
    } else {
      // Non-transactional migrations (e.g. CREATE INDEX CONCURRENTLY) run statement by statement.
      for (const statement of splitStatements(file.sql)) {
        await db.query(statement);
      }
      await db.query(
        `INSERT INTO schema_migrations (version, name, checksum, execution_ms, applied_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [file.version, file.name, file.checksum, Date.now() - migrationStartedAt, options.appliedBy ?? null],
      );
    }
    executed.push(file.fileName);
  }

  return { applied: executed, skipped: [], durationMs: Date.now() - startedAt };
}

/**
 * Apply pending migrations under an advisory lock so concurrent deployments cannot interleave.
 */
export async function migrateSafely(db: Database, options: MigrateOptions = {}): Promise<MigrationResult> {
  return db.withAdvisoryLock(MIGRATION_ADVISORY_LOCK_KEY, () => migrate(db, options));
}

/** Minimal statement splitter for non-transactional migrations (respects `$$` blocks and quotes). */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDollarQuote = false;
  let dollarTag = '';
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index] as string;
    const next = sql[index + 1];
    if (!inSingleQuote && char === '$') {
      const tagMatch = /^\$[A-Za-z_]*\$/.exec(sql.slice(index));
      if (tagMatch) {
        const tag = tagMatch[0];
        if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = tag;
        } else if (tag === dollarTag) {
          inDollarQuote = false;
          dollarTag = '';
        }
        current += tag;
        index += tag.length - 1;
        continue;
      }
    }
    if (!inDollarQuote && char === "'") {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }
    if (!inSingleQuote && !inDollarQuote && char === ';') {
      statements.push(current.trim());
      current = '';
      continue;
    }
    if (!inDollarQuote && !inSingleQuote && char === '-' && next === '-') {
      // strip line comments
      const lineEnd = sql.indexOf('\n', index);
      index = lineEnd === -1 ? sql.length : lineEnd;
      current += '\n';
      continue;
    }
    current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter((statement) => statement.length > 0);
}

/** Scaffold a new migration file with the next sequential version. */
export async function createMigrationFile(name: string, directory = migrationsDirectory()): Promise<string> {
  const { writeFile } = await import('node:fs/promises');
  const files = await loadMigrationFiles(directory);
  const lastVersion = files.at(-1)?.version ?? '0000';
  const nextVersion = String(Number.parseInt(lastVersion, 10) + 1).padStart(4, '0');
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const fileName = `${nextVersion}_${slug}.sql`;
  const template = `-- ${fileName}
-- Description: TODO describe the change and why it is safe to apply.
-- Rules: forward-only in production, deterministic, no data loss without an explicit backfill plan.

`;
  await writeFile(join(directory, fileName), template, 'utf8');
  return fileName;
}
