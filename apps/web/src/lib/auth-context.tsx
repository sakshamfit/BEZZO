'use client';

/**
 * Session management for the web client.
 *
 * The access token stays in memory for bearer API calls. The rotating refresh token is held only in
 * an HttpOnly, SameSite cookie set by the same-origin API proxy; it is never exposed to browser JS.
 * A page reload restores the session by rotating that cookie, and a 401 triggers one refresh/retry.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  API_BROWSER_BASE,
  ApiError,
  apiRequest,
  apiRequestEnvelope,
  newIdempotencyKey,
  type ApiRequestOptions,
  type SuccessEnvelope,
} from './api';

export interface Principal {
  id: string;
  sessionId: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  roles: string[];
  permissions: string[];
  organization: { id: string; type: string | null; name: string | null } | null;
  supplier: { id: string; status: string | null; verificationStatus: string | null } | null;
  buyer: { id: string; status: string | null } | null;
  picker: { id: string; status: string | null } | null;
  lastLoginAt: string | null;
  createdAt: string;
}

interface SessionState {
  accessToken: string;
  principal: Principal;
  expiresAt: number;
}

interface SessionResponse {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresIn: number;
  principal: Principal;
}

interface AuthContextValue {
  ready: boolean;
  session: SessionState | null;
  principal: Principal | null;
  signIn: (identifier: string, password: string) => Promise<Principal>;
  signOut: () => Promise<void>;
  refreshPrincipal: () => Promise<void>;
  /**
   * Authenticated request helper: injects the token and transparently refreshes once on 401.
   *
   * The `Idempotency-Key` is created here and reused by both attempts, so a mutation that was
   * interrupted by an expired token can never execute twice on the server.
   */
  request: <T>(path: string, options?: ApiRequestOptions) => Promise<T>;
  /** Same guarantees as `request`, but returns the envelope so list screens can read `meta`. */
  requestEnvelope: <T>(path: string, options?: ApiRequestOptions) => Promise<SuccessEnvelope<T>>;
  hasRole: (...roles: string[]) => boolean;
  hasPermission: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [ready, setReady] = useState(false);
  const sessionRef = useRef<SessionState | null>(null);
  const refreshInFlight = useRef<Promise<SessionState | null> | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Restore from the HttpOnly refresh cookie; no session credential is read from browser storage.
  useEffect(() => {
    let cancelled = false;
    // Remove refresh credentials left by older web builds that persisted them in localStorage.
    try {
      window.localStorage.removeItem('bezzo.session.v1');
    } catch {
      // Session restoration relies on the HttpOnly cookie, not browser storage availability.
    }
    void apiRequest<SessionResponse>('/auth/refresh', {
      method: 'POST',
      body: { deviceType: 'web' },
    })
      .then((data) => {
        if (cancelled) return;
        const restored: SessionState = {
          accessToken: data.accessToken,
          principal: data.principal,
          expiresAt: Date.now() + data.accessTokenExpiresIn * 1000,
        };
        sessionRef.current = restored;
        setSession(restored);
      })
      .catch(() => {
        if (!cancelled) {
          sessionRef.current = null;
          setSession(null);
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: SessionState | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const signIn = useCallback(
    async (identifier: string, password: string): Promise<Principal> => {
      const data = await apiRequest<SessionResponse>('/auth/login', {
        method: 'POST',
        body: { identifier, password, deviceName: 'Bezzo Web', deviceType: 'web' },
      });
      const next: SessionState = {
        accessToken: data.accessToken,
        principal: data.principal,
        expiresAt: Date.now() + data.accessTokenExpiresIn * 1000,
      };
      persist(next);
      return data.principal;
    },
    [persist],
  );

  const signOut = useCallback(async () => {
    const current = sessionRef.current;
    persist(null);
    if (!current) return;
    try {
      await apiRequest('/auth/logout', {
        method: 'POST',
        token: current.accessToken,
        body: { allSessions: false },
      });
    } catch {
      // The session is already cleared locally; a failed revocation is reported by the API's audit log.
    }
  }, [persist]);

  const rotate = useCallback(async (): Promise<SessionState | null> => {
    const current = sessionRef.current;
    if (!current) return null;
    if (refreshInFlight.current) return refreshInFlight.current;

    const promise = (async () => {
      try {
        const data = await apiRequest<SessionResponse>('/auth/refresh', {
          method: 'POST',
          body: { deviceType: 'web' },
        });
        const next: SessionState = {
          accessToken: data.accessToken,
          principal: data.principal,
          expiresAt: Date.now() + data.accessTokenExpiresIn * 1000,
        };
        persist(next);
        return next;
      } catch {
        persist(null);
        return null;
      } finally {
        refreshInFlight.current = null;
      }
    })();

    refreshInFlight.current = promise;
    return promise;
  }, [persist]);

  const requestEnvelope = useCallback(
    async <T,>(path: string, options: ApiRequestOptions = {}): Promise<SuccessEnvelope<T>> => {
      const current = sessionRef.current;
      if (!current) throw new ApiError('AUTH_REQUIRED', 'Please sign in to continue', 401);

      // Refresh slightly ahead of expiry so a user action never fails on an expired token.
      const active = current.expiresAt - 15_000 < Date.now() ? await rotate() : current;
      if (!active)
        throw new ApiError(
          'SESSION_EXPIRED',
          'Your session has expired. Please sign in again.',
          401,
        );

      // One key for both attempts: a 401 retry must not create a second logical operation.
      const idempotencyKey = options.idempotencyKey ?? newIdempotencyKey();

      try {
        return await apiRequestEnvelope<T>(path, {
          ...options,
          token: active.accessToken,
          idempotencyKey,
        });
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.code === 'TOKEN_EXPIRED')) {
          const refreshed = await rotate();
          if (!refreshed) throw error;
          return apiRequestEnvelope<T>(path, {
            ...options,
            token: refreshed.accessToken,
            idempotencyKey,
          });
        }
        throw error;
      }
    },
    [rotate],
  );

  const request = useCallback(
    async <T,>(path: string, options: ApiRequestOptions = {}): Promise<T> =>
      (await requestEnvelope<T>(path, options)).data,
    [requestEnvelope],
  );

  const refreshPrincipal = useCallback(async () => {
    const principal = await request<Principal>('/me');
    const current = sessionRef.current;
    if (current) persist({ ...current, principal });
  }, [persist, request]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      principal: session?.principal ?? null,
      signIn,
      signOut,
      refreshPrincipal,
      request,
      requestEnvelope,
      hasRole: (...roles: string[]) => {
        const held = session?.principal.roles ?? [];
        return roles.some((role) => held.includes(role));
      },
      hasPermission: (...permissions: string[]) => {
        const held = session?.principal.permissions ?? [];
        return permissions.every((permission) => held.includes(permission));
      },
    }),
    [ready, session, signIn, signOut, refreshPrincipal, request],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

export { API_BROWSER_BASE };
