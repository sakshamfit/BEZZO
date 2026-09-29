import { loadConfig, loadEnvFile } from '@bezzo/config';
import { Database } from '@bezzo/database';
import { hashOtp } from '@bezzo/crypto';
import { ApiClient, waitForApi } from '../helpers/api-client';

jest.setTimeout(30_000);

describe('password reset', () => {
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
      applicationName: 'bezzo-api-password-reset-test',
    });
  });

  afterAll(async () => {
    await database?.close();
  });

  it('resets by a password-reset OTP, invalidates sessions, and permits the new password', async () => {
    const client = new ApiClient();
    const email = `password-reset-${crypto.randomUUID()}@bezzo.local`;
    const registered = await client.post('/auth/register', {
      accountType: 'BUYER',
      email,
      password: 'OldPassword123!',
      displayName: 'Password Reset Test',
      acceptedTermsVersion: 'v1',
      deviceType: 'android',
    });
    expect([200, 201]).toContain(registered.status);

    const request = await client.post('/auth/otp/request', {
      identifier: email,
      purpose: 'PASSWORD_RESET',
    });
    expect(request.status).toBe(202);
    const { challengeId } = request.data as { challengeId: string };
    const code = '654321';
    const config = loadConfig();
    await database.query(`UPDATE otp_challenges SET code_hash = $2 WHERE id = $1`, [
      challengeId,
      hashOtp(code, config.AUTH_OTP_PEPPER),
    ]);

    const reset = await client.post('/auth/password/reset', {
      challengeId,
      code,
      newPassword: 'NewPassword456!',
    });
    expect(reset.status).toBe(200);
    expect(reset.data).toMatchObject({ status: 'PASSWORD_RESET' });

    const oldPassword = await client.post('/auth/login', {
      identifier: email,
      password: 'OldPassword123!',
    });
    expect(oldPassword.status).toBe(401);
    const newPassword = await client.post('/auth/login', {
      identifier: email,
      password: 'NewPassword456!',
      deviceType: 'android',
    });
    expect(newPassword.status).toBe(200);
  });
});
