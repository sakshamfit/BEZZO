import { loadConfig, tryLoadConfig } from './index';
import { dirname, resolve } from 'node:path';
import { resolveEnvFile } from './env-file';

const baseEnv = {
  DATABASE_URL: 'postgresql://localhost:5432/bezzo_test',
  JWT_ACCESS_SECRET: 'access-secret-value-1234567890',
  JWT_REFRESH_SECRET: 'refresh-secret-value-1234567890',
  AUTH_OTP_PEPPER: 'otp-pepper',
  CORS_ALLOWED_ORIGINS: 'https://app.bezzo.in',
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

  it('resolves a relative database CA path from the discovered env file', () => {
    const relativePath = '.secrets/supabase-root.crt';
    const envFile = resolveEnvFile();
    const config = loadConfig({ source: { ...baseEnv, DATABASE_SSL_CA_CERT_PATH: relativePath } });
    expect(config.DATABASE_SSL_CA_CERT_PATH).toBe(
      resolve(dirname(envFile ?? process.cwd()), relativePath),
    );
  });

  it('rejects a missing database URL', () => {
    expect(() =>
      loadConfig({
        source: {
          JWT_ACCESS_SECRET: baseEnv.JWT_ACCESS_SECRET,
          JWT_REFRESH_SECRET: baseEnv.JWT_REFRESH_SECRET,
          AUTH_OTP_PEPPER: 'x',
        },
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('refuses default JWT secrets in production', () => {
    expect(() =>
      loadConfig({
        source: {
          ...baseEnv,
          NODE_ENV: 'production',
          JWT_ACCESS_SECRET: 'change-me-access-secret',
          DATABASE_SSL: 'true',
          STORAGE_DRIVER: 's3',
        },
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

  it('refuses a default refresh secret even when the access secret is set', () => {
    expect(() =>
      loadConfig({
        source: {
          ...baseEnv,
          NODE_ENV: 'production',
          JWT_REFRESH_SECRET: 'change-me-refresh-secret',
          DATABASE_SSL: 'true',
          STORAGE_DRIVER: 's3',
          PAYMENTS_PROVIDER: 'razorpay',
          RAZORPAY_KEY_ID: 'key',
          RAZORPAY_KEY_SECRET: 'secret',
          RAZORPAY_WEBHOOK_SECRET: 'webhook',
        },
      }),
    ).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('requires exact HTTPS CORS origins in production', () => {
    expect(() =>
      loadConfig({
        source: {
          ...baseEnv,
          NODE_ENV: 'production',
          DATABASE_SSL: 'true',
          STORAGE_DRIVER: 's3',
          CORS_ALLOWED_ORIGINS: '*',
        },
      }),
    ).toThrow(/CORS origins must be exact HTTPS origins/);
  });

  it('refuses mock or unimplemented payment providers in production', () => {
    expect(() =>
      loadConfig({
        source: {
          ...baseEnv,
          NODE_ENV: 'production',
          DATABASE_SSL: 'true',
          STORAGE_DRIVER: 's3',
          PAYMENTS_PROVIDER: 'mock',
          RAZORPAY_KEY_ID: undefined,
          RAZORPAY_KEY_SECRET: undefined,
          RAZORPAY_WEBHOOK_SECRET: undefined,
        },
      }),
    ).toThrow(/Production requires the implemented live Razorpay provider/);
  });

  it('requires an opensearch node when search is enabled', () => {
    expect(() => loadConfig({ source: { ...baseEnv, SEARCH_ENABLED: 'true' } })).toThrow(
      /OPENSEARCH_NODE/,
    );
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

  it('requires real email and SMS delivery providers in production', () => {
    expect(() =>
      loadConfig({
        source: {
          ...baseEnv,
          NODE_ENV: 'production',
          DATABASE_SSL: 'true',
          STORAGE_DRIVER: 's3',
          PAYMENTS_PROVIDER: 'razorpay',
          RAZORPAY_KEY_ID: 'key',
          RAZORPAY_KEY_SECRET: 'secret',
          RAZORPAY_WEBHOOK_SECRET: 'webhook',
        },
      }),
    ).toThrow(/Production OTP delivery requires email notifications/);

    expect(() =>
      loadConfig({
        source: {
          ...baseEnv,
          NODE_ENV: 'production',
          DATABASE_SSL: 'true',
          STORAGE_DRIVER: 's3',
          PAYMENTS_PROVIDER: 'razorpay',
          RAZORPAY_KEY_ID: 'key',
          RAZORPAY_KEY_SECRET: 'secret',
          RAZORPAY_WEBHOOK_SECRET: 'webhook',
          NOTIFICATIONS_EMAIL_ENABLED: 'true',
          EMAIL_PROVIDER_API_KEY: 'email-key',
          EMAIL_FROM: 'security@bezzo.in',
        },
      }),
    ).toThrow(/Production OTP delivery requires SMS notifications/);

    const config = loadConfig({
      source: {
        ...baseEnv,
        NODE_ENV: 'production',
        DATABASE_SSL: 'true',
        STORAGE_DRIVER: 's3',
        REDIS_URL: 'redis://cache.internal:6379',
        REDIS_REQUIRED: 'true',
        PAYMENTS_PROVIDER: 'razorpay',
        RAZORPAY_KEY_ID: 'key',
        RAZORPAY_KEY_SECRET: 'secret',
        RAZORPAY_WEBHOOK_SECRET: 'webhook',
        NOTIFICATIONS_EMAIL_ENABLED: 'true',
        EMAIL_PROVIDER_API_KEY: 'email-key',
        EMAIL_FROM: 'security@bezzo.in',
        NOTIFICATIONS_SMS_ENABLED: 'true',
        SMS_PROVIDER_ACCOUNT_ID: 'TWILIO_TEST_ACCOUNT',
        SMS_PROVIDER_API_KEY: 'sms-token',
        SMS_PROVIDER_FROM: '+919876543210',
      },
    });
    expect(config.NODE_ENV).toBe('production');
    expect(config.WORKER_ENABLED).toBe(true);
  });

  it('degrades gracefully for tooling via tryLoadConfig', () => {
    const { config, warnings } = tryLoadConfig({ source: { NODE_ENV: 'test' } });
    expect(warnings.length).toBeGreaterThan(0);
    expect(config.NODE_ENV).toBe('test');
    expect(config.DATABASE_URL).toContain('bezzo_local');
  });
});
