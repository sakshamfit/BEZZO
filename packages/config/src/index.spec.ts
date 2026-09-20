import { loadConfig, tryLoadConfig } from './index';

const baseEnv = {
  DATABASE_URL: 'postgresql://localhost:5432/bezzo_test',
  JWT_ACCESS_SECRET: 'access-secret-value-1234567890',
  JWT_REFRESH_SECRET: 'refresh-secret-value-1234567890',
  AUTH_OTP_PEPPER: 'otp-pepper',
};

describe('configuration', () => {
  it('applies documented defaults', () => {
    const config = loadConfig({ source: baseEnv });
    expect(config.NODE_ENV).toBe('development');
    expect(config.PICKER_OFFER_TIMEOUT_SECONDS).toBe(20);
    expect(config.BUSINESS_TIMEZONE).toBe('Asia/Kolkata');
    expect(config.DEFAULT_CURRENCY).toBe('INR');
    expect(config.RESERVATION_TTL_SECONDS).toBe(900);
  });

  it('rejects a missing database URL', () => {
    expect(() =>
      loadConfig({ source: { JWT_ACCESS_SECRET: baseEnv.JWT_ACCESS_SECRET, JWT_REFRESH_SECRET: baseEnv.JWT_REFRESH_SECRET, AUTH_OTP_PEPPER: 'x' } }),
    ).toThrow(/DATABASE_URL/);
  });

  it('refuses default JWT secrets in production', () => {
    expect(() =>
      loadConfig({
        source: { ...baseEnv, NODE_ENV: 'production', JWT_ACCESS_SECRET: 'change-me-access-secret', DATABASE_SSL: 'true', STORAGE_DRIVER: 's3' },
      }),
    ).toThrow(/production/i);
  });

  it('requires TLS and object storage in production', () => {
    expect(() =>
      loadConfig({
        source: { ...baseEnv, NODE_ENV: 'production', DATABASE_SSL: 'false', STORAGE_DRIVER: 's3' },
      }),
    ).toThrow(/TLS/);
  });

  it('requires an opensearch node when search is enabled', () => {
    expect(() => loadConfig({ source: { ...baseEnv, SEARCH_ENABLED: 'true' } })).toThrow(/OPENSEARCH_NODE/);
  });

  it('never echoes a dev OTP in production', () => {
    expect(() =>
      loadConfig({
        source: {
          ...baseEnv,
          NODE_ENV: 'production',
          DATABASE_SSL: 'true',
          STORAGE_DRIVER: 's3',
          AUTH_OTP_DEV_ECHO: 'true',
        },
      }),
    ).toThrow(/AUTH_OTP_DEV_ECHO/);
  });

  it('degrades gracefully for tooling via tryLoadConfig', () => {
    const { config, warnings } = tryLoadConfig({ source: { NODE_ENV: 'test' } });
    expect(warnings.length).toBeGreaterThan(0);
    expect(config.NODE_ENV).toBe('test');
    expect(config.DATABASE_URL).toContain('bezzo_local');
  });
});
