/**
 * Typed configuration.
 *
 * `loadConfig()` performs full zod validation at boot and refuses to start on an invalid or unsafe
 * configuration (see `@bezzo/config`). No module ever reads `process.env` directly, so configuration
 * has exactly one source and one validation point.
 */
import { Global, Module } from '@nestjs/common';
import { loadConfig, type AppConfig } from '@bezzo/config';

export const APP_CONFIG = 'BEZZO_APP_CONFIG';

export const configProvider = {
  provide: APP_CONFIG,
  useFactory: (): AppConfig => loadConfig(),
};

@Global()
@Module({
  providers: [configProvider],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
