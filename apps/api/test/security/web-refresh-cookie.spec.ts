import { ApiClient, waitForApi } from '../helpers/api-client';

jest.setTimeout(30_000);

describe('web refresh credential cookie', () => {
  beforeAll(async () => {
    await waitForApi();
  });

  it('keeps the refresh token out of JSON and rotates/clears it through HttpOnly cookie', async () => {
    const anonymous = new ApiClient();
    const login = await anonymous.post('/auth/login', {
      identifier: 'buyer1@bezzo.local',
      password: 'Bezzo@12345',
      deviceType: 'web',
    });

    expect(login.status).toBe(200);
    expect(login.data).not.toHaveProperty('refreshToken');
    expect(login.setCookie).toContain('bezzo_refresh=');
    expect(login.setCookie).toContain('Path=/api/v1/auth');
    expect(login.setCookie).toContain('HttpOnly');
    expect(login.setCookie).toContain('SameSite=Lax');
    const accessToken = (login.data as { accessToken: string }).accessToken;
    const cookiePair = login.setCookie!.split(';', 1)[0]!;

    const refreshed = await anonymous.post(
      '/auth/refresh',
      { deviceType: 'web' },
      { cookie: cookiePair },
    );
    expect(refreshed.status).toBe(200);
    expect(refreshed.data).not.toHaveProperty('refreshToken');
    expect(refreshed.setCookie).toContain('bezzo_refresh=');

    const logout = await new ApiClient(accessToken).post('/auth/logout', { allSessions: false });
    expect(logout.status).toBe(204);
    expect(logout.setCookie).toContain('Max-Age=0');
  });
});
