'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, apiRequest } from '../../lib/api';
import { humanise } from '../../lib/format';

type AccountType = 'BUYER' | 'SUPPLIER' | 'PICKER';

const ACCOUNT_TYPES: Array<{ value: AccountType; title: string; body: string }> = [
  {
    value: 'BUYER',
    title: 'Medical store / pharmacy',
    body: 'Buy stock from verified wholesalers. Bring your drug licence and GST details for verification.',
  },
  {
    value: 'SUPPLIER',
    title: 'Wholesaler / distributor',
    body: 'List products, manage stock and receive pickup tasks from Bezzo pickers.',
  },
  {
    value: 'PICKER',
    title: 'Picker / hub staff',
    body: 'Provisioned by Bezzo operations — you need the invite code issued to you.',
  },
];

interface RegisterResponse {
  userId: string;
  status: string;
  verificationRequired: boolean;
  devOtp?: string;
}

interface OtpRequestResponse {
  challengeId: string;
  expiresInSeconds: number;
  destinationMasked: string;
  devOtp?: string;
}

interface OtpVerifyResponse {
  verified: boolean;
  purpose: string;
  userId: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'otp' | 'done'>('form');
  const [accountType, setAccountType] = useState<AccountType>('BUYER');
  const [form, setForm] = useState({
    displayName: '',
    businessName: '',
    email: '',
    phone: '',
    password: '',
    inviteCode: '',
    employeeCode: '',
  });
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [masked, setMasked] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitRegistration(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        accountType,
        displayName: form.displayName.trim(),
        password: form.password,
        acceptedTermsVersion: 'v1',
      };
      if (form.email.trim()) body.email = form.email.trim();
      if (form.phone.trim()) body.phone = form.phone.trim();
      if (accountType !== 'PICKER' && form.businessName.trim()) body.businessName = form.businessName.trim();
      if (accountType === 'PICKER') {
        if (form.inviteCode.trim()) body.inviteCode = form.inviteCode.trim();
        if (form.employeeCode.trim()) body.employeeCode = form.employeeCode.trim();
      }

      await apiRequest<RegisterResponse>('/auth/register', { method: 'POST', body });

      // Registration always issues a contact-verification challenge for the primary identifier.
      const identifier = form.email.trim() || form.phone.trim();
      const challenge = await apiRequest<OtpRequestResponse>('/auth/otp/request', {
        method: 'POST',
        body: { identifier, purpose: form.email.trim() ? 'EMAIL_VERIFY' : 'PHONE_VERIFY' },
      });
      setChallengeId(challenge.challengeId);
      setMasked(challenge.destinationMasked);
      setDevOtp(challenge.devOtp ?? null);
      setStep('otp');
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? `${cause.message}${cause.fieldErrors?.length ? ` (${cause.fieldErrors.map((f) => `${f.field}: ${f.message}`).join('; ')})` : ''}`
          : 'Registration failed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    if (!challengeId) return;
    setError(null);
    setBusy(true);
    try {
      await apiRequest<OtpVerifyResponse>('/auth/otp/verify', {
        method: 'POST',
        body: { challengeId, code: otp.trim() },
      });
      setStep('done');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Verification failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'done') {
    return (
      <div className="card" style={{ maxWidth: 620 }}>
        <h2>Contact verified</h2>
        <div className="alert ok" style={{ marginBottom: 'var(--space-4)' }}>
          Your account is active. {accountType === 'PICKER' ? 'Operations can now assign you work.' : 'Next step: submit your business documents for verification.'}
        </div>
        <p className="muted small">
          You can sign in now with the password you just created. Ordering scheduled medicines requires a
          verified drug licence, and wholesalers must be verified before their offers appear in the
          catalogue.
        </p>
        <div className="row">
          <Link className="btn primary" href="/login">
            Sign in
          </Link>
          <Link className="btn" href="/catalog">
            Browse the catalogue
          </Link>
        </div>
      </div>
    );
  }

  if (step === 'otp') {
    return (
      <div className="card" style={{ maxWidth: 560 }}>
        <h2>Verify {masked}</h2>
        <p className="muted small">
          We sent a one-time code. It is single use, expires in a few minutes, and every attempt is
          recorded in the security log.
        </p>
        {devOtp && (
          <div className="alert warn" style={{ marginBottom: 'var(--space-4)' }}>
            Development mode echoes the code: <span className="mono">{devOtp}</span>
          </div>
        )}
        {error && (
          <div className="alert error" style={{ marginBottom: 'var(--space-4)' }} role="alert">
            {error}
          </div>
        )}
        <form className="stack" onSubmit={verifyOtp}>
          <div className="field">
            <label htmlFor="otp">One-time code</label>
            <input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={8}
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
            />
          </div>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="stack">
      <div>
        <h1>Register your business</h1>
        <p className="muted" style={{ maxWidth: '70ch' }}>
          Choose the account type you are registering. Verification of licences happens after contact
          verification, and a Bezzo operator reviews every submission.
        </p>
      </div>

      <div className="grid grid-3">
        {ACCOUNT_TYPES.map((type) => (
          <button
            key={type.value}
            type="button"
            className="card"
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              borderColor: accountType === type.value ? 'var(--accent)' : undefined,
              boxShadow: accountType === type.value ? 'var(--elevation-2)' : undefined,
            }}
            onClick={() => setAccountType(type.value)}
            aria-pressed={accountType === type.value}
          >
            <div className="card-title">
              <h3 style={{ margin: 0 }}>{type.title}</h3>
              {accountType === type.value && <span className="badge ok">selected</span>}
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              {type.body}
            </p>
          </button>
        ))}
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        {error && (
          <div className="alert error" style={{ marginBottom: 'var(--space-4)' }} role="alert">
            {error}
          </div>
        )}
        <form className="stack" onSubmit={submitRegistration}>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="displayName">Your name</label>
              <input
                id="displayName"
                required
                minLength={2}
                value={form.displayName}
                onChange={(event) => update('displayName', event.target.value)}
              />
            </div>
            {accountType !== 'PICKER' && (
              <div className="field">
                <label htmlFor="businessName">Registered business name</label>
                <input
                  id="businessName"
                  required
                  minLength={2}
                  value={form.businessName}
                  onChange={(event) => update('businessName', event.target.value)}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Business email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
              />
              <span className="hint">Provide an email or a mobile number — at least one is required.</span>
            </div>
            <div className="field">
              <label htmlFor="phone">Mobile number</label>
              <input
                id="phone"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+919000000000"
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={form.password}
                onChange={(event) => update('password', event.target.value)}
              />
              <span className="hint">At least 10 characters with upper case, lower case and a number.</span>
            </div>
            {accountType === 'PICKER' && (
              <>
                <div className="field">
                  <label htmlFor="inviteCode">Bezzo invite code</label>
                  <input
                    id="inviteCode"
                    value={form.inviteCode}
                    onChange={(event) => update('inviteCode', event.target.value)}
                  />
                  <span className="hint">Issued by Bezzo operations when you are onboarded.</span>
                </div>
                <div className="field">
                  <label htmlFor="employeeCode">Employee code (optional)</label>
                  <input
                    id="employeeCode"
                    value={form.employeeCode}
                    onChange={(event) => update('employeeCode', event.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="checkbox">
            <input id="terms" type="checkbox" required />
            <label htmlFor="terms" className="small">
              I accept the BEZZO terms of use, and I confirm the business details I provide are accurate.
            </label>
          </div>

          <div className="row">
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Submitting…' : `Register as ${humanise(accountType).toLowerCase()}`}
            </button>
            <Link className="btn" href="/login">
              I already have an account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
