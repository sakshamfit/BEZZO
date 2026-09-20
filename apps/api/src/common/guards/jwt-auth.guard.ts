/**
 * Authentication guard.
 *
 * Verifies the bearer access token AND the server-side session. A valid signature is not sufficient:
 * BEZZO re-checks the session on every request so that revocation, suspension and role changes take
 * effect immediately (identity spec §2.2–§2.3: authentication is not authorization).
 */
import { CanActivate, ExecutionContext, Injectable, type OnModuleInit } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';
import { ErrorCode, type RoleCode } from '@bezzo/contracts';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import { DATABASE, InjectDatabase } from '../../infrastructure/database/database.module';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { DomainError } from '../errors/domain-error';
import { setActor, type AuthenticatedActor } from '../context/request-context';
import { IS_PUBLIC_KEY } from '../decorators';

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  role: RoleCode;
  iat: number;
  exp: number;
}

interface ActorRow {
  user_id: string;
  session_id: string;
  user_status: string;
  session_revoked_at: Date | null;
  session_expires_at: Date;
  organization_id: string | null;
  organization_type: string | null;
  roles: string[] | null;
  permissions: string[] | null;
  supplier_id: string | null;
  buyer_id: string | null;
  picker_id: string | null;
  hub_id: string | null;
}

export const ACTOR_CACHE_TTL_SECONDS = 60;

@Injectable()
export class JwtAuthGuard implements CanActivate, OnModuleInit {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly cache: CacheService,
    @InjectDatabase() private readonly database: DatabaseType,
  ) {}

  onModuleInit(): void {
    // no-op: kept for symmetry with other guards that warm caches
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.toLowerCase().startsWith('bearer ') ? header.slice(7) : null;

    if (!token) {
      if (isPublic) return true;
      throw new DomainError(ErrorCode.AUTH_REQUIRED, 'Authentication is required for this resource');
    }

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token);
    } catch (error) {
      const expired = (error as Error).name === 'TokenExpiredError';
      throw new DomainError(
        expired ? ErrorCode.TOKEN_EXPIRED : ErrorCode.INVALID_TOKEN,
        expired ? 'The access token has expired' : 'The access token is invalid',
      );
    }

    const actor = await this.resolveActor(claims);
    setActor(actor);
    return true;
  }

  /** Resolve the actor with roles/permissions, using a short-lived cache to avoid per-request joins. */
  private async resolveActor(claims: AccessTokenClaims): Promise<AuthenticatedActor> {
    const cacheKey = `actor:${claims.sub}:${claims.sid}`;
    const cached = await this.cache.getJson<AuthenticatedActor>(cacheKey);
    if (cached) return cached;

    const row = await this.database.row<ActorRow>(
      `SELECT u.id AS user_id, s.id AS session_id, u.status AS user_status,
              s.revoked_at AS session_revoked_at, s.expires_at AS session_expires_at,
              o.id AS organization_id, o.type AS organization_type,
              (SELECT array_agg(DISTINCT r.code) FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id AND ur.revoked_at IS NULL) AS roles,
              (SELECT array_agg(DISTINCT p.code) FROM user_roles ur
                 JOIN role_permissions rp ON rp.role_id = ur.role_id
                 JOIN permissions p ON p.id = rp.permission_id
                WHERE ur.user_id = u.id AND ur.revoked_at IS NULL) AS permissions,
              (SELECT id::TEXT FROM suppliers WHERE user_id = u.id LIMIT 1) AS supplier_id,
              (SELECT id::TEXT FROM buyers WHERE user_id = u.id LIMIT 1) AS buyer_id,
              (SELECT id::TEXT FROM pickers WHERE user_id = u.id LIMIT 1) AS picker_id,
              (SELECT home_hub_id::TEXT FROM pickers WHERE user_id = u.id LIMIT 1) AS hub_id
         FROM users u
         JOIN sessions s ON s.id = $2::UUID AND s.user_id = u.id
         LEFT JOIN organization_members om ON om.user_id = u.id AND om.membership_status = 'ACTIVE'
         LEFT JOIN organizations o ON o.id = om.organization_id
        WHERE u.id = $1::UUID AND u.deleted_at IS NULL
        LIMIT 1`,
      [claims.sub, claims.sid],
    );

    if (!row) {
      throw new DomainError(ErrorCode.INVALID_TOKEN, 'The session no longer exists');
    }
    if (row.session_revoked_at) {
      throw new DomainError(ErrorCode.SESSION_REVOKED, 'This session has been revoked');
    }
    if (row.session_expires_at.getTime() < Date.now()) {
      throw new DomainError(ErrorCode.SESSION_EXPIRED, 'This session has expired');
    }
    if (row.user_status === 'SUSPENDED' || row.user_status === 'DEACTIVATED') {
      throw new DomainError(ErrorCode.ACCOUNT_DISABLED, 'This account is not permitted to sign in');
    }
    if (row.user_status === 'LOCKED') {
      throw new DomainError(ErrorCode.ACCOUNT_LOCKED, 'This account is locked for security reasons');
    }

    const actor: AuthenticatedActor = {
      userId: row.user_id,
      sessionId: row.session_id,
      roles: (row.roles ?? []) as RoleCode[],
      permissions: row.permissions ?? [],
      organizationId: row.organization_id,
      organizationType: row.organization_type,
      supplierId: row.supplier_id,
      buyerId: row.buyer_id,
      pickerId: row.picker_id,
      hubId: row.hub_id,
    };

    await this.cache.setJson(cacheKey, actor, ACTOR_CACHE_TTL_SECONDS);
    return actor;
  }
}
