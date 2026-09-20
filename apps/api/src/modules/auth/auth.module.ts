import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Authentication module.
 *
 * `JwtModule` is registered globally by `AppModule`, so `JwtService` is available here without an
 * extra import; infrastructure modules (config, database, cache, audit, events, notifications) are
 * globally scoped.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
