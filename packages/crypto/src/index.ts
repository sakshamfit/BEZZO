/**
 * BEZZO cryptography helpers.
 *
 * Password hashing uses scrypt (Node core, no native build step, memory-hard). The stored format is
 * self-describing so the algorithm parameters can be raised over time without inventing a new
 * column:
 *
 *   scrypt$N$r$p$<salt-base64>$<derived-key-base64>
 *
 * Verification is constant-time. `needsRehash` lets the API transparently upgrade a hash when the
 * configured parameters change.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** OWASP-aligned scrypt parameters (N=2^15, r=8, p=1 → ~32 MB per hash). */
export const SCRYPT_PARAMS = { N: 32_768, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEM = 64 * 1024 * 1024;

export interface PasswordHashOptions {
  N?: number;
  r?: number;
  p?: number;
}

export async function hashPassword(
  password: string,
  options: PasswordHashOptions = {},
): Promise<string> {
  const params = { ...SCRYPT_PARAMS, ...options };
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, { ...params, maxmem: MAX_MEM });
  return [
    'scrypt',
    params.N,
    params.r,
    params.p,
    salt.toString('base64'),
    derivedKey.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) return false;
  const derivedKey = await scrypt(password, parsed.salt, parsed.hash.length, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
    maxmem: MAX_MEM,
  });
  return timingSafeEqualHex(derivedKey.toString('base64'), parsed.hash.toString('base64'));
}

export async function needsRehash(storedHash: string): Promise<boolean> {
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) return true;
  return parsed.N < SCRYPT_PARAMS.N || parsed.r < SCRYPT_PARAMS.r || parsed.p < SCRYPT_PARAMS.p;
}

interface ParsedPasswordHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parsePasswordHash(storedHash: string): ParsedPasswordHash | null {
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts as [string, string, string, string, string, string];
  const N = Number.parseInt(nRaw, 10);
  const r = Number.parseInt(rRaw, 10);
  const p = Number.parseInt(pRaw, 10);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return null;
  try {
    return { N, r, p, salt: Buffer.from(saltRaw, 'base64'), hash: Buffer.from(hashRaw, 'base64') };
  } catch {
    return null;
  }
}

/** Strong random token used for refresh tokens and one-time links. */
export function generateSecureToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

/** Numeric OTP with uniform distribution (no modulo bias). */
export function generateNumericOtp(length = 6): string {
  let otp = '';
  for (let index = 0; index < length; index += 1) {
    otp += randomInt(0, 10).toString();
  }
  return otp;
}

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/** OTPs are stored only as a peppered HMAC — a database leak does not reveal live codes. */
export function hashOtp(code: string, pepper: string): string {
  return createHmac('sha256', pepper).update(code).digest('hex');
}

export function hmacHex(payload: string | Buffer, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time comparison for hex/base64 digests of equal length. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function newUuid(): string {
  return randomUUID();
}

/** Mask an email/phone for safe display in API responses and notification copy. */
export function maskIdentifier(identifier: string): string {
  if (identifier.includes('@')) {
    const [local, domain] = identifier.split('@');
    if (!local || !domain) return '***';
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}${'*'.repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
  }
  const digits = identifier.replace(/\D/g, '');
  if (digits.length <= 4) return '*'.repeat(digits.length);
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/** Password policy used by registration and password change (configurable minimum length). */
export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

export function validatePasswordStrength(password: string, minimumLength = 8): PasswordPolicyResult {
  const errors: string[] = [];
  if (password.length < minimumLength) {
    errors.push(`Password must be at least ${minimumLength} characters long`);
  }
  if (!/[A-Za-z]/.test(password)) errors.push('Password must contain a letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain a number');
  const weak = ['password', '12345678', 'qwerty', 'letmein', 'bezzo123'];
  if (weak.some((entry) => password.toLowerCase().includes(entry))) {
    errors.push('Password is too common');
  }
  return { valid: errors.length === 0, errors };
}
