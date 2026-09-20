import {
  generateNumericOtp,
  generateSecureToken,
  hashOtp,
  hashPassword,
  maskIdentifier,
  needsRehash,
  sha256Hex,
  timingSafeEqualHex,
  validatePasswordStrength,
  verifyPassword,
} from './index';

describe('password hashing', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('CorrectHorse1');
    expect(hash.startsWith('scrypt$')).toBe(true);
    await expect(verifyPassword('CorrectHorse1', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('produces a different hash per call (random salt)', async () => {
    const [a, b] = await Promise.all([hashPassword('CorrectHorse1'), hashPassword('CorrectHorse1')]);
    expect(a).not.toEqual(b);
  });

  it('flags rehashing when parameters are outdated', async () => {
    const weakHash = await hashPassword('CorrectHorse1', { N: 1024, r: 8, p: 1 });
    await expect(needsRehash(weakHash)).resolves.toBe(true);
    const strongHash = await hashPassword('CorrectHorse1');
    await expect(needsRehash(strongHash)).resolves.toBe(false);
  });

  it('rejects a malformed stored hash without throwing', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
  });
});

describe('tokens and OTP', () => {
  it('generates unique url-safe tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateSecureToken()));
    expect(tokens.size).toBe(50);
  });

  it('generates numeric OTPs of the requested length', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(generateNumericOtp(6)).toMatch(/^\d{6}$/);
    }
  });

  it('hashes OTPs with a pepper (never stores the code)', () => {
    const digest = hashOtp('123456', 'pepper');
    expect(digest).not.toContain('123456');
    expect(digest).toEqual(hashOtp('123456', 'pepper'));
    expect(digest).not.toEqual(hashOtp('123456', 'other-pepper'));
  });
});

describe('utilities', () => {
  it('compares digests in constant time and rejects length mismatch', () => {
    expect(timingSafeEqualHex(sha256Hex('a'), sha256Hex('a'))).toBe(true);
    expect(timingSafeEqualHex(sha256Hex('a'), sha256Hex('b'))).toBe(false);
    expect(timingSafeEqualHex('abc', 'abcd')).toBe(false);
  });

  it('masks identifiers for display', () => {
    expect(maskIdentifier('buyer@example.com')).toBe('bu***@example.com');
    expect(maskIdentifier('+919876543210')).toBe('********3210');
  });

  it('enforces the password policy', () => {
    expect(validatePasswordStrength('Str0ngPass').valid).toBe(true);
    expect(validatePasswordStrength('short').valid).toBe(false);
    expect(validatePasswordStrength('alllettersonly').valid).toBe(false);
    expect(validatePasswordStrength('password123').valid).toBe(false);
  });
});
