/**
 * Database module.
 *
 * A single bounded `pg` pool is shared by the whole process (project rule: never one connection per
 * user). Repositories obtain the pool through dependency injection; write paths use
 * `db.transaction()` so the pool never leaks a client.
 */
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Database } from '@bezzo/database';
import type { AppConfig } from '@bezzo/config';
import { APP_CONFIG } from '../config/config.module';
import { InjectLogger, BEZZO_LOGGER, type BezzoLogger } from '../logger/logger.module';

export const DATABASE = 'BEZZO_DATABASE';

export const databaseProvider = {
  provide: DATABASE,
  inject: [APP_CONFIG, BEZZO_LOGGER],
  useFactory: (config: AppConfig, logger: BezzoLogger): Database =>
    new Database({
      connectionString: config.DATABASE_URL,
      maxConnections: config.DATABASE_POOL_MAX,
      idleTimeoutMs: config.DATABASE_POOL_IDLE_TIMEOUT_MS,
      statementTimeoutMs: config.DATABASE_STATEMENT_TIMEOUT_MS,
      ssl: config.DATABASE_SSL,
      applicationName: `${config.DATABASE_APPLICATION_NAME}-api`,
      logger: {
        debug: (message, meta) => logger.debugWith(meta ?? {}, message),
        info: (message, meta) => logger.info(meta ?? {}, message),
        warn: (message, meta) => logger.warnWith(meta ?? {}, message),
        error: (message, meta) => logger.errorWith(meta ?? {}, message),
      },
    }),
};

@Global()
@Module({
  providers: [databaseProvider],
  exports: [databaseProvider],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async onApplicationShutdown(): Promise<void> {
    await this.database.close();
  }
}

export const InjectDatabase = () => Inject(DATABASE);
