/**
 * Logistics provider wiring. Selecting `porter` without credentials is a fatal configuration error:
 * the platform must never believe a delivery was booked when it was not.
 */
import { Global, Module } from '@nestjs/common';
import type { AppConfig } from '@bezzo/config';
import { APP_CONFIG } from '../config/config.module';
import { ManualLogisticsProvider, PorterLogisticsProvider, type LogisticsProvider } from './logistics-provider';

export const LOGISTICS_PROVIDER = 'BEZZO_LOGISTICS_PROVIDER';

@Global()
@Module({
  providers: [
    {
      provide: LOGISTICS_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): LogisticsProvider => {
        if (config.LOGISTICS_PROVIDER === 'porter') {
          if (!config.PORTER_API_KEY || !config.PORTER_API_SECRET) {
            throw new Error(
              'LOGISTICS_PROVIDER=porter requires PORTER_API_KEY and PORTER_API_SECRET. ' +
                'Provide them through the secret manager, or use LOGISTICS_PROVIDER=manual.',
            );
          }
          return new PorterLogisticsProvider({
            apiKey: config.PORTER_API_KEY,
            apiSecret: config.PORTER_API_SECRET,
            baseUrl: config.PORTER_BASE_URL,
            webhookSecret: config.PORTER_WEBHOOK_SECRET,
          });
        }
        return new ManualLogisticsProvider();
      },
    },
  ],
  exports: [LOGISTICS_PROVIDER],
})
export class LogisticsInfraModule {}
