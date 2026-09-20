'use client';

/**
 * Session management for the web client.
 *
 * The browser holds the tokens; the API remains the only authority. A 401 triggers exactly one
 * refresh-and-retry, and a failed refresh clears the session so the UI immediately reflects reality.
 *
 * Storage note: tokens live in `localStorage` because the API authenticates with bearer tokens and
 * must also serve the mobile clients. The production hardening path (httpOnly, SameSite=strict
 * refresh cookies issued by the same origin) is recorded in the security specification; nothing in
 * this client is trusted by the API either way.
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
import { API_BROWSER_BASE, ApiError, apiRequest, newIdempotencyKey } from './api';

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
  refreshToken: string;
  principal: Principal;
  expiresAt: number;
}

interface SessionResponse {
  accessToken: string;
  refreshToken: string;
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
  request: <T>(path: string, options?: { method?: string; body?: unknown; idempotencyKey?: string }) => Promise<T>;
  hasRole: (...roles: string[]) => boolean;
  hasPermission: (...permissions: string[]) => boolean;
}

const STORAGE_KEY = 'bezzo.session.v1';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [ready, setReady] = useState(false);
  const sessionRef = useRef<SessionState | null>(null);
  const refreshInFlight = useRef<Promise<SessionState | null> | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Restore a previous session and validate it against the server before showing a signed-in UI.
  useEffect(() => {
    let cancelled = false;
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setReady(true);
      return;
    }
    try {
      const stored = JSON.parse(raw) as SessionState;
      sessionRef.current = stored;
      setSession(stored);
      void apiRequest<Principal>('/me', { token: stored.accessToken })
        .then((principal) => {
          if (cancelled) return;
          const next = { ...stored, principal };
          setSession(next);
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        })
        .catch(() => {
          if (cancelled) return;
          window.localStorage.removeItem(STORAGE_KEY);
          sessionRef.current = null;
          setSession(null);
        })
        .finally(() => {
          if (!cancelled) setReady(true);
        });
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      setReady(true);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: SessionState | null) => {
    sessionRef.current = next;
    setSession(next);
    if (typeof window === 'undefined') return;
    if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const signIn = useCallback(
    async (identifier: string, password: string): Promise<Principal> => {
      const data = await apiRequest<SessionResponse>('/auth/login', {
        method: 'POST',
        body: { identifier, password, deviceName: 'Bezzo Web', deviceType: 'web' },
      });
      const next: SessionState = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
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
      await apiRequest('/auth/logout', { method: 'POST', token: current.accessToken, body: { allSessions: false } });
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
          body: { refreshToken: current.refreshToken, deviceType: 'web' },
        });
        const next: SessionState = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
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

  const request = useCallback(
    async <T,>(path: string, options: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> => {
      const current = sessionRef.current;
      if (!current) throw new ApiError('AUTH_REQUIRED', 'Please sign in to continue', 401);

      // Refresh slightly ahead of expiry so a user action never fails on an expired token.
      const active = current.expiresAt - 15_000 < Date.now() ? await rotate() : current;
      if (!active) throw new ApiError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.', 401);

      // One key for both attempts: a 401 retry must not create a second logical operation.
      const idempotencyKey = options.idempotencyKey ?? newIdempotencyKey();

      try {
        return await apiRequest<T>(path, { ...options, token: active.accessToken, idempotencyKey });
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.code === 'TOKEN_EXPIRED')) {
          const refreshed = await rotate();
          if (!refreshed) throw error;
          return apiRequest<T>(path, { ...options, token: refreshed.accessToken, idempotencyKey });
        }
        throw error;
      }
    },
    [rotate],
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
