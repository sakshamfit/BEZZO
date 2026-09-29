/**
 * Proves refresh-token rotation against the running API: racing one refresh token may create only one
 * child session, and detection of those replays revokes the complete token family.
 */
import { ApiClient, waitForApi } from '../helpers/api-client';

jest.setTimeout(60_000);

describe('refresh-token rotation concurrency', () => {
  beforeAll(async () => {
    await waitForApi();
  });

  it('creates at most one child session and revokes the family when the old token is replayed', async () => {
    const anonymous = new ApiClient();
    const login = await anonymous.post('/auth/login', {
      identifier: 'buyer1@bezzo.local',
      password: 'Bezzo@12345',
      deviceType: 'android',
    });
    expect(login.status).toBe(200);
    const originalRefreshToken = (login.data as { refreshToken: string }).refreshToken;
    expect(originalRefreshToken).toBeTruthy();

    const attempts = await Promise.all(
      Array.from({ length: 12 }, () =>
        anonymous.post('/auth/refresh', {
          refreshToken: originalRefreshToken,
          deviceType: 'android',
        }),
      ),
    );

    const successful = attempts.filter((response) => response.status === 200);
    const replays = attempts.filter((response) => response.errorCode === 'REFRESH_TOKEN_REUSED');
    expect(successful).toHaveLength(1);
    expect(replays).toHaveLength(11);

    // A losing concurrent presentation is treated as replay under the existing policy, so the
    // successful response's new token is also revoked with the rest of its family.
    const childRefreshToken = (successful[0].data as { refreshToken: string }).refreshToken;
    const afterFamilyRevocation = await anonymous.post('/auth/refresh', {
      refreshToken: childRefreshToken,
    });
    expect(afterFamilyRevocation.status).not.toBe(200);
    expect(afterFamilyRevocation.errorCode).toBe('SESSION_REVOKED');
  });
});
