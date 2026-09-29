import type { AppConfig } from '@bezzo/config';

export const WEB_REFRESH_COOKIE = 'bezzo_refresh';

function cookiePath(config: AppConfig): string {
  const basePath = `/${config.API_BASE_PATH.replace(/^\/+|\/+$/g, '')}`;
  return `${basePath === '/' ? '' : basePath}/auth`;
}

function secureAttribute(config: AppConfig): string {
  return config.NODE_ENV === 'development' || config.NODE_ENV === 'test' ? '' : '; Secure';
}

export function readWebRefreshCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== WEB_REFRESH_COOKIE) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim()) || null;
    } catch {
      return null;
    }
  }
  return null;
}

export function webRefreshCookie(value: string, config: AppConfig): string {
  return `${WEB_REFRESH_COOKIE}=${encodeURIComponent(value)}; Path=${cookiePath(config)}; Max-Age=${config.JWT_REFRESH_TTL_SECONDS}; HttpOnly; SameSite=Lax${secureAttribute(config)}`;
}

export function clearWebRefreshCookie(config: AppConfig): string {
  return `${WEB_REFRESH_COOKIE}=; Path=${cookiePath(config)}; Max-Age=0; HttpOnly; SameSite=Lax${secureAttribute(config)}`;
}
