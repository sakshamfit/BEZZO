/**
 * Seed runner.
 *
 * Seeds are idempotent (migration spec §32): every seed uses natural keys with
 * `ON CONFLICT DO UPDATE`, so re-running them converges rather than duplicating data.
 *
 * Categories (spec §18):
 *   reference   — mandatory controlled vocabulary and operational defaults. Safe in every env.
 *   development — demo marketplace data for local work. Never production.
 *   test        — deterministic fixtures used by automated tests.
 */
import type { Database } from '../pool';
import { seedReference } from './reference';
import { seedDevelopment } from './development';
import { seedTest } from './test';

export type SeedEnvironment = 'reference' | 'development' | 'test';

export interface SeedResult {
  environment: SeedEnvironment;
  statements: number;
  durationMs: number;
}

export async function runSeeds(db: Database, environment: SeedEnvironment): Promise<SeedResult> {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (environment === 'development' && nodeEnv === 'production') {
    throw new Error('Development seeds must never run against production');
  }
  const startedAt = Date.now();
  let statements = 0;

  // Reference data is always applied first: every other seed depends on roles/permissions/config.
  statements += await seedReference(db);

  if (environment === 'development') {
    statements += await seedDevelopment(db);
  }
  if (environment === 'test') {
    statements += await seedTest(db);
  }

  return { environment, statements, durationMs: Date.now() - startedAt };
}
