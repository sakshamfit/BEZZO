/**
 * BEZZO API root module.
 *
 * Architecture: a modular monolith (project rule §14 — no premature microservices). Every domain
 * module owns its controllers, services and SQL; infrastructure modules are globally scoped because
 * configuration, logging, the database pool, caching, storage, the outbox, idempotency, auditing,
 * scheduling, metrics, search, payments, logistics and notifications are genuinely cross-cutting.
 *
 * Cross-cutting concerns wired here:
 *  - `APP_GUARD` JwtAuthGuard       — authentication (session-aware, revocation-aware)
 *  - `APP_GUARD` PermissionsGuard   — role + permission authorization (ownership stays in services)
 *  - `APP_FILTER` AllExceptionsFilter   — one error envelope, no internal leakage
 *  - `APP_INTERCEPTOR` MetricsInterceptor      — HTTP latency/count metrics
 *  - `APP_INTERCEPTOR` ResponseEnvelopeInterceptor — one success envelope
 *
 * The extractable boundaries (picker, logistics, payments, search, notifications, identity) are
 * already isolated in their own modules so they can be split into services later without rewrites.
 */
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { AppConfig } from '@bezzo/config';

import { AppConfigModule, APP_CONFIG } from './infrastructure/config/config.module';
import { LoggerModule } from './infrastructure/logger/logger.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { CacheModule } from './infrastructure/cache/cache.service';
import { StorageModule } from './infrastructure/storage/storage.service';
import { EventsModule } from './infrastructure/events/event-bus.service';
import { IdempotencyModule } from './infrastructure/idempotency/idempotency.service';
import { AuditModule } from './infrastructure/audit/audit.service';
import { JobsModule } from './infrastructure/jobs/scheduler.service';
import { MetricsModule } from './infrastructure/metrics/metrics.service';
import { SearchModule } from './infrastructure/search/search.service';
import { PaymentsInfraModule } from './infrastructure/payments/payments-infra.module';
import { LogisticsInfraModule } from './infrastructure/logistics/logistics-infra.module';
import { NotificationsInfraModule } from './infrastructure/notifications/notification.service';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';

import { AuthModule } from './modules/auth/auth.module';
import { BuyersModule } from './modules/buyers/buyers.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CartModule } from './modules/cart/cart.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { PlatformModule } from './modules/platform/platform.module';
import { UsersModule } from './modules/users/users.module';
import { WorkerModule } from './modules/workers/worker.module';
import { PickerModule } from './modules/picker/picker.module';

@Module({
  imports: [
    // Infrastructure (all globally scoped)
    AppConfigModule,
    LoggerModule,
    DatabaseModule,
    CacheModule,
    StorageModule,
    EventsModule,
    IdempotencyModule,
    AuditModule,
    JobsModule,
    MetricsModule,
    SearchModule,
    PaymentsInfraModule,
    LogisticsInfraModule,
    NotificationsInfraModule,

    // Authentication tokens (access tokens only; refresh tokens are opaque and stored hashed)
    JwtModule.registerAsync({
      global: true,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.JWT_ACCESS_SECRET,
        signOptions: {
          expiresIn: config.JWT_ACCESS_TTL_SECONDS,
          issuer: 'bezzo-api',
          audience: 'bezzo-clients',
        },
        verifyOptions: { issuer: 'bezzo-api', audience: 'bezzo-clients' },
      }),
    }),

    // Domain modules
    AuthModule,
    BuyersModule,
    SuppliersModule,
    CatalogModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    ApplicationsModule,
    UsersModule,
    PlatformModule,
    PickerModule,

    // Background workers (no-op when WORKER_ENABLED=false)
    WorkerModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
