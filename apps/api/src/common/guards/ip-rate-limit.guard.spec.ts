import type { AppConfig } from '@bezzo/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { IpRateLimitGuard } from './ip-rate-limit.guard';
import { DomainError } from '../errors/domain-error';

function makeContext(input: { method?: string; url?: string; ip?: string }) {
  const headers = new Map<string, string>();
  const request = {
    method: input.method ?? 'GET',
    url: input.url ?? '/api/v1/catalog/products',
    ip: input.ip ?? '203.0.113.7',
  } as FastifyRequest;
  const reply = {
    header: (name: string, value: string) => {
      headers.set(name, value);
      return reply;
    },
  } as unknown as FastifyReply;
  return {
    context: {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => reply }),
    } as never,
    headers,
  };
}

function makeGuard(limits: { global: number; auth: number; ttl?: number }) {
  const counts = new Map<string, number>();
  const cache = {
    increment: jest.fn(async (key: string) => {
      const value = (counts.get(key) ?? 0) + 1;
      counts.set(key, value);
      return value;
    }),
    ttl: jest.fn(async () => limits.ttl ?? 37),
  };
  const config = {
    API_BASE_PATH: '/api/v1',
    RATE_LIMIT_TTL_SECONDS: 60,
    RATE_LIMIT_MAX: limits.global,
    RATE_LIMIT_AUTH_MAX: limits.auth,
  } as AppConfig;
  return { guard: new IpRateLimitGuard(config, cache as never), cache };
}

describe('IpRateLimitGuard', () => {
  it('applies the configured global IP limit and sets Retry-After on rejection', async () => {
    const { guard, cache } = makeGuard({ global: 2, auth: 1, ttl: 23 });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { context } = makeContext({});
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }

    const { context, headers } = makeContext({});
    await expect(guard.canActivate(context)).rejects.toMatchObject({ httpStatus: 429 });
    expect(headers.get('Retry-After')).toBe('23');
    expect(headers.get('X-RateLimit-Limit')).toBe('2');
    expect(headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(cache.ttl).toHaveBeenCalledTimes(1);
  });

  it('applies the stricter auth limit after the global limit', async () => {
    const { guard } = makeGuard({ global: 10, auth: 1 });
    const first = makeContext({ url: '/api/v1/auth/login' });
    await expect(guard.canActivate(first.context)).resolves.toBe(true);

    const second = makeContext({ url: '/api/v1/auth/otp/request' });
    await expect(guard.canActivate(second.context)).rejects.toBeInstanceOf(DomainError);
    expect(second.headers.get('Retry-After')).toBe('37');
  });

  it.each(['OPTIONS', 'GET'])('bypasses %s where applicable', async (method) => {
    const { guard, cache } = makeGuard({ global: 0, auth: 0 });
    const url = method === 'GET' ? '/health/ready' : '/api/v1/auth/login';
    const { context } = makeContext({ method, url });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(cache.increment).not.toHaveBeenCalled();
  });

  it.each(['/health', '/health/live', '/health/ready', '/metrics', '/version'])(
    'bypasses %s',
    async (path) => {
      const { guard, cache } = makeGuard({ global: 0, auth: 0 });
      const { context } = makeContext({ url: path });
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(cache.increment).not.toHaveBeenCalled();
    },
  );

  it('keeps distinct IPs in separate buckets and ignores query strings for route matching', async () => {
    const { guard, cache } = makeGuard({ global: 10, auth: 10 });
    const a = makeContext({ url: '/api/v1/auth/login?source=web', ip: '203.0.113.1' });
    const b = makeContext({ url: '/api/v1/auth/login', ip: '203.0.113.2' });
    await guard.canActivate(a.context);
    await guard.canActivate(b.context);
    expect(cache.increment).toHaveBeenCalledTimes(4);
    const keys = cache.increment.mock.calls.map(([key]) => key);
    expect(new Set(keys).size).toBe(4);
    expect(keys.every((key) => !key.includes('203.0.113'))).toBe(true);
  });
});
