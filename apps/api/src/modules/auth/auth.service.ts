/**
 * Authentication service (identity/auth spec).
 *
 * - Registration creates the user, the organization, the role assignment and the business profile
 *   shell for the requested account type (BUYER / SUPPLIER / PICKER);
 * - OTP challenges are stored hashed with a server-side pepper and are single-use with attempts;
 * - Passwords use the scrypt parameters from `@bezzo/crypto` and are upgraded transparently on login
 *   when the algorithm parameters change;
 * - Access tokens are short-lived JWTs; refresh tokens are opaque, stored only as a SHA-256 digest and
 *   ROTATED on every use, with token-family revocation when a rotated token is replayed;
 * - Every authentication outcome is written to `auth_events` for security forensics.
 */
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AppConfig } from '@bezzo/config';
import { ErrorCode, RoleCode, UserStatus, DomainEventName } from '@bezzo/contracts';
import {
  generateNumericOtp,
  generateSecureToken,
  hashOtp,
  hashPassword,
  maskIdentifier,
  needsRehash,
  sha256Hex,
  timingSafeEqualHex,
  validatePasswordStrength,
  verifyPassword,
} from '@bezzo/crypto';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import { APP_CONFIG } from '../../infrastructure/config/config.module';
import { DATABASE } from '../../infrastructure/database/database.module';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { EventBusService } from '../../infrastructure/events/event-bus.service';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { NotificationService } from '../../infrastructure/notifications/notification.service';
import { DomainError } from '../../common/errors/domain-error';
import { getRequestContext } from '../../common/context/request-context';
import type {
  LoginInput,
  RegisterInput,
  RequestOtpInput,
  VerifyOtpInput,
} from './dto/auth.schemas';
import { ROLE_FOR_ACCOUNT_TYPE } from './dto/auth.schemas';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  tokenType: 'Bearer';
  sessionId: string;
}

interface UserRow {
  id: string;
  email: string | null;
  phone: string | null;
  display_name: string;
  password_hash: string | null;
  status: string;
  email_verified_at: Date | null;
  phone_verified_at: Date | null;
  failed_login_count: number;
  locked_until: Date | null;
}

const OTP_TYPES = { EMAIL: 'EMAIL', PHONE: 'PHONE' } as const;

@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: DatabaseType,
    private readonly jwt: JwtService,
    private readonly cache: CacheService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  /* ------------------------------------------------------------------ register */

  async register(input: RegisterInput): Promise<{
    userId: string;
    status: UserStatus;
    verificationRequired: boolean;
  }> {
    const strength = validatePasswordStrength(input.password, this.config.AUTH_PASSWORD_MIN_LENGTH);
    if (!strength.valid) {
      throw new DomainError(
        ErrorCode.WEAK_PASSWORD,
        'The password does not meet the security policy',
        {
          httpStatus: 422,
          details: { violations: strength.errors },
        },
      );
    }

    const email = input.email ?? null;
    const phone = input.phone ?? null;

    if (email) {
      const existing = await this.database.row<{ id: string }>(
        `SELECT id FROM users WHERE email_normalized = lower($1) AND deleted_at IS NULL`,
        [email],
      );
      if (existing) {
        throw new DomainError(
          ErrorCode.IDENTIFIER_ALREADY_REGISTERED,
          'An account already exists for this email',
        );
      }
    }
    if (phone) {
      const existing = await this.database.row<{ id: string }>(
        `SELECT id FROM users WHERE phone = $1 AND deleted_at IS NULL`,
        [phone],
      );
      if (existing) {
        throw new DomainError(
          ErrorCode.IDENTIFIER_ALREADY_REGISTERED,
          'An account already exists for this phone number',
        );
      }
    }

    const passwordHash = await hashPassword(input.password);
    const roleCode = ROLE_FOR_ACCOUNT_TYPE[input.accountType];
    const organizationType =
      input.accountType === 'SUPPLIER' ? 'SUPPLIER_ORGANIZATION' : 'BUYER_ORGANIZATION';

    const created = await this.database.transaction(async (client) => {
      const userResult = await client.query<{ id: string }>(
        `INSERT INTO users (email, phone, display_name, password_hash, password_updated_at, status,
                            terms_accepted_at, terms_version, email_verified_at, phone_verified_at)
         VALUES ($1, $2, $3, $4, now(), 'PENDING', now(), $5, NULL, NULL)
         RETURNING id`,
        [email, phone, input.displayName, passwordHash, input.acceptedTermsVersion ?? 'v1'],
      );
      const userId = userResult.rows[0]?.id;
      if (!userId) throw new Error('Failed to create user');

      let pickerHomeHubId: string | null = null;
      if (input.accountType === 'PICKER') {
        // Consume the operations-issued invite atomically so concurrent registrations cannot reuse it.
        const invite = await client.query<{ home_hub_id: string | null }>(
          `UPDATE picker_invites
              SET used_at = now(), used_by = $2
            WHERE code = $1 AND role = 'PICKER' AND used_at IS NULL AND expires_at > now()
            RETURNING home_hub_id`,
          [input.inviteCode, userId],
        );
        if (!invite.rows[0]) {
          throw new DomainError(
            ErrorCode.VALIDATION_FAILED,
            'This picker invite code is invalid or has expired',
            {
              httpStatus: 422,
            },
          );
        }
        pickerHomeHubId = invite.rows[0].home_hub_id;
      }

      let organizationId: string | null = null;
      if (input.accountType !== 'PICKER') {
        const organizationResult = await client.query<{ id: string }>(
          `INSERT INTO organizations (type, name) VALUES ($1, $2) RETURNING id`,
          [organizationType, input.businessName ?? input.displayName],
        );
        organizationId = organizationResult.rows[0]?.id ?? null;
        if (organizationId) {
          await client.query(
            `INSERT INTO organization_members (organization_id, user_id, membership_status, is_primary_contact, joined_at)
             VALUES ($1, $2, 'ACTIVE', TRUE, now())`,
            [organizationId, userId],
          );
        }
      }

      const role = await client.query<{ id: string }>(`SELECT id FROM roles WHERE code = $1`, [
        roleCode,
      ]);
      if (!role.rows[0]?.id) {
        throw new Error(
          `Role ${roleCode} is missing — run the reference seed before starting the API`,
        );
      }
      await client.query(
        `INSERT INTO user_roles (user_id, role_id, organization_id, granted_at) VALUES ($1, $2, $3, now())`,
        [userId, role.rows[0].id, organizationId],
      );

      if (input.accountType === 'BUYER') {
        await client.query(
          `INSERT INTO buyers (user_id, organization_id, business_name, store_name, status, verification_status)
           VALUES ($1, $2, $3, $4, 'PENDING_VERIFICATION', 'REGISTERED')`,
          [
            userId,
            organizationId,
            input.businessName ?? input.displayName,
            input.businessName ?? input.displayName,
          ],
        );
        await client.query(
          `INSERT INTO buyer_settings (buyer_id) SELECT id FROM buyers WHERE user_id = $1
           ON CONFLICT (buyer_id) DO NOTHING`,
          [userId],
        );
      }

      if (input.accountType === 'SUPPLIER') {
        await client.query(
          `INSERT INTO suppliers (user_id, organization_id, legal_name, display_name, status, verification_status)
           VALUES ($1, $2, $3, $3, 'REGISTERED', 'REGISTERED')`,
          [userId, organizationId, input.businessName ?? input.displayName],
        );
      }

      if (input.accountType === 'PICKER') {
        const fallbackHub = pickerHomeHubId
          ? null
          : await client.query<{ id: string }>(
              `SELECT id FROM collection_hubs ORDER BY code LIMIT 1`,
            );
        const hubId = pickerHomeHubId ?? fallbackHub?.rows[0]?.id ?? null;
        await client.query(
          `INSERT INTO pickers (user_id, employee_code, status, phone, home_hub_id)
           VALUES ($1, $2, 'OFFLINE', $3, $4)`,
          [userId, `PEND-${userId.slice(0, 8)}`, phone, hubId],
        );
      }

      await client.query(
        `INSERT INTO account_status_history (user_id, from_status, to_status, reason, actor_type)
         VALUES ($1, NULL, 'PENDING', 'Registration', 'USER')`,
        [userId],
      );

      await this.events.emit(client, {
        eventName: DomainEventName.UserRegistered,
        aggregateType: 'user',
        aggregateId: userId,
        payload: { accountType: input.accountType, role: roleCode, organizationId },
      });
      await this.audit.record(client, {
        action: 'user.registered',
        resourceType: 'user',
        resourceId: userId,
        metadata: { accountType: input.accountType, role: roleCode },
      });

      return { userId, organizationId };
    });

    return { userId: created.userId, status: UserStatus.PENDING, verificationRequired: true };
  }

  /* ----------------------------------------------------------------------- OTP */

  async requestOtp(input: RequestOtpInput): Promise<{
    challengeId: string;
    expiresInSeconds: number;
    destinationMasked: string;
    devOtp: string | null;
  }> {
    const identifier = this.normalizeIdentifier(input.identifier);

    // Rate limit per identifier before touching the database (api spec §9).
    const attempts = await this.cache.increment(`otp:rate:${identifier}`, 3600);
    if (attempts > 10) {
      throw new DomainError(
        ErrorCode.RATE_LIMIT_EXCEEDED,
        'Too many OTP requests. Please try again later.',
      );
    }

    const user = await this.database.row<{ id: string; status: string }>(
      `SELECT id, status FROM users
        WHERE (email_normalized = lower($1) OR phone = $1) AND deleted_at IS NULL
        LIMIT 1`,
      [identifier],
    );

    if (!user) {
      // Never disclose whether an account exists: the response shape is identical.
      return {
        challengeId: '00000000-0000-0000-0000-000000000000',
        expiresInSeconds: this.config.AUTH_OTP_TTL_SECONDS,
        destinationMasked: maskIdentifier(identifier),
        devOtp: null,
      };
    }

    return this.createOtpChallenge({ userId: user.id, identifier, purpose: input.purpose });
  }

  private async createOtpChallenge(input: {
    userId: string;
    identifier: string;
    purpose: RequestOtpInput['purpose'];
  }): Promise<{
    challengeId: string;
    expiresInSeconds: number;
    destinationMasked: string;
    devOtp: string | null;
  }> {
    const code = generateNumericOtp(6);
    const identifierType = input.identifier.includes('@') ? OTP_TYPES.EMAIL : OTP_TYPES.PHONE;

    const inserted = await this.database.row<{ id: string }>(
      `INSERT INTO otp_challenges (user_id, identifier, identifier_type, purpose, code_hash, max_attempts, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 || ' seconds')::INTERVAL)
       RETURNING id`,
      [
        input.userId,
        input.identifier,
        identifierType,
        input.purpose,
        hashOtp(code, this.config.AUTH_OTP_PEPPER),
        this.config.AUTH_OTP_MAX_ATTEMPTS,
        String(this.config.AUTH_OTP_TTL_SECONDS),
      ],
    );
    const challengeId = inserted?.id;
    if (!challengeId) throw new Error('Failed to create OTP challenge');

    await this.notifications.queue(this.database, {
      userId: input.userId,
      type: `auth.otp.${input.purpose.toLowerCase()}`,
      title: 'Your BEZZO verification code',
      body: `Your BEZZO verification code is ${code}. It expires in ${Math.round(
        this.config.AUTH_OTP_TTL_SECONDS / 60,
      )} minutes. Never share this code with anyone.`,
      channels: [identifierType === OTP_TYPES.EMAIL ? 'EMAIL' : 'SMS'],
      referenceType: 'otp_challenge',
      referenceId: challengeId,
    });

    return {
      challengeId,
      expiresInSeconds: this.config.AUTH_OTP_TTL_SECONDS,
      destinationMasked: maskIdentifier(input.identifier),
      devOtp: this.config.AUTH_OTP_DEV_ECHO ? code : null,
    };
  }

  async verifyOtp(input: VerifyOtpInput): Promise<{
    tokens: IssuedTokens | null;
    userId: string;
    purpose: string;
    verified: boolean;
  }> {
    const challenge = await this.database.row<{
      id: string;
      user_id: string | null;
      identifier: string;
      identifier_type: string;
      purpose: string;
      code_hash: string;
      attempts: number;
      max_attempts: number;
      consumed_at: Date | null;
      expires_at: Date;
    }>(
      `SELECT id, user_id, identifier, identifier_type, purpose, code_hash, attempts, max_attempts, consumed_at, expires_at
         FROM otp_challenges WHERE id = $1`,
      [input.challengeId],
    );

    if (!challenge || challenge.consumed_at) {
      throw new DomainError(ErrorCode.INVALID_OTP, 'This verification code is not valid');
    }
    if (challenge.expires_at.getTime() < Date.now()) {
      throw new DomainError(ErrorCode.OTP_EXPIRED, 'This verification code has expired');
    }
    if (challenge.attempts >= challenge.max_attempts) {
      throw new DomainError(
        ErrorCode.OTP_ATTEMPTS_EXCEEDED,
        'Too many incorrect attempts for this code',
      );
    }

    const expected = hashOtp(input.code, this.config.AUTH_OTP_PEPPER);
    if (!timingSafeEqualHex(expected, challenge.code_hash)) {
      await this.database.query(
        `UPDATE otp_challenges
            SET attempts = LEAST(attempts + 1, max_attempts)
          WHERE id = $1
            AND consumed_at IS NULL
            AND expires_at > now()
            AND attempts < max_attempts`,
        [challenge.id],
      );
      await this.recordAuthEvent({
        userId: challenge.user_id,
        identifier: challenge.identifier,
        eventType: 'otp.verify',
        success: false,
        reason: 'INVALID_CODE',
      });
      throw new DomainError(ErrorCode.INVALID_OTP, 'This verification code is not valid');
    }

    await this.database.transaction(async (client) => {
      // Claim the challenge with one conditional write. Under READ COMMITTED, concurrent requests
      // serialize on this row; after the winner commits, every loser rechecks the predicate and gets
      // no row back, so a one-time code can never create multiple sessions.
      const consumed = await client.query<{ id: string }>(
        `UPDATE otp_challenges
            SET consumed_at = now()
          WHERE id = $1
            AND code_hash = $2
            AND consumed_at IS NULL
            AND expires_at > now()
            AND attempts < max_attempts
          RETURNING id`,
        [challenge.id, expected],
      );

      if (!consumed.rows[0]) {
        // Preserve the specific expired/attempt-limit responses when another concurrent request
        // changed the challenge state. A consumed challenge is always an invalid one-time code.
        const latest = await client.query<{
          consumed_at: Date | null;
          expires_at: Date;
          attempts: number;
          max_attempts: number;
        }>(
          `SELECT consumed_at, expires_at, attempts, max_attempts FROM otp_challenges WHERE id = $1`,
          [challenge.id],
        );
        const current = latest.rows[0];
        if (current && current.expires_at.getTime() <= Date.now()) {
          throw new DomainError(ErrorCode.OTP_EXPIRED, 'This verification code has expired');
        }
        if (current && current.attempts >= current.max_attempts) {
          throw new DomainError(
            ErrorCode.OTP_ATTEMPTS_EXCEEDED,
            'Too many incorrect attempts for this code',
          );
        }
        throw new DomainError(ErrorCode.INVALID_OTP, 'This verification code is not valid');
      }

      if (challenge.identifier_type === OTP_TYPES.EMAIL) {
        await client.query(
          `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), status = 'ACTIVE'
            WHERE id = $1 AND status = 'PENDING'`,
          [challenge.user_id],
        );
      } else {
        await client.query(
          `UPDATE users SET phone_verified_at = COALESCE(phone_verified_at, now()), status = 'ACTIVE'
            WHERE id = $1 AND status = 'PENDING'`,
          [challenge.user_id],
        );
      }

      // The store becomes ACTIVE on contact verification; supplies still require document verification.
      await client.query(
        `UPDATE buyers SET status = 'ACTIVE'
          WHERE user_id = $1 AND status = 'PENDING_VERIFICATION'
            AND (SELECT status FROM users WHERE id = $1) = 'ACTIVE'`,
        [challenge.user_id],
      );

      await client.query(
        `INSERT INTO account_status_history (user_id, from_status, to_status, reason, actor_type)
         SELECT $1, 'PENDING', 'ACTIVE', 'Contact verification completed', 'SYSTEM'
          WHERE EXISTS (SELECT 1 FROM users WHERE id = $1 AND status = 'ACTIVE')`,
        [challenge.user_id],
      );

      if (challenge.user_id) {
        await this.events.emit(client, {
          eventName: DomainEventName.UserActivated,
          aggregateType: 'user',
          aggregateId: challenge.user_id,
          payload: { verifiedChannel: challenge.identifier_type },
        });
      }
    });

    await this.recordAuthEvent({
      userId: challenge.user_id,
      identifier: challenge.identifier,
      eventType: 'otp.verify',
      success: true,
    });

    if (!challenge.user_id) {
      return { tokens: null, userId: '', purpose: challenge.purpose, verified: true };
    }

    if (challenge.purpose === 'LOGIN') {
      const tokens = await this.issueSession({
        user: { id: challenge.user_id },
        deviceName: input.deviceName,
        deviceType: input.deviceType,
        deviceId: input.deviceId,
        authenticationMethod: 'OTP',
      });
      return { tokens, userId: challenge.user_id, purpose: challenge.purpose, verified: true };
    }

    return { tokens: null, userId: challenge.user_id, purpose: challenge.purpose, verified: true };
  }

  /* --------------------------------------------------------------- password login */

  async login(input: LoginInput): Promise<IssuedTokens & { userId: string }> {
    const identifier = this.normalizeIdentifier(input.identifier);
    const user = await this.database.row<UserRow>(
      `SELECT id, email, phone, display_name, password_hash, status, email_verified_at, phone_verified_at,
              failed_login_count, locked_until
         FROM users WHERE (email_normalized = lower($1) OR phone = $1) AND deleted_at IS NULL LIMIT 1`,
      [identifier],
    );

    if (!user || !user.password_hash) {
      // Constant-ish timing: still perform a hash comparison so absence of the account is not
      // distinguishable by response time.
      await verifyPassword(
        input.password,
        'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
      );
      await this.recordAuthEvent({
        userId: null,
        identifier,
        eventType: 'password.login',
        success: false,
        reason: 'UNKNOWN_ACCOUNT',
      });
      throw new DomainError(
        ErrorCode.INVALID_CREDENTIALS,
        'The credentials provided are incorrect',
      );
    }

    if (user.locked_until && user.locked_until.getTime() > Date.now()) {
      throw new DomainError(
        ErrorCode.ACCOUNT_LOCKED,
        'This account is temporarily locked after repeated failed attempts',
        {
          details: { lockedUntil: user.locked_until.toISOString() },
        },
      );
    }
    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      throw new DomainError(ErrorCode.ACCOUNT_DISABLED, 'This account is not permitted to sign in');
    }

    const passwordValid = await verifyPassword(input.password, user.password_hash);
    if (!passwordValid) {
      await this.registerFailedLogin(user.id);
      await this.recordAuthEvent({
        userId: user.id,
        identifier,
        eventType: 'password.login',
        success: false,
        reason: 'BAD_PASSWORD',
      });
      throw new DomainError(
        ErrorCode.INVALID_CREDENTIALS,
        'The credentials provided are incorrect',
      );
    }

    if (user.status === 'PENDING') {
      await this.recordAuthEvent({
        userId: user.id,
        identifier,
        eventType: 'password.login',
        success: false,
        reason: 'CONTACT_NOT_VERIFIED',
      });
      throw new DomainError(
        ErrorCode.ACCOUNT_DISABLED,
        'Verify your registered email or phone before signing in',
      );
    }

    await this.database.query(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`,
      [user.id],
    );

    if (await needsRehash(user.password_hash)) {
      const upgraded = await hashPassword(input.password);
      await this.database.query(
        `UPDATE users SET password_hash = $2, password_updated_at = now() WHERE id = $1`,
        [user.id, upgraded],
      );
    }

    await this.recordAuthEvent({
      userId: user.id,
      identifier,
      eventType: 'password.login',
      success: true,
    });

    const tokens = await this.issueSession({
      user: { id: user.id },
      deviceName: input.deviceName,
      deviceType: input.deviceType,
      deviceId: input.deviceId,
      authenticationMethod: 'PASSWORD',
    });
    return { ...tokens, userId: user.id };
  }

  private async registerFailedLogin(userId: string): Promise<void> {
    const updated = await this.database.row<{ failed_login_count: number }>(
      `UPDATE users SET failed_login_count = failed_login_count + 1 WHERE id = $1 RETURNING failed_login_count`,
      [userId],
    );
    if ((updated?.failed_login_count ?? 0) >= this.config.AUTH_MAX_FAILED_LOGINS) {
      await this.database.query(
        `UPDATE users SET locked_until = now() + ($2 || ' seconds')::INTERVAL WHERE id = $1`,
        [userId, String(this.config.AUTH_LOCKOUT_SECONDS)],
      );
      await this.notifications.queue(this.database, {
        userId,
        type: 'auth.account_locked',
        title: 'Your BEZZO account has been locked',
        body:
          'We detected repeated failed sign-in attempts, so your account is temporarily locked. ' +
          'Reset your password or contact support if this was not you.',
        channels: ['IN_APP', 'EMAIL'],
      });
    }
  }

  /* ----------------------------------------------------- sessions / token rotation */

  async issueSession(input: {
    user: { id: string };
    deviceName?: string;
    deviceType?: string;
    deviceId?: string;
    authenticationMethod: 'PASSWORD' | 'OTP' | 'REFRESH';
    tokenFamilyId?: string;
    rotatesSessionId?: string;
  }): Promise<IssuedTokens> {
    const refreshToken = generateSecureToken(48);
    const refreshHash = sha256Hex(refreshToken);
    const familyId = input.tokenFamilyId ?? crypto.randomUUID();
    const expiresAt = new Date(Date.now() + this.config.JWT_REFRESH_TTL_SECONDS * 1000);
    const context = getRequestContext();

    const session = await this.database.row<{ id: string }>(
      `INSERT INTO sessions (user_id, token_family_id, refresh_token_hash, device_id, device_type, device_name,
                             ip_address, user_agent, authentication_method, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        input.user.id,
        familyId,
        refreshHash,
        input.deviceId ?? null,
        input.deviceType ?? context?.clientPlatform ?? null,
        input.deviceName ?? null,
        context?.ipAddress ?? null,
        context?.userAgent ?? null,
        input.authenticationMethod,
        expiresAt,
      ],
    );
    const sessionId = session?.id;
    if (!sessionId) throw new Error('Failed to create session');

    if (input.rotatesSessionId) {
      await this.database.query(`UPDATE sessions SET replaced_by_session_id = $2 WHERE id = $1`, [
        input.rotatesSessionId,
        sessionId,
      ]);
    }

    const accessToken = await this.jwt.signAsync(
      { sub: input.user.id, sid: sessionId, role: await this.primaryRole(input.user.id) },
      { secret: this.config.JWT_ACCESS_SECRET, expiresIn: this.config.JWT_ACCESS_TTL_SECONDS },
    );

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.config.JWT_ACCESS_TTL_SECONDS,
      refreshTokenExpiresIn: this.config.JWT_REFRESH_TTL_SECONDS,
      tokenType: 'Bearer',
      sessionId,
    };
  }

  /**
   * Rotate a refresh token.
   *
   * Presenting a token that was already rotated means the token leaked: the whole family is revoked
   * and a security event is recorded.
   */
  async refresh(input: {
    refreshToken: string;
    deviceType?: string;
  }): Promise<IssuedTokens & { userId: string }> {
    const hash = sha256Hex(input.refreshToken);
    const session = await this.database.row<{
      id: string;
      user_id: string;
      token_family_id: string;
      revoked_at: Date | null;
      expires_at: Date;
      replaced_by_session_id: string | null;
      user_status: string;
    }>(
      `SELECT s.id, s.user_id, s.token_family_id, s.revoked_at, s.expires_at, s.replaced_by_session_id,
              u.status AS user_status
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.refresh_token_hash = $1`,
      [hash],
    );

    if (!session) {
      throw new DomainError(ErrorCode.INVALID_TOKEN, 'The refresh token is invalid');
    }
    if (session.user_status === 'SUSPENDED' || session.user_status === 'DEACTIVATED') {
      throw new DomainError(ErrorCode.ACCOUNT_DISABLED, 'This account is not permitted to sign in');
    }

    const refreshToken = generateSecureToken(48);
    const refreshHash = sha256Hex(refreshToken);
    const expiresAt = new Date(Date.now() + this.config.JWT_REFRESH_TTL_SECONDS * 1000);
    const context = getRequestContext();
    const rotation = await this.database.transaction(async (client) => {
      // Claim and replace the old session in one transaction. A competing refresh waits on this
      // row; after the winner commits, its conditional UPDATE returns no row and the loser observes
      // the replacement below, preserving the token-family replay response.
      const claimed = await client.query<{ user_id: string; token_family_id: string }>(
        `UPDATE sessions s
            SET revoked_at = now(), revoked_reason = 'ROTATED', last_seen_at = now()
           FROM users u
          WHERE s.id = $1 AND s.refresh_token_hash = $2 AND s.user_id = u.id
            AND s.revoked_at IS NULL AND s.replaced_by_session_id IS NULL AND s.expires_at > now()
            AND u.status NOT IN ('SUSPENDED', 'DEACTIVATED')
          RETURNING s.user_id, s.token_family_id`,
        [session.id, hash],
      );

      if (!claimed.rows[0]) {
        const latest = await client.query<{
          token_family_id: string;
          revoked_at: Date | null;
          revoked_reason: string | null;
          expires_at: Date;
          replaced_by_session_id: string | null;
          user_status: string;
        }>(
          `SELECT s.token_family_id, s.revoked_at, s.revoked_reason, s.expires_at,
                  s.replaced_by_session_id, u.status AS user_status
             FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.id = $1 AND s.refresh_token_hash = $2`,
          [session.id, hash],
        );
        const current = latest.rows[0];
        if (!current) return { kind: 'invalid' as const };

        // ROTATED without a pointer is included for recovery of rows rotated by older versions,
        // which wrote revocation and the child pointer as separate statements.
        if (current.replaced_by_session_id || current.revoked_reason === 'ROTATED') {
          await client.query(
            `UPDATE sessions SET revoked_at = now(), revoked_reason = 'REFRESH_TOKEN_REUSE'
              WHERE token_family_id = $1 AND revoked_at IS NULL`,
            [current.token_family_id],
          );
          return { kind: 'reused' as const, userId: session.user_id };
        }
        if (current.user_status === 'SUSPENDED' || current.user_status === 'DEACTIVATED') {
          return { kind: 'disabled' as const };
        }
        if (current.expires_at.getTime() <= Date.now()) return { kind: 'expired' as const };
        return { kind: 'revoked' as const };
      }

      const child = await client.query<{ id: string }>(
        `INSERT INTO sessions (user_id, token_family_id, refresh_token_hash, device_type, ip_address,
                               user_agent, authentication_method, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'REFRESH', $7)
         RETURNING id`,
        [
          claimed.rows[0].user_id,
          claimed.rows[0].token_family_id,
          refreshHash,
          input.deviceType ?? context?.clientPlatform ?? null,
          context?.ipAddress ?? null,
          context?.userAgent ?? null,
          expiresAt,
        ],
      );
      const childId = child.rows[0]?.id;
      if (!childId) throw new Error('Failed to create rotated session');
      await client.query(`UPDATE sessions SET replaced_by_session_id = $2 WHERE id = $1`, [
        session.id,
        childId,
      ]);
      return { kind: 'rotated' as const, userId: claimed.rows[0].user_id, sessionId: childId };
    });

    if (rotation.kind === 'reused') {
      await this.cache.invalidatePrefix(`actor:${rotation.userId}:`);
      await this.recordAuthEvent({
        userId: rotation.userId,
        identifier: null,
        eventType: 'token.reuse_detected',
        success: false,
        reason: 'ROTATED_TOKEN_REPLAYED',
      });
      throw new DomainError(
        ErrorCode.REFRESH_TOKEN_REUSED,
        'This refresh token was already used. All sessions on this device have been revoked.',
      );
    }
    if (rotation.kind === 'invalid') {
      throw new DomainError(ErrorCode.INVALID_TOKEN, 'The refresh token is invalid');
    }
    if (rotation.kind === 'disabled') {
      throw new DomainError(ErrorCode.ACCOUNT_DISABLED, 'This account is not permitted to sign in');
    }
    if (rotation.kind === 'expired') {
      throw new DomainError(ErrorCode.SESSION_EXPIRED, 'This session has expired');
    }
    if (rotation.kind === 'revoked') {
      throw new DomainError(ErrorCode.SESSION_REVOKED, 'This session has been revoked');
    }

    await this.cache.del(`actor:${rotation.userId}:${session.id}`);
    const accessToken = await this.jwt.signAsync(
      {
        sub: rotation.userId,
        sid: rotation.sessionId,
        role: await this.primaryRole(rotation.userId),
      },
      { secret: this.config.JWT_ACCESS_SECRET, expiresIn: this.config.JWT_ACCESS_TTL_SECONDS },
    );
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.config.JWT_ACCESS_TTL_SECONDS,
      refreshTokenExpiresIn: this.config.JWT_REFRESH_TTL_SECONDS,
      tokenType: 'Bearer',
      sessionId: rotation.sessionId,
      userId: rotation.userId,
    };
  }

  async logout(input: { userId: string; sessionId: string; allSessions?: boolean }): Promise<void> {
    if (input.allSessions) {
      await this.database.query(
        `UPDATE sessions SET revoked_at = now(), revoked_reason = 'USER_LOGOUT_ALL'
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [input.userId],
      );
      await this.cache.invalidatePrefix(`actor:${input.userId}:`);
    } else {
      await this.database.query(
        `UPDATE sessions SET revoked_at = now(), revoked_reason = 'USER_LOGOUT' WHERE id = $1 AND user_id = $2`,
        [input.sessionId, input.userId],
      );
      await this.cache.del(`actor:${input.userId}:${input.sessionId}`);
    }
    await this.audit.record(this.database, {
      action: input.allSessions ? 'auth.logout_all' : 'auth.logout',
      resourceType: 'session',
      resourceId: input.sessionId,
    });
  }

  async listSessions(userId: string, currentSessionId: string) {
    const rows = await this.database.rows<{
      id: string;
      device_name: string | null;
      device_type: string | null;
      ip_address: string | null;
      authentication_method: string;
      created_at: Date;
      last_seen_at: Date;
      expires_at: Date;
    }>(
      `SELECT id, device_name, device_type, host(ip_address) AS ip_address, authentication_method,
              created_at, last_seen_at, expires_at
         FROM sessions
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
        ORDER BY last_seen_at DESC`,
      [userId],
    );
    return rows.map((row) => ({
      id: row.id,
      deviceName: row.device_name,
      deviceType: row.device_type,
      ipAddress: row.ip_address,
      authenticationMethod: row.authentication_method,
      createdAt: row.created_at.toISOString(),
      lastSeenAt: row.last_seen_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      current: row.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.database.query(
      `UPDATE sessions SET revoked_at = now(), revoked_reason = 'USER_REVOKED'
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [sessionId, userId],
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Session not found');
    }
    await this.cache.del(`actor:${userId}:${sessionId}`);
  }

  /* ---------------------------------------------------------------- password change */

  async changePassword(input: {
    userId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    const user = await this.database.row<{ password_hash: string | null }>(
      `SELECT password_hash FROM users WHERE id = $1`,
      [input.userId],
    );
    if (!user?.password_hash) {
      throw new DomainError(
        ErrorCode.INVALID_CREDENTIALS,
        'This account does not use password authentication',
      );
    }
    const valid = await verifyPassword(input.currentPassword, user.password_hash);
    if (!valid) {
      throw new DomainError(ErrorCode.INVALID_CREDENTIALS, 'The current password is incorrect');
    }

    const policy = validatePasswordStrength(
      input.newPassword,
      this.config.AUTH_PASSWORD_MIN_LENGTH,
    );
    if (!policy.valid) {
      throw new DomainError(
        ErrorCode.WEAK_PASSWORD,
        'The new password does not meet the security policy',
        {
          httpStatus: 422,
          details: { violations: policy.errors },
        },
      );
    }

    const history = await this.database.rows<{ password_hash: string }>(
      `SELECT password_hash FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [input.userId],
    );
    for (const entry of history) {
      if (await verifyPassword(input.newPassword, entry.password_hash)) {
        throw new DomainError(
          ErrorCode.WEAK_PASSWORD,
          'This password was used recently. Choose a different password.',
          {
            httpStatus: 422,
          },
        );
      }
    }

    const newHash = await hashPassword(input.newPassword);
    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO password_history (user_id, password_hash)
         SELECT $1, password_hash FROM users WHERE id = $1 AND password_hash IS NOT NULL`,
        [input.userId],
      );
      await client.query(
        `UPDATE users SET password_hash = $2, password_updated_at = now() WHERE id = $1`,
        [input.userId, newHash],
      );
      // A password change revokes every existing session.
      await client.query(
        `UPDATE sessions SET revoked_at = now(), revoked_reason = 'PASSWORD_CHANGED'
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [input.userId],
      );
      await this.audit.record(client, {
        action: 'auth.password_changed',
        resourceType: 'user',
        resourceId: input.userId,
      });
    });
    await this.cache.invalidatePrefix(`actor:${input.userId}:`);
  }

  /** Reset with a single-use contact challenge; all existing sessions are revoked on success. */
  async resetPassword(input: {
    challengeId: string;
    code: string;
    newPassword: string;
  }): Promise<void> {
    const policy = validatePasswordStrength(
      input.newPassword,
      this.config.AUTH_PASSWORD_MIN_LENGTH,
    );
    if (!policy.valid) {
      throw new DomainError(
        ErrorCode.WEAK_PASSWORD,
        'The new password does not meet the security policy',
        {
          httpStatus: 422,
          details: { violations: policy.errors },
        },
      );
    }

    const challenge = await this.database.row<{
      user_id: string | null;
      purpose: string;
      password_hash: string | null;
    }>(
      `SELECT c.user_id, c.purpose, u.password_hash
         FROM otp_challenges c LEFT JOIN users u ON u.id = c.user_id
        WHERE c.id = $1`,
      [input.challengeId],
    );
    if (!challenge?.user_id || challenge.purpose !== 'PASSWORD_RESET') {
      throw new DomainError(ErrorCode.INVALID_OTP, 'This verification code is not valid');
    }

    if (
      challenge.password_hash &&
      (await verifyPassword(input.newPassword, challenge.password_hash))
    ) {
      throw new DomainError(
        ErrorCode.WEAK_PASSWORD,
        'Choose a password you have not used before.',
        {
          httpStatus: 422,
        },
      );
    }
    const history = await this.database.rows<{ password_hash: string }>(
      `SELECT password_hash FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [challenge.user_id],
    );
    for (const entry of history) {
      if (await verifyPassword(input.newPassword, entry.password_hash)) {
        throw new DomainError(
          ErrorCode.WEAK_PASSWORD,
          'This password was used recently. Choose a different password.',
          {
            httpStatus: 422,
          },
        );
      }
    }

    await this.verifyOtp({ challengeId: input.challengeId, code: input.code });
    const newHash = await hashPassword(input.newPassword);
    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO password_history (user_id, password_hash)
         SELECT id, password_hash FROM users WHERE id = $1 AND password_hash IS NOT NULL`,
        [challenge.user_id],
      );
      await client.query(
        `UPDATE users
            SET password_hash = $2, password_updated_at = now(), failed_login_count = 0, locked_until = NULL
          WHERE id = $1`,
        [challenge.user_id, newHash],
      );
      await client.query(
        `UPDATE sessions SET revoked_at = now(), revoked_reason = 'PASSWORD_RESET'
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [challenge.user_id],
      );
      await this.audit.record(client, {
        action: 'auth.password_reset',
        resourceType: 'user',
        resourceId: challenge.user_id,
      });
    });
    await this.cache.invalidatePrefix(`actor:${challenge.user_id}:`);
  }

  /* ------------------------------------------------------------------ principal */

  async buildPrincipal(userId: string, sessionId: string) {
    const row = await this.database.row<{
      id: string;
      email: string | null;
      phone: string | null;
      display_name: string;
      status: string;
      email_verified_at: Date | null;
      phone_verified_at: Date | null;
      last_login_at: Date | null;
      created_at: Date;
      roles: string[] | null;
      permissions: string[] | null;
      organization_id: string | null;
      organization_type: string | null;
      organization_name: string | null;
      supplier_id: string | null;
      supplier_status: string | null;
      supplier_verification_status: string | null;
      buyer_id: string | null;
      buyer_status: string | null;
      picker_id: string | null;
      picker_status: string | null;
    }>(
      `SELECT u.id, u.email, u.phone, u.display_name, u.status, u.email_verified_at, u.phone_verified_at,
              u.last_login_at, u.created_at,
              (SELECT array_agg(DISTINCT r.code) FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id AND ur.revoked_at IS NULL) AS roles,
              (SELECT array_agg(DISTINCT p.code) FROM user_roles ur
                 JOIN role_permissions rp ON rp.role_id = ur.role_id
                 JOIN permissions p ON p.id = rp.permission_id
                WHERE ur.user_id = u.id AND ur.revoked_at IS NULL) AS permissions,
              o.id AS organization_id, o.type AS organization_type, o.name AS organization_name,
              s.id::TEXT AS supplier_id, s.status AS supplier_status, s.verification_status AS supplier_verification_status,
              b.id::TEXT AS buyer_id, b.status AS buyer_status,
              p.id::TEXT AS picker_id, p.status AS picker_status
         FROM users u
         LEFT JOIN organization_members om ON om.user_id = u.id AND om.membership_status = 'ACTIVE'
         LEFT JOIN organizations o ON o.id = om.organization_id
         LEFT JOIN suppliers s ON s.user_id = u.id
         LEFT JOIN buyers b ON b.user_id = u.id
         LEFT JOIN pickers p ON p.user_id = u.id
        WHERE u.id = $1
        LIMIT 1`,
      [userId],
    );
    if (!row) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'User not found');

    const roles = (row.roles ?? []) as RoleCode[];
    const permissions = row.permissions ?? [];

    return {
      id: row.id,
      sessionId,
      email: row.email,
      phone: row.phone,
      displayName: row.display_name,
      status: row.status,
      emailVerified: Boolean(row.email_verified_at),
      phoneVerified: Boolean(row.phone_verified_at),
      roles,
      permissions,
      organization: row.organization_id
        ? { id: row.organization_id, type: row.organization_type, name: row.organization_name }
        : null,
      supplier: row.supplier_id
        ? {
            id: row.supplier_id,
            status: row.supplier_status,
            verificationStatus: row.supplier_verification_status,
          }
        : null,
      buyer: row.buyer_id ? { id: row.buyer_id, status: row.buyer_status } : null,
      picker: row.picker_id ? { id: row.picker_id, status: row.picker_status } : null,
      lastLoginAt: row.last_login_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    };
  }

  /* ------------------------------------------------------------------- helpers */

  private normalizeIdentifier(identifier: string): string {
    const trimmed = identifier.trim();
    if (trimmed.includes('@')) return trimmed.toLowerCase();
    return trimmed.startsWith('+') ? trimmed : `+${trimmed.replace(/^0+/, '')}`;
  }

  private async primaryRole(userId: string): Promise<RoleCode> {
    const row = await this.database.row<{ code: string }>(
      `SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1 AND ur.revoked_at IS NULL
        ORDER BY CASE WHEN r.scope = 'ADMIN' THEN 0 ELSE 1 END, r.code
        LIMIT 1`,
      [userId],
    );
    return (row?.code as RoleCode) ?? RoleCode.BUYER;
  }

  private async recordAuthEvent(input: {
    userId: string | null;
    identifier: string | null;
    eventType: string;
    success: boolean;
    reason?: string;
    sessionId?: string;
  }): Promise<void> {
    const context = getRequestContext();
    await this.database.query(
      `INSERT INTO auth_events (user_id, identifier, event_type, success, reason, session_id, ip_address, user_agent, request_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        input.userId,
        input.identifier ? maskIdentifier(input.identifier) : null,
        input.eventType,
        input.success,
        input.reason ?? null,
        input.sessionId ?? null,
        context?.ipAddress ?? null,
        context?.userAgent ?? null,
        context?.requestId ?? null,
      ],
    );
  }
}
