import { registerSchema } from './auth.schemas';

const validBuyer = {
  accountType: 'BUYER',
  email: 'buyer@example.com',
  password: 'GoodPassword1',
  displayName: 'Buyer Name',
  acceptedTermsVersion: 'v1',
};

describe('registerSchema', () => {
  it('requires an explicit terms version', () => {
    const { acceptedTermsVersion: _acceptedTermsVersion, ...withoutTerms } = validBuyer;
    expect(registerSchema.safeParse(withoutTerms).success).toBe(false);
  });

  it('rejects picker registration based only on a caller-supplied employee code', () => {
    const result = registerSchema.safeParse({
      ...validBuyer,
      accountType: 'PICKER',
      employeeCode: 'SELF-ASSIGNED-1',
    });
    expect(result.success).toBe(false);
  });

  it('accepts picker registration with an operations invite code', () => {
    const result = registerSchema.safeParse({
      ...validBuyer,
      accountType: 'PICKER',
      inviteCode: 'issued-by-operations',
    });
    expect(result.success).toBe(true);
  });
});
