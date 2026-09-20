/**
 * Black-box API client for the integration suite.
 *
 * The integration tests talk to a *booted* API over HTTP rather than booting the Nest application
 * in-process. That is deliberate: the guards, the raw-body capture for webhook signatures, the
 * request-context hook and the global filters are installed by the bootstrap, so an in-process test
 * would exercise a slightly different wiring than the one that ships. Point `BEZZO_API_URL` at the
 * environment under test (default `http://127.0.0.1:4000`).
 */
export const API_URL = process.env.BEZZO_API_URL ?? 'http://127.0.0.1:4000';
export const API_BASE = `${API_URL}/api/v1`;

export interface ApiResponse<T = unknown> {
  status: number;
  body: T & { data?: unknown; error?: { code?: string; message?: string } };
  data: unknown;
  errorCode: string | null;
}

export class ApiClient {
  constructor(private readonly token: string | null = null) {}

  withToken(token: string): ApiClient {
    return new ApiClient(token);
  }

  async request<T = unknown>(
    method: string,
    path: string,
    options: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { 'content-type': 'application/json', ...options.headers };
    if (this.token) headers.authorization = `Bearer ${this.token}`;

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      parsed = { raw: text };
    }
    const error = parsed.error as { code?: string } | undefined;
    return {
      status: response.status,
      body: parsed as ApiResponse<T>['body'],
      data: parsed.data,
      errorCode: error?.code ?? null,
    };
  }

  get(path: string): Promise<ApiResponse> {
    return this.request('GET', path);
  }

  post(path: string, body?: unknown, headers?: Record<string, string>): Promise<ApiResponse> {
    return this.request('POST', path, { body: body ?? {}, headers });
  }

  patch(path: string, body?: unknown): Promise<ApiResponse> {
    return this.request('PATCH', path, { body: body ?? {} });
  }

  delete(path: string): Promise<ApiResponse> {
    return this.request('DELETE', path, { body: {} });
  }
}

export interface Session {
  token: string;
  client: ApiClient;
  userId: string;
  roles: string[];
  permissions: string[];
  buyerId: string | null;
  supplierId: string | null;
  pickerId: string | null;
}

/** Signs in a seeded account. Seeded development passwords are documented in docs/01-local-development.md. */
export async function signIn(identifier: string, password = 'Bezzo@12345'): Promise<Session> {
  const anonymous = new ApiClient();
  const response = await anonymous.post('/auth/login', { identifier, password, deviceType: 'web' });
  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`Sign-in failed for ${identifier}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  const data = response.data as {
    accessToken: string;
    principal: {
      id: string;
      roles: string[];
      permissions: string[];
      buyer: { id: string } | null;
      supplier: { id: string } | null;
      picker: { id: string } | null;
    };
  };
  if (!data.principal || !data.accessToken) {
    throw new Error(`Sign-in response for ${identifier} has no principal: ${JSON.stringify(response.body)}`);
  }
  return {
    token: data.accessToken,
    client: anonymous.withToken(data.accessToken),
    userId: data.principal.id,
    roles: data.principal.roles,
    permissions: data.principal.permissions,
    buyerId: data.principal.buyer?.id ?? null,
    supplierId: data.principal.supplier?.id ?? null,
    pickerId: data.principal.picker?.id ?? null,
  };
}

/**
 * Unique key per call.
 *
 * The API replays a stored response for a repeated key *and* rejects a repeated key that carries a
 * different body with 409, so a test that issues two different commands must issue two different keys.
 * The counter makes every call distinct while keeping the key readable in logs.
 */
export const RUN_ID = `${Date.now()}`;
let keyCounter = 0;
export const idempotencyKey = (name: string): Record<string, string> => ({
  'idempotency-key': `${name}-${RUN_ID}-${++keyCounter}`.slice(0, 255),
});

/** Waits for the API to answer `/health`, so a suite never races the server boot. */
export async function waitForApi(timeoutMs = 30_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      const response = await fetch(`${API_URL}/health`);
      if (response.ok) return;
    } catch {
      // still booting
    }
    if (Date.now() - started > timeoutMs) throw new Error(`API at ${API_URL} did not become healthy`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
