import { createHash } from 'node:crypto';
import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '@bezzo/config';
import { ErrorCode } from '@bezzo/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { APP_CONFIG } from '../../infrastructure/config/config.module';
import { DomainError } from '../errors/domain-error';

const EXEMPT_PATHS = new Set(['/health', '/health/live', '/health/ready', '/metrics', '/version']);

@Injectable()
export class IpRateLimitGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    if (request.method.toUpperCase() === 'OPTIONS') return true;

    const path = this.normalizedPath(request.url);
    if (EXEMPT_PATHS.has(path)) return true;

    const ip = request.ip?.trim() || 'unknown';
    const ipHash = createHash('sha256').update(ip).digest('hex');
    await this.enforceLimit({
      key: `rate-limit:global:${ipHash}`,
      max: this.config.RATE_LIMIT_MAX,
      reply,
    });

    if (path === '/auth' || path.startsWith('/auth/')) {
      await this.enforceLimit({
        key: `rate-limit:auth:${ipHash}`,
        max: this.config.RATE_LIMIT_AUTH_MAX,
        reply,
      });
    }

    return true;
  }

  private normalizedPath(url: string): string {
    const path = url.split('?', 1)[0] || '/';
    const basePath = this.config.API_BASE_PATH.replace(/\/+$/, '');
    const withoutBase =
      basePath && (path === basePath || path.startsWith(`${basePath}/`))
        ? path.slice(basePath.length) || '/'
        : path;
    return withoutBase.replace(/\/+$/, '') || '/';
  }

  private async enforceLimit(input: {
    key: string;
    max: number;
    reply: FastifyReply;
  }): Promise<void> {
    const count = await this.cache.increment(input.key, this.config.RATE_LIMIT_TTL_SECONDS);
    const remaining = Math.max(input.max - count, 0);
    input.reply.header('X-RateLimit-Limit', String(input.max));
    input.reply.header('X-RateLimit-Remaining', String(remaining));

    if (count <= input.max) return;

    const ttl = await this.cache.ttl(input.key);
    const retryAfterSeconds = Math.max(ttl, 1);
    input.reply.header('Retry-After', String(retryAfterSeconds));
    throw new DomainError(
      ErrorCode.RATE_LIMIT_EXCEEDED,
      'Too many requests. Please try again later.',
      {
        httpStatus: HttpStatus.TOO_MANY_REQUESTS,
        details: { retryAfterSeconds },
      },
    );
  }
}
