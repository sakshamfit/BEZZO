/**
 * Idempotency interceptor.
 *
 * Routes decorated with `@Idempotent(operation?)` require an `Idempotency-Key` header. The interceptor
 * is the enforcement point that turns the `idempotency_keys` table into observable behaviour:
 *
 *  - a first request inserts an `IN_PROGRESS` record and executes normally;
 *  - a retry that arrives while the first is still running gets `IDEMPOTENCY_KEY_CONFLICT` (409)
 *    instead of duplicating the side effect;
 *  - a retry after completion replays the stored response body and status byte-for-byte;
 *  - reusing the same key with a *different* body is rejected by `IdempotencyService.begin`;
 *  - a failed attempt deletes its record so the client can legitimately retry the same key.
 *
 * Ordering note: this interceptor is registered *after* `ResponseEnvelopeInterceptor`, so on the way
 * out it sees the raw handler payload (before the `{ success, data, meta }` envelope is applied) and
 * stores that. A replay therefore passes through the envelope interceptor again and the client cannot
 * tell a replayed 201 from a first-execution 201, apart from the per-request `requestId`.
 */
import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Observable, of, from, lastValueFrom } from 'rxjs';
import { ErrorCode } from '@bezzo/contracts';
import { DomainError } from '../errors/domain-error';
import { getRequestContext } from '../context/request-context';
import { IDEMPOTENT_KEY } from '../decorators';
import { IdempotencyService } from '../../infrastructure/idempotency/idempotency.service';

interface IdempotentMetadata {
  operation: string | null;
}

interface RawRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  routeOptions?: { url?: string };
}

const MAX_KEY_LENGTH = 255;
const MIN_KEY_LENGTH = 8;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const metadata = this.reflector.getAllAndOverride<IdempotentMetadata | undefined>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!metadata) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RawRequest>();
    const response = http.getResponse<{ status: (code: number) => unknown }>();

    // Header names are case-insensitive; Fastify lowercases them, but a proxy may not.
    const headerValue = request.headers['idempotency-key'] ?? request.headers['Idempotency-Key'];
    const key = (Array.isArray(headerValue) ? headerValue[0] : headerValue)?.trim();

    if (!key || key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH) {
      throw new DomainError(
        ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        `This operation requires an Idempotency-Key header of ${MIN_KEY_LENGTH}-${MAX_KEY_LENGTH} characters`,
        { details: { operation: this.operationName(metadata, request) } },
      );
    }

    const operation = this.operationName(metadata, request);
    const actor = getRequestContext()?.actor ?? null;

    const begin = await this.idempotency.begin({
      key,
      operation,
      userId: actor?.userId ?? null,
      requestFingerprint: request.body ?? null,
    });

    if (begin.state === 'COMPLETED') {
      response.status(begin.status);
      return of(begin.body);
    }

    if (begin.state === 'IN_PROGRESS') {
      throw new DomainError(
        ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
        'An identical request with this idempotency key is still being processed',
        { details: { operation } },
      );
    }

    try {
      const value = await lastValueFrom(next.handle());
      await this.idempotency.complete(begin.recordId, this.statusFor(context), value ?? null);
      return of(value);
    } catch (error) {
      // Store nothing on failure: the client may retry the same key once the underlying cause is fixed.
      await this.idempotency
        .fail(begin.recordId, error instanceof Error ? error.message : 'unknown failure')
        .catch(() => undefined);
      return from(Promise.reject(error));
    }
  }

  private operationName(metadata: IdempotentMetadata, request: RawRequest): string {
    if (metadata.operation) return metadata.operation;
    const route = request.routeOptions?.url ?? request.url;
    return `${request.method.toUpperCase()} ${route}`;
  }

  /** Mirrors Nest's own status resolution: explicit `@HttpCode`, else POST → 201, everything else 200. */
  private statusFor(context: ExecutionContext): number {
    const explicit = this.reflector.getAllAndOverride<number | undefined>(HTTP_CODE_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (typeof explicit === 'number') return explicit;
    const method = context.switchToHttp().getRequest<RawRequest>().method.toUpperCase();
    return method === 'POST' ? 201 : 200;
  }
}
