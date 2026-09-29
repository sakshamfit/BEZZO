import { loadConfig } from '@bezzo/config';
import { clearWebRefreshCookie, readWebRefreshCookie, webRefreshCookie } from './refresh-cookie';

const baseEnv = {
  DATABASE_URL: 'postgresql://localhost:5432/bezzo_test',
  JWT_ACCESS_SECRET: 'access-secret-value-1234567890',
  JWT_REFRESH_SECRET: 'refresh-secret-value-1234567890',
  AUTH_OTP_PEPPER: 'otp-pepper',
};

describe('web refresh cookie', () => {
  it('writes a scoped HttpOnly SameSite cookie with Secure in production', () => {
    const config = { ...loadConfig({ source: baseEnv }), NODE_ENV: 'production' as const };
    const cookie = webRefreshCookie('secret token', config);

    expect(cookie).toContain('bezzo_refresh=secret%20token');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain(`Max-Age=${config.JWT_REFRESH_TTL_SECONDS}`);
    expect(clearWebRefreshCookie(config)).toContain('Max-Age=0');
  });

  it('reads the named cookie without accepting malformed percent encoding', () => {
    expect(readWebRefreshCookie('other=x; bezzo_refresh=abc%20123; mode=web')).toBe('abc 123');
    expect(readWebRefreshCookie('bezzo_refresh=%E0%A4%A')).toBeNull();
    expect(readWebRefreshCookie('other=abc')).toBeNull();
  });
});
