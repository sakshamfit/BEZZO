/**
 * Proves one-time OTP consumption against PostgreSQL: many simultaneous valid submissions for one
 * challenge may produce exactly one authenticated response.
 */
import { loadConfig, loadEnvFile } from '@bezzo/config';
import { Database } from '@bezzo/database';
import { hashOtp } from '@bezzo/crypto';
import { ApiClient, waitForApi } from '../helpers/api-client';

jest.setTimeout(60_000);

describe('OTP challenge concurrency', () => {
  let database: Database;

  beforeAll(async () => {
    loadEnvFile({ silent: true });
    await waitForApi();
    const config = loadConfig();
    database = new Database({
      connectionString: config.DATABASE_URL,
      ssl: config.DATABASE_SSL,
      sslRejectUnauthorized: config.DATABASE_SSL_REJECT_UNAUTHORIZED,
      sslCaCertPath: config.DATABASE_SSL_CA_CERT_PATH,
      applicationName: 'bezzo-api-otp-concurrency-test',
    });
  });

  afterAll(async () => {
    await database?.close();
  });

  it('allows only one concurrent request to consume and log in with the same OTP', async () => {
    const anonymous = new ApiClient();
    const requested = await anonymous.post('/auth/otp/request', {
      identifier: 'buyer1@bezzo.local',
      purpose: 'LOGIN',
    });
    expect(requested.status).toBe(202);
    const { challengeId } = requested.data as { challengeId: string };
    expect(challengeId).not.toBe('00000000-0000-0000-0000-000000000000');

    // The integration environment controls the persisted digest so the test does not depend on
    // development OTP echo or an external email/SMS transport.
    const code = '654321';
    const config = loadConfig();
    await database.query(`UPDATE otp_challenges SET code_hash = $2 WHERE id = $1`, [
      challengeId,
      hashOtp(code, config.AUTH_OTP_PEPPER),
    ]);

    const attempts = await Promise.all(
      Array.from({ length: 12 }, () =>
        anonymous.post('/auth/otp/verify', {
          challengeId,
          code,
          deviceType: 'web',
        }),
      ),
    );

    expect(attempts.filter((response) => response.status === 200)).toHaveLength(1);
    expect(attempts.filter((response) => response.status !== 200)).toHaveLength(11);
    expect(attempts.filter((response) => response.errorCode === 'INVALID_OTP')).toHaveLength(11);
  });
});
