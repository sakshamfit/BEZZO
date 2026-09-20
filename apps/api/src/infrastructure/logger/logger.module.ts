/**
 * Structured logging (observability spec §33, project rule §41).
 *
 * Every log line carries the request/correlation identifiers from the request context, plus the
 * actor when one is authenticated. Sensitive fields are redacted at the logger level so a careless
 * log statement can never leak a password, token, OTP or bank detail.
 */
import { Global, Inject, Injectable, LoggerService, Module } from '@nestjs/common';
import pino, { type Logger as PinoLogger } from 'pino';
import type { AppConfig } from '@bezzo/config';
import { APP_CONFIG } from '../config/config.module';
import { currentActor, getRequestContext } from '../../common/context/request-context';

/** Fields that must never appear in logs, at any level, in any environment. */
const REDACTED_PATHS = [
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'refreshToken',
  'accessToken',
  'token',
  'otp',
  'code',
  'authorization',
  'headers.authorization',
  '*.password',
  '*.refreshToken',
  '*.otp',
  'req.headers.authorization',
  'bankAccountNumber',
  'bank_ifsc',
  'pan',
  'cardNumber',
  'cvv',
];

@Injectable()
export class BezzoLogger implements LoggerService {
  constructor(private readonly logger: PinoLogger) {}

  private withContext(fields: Record<string, unknown> = {}): Record<string, unknown> {
    const context = getRequestContext();
    const actor = currentActor();
    return {
      ...fields,
      ...(context?.requestId ? { requestId: context.requestId } : {}),
      ...(context?.correlationId ? { correlationId: context.correlationId } : {}),
      ...(actor?.userId ? { userId: actor.userId } : {}),
      ...(context?.correlation && Object.keys(context.correlation).length > 0
        ? { correlation: context.correlation }
        : {}),
    };
  }

  log(message: unknown, context?: string): void {
    this.logger.info(this.withContext(context ? { context } : {}), String(message));
  }

  info(fields: Record<string, unknown>, message: string): void {
    this.logger.info(this.withContext(fields), message);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.logger.error(this.withContext({ ...(context ? { context } : {}), stack: trace }), String(message));
  }

  errorWith(fields: Record<string, unknown>, message: string): void {
    this.logger.error(this.withContext(fields), message);
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn(this.withContext(context ? { context } : {}), String(message));
  }

  warnWith(fields: Record<string, unknown>, message: string): void {
    this.logger.warn(this.withContext(fields), message);
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug(this.withContext(context ? { context } : {}), String(message));
  }

  debugWith(fields: Record<string, unknown>, message: string): void {
    this.logger.debug(this.withContext(fields), message);
  }

  verbose(message: unknown, context?: string): void {
    this.logger.trace(this.withContext(context ? { context } : {}), String(message));
  }

  /** Named child logger for a subsystem (same context injection, distinct `component` field). */
  child(component: string): BezzoLogger {
    return new BezzoLogger(this.logger.child({ component }));
  }
}

export const BEZZO_LOGGER = 'BEZZO_LOGGER';

export type LogFields = Record<string, unknown>;

export const loggerProvider = {
  provide: BEZZO_LOGGER,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): BezzoLogger => {
    const logger = pino({
      level: config.LOG_LEVEL,
      base: { service: 'bezzo-api', environment: config.NODE_ENV, version: config.APP_VERSION },
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
      timestamp: pino.stdTimeFunctions.isoTime,
      ...(config.LOG_PRETTY
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
            },
          }
        : {}),
    });
    return new BezzoLogger(logger);
  },
};

@Global()
@Module({
  providers: [loggerProvider],
  exports: [loggerProvider],
})
export class LoggerModule {}

export const InjectLogger = () => Inject(BEZZO_LOGGER);
