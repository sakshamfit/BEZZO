/**
 * Establishes the request context (request id, correlation id, client metadata) for every inbound
 * request and echoes the identifiers back on the response (API spec §5.1–§5.3).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ClientPlatform } from '@bezzo/contracts';
import { createRequestContext, enterWithContext } from '../context/request-context';

export function requestContextMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
): void {
  const headers = request.headers as Record<string, string | string[] | undefined>;
  const headerValue = (name: string): string | null => {
    const value = headers[name];
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
  };

  const requestId = headerValue('x-request-id') ?? crypto.randomUUID();
  const correlationId = headerValue('x-correlation-id') ?? requestId;
  const platformHeader = headerValue('x-client-platform');
  const clientPlatform =
    platformHeader && Object.values(ClientPlatform).includes(platformHeader as ClientPlatform)
      ? (platformHeader as ClientPlatform)
      : null;

  const context = createRequestContext({
    requestId,
    correlationId,
    clientPlatform,
    clientVersion: headerValue('x-client-version'),
    ipAddress: request.ip ?? null,
    userAgent: headerValue('user-agent'),
  });

  reply.header('X-Request-ID', requestId);
  reply.header('X-Correlation-ID', correlationId);

  // `enterWith` (not `run`) — the hook returns before the handler executes, so the store must stay
  // attached to this request's async chain for the whole request lifetime.
  enterWithContext(context);
  done();
}
