/**
 * BEZZO centralized configuration.
 *
 * Every runtime (API, workers, database CLI, SSR web) loads configuration through this module so
 * that:
 *   1. missing/invalid configuration fails fast at boot rather than at first request;
 *   2. secrets never appear in source (spec §39);
 *   3. behaviour is environment-specific but code is not.
 */
import { z } from 'zod';

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())));

const integerish = (defaultValue: number) =>
  z
    .union([z.number(), z.string()])
    .default(defaultValue)
    .transform((value, ctx) => {
      const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
      if (Number.isNaN(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Expected an integer, received "${value}"` });
        return z.NEVER;
      }
      return parsed;
    });

export const NodeEnv = {
  DEVELOPMENT: 'development',
  TEST: 'test',
  STAGING: 'staging',
  PRODUCTION: 'production',
} as const;
export type NodeEnv = (typeof NodeEnv)[keyof typeof NodeEnv];

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),

    // ---- Application identity
    APP_NAME: z.string().default('BEZZO'),
    APP_VERSION: z.string().default('1.0.0'),

    // ---- API runtime
    API_PORT: integerish(4000),
    API_HOST: z.string().default('0.0.0.0'),
    API_BASE_PATH: z.string().default('/api/v1'),
    API_PUBLIC_URL: z.string().default('http://localhost:4000'),
    API_BODY_LIMIT_BYTES: integerish(2 * 1024 * 1024),

    // ---- Database
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required — PostgreSQL is the source of truth'),
    DATABASE_POOL_MAX: integerish(20),
    DATABASE_POOL_IDLE_TIMEOUT_MS: integerish(30_000),
    DATABASE_STATEMENT_TIMEOUT_MS: integerish(15_000),
    DATABASE_SSL: booleanish.default(false),
    DATABASE_APPLICATION_NAME: z.string().default('bezzo'),

    // ---- Redis (cache/geo only; PostgreSQL stays authoritative)
    REDIS_URL: z.string().optional(),
    REDIS_REQUIRED: booleanish.default(false),
    REDIS_KEY_PREFIX: z.string().default('bezzo'),

    // ---- Search
    SEARCH_ENABLED: booleanish.default(false),
    OPENSEARCH_NODE: z.string().optional(),
    OPENSEARCH_USERNAME: z.string().optional(),
    OPENSEARCH_PASSWORD: z.string().optional(),
    OPENSEARCH_PRODUCT_INDEX: z.string().default('bezzo-products-v1'),
    /** When OpenSearch is unavailable, browsing degrades to a bounded database query (rule §42). */
    SEARCH_FALLBACK_ENABLED: booleanish.default(true),

    // ---- Storage
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_ROOT: z.string().default('.storage'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('ap-south-1'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: booleanish.default(true),
    STORAGE_SIGNED_URL_TTL_SECONDS: integerish(300),
    /** Public CDN/bucket base URL for catalog media (never used for private compliance documents). */
    CDN_PUBLIC_BASE_URL: z.string().optional(),

    // ---- Auth
    JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
    JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
    JWT_ACCESS_TTL_SECONDS: integerish(900),
    JWT_REFRESH_TTL_SECONDS: integerish(2_592_000),
    AUTH_OTP_PEPPER: z.string().min(8, 'AUTH_OTP_PEPPER is required'),
    AUTH_OTP_TTL_SECONDS: integerish(300),
    AUTH_OTP_MAX_ATTEMPTS: integerish(5),
    AUTH_OTP_DEV_ECHO: booleanish.default(false),
    AUTH_PASSWORD_MIN_LENGTH: integerish(8),
    AUTH_MAX_FAILED_LOGINS: integerish(10),
    AUTH_LOCKOUT_SECONDS: integerish(900),

    // ---- Rate limiting
    RATE_LIMIT_TTL_SECONDS: integerish(60),
    RATE_LIMIT_MAX: integerish(300),
    RATE_LIMIT_AUTH_MAX: integerish(20),

    // ---- Payments
    PAYMENTS_PROVIDER: z.enum(['mock', 'razorpay', 'cashfree']).default('mock'),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    CASHFREE_APP_ID: z.string().optional(),
    CASHFREE_SECRET_KEY: z.string().optional(),
    CASHFREE_WEBHOOK_SECRET: z.string().optional(),

    // ---- Logistics
    LOGISTICS_PROVIDER: z.enum(['manual', 'porter', 'bezzo_fleet']).default('manual'),
    PORTER_API_KEY: z.string().optional(),
    PORTER_API_SECRET: z.string().optional(),
    PORTER_BASE_URL: z.string().default('https://api.porter.in'),
    PORTER_WEBHOOK_SECRET: z.string().optional(),

    // ---- Notifications
    NOTIFICATIONS_ENABLED: booleanish.default(true),
    NOTIFICATIONS_PUSH_ENABLED: booleanish.default(false),
    NOTIFICATIONS_SMS_ENABLED: booleanish.default(false),
    NOTIFICATIONS_EMAIL_ENABLED: booleanish.default(false),
    NOTIFICATIONS_WHATSAPP_ENABLED: booleanish.default(false),
    FCM_PROJECT_ID: z.string().optional(),
    FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),
    SMS_PROVIDER_API_KEY: z.string().optional(),
    EMAIL_SMTP_URL: z.string().optional(),
    WHATSAPP_API_TOKEN: z.string().optional(),

    // ---- Picker operations defaults (runtime overrides live in `configurations`)
    PICKER_OFFER_TIMEOUT_SECONDS: integerish(20),
    PICKER_ASSIGNMENT_RADIUS_KM: integerish(12),
    PICKER_HEARTBEAT_STALE_SECONDS: integerish(120),
    PICKER_DEFAULT_CAPACITY_PACKAGES: integerish(20),
    PICKER_GEOFENCE_RADIUS_METERS: integerish(250),
    PICKER_ALLOW_PARALLEL_OFFERS: booleanish.default(false),
    PICKER_PARALLEL_OFFER_COUNT: integerish(3),

    // ---- Business defaults
    BUSINESS_TIMEZONE: z.string().default('Asia/Kolkata'),
    DEFAULT_CURRENCY: z.string().default('INR'),
    RESERVATION_TTL_SECONDS: integerish(900),
    MARKETPLACE_COMMISSION_PERCENT: z
      .union([z.number(), z.string()])
      .default(8)
      .transform((v) => Number(v)),
    DELIVERY_FEE_DEFAULT: z
      .union([z.number(), z.string()])
      .default(49)
      .transform((v) => Number(v)),
    INSTANT_DELIVERY_SURCHARGE: z
      .union([z.number(), z.string()])
      .default(99)
      .transform((v) => Number(v)),

    // ---- Observability
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    LOG_PRETTY: booleanish.default(false),
    METRICS_ENABLED: booleanish.default(true),
    TRACING_ENABLED: booleanish.default(false),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),

    // ---- Workers/jobs
    WORKER_ENABLED: booleanish.default(true),
    WORKER_POLL_INTERVAL_MS: integerish(2000),
    WORKER_BATCH_SIZE: integerish(50),
    WORKER_MAX_ATTEMPTS: integerish(5),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.JWT_ACCESS_SECRET.includes('change-me')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message: 'Default JWT secrets must never be used in production',
        });
      }
      if (env.AUTH_OTP_DEV_ECHO) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_OTP_DEV_ECHO'],
          message: 'AUTH_OTP_DEV_ECHO must be disabled in production',
        });
      }
      if (env.STORAGE_DRIVER === 'local') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_DRIVER'],
          message: 'Local storage driver is not permitted in production — use S3-compatible storage',
        });
      }
      if (env.DATABASE_SSL === false) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_SSL'],
          message: 'Database TLS must be enabled in production',
        });
      }
    }
    if (env.SEARCH_ENABLED && !env.OPENSEARCH_NODE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENSEARCH_NODE'],
        message: 'OPENSEARCH_NODE is required when SEARCH_ENABLED=true',
      });
    }
    if (env.PAYMENTS_PROVIDER === 'razorpay' && !env.RAZORPAY_KEY_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RAZORPAY_KEY_ID'],
        message: 'RAZORPAY_KEY_ID is required when PAYMENTS_PROVIDER=razorpay',
      });
    }
    if (env.LOGISTICS_PROVIDER === 'porter' && !env.PORTER_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PORTER_API_KEY'],
        message: 'PORTER_API_KEY is required when LOGISTICS_PROVIDER=porter',
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export interface ConfigLoadOptions {
  /** Defaults to `process.env`. */
  source?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  /** When true, invalid configuration throws instead of returning a partially-filled object. */
  strict?: boolean;
}

export interface ConfigLoadResult {
  config: AppConfig;
  warnings: string[];
}

/**
 * Parse and validate configuration. In every environment except `test` an invalid configuration is
 * a fatal boot error: the platform must never start in a half-configured state.
 */
export function loadConfig(options: ConfigLoadOptions = {}): AppConfig {
  const source = options.source ?? process.env;
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid BEZZO configuration:\n${issues}`);
  }
  return result.data;
}

export function tryLoadConfig(options: ConfigLoadOptions = {}): ConfigLoadResult {
  const source = options.source ?? process.env;
  const result = envSchema.safeParse(source);
  if (result.success) {
    return { config: result.data, warnings: [] };
  }
  if (options.strict) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid BEZZO configuration: ${issues}`);
  }
  // Fall back to development-safe defaults so tooling (docs, typecheck) can run without a .env.
  const fallback = envSchema.parse({
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/bezzo_local',
    JWT_ACCESS_SECRET: 'dev-access-secret-not-for-production',
    JWT_REFRESH_SECRET: 'dev-refresh-secret-not-for-production',
    AUTH_OTP_PEPPER: 'dev-otp-pepper',
    ...source,
  });
  return {
    config: fallback,
    warnings: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}

export const isProduction = (config: AppConfig): boolean => config.NODE_ENV === 'production';
export const isTest = (config: AppConfig): boolean => config.NODE_ENV === 'test';
export const isDevelopment = (config: AppConfig): boolean =>
  config.NODE_ENV === 'development' || config.NODE_ENV === 'test';

/** Convenience helper used by scripts that need only the database URL. */
export function requireDatabaseUrl(source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string {
  if (!source.DATABASE_URL) {
    throw new Error('DATABASE_URL is required (see .env.example). PostgreSQL is the source of truth.');
  }
  return source.DATABASE_URL;
}

export { envSchema };
export { loadEnvFile, type LoadEnvFileResult } from './env-file';
