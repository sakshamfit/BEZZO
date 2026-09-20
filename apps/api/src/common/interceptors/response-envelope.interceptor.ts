/**
 * Wraps every successful response in the BEZZO envelope `{ success, data, meta }`
 * (API spec §7). Routes that already return an envelope (health, webhooks) opt out.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { getRequestContext } from '../context/request-context';

export interface EnvelopedResponse<T> {
  success: true;
  data: T;
  meta: Record<string, unknown>;
}

/** Marker interface: a handler returning this object is passed through untouched. */
export interface RawResponse {
  __bezzoRaw: true;
}

export function rawResponse<T>(payload: T): T & RawResponse {
  return Object.assign(payload as object, { __bezzoRaw: true as const }) as T & RawResponse;
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && '__bezzoRaw' in (data as Record<string, unknown>)) {
          const { __bezzoRaw, ...rest } = data as Record<string, unknown>;
          void __bezzoRaw;
          return rest;
        }
        const context = getRequestContext();
        const meta: Record<string, unknown> = { requestId: context?.requestId ?? null };
        if (context?.correlationId) meta.correlationId = context.correlationId;

        // Paginated service results carry their own meta → lift it into the envelope.
        if (
          data &&
          typeof data === 'object' &&
          'items' in (data as Record<string, unknown>) &&
          'pagination' in (data as Record<string, unknown>)
        ) {
          const { items, pagination, ...rest } = data as {
            items: unknown;
            pagination: unknown;
          } & Record<string, unknown>;
          return {
            success: true,
            data: items,
            meta: { ...meta, pagination, ...rest },
          };
        }

        return { success: true, data: data ?? null, meta };
      }),
    );
  }
}
