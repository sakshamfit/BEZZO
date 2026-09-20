/**
 * HTTP metrics interceptor — feeds the Prometheus histograms used for the p50/p95/p99 latency SLOs.
 *
 * Route labels use the Nest route pattern (not the raw URL) so cardinality stays bounded.
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Observable, tap } from 'rxjs';
import { MetricsService } from '../../infrastructure/metrics/metrics.service';
import { DomainError } from '../errors/domain-error';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const response = http.getResponse<FastifyReply>();
    const startedAt = process.hrtime.bigint();
    const method = request.method;
    const route = this.resolveRoute(request);

    const record = (statusCode: number): void => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      const status = String(statusCode);
      this.metrics.httpRequests.inc({ method, route, status });
      this.metrics.httpDuration.observe({ method, route, status }, durationSeconds);
    };

    return next.handle().pipe(
      tap({
        next: () => record(response.statusCode),
        error: (error: unknown) => {
          const status =
            error instanceof DomainError
              ? error.httpStatus
              : typeof (error as { status?: number })?.status === 'number'
                ? (error as { status: number }).status
                : 500;
          record(status);
        },
      }),
    );
  }

  private resolveRoute(request: FastifyRequest): string {
    const routeOptions = (request as unknown as { routeOptions?: { url?: string } }).routeOptions;
    if (routeOptions?.url) return routeOptions.url;
    const rawUrl = request.url ?? '/';
    return rawUrl.split('?')[0] ?? '/';
  }
}
