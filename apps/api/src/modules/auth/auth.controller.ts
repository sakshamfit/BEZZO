import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { ErrorCode } from '@bezzo/contracts';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import { AuthService } from './auth.service';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { DATABASE } from '../../infrastructure/database/database.module';
import { validate } from '../../common/pipes/zod-validation.pipe';
import { CurrentActor, Public } from '../../common/decorators';
import type { AuthenticatedActor } from '../../common/context/request-context';
import { DomainError } from '../../common/errors/domain-error';
import {
  changePasswordSchema,
  loginSchema,
  logoutSchema,
  registerSchema,
  refreshSchema,
  requestOtpSchema,
  updateProfileSchema,
  verifyOtpSchema,
  type LoginInput,
  type RegisterInput,
  type RequestOtpInput,
  type VerifyOtpInput,
} from './dto/auth.schemas';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    @Inject(DATABASE) private readonly database: DatabaseType,
  ) {}

  @Public()
  @Post('auth/register')
  @ApiOperation({ summary: 'Create an account (buyer, supplier or picker) and start onboarding' })
  async register(@Body(validate(registerSchema)) body: RegisterInput) {
    const result = await this.auth.register(body);
    return {
      userId: result.userId,
      status: result.status,
      verificationRequired: result.verificationRequired,
      ...(result.devOtp ? { devOtp: result.devOtp } : {}),
    };
  }

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Password sign-in issuing a session (access + rotating refresh token)' })
  async login(@Body(validate(loginSchema)) body: LoginInput) {
    const tokens = await this.auth.login(body);
    const principal = await this.auth.buildPrincipal(tokens.userId, tokens.sessionId);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresIn: tokens.accessTokenExpiresIn,
      refreshTokenExpiresIn: tokens.refreshTokenExpiresIn,
      tokenType: tokens.tokenType,
      principal,
    };
  }

  @Public()
  @Post('auth/otp/request')
  @HttpCode(202)
  @ApiOperation({ summary: 'Request an OTP for verification or passwordless login' })
  async requestOtp(@Body(validate(requestOtpSchema)) body: RequestOtpInput) {
    const result = await this.auth.requestOtp(body);
    return {
      challengeId: result.challengeId,
      expiresInSeconds: result.expiresInSeconds,
      destinationMasked: result.destinationMasked,
      ...(result.devOtp ? { devOtp: result.devOtp } : {}),
    };
  }

  @Public()
  @Post('auth/otp/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify an OTP; a LOGIN challenge also issues a session' })
  async verifyOtp(@Body(validate(verifyOtpSchema)) body: VerifyOtpInput) {
    const result = await this.auth.verifyOtp(body);
    if (!result.tokens) {
      return { verified: true, purpose: result.purpose, userId: result.userId };
    }
    const principal = await this.auth.buildPrincipal(result.userId, result.tokens.sessionId);
    return {
      verified: true,
      purpose: result.purpose,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      accessTokenExpiresIn: result.tokens.accessTokenExpiresIn,
      refreshTokenExpiresIn: result.tokens.refreshTokenExpiresIn,
      tokenType: result.tokens.tokenType,
      principal,
    };
  }

  @Public()
  @Post('auth/refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a refresh token (reuse revokes the whole token family)' })
  async refresh(@Body(validate(refreshSchema)) body: { refreshToken: string; deviceType?: string }) {
    const tokens = await this.auth.refresh(body);
    const principal = await this.auth.buildPrincipal(tokens.userId, tokens.sessionId);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresIn: tokens.accessTokenExpiresIn,
      refreshTokenExpiresIn: tokens.refreshTokenExpiresIn,
      tokenType: tokens.tokenType,
      principal,
    };
  }

  @Post('auth/logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the current session (or every session with allSessions)' })
  async logout(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(validate(logoutSchema)) body: { allSessions?: boolean },
  ): Promise<void> {
    await this.auth.logout({ userId: actor.userId, sessionId: actor.sessionId, allSessions: body.allSessions });
  }

  @Post('auth/logout-all')
  @HttpCode(204)
  @ApiOperation({ summary: 'Sign out everywhere' })
  async logoutAll(@CurrentActor() actor: AuthenticatedActor): Promise<void> {
    await this.auth.logout({ userId: actor.userId, sessionId: actor.sessionId, allSessions: true });
  }

  @Get('auth/sessions')
  @ApiOperation({ summary: 'List the active sessions/devices for the caller' })
  async sessions(@CurrentActor() actor: AuthenticatedActor) {
    return this.auth.listSessions(actor.userId, actor.sessionId);
  }

  @Delete('auth/sessions/:sessionId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke one of the caller sessions' })
  async revokeSession(@CurrentActor() actor: AuthenticatedActor, @Param('sessionId') sessionId: string): Promise<void> {
    await this.auth.revokeSession(actor.userId, sessionId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Current principal with roles, permissions and business profile references' })
  async me(@CurrentActor() actor: AuthenticatedActor) {
    return this.auth.buildPrincipal(actor.userId, actor.sessionId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the caller display name / contact identifiers' })
  async updateMe(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(validate(updateProfileSchema)) body: { displayName?: string; email?: string; phone?: string },
  ) {
    if (body.email) {
      const existing = await this.database.row<{ id: string }>(
        `SELECT id FROM users WHERE email_normalized = lower($1) AND id <> $2 AND deleted_at IS NULL`,
        [body.email, actor.userId],
      );
      if (existing) throw new DomainError(ErrorCode.IDENTIFIER_ALREADY_REGISTERED, 'This email is already in use');
    }
    if (body.phone) {
      const existing = await this.database.row<{ id: string }>(
        `SELECT id FROM users WHERE phone = $1 AND id <> $2 AND deleted_at IS NULL`,
        [body.phone, actor.userId],
      );
      if (existing) {
        throw new DomainError(ErrorCode.IDENTIFIER_ALREADY_REGISTERED, 'This phone number is already in use');
      }
    }

    await this.database.query(
      `UPDATE users
          SET display_name = COALESCE($2, display_name),
              email = COALESCE($3, email),
              phone = COALESCE($4, phone),
              email_verified_at = CASE WHEN $3 IS NOT NULL AND lower($3) IS DISTINCT FROM email_normalized THEN NULL ELSE email_verified_at END,
              phone_verified_at = CASE WHEN $4 IS NOT NULL AND $4 IS DISTINCT FROM phone THEN NULL ELSE phone_verified_at END
        WHERE id = $1`,
      [actor.userId, body.displayName ?? null, body.email ?? null, body.phone ?? null],
    );
    await this.audit.record(this.database, {
      action: 'user.profile_updated',
      resourceType: 'user',
      resourceId: actor.userId,
      after: { ...body },
    });
    return this.auth.buildPrincipal(actor.userId, actor.sessionId);
  }

  @Get('me/security')
  @ApiOperation({ summary: 'Security summary: recent authentication events and lock state' })
  async security(@CurrentActor() actor: AuthenticatedActor) {
    const events = await this.database.rows<{
      event_type: string;
      success: boolean;
      reason: string | null;
      identifier: string | null;
      ip_address: string | null;
      created_at: Date;
    }>(
      `SELECT event_type, success, reason, identifier, host(ip_address) AS ip_address, created_at
         FROM auth_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [actor.userId],
    );
    const user = await this.database.row<{ locked_until: Date | null; password_updated_at: Date | null }>(
      `SELECT locked_until, password_updated_at FROM users WHERE id = $1`,
      [actor.userId],
    );
    return {
      lockedUntil: user?.locked_until?.toISOString() ?? null,
      passwordUpdatedAt: user?.password_updated_at?.toISOString() ?? null,
      recentEvents: events.map((event) => ({
        eventType: event.event_type,
        success: event.success,
        reason: event.reason,
        identifier: event.identifier,
        ipAddress: event.ip_address,
        createdAt: event.created_at.toISOString(),
      })),
    };
  }

  @Patch('me/password')
  @HttpCode(204)
  @ApiOperation({ summary: 'Change the password; every other session is revoked' })
  async changePassword(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(validate(changePasswordSchema)) body: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    await this.auth.changePassword({ userId: actor.userId, ...body });
  }

  @Delete('me')
  @HttpCode(202)
  @ApiOperation({ summary: 'Deactivate the caller account (retention policy applies)' })
  async deactivate(@CurrentActor() actor: AuthenticatedActor): Promise<{ status: string }> {
    await this.database.transaction(async (client) => {
      await client.query(`UPDATE users SET status = 'DEACTIVATED', deleted_at = now() WHERE id = $1`, [actor.userId]);
      await client.query(
        `UPDATE sessions SET revoked_at = now(), revoked_reason = 'ACCOUNT_DEACTIVATED'
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [actor.userId],
      );
      await client.query(
        `INSERT INTO account_status_history (user_id, from_status, to_status, reason, actor_type)
         VALUES ($1, NULL, 'DEACTIVATED', 'User requested deactivation', 'USER')`,
        [actor.userId],
      );
      // Suppliers and buyers are commercial actors: deactivation must be visible to operations
      // rather than silently removing a trading partner from the marketplace.
      await client.query(`UPDATE suppliers SET status = 'INACTIVE' WHERE user_id = $1 AND status = 'ACTIVE'`, [
        actor.userId,
      ]);
      await client.query(`UPDATE buyers SET status = 'DEACTIVATED' WHERE user_id = $1`, [actor.userId]);
      await this.audit.record(client, {
        action: 'user.deactivated',
        resourceType: 'user',
        resourceId: actor.userId,
      });
    });
    return { status: 'DEACTIVATED' };
  }
}
