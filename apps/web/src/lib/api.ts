/**
 * API client.
 *
 * Two callers exist and they must not share a base URL:
 *  - browser code talks to this app's own origin (`/api/v1/...`) and Next proxies to the API, so no
 *    environment-specific host ever leaks into the client bundle;
 *  - server components talk to the API directly over the private network URL.
 *
 * Every response is unwrapped from the platform envelope, so screens deal in domain data or in a
 * thrown `ApiError` that carries the stable error code, HTTP status and field errors.
 */

export interface EnvelopeMeta {
  requestId?: string;
  correlationId?: string;
  pagination?: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNext?: boolean;
  };
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: EnvelopeMeta;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown> | null;
    fieldErrors?: Array<{ field: string; message: string }> | null;
  };
  meta?: EnvelopeMeta;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown> | null,
    readonly fieldErrors?: Array<{ field: string; message: string }> | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Network/5xx conditions are worth retrying; validation failures are not. */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 429;
  }
}

/** Browser-visible base path. Relative on purpose — see the module comment. */
export const API_BROWSER_BASE = '/api/v1';

/** Server-side base URL (container-to-container). */
export function serverApiBase(): string {
  const host = process.env.BEZZO_API_INTERNAL_URL ?? 'http://127.0.0.1:4000';
  const basePath = process.env.BEZZO_API_BASE_PATH ?? '/api/v1';
  return `${host}${basePath}`;
}

function parseEnvelope<T>(status: number, payload: unknown): T {
  if (payload && typeof payload === 'object' && 'success' in payload) {
    const envelope = payload as SuccessEnvelope<T> | ErrorEnvelope;
    if (envelope.success) return envelope.data;
    throw new ApiError(
      envelope.error.code,
      envelope.error.message,
      status,
      envelope.error.details ?? null,
      envelope.error.fieldErrors ?? null,
    );
  }
  // Non-enveloped responses (proxy errors, HTML error pages) must not be mistaken for data.
  throw new ApiError('UNEXPECTED_RESPONSE', `The API returned an unexpected response (HTTP ${status})`, status);
}

/** Methods the API treats as state-changing; every one of them carries an `Idempotency-Key`. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** `crypto.randomUUID` is unavailable on insecure origins, so a UUIDv4 fallback keeps retries safe. */
export function newIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `bezzo-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Raw JSON request used by the browser; token injection and retries live in the auth provider.
 *
 * Mutating requests get an `Idempotency-Key` automatically. The whole point of the header is that a
 * retried mutation (network drop, double tap, refreshed tab) executes at most once, so the key is
 * generated once here and reused verbatim by any retry of the same call inside the auth provider.
 */
export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null; signal?: AbortSignal; headers?: Record<string, string>; idempotencyKey?: string } = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BROWSER_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const method = (options.method ?? 'GET').toUpperCase();
  const idempotencyKey =
    options.idempotencyKey ??
    options.headers?.['idempotency-key'] ??
    options.headers?.['Idempotency-Key'] ??
    (MUTATING_METHODS.has(method) ? newIdempotencyKey() : null);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        ...(options.headers ?? {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch (error) {
    // A transport failure is surfaced as a first-class error rather than a silent empty state.
    throw new ApiError('NETWORK_ERROR', (error as Error).message || 'The API could not be reached', 0);
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  return parseEnvelope<T>(response.status, payload);
}

/**
 * Server-component fetch. Uses the internal API URL, is never cached (marketplace data is
 * user-specific and price-sensitive), and degrades to `null` so a page can render a truthful
 * "service unavailable" state instead of throwing a 500.
 */
export async function serverGet<T>(
  path: string,
  options: { revalidateSeconds?: number; allowFailure?: boolean; query?: Record<string, string | number | boolean | undefined> } = {},
): Promise<{ data: T; meta?: EnvelopeMeta } | null> {
  const url = new URL(`${serverApiBase()}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  try {
    const response = await fetch(url.toString(), {
      headers: { accept: 'application/json' },
      next: options.revalidateSeconds ? { revalidate: options.revalidateSeconds } : { revalidate: 0 },
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      if (options.allowFailure ?? true) return null;
      return null;
    }
    return payload as { data: T; meta?: EnvelopeMeta };
  } catch {
    return null;
  }
}
