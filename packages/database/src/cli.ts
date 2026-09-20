/* eslint-disable no-console */
/**
 * BEZZO database CLI.
 *
 * Commands (migration spec §6):
 *   migrate [--to NNNN] [--dry-run]   apply pending migrations under an advisory lock
 *   status                            show applied/pending migrations and checksum drift
 *   seed --env <reference|development|test>
 *   reset --yes                       drop and recreate the public schema (dev/test only)
 *   verify                            integrity checks: migrations, extensions, invariants, indexes
 *   create <name>                     scaffold the next migration file
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile } from '@bezzo/config';
import { Database } from './pool';
import { createMigrationFile, getStatus, migrateSafely, migrationsDirectory } from './migrator';
import { runSeeds, type SeedEnvironment } from './seeds/runner';
import { resetDatabase } from './reset';

interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = 'help', ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token) continue;
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = rest[index + 1];
    if (value && !value.startsWith('--')) {
      flags[key] = value;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function databaseNameFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, '') || 'unknown';
  } catch {
    return 'unknown';
  }
}

function createDb(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure it.');
  }
  return new Database({
    connectionString,
    maxConnections: Number(process.env.DATABASE_POOL_MAX ?? 10),
    statementTimeoutMs: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 60_000),
    ssl: process.env.DATABASE_SSL === 'true',
    applicationName: 'bezzo-db-cli',
    logger: {
      debug: () => undefined,
      info: (message, meta) => console.log(`[db] ${message}`, meta ?? ''),
      warn: (message, meta) => console.warn(`[db] ${message}`, meta ?? ''),
      error: (message, meta) => console.error(`[db] ${message}`, meta ?? ''),
    },
  });
}

const HELP = `BEZZO database CLI

  bezzo-db migrate [--to 0007] [--dry-run]
  bezzo-db status
  bezzo-db seed --env reference|development|test
  bezzo-db reset --yes
  bezzo-db verify
  bezzo-db create <migration_name>
`;

export async function runCli(argv: string[]): Promise<void> {
  /**
   * Load the repository `.env` first (process variables still win). Without this the documented
   * `corepack pnpm db:migrate` flow fails with "DATABASE_URL is required" even though `.env` exists,
   * because each workspace package is executed with its own working directory.
   */
  const loaded = loadEnvFile({ silent: true });
  const { command, flags } = parseArgs(argv);
  if (command === 'help' || flags.help) {
    console.log(HELP);
    return;
  }
  // Being explicit about where configuration came from avoids the classic "which .env is this?" hunt.
  if (flags.verbose === true) {
    console.log(loaded.path ? `Environment: ${loaded.path}` : 'Environment: process variables only (.env not found)');
  }
  if (loaded.errors.length > 0) {
    console.warn(`Ignored ${loaded.errors.length} malformed line(s) in ${loaded.path ?? '.env'}`);
  }

  const db = createDb();
  try {
    switch (command) {
      case 'migrate': {
        const result = await migrateSafely(db, {
          to: typeof flags.to === 'string' ? flags.to : undefined,
          dryRun: flags['dry-run'] === true,
          appliedBy: process.env.USER ?? 'cli',
        });
        if (result.applied.length === 0) {
          console.log(result.skipped.length > 0 ? `Dry run — would apply: ${result.skipped.join(', ')}` : 'No pending migrations.');
        } else {
          console.log(`Applied ${result.applied.length} migration(s) in ${result.durationMs}ms:`);
          for (const file of result.applied) console.log(`  ✔ ${file}`);
        }
        break;
      }

      case 'status': {
        const status = await getStatus(db);
        console.log(`Database: ${databaseNameFromUrl(process.env.DATABASE_URL ?? '')}`);
        console.log(`Applied:  ${status.applied.length}`);
        console.log(`Pending:  ${status.pending.length}`);
        for (const migration of status.applied) {
          console.log(`  ✔ ${migration.version}_${migration.name} (${migration.executionMs}ms, ${migration.appliedAt})`);
        }
        for (const migration of status.pending) {
          console.log(`  • ${migration.fileName} (pending)`);
        }
        if (status.drift.length > 0) {
          console.error('\n⚠ Checksum drift detected for applied migrations:');
          for (const entry of status.drift) console.error(`  ! ${entry.version}_${entry.name}`);
          process.exitCode = 2;
        }
        break;
      }

      case 'seed': {
        const environment = (typeof flags.env === 'string' ? flags.env : 'development') as SeedEnvironment;
        const result = await runSeeds(db, environment);
        console.log(`Seeded "${result.environment}" (${result.statements} statements, ${result.durationMs}ms)`);
        break;
      }

      case 'reset': {
        if (flags.yes !== true) {
          throw new Error('reset requires --yes (it drops the entire public schema)');
        }
        const databaseName = databaseNameFromUrl(process.env.DATABASE_URL ?? '');
        await resetDatabase(db, { databaseName, force: true });
        console.log(`Dropped and recreated the public schema of "${databaseName}"`);
        break;
      }

      case 'verify': {
        const failures = await verifyDatabase(db);
        if (failures.length === 0) {
          console.log('✔ Database verification passed');
        } else {
          console.error('✘ Database verification failed:');
          for (const failure of failures) console.error(`  ! ${failure}`);
          process.exitCode = 3;
        }
        break;
      }

      case 'create': {
        const name = process.argv[3];
        if (!name) throw new Error('create requires a migration name, e.g. `bezzo-db create add_order_snapshots`');
        const fileName = await createMigrationFile(name);
        console.log(`Created ${fileName}`);
        break;
      }

      default:
        console.log(HELP);
    }
  } finally {
    await db.close();
  }
}

/**
 * Structural verification used by CI and pre-deployment checks. It asserts that the schema is
 * actually able to enforce the platform's critical invariants — not merely that tables exist.
 */
export async function verifyDatabase(db: Database): Promise<string[]> {
  const failures: string[] = [];

  const status = await getStatus(db);
  if (status.pending.length > 0) {
    failures.push(`Pending migrations: ${status.pending.map((m) => m.fileName).join(', ')}`);
  }
  if (status.drift.length > 0) {
    failures.push(`Checksum drift: ${status.drift.map((d) => d.version).join(', ')}`);
  }

  const extensions = await db.rows<{ extname: string }>(
    `SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','pg_trgm')`,
  );
  for (const required of ['pgcrypto', 'pg_trgm']) {
    if (!extensions.some((row) => row.extname === required)) {
      failures.push(`Required extension is missing: ${required}`);
    }
  }

  const requiredTables = [
    'users',
    'sessions',
    'buyers',
    'buyer_addresses',
    'suppliers',
    'supplier_documents',
    'categories',
    'products',
    'supplier_product_listings',
    'inventories',
    'inventory_reservations',
    'inventory_transactions',
    'carts',
    'cart_items',
    'checkout_sessions',
    'orders',
    'order_items',
    'order_status_history',
    'fulfillments',
    'fulfillment_items',
    'collection_hubs',
    'pickers',
    'pickup_tasks',
    'pickup_task_orders',
    'pickup_packages',
    'pickup_offers',
    'pickup_runs',
    'pickup_stops',
    'pickup_events',
    'hub_receivings',
    'hub_package_scans',
    'pickup_exceptions',
    'payments',
    'payment_attempts',
    'payment_webhook_events',
    'refunds',
    'invoices',
    'deliveries',
    'delivery_events',
    'notifications',
    'notification_deliveries',
    'support_tickets',
    'disputes',
    'domain_events',
    'audit_logs',
    'idempotency_keys',
    'configurations',
  ];
  const tables = await db.rows<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  const tableNames = new Set(tables.map((row) => row.table_name));
  for (const table of requiredTables) {
    if (!tableNames.has(table)) failures.push(`Required table is missing: ${table}`);
  }

  // Critical constraints that protect money, stock and pickup concurrency.
  const criticalConstraints: Array<{ table: string; name: string; kind: string }> = [
    { table: 'inventories', name: 'inventories_reserved_within_available', kind: 'c' },
    { table: 'inventories', name: 'inventories_listing_unique', kind: 'i' },
    { table: 'inventory_reservations', name: 'inventory_reservations_order_item_active_unique', kind: 'i' },
    { table: 'pickup_task_orders', name: 'pickup_task_orders_active_unique', kind: 'i' },
    { table: 'hub_package_scans', name: 'hub_package_scans_accepted_unique', kind: 'i' },
    { table: 'pickup_offers', name: 'pickup_offers_pending_unique', kind: 'i' },
    { table: 'payment_webhook_events', name: 'payment_webhook_events_unique', kind: 'c' },
    { table: 'idempotency_keys', name: 'idempotency_keys_scope_unique', kind: 'c' },
    { table: 'pickup_packages', name: 'pickup_packages_collected_once', kind: 'i' },
  ];

  for (const constraint of criticalConstraints) {
    const found =
      constraint.kind === 'c'
        ? await db.row<{ count: string }>(
            `SELECT count(*)::TEXT AS count FROM pg_constraint c
             JOIN pg_class t ON t.oid = c.conrelid
             WHERE t.relname = $1 AND c.conname = $2`,
            [constraint.table, constraint.name],
          )
        : await db.row<{ count: string }>(
            `SELECT count(*)::TEXT AS count FROM pg_indexes WHERE tablename = $1 AND indexname = $2`,
            [constraint.table, constraint.name],
          );
    if (Number(found?.count ?? 0) === 0) {
      failures.push(`Critical constraint/index is missing: ${constraint.table}.${constraint.name}`);
    }
  }

  // Helper functions used by application queries.
  const functions = await db.rows<{ proname: string }>(
    `SELECT proname FROM pg_proc WHERE proname IN ('bezzo_next_order_number','bezzo_next_pickup_task_code','bezzo_haversine_km','bezzo_touch_updated_at')`,
  );
  for (const required of ['bezzo_next_order_number', 'bezzo_next_pickup_task_code', 'bezzo_haversine_km']) {
    if (!functions.some((row) => row.proname === required)) {
      failures.push(`Required function is missing: ${required}()`);
    }
  }

  const seedFiles = existsSync(join(migrationsDirectory(), '..', 'seeds'))
    ? readdirSync(join(migrationsDirectory(), '..', 'seeds')).length
    : 0;
  if (seedFiles === 0) {
    failures.push('No seed assets found next to the migrations directory');
  }

  return failures;
}
