/**
 * Development/test database reset.
 *
 * Guard rails (migration spec §30–§31): the reset refuses to run against a database whose name does
 * not look like a local/test database, and refuses whenever NODE_ENV=production.
 */
import type { Database } from './pool';

const PROTECTED_NAME_PATTERNS = [/production/i, /prod$/i, /staging/i];

export interface ResetOptions {
  databaseName: string;
  environment?: string;
  force?: boolean;
}

export async function resetDatabase(db: Database, options: ResetOptions): Promise<void> {
  const environment = options.environment ?? process.env.NODE_ENV ?? 'development';
  if (environment === 'production') {
    throw new Error('Refusing to reset a production database');
  }
  if (!options.force) {
    throw new Error('resetDatabase requires an explicit force flag');
  }
  if (PROTECTED_NAME_PATTERNS.some((pattern) => pattern.test(options.databaseName))) {
    throw new Error(
      `Refusing to reset database "${options.databaseName}": the name suggests a protected environment`,
    );
  }
  await db.transaction(async (client) => {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  });
}
