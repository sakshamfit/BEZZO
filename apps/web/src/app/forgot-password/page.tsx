'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ApiError, apiRequest } from '../../lib/api';

type Step = 'identifier' | 'code' | 'done';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [destination, setDestination] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{
        challengeId: string;
        destinationMasked: string;
      }>('/auth/otp/request', {
        method: 'POST',
        body: { identifier: identifier.trim(), purpose: 'PASSWORD_RESET' },
      });
      setChallengeId(result.challengeId);
      setDestination(result.destinationMasked);
      setStep('code');
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'Could not request a reset code. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await apiRequest('/auth/password/reset', {
        method: 'POST',
        body: { challengeId, code: code.trim(), newPassword: password },
      });
      setStep('done');
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'Could not reset the password. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
      {step === 'done' ? (
        <>
          <h2>Password updated</h2>
          <p className="muted">Your password was changed and existing sessions were signed out.</p>
          <Link className="btn primary" href="/login">
            Return to sign in
          </Link>
        </>
      ) : step === 'identifier' ? (
        <>
          <h2>Reset your password</h2>
          <p className="muted small">
            We’ll send a one-time code to the email or mobile number on your account.
          </p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <form className="stack" onSubmit={requestCode}>
            <div className="field">
              <label htmlFor="identifier">Email or mobile number</label>
              <input
                id="identifier"
                autoComplete="username"
                required
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="you@pharmacy.in or +919876543210"
              />
            </div>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset code'}
            </button>
          </form>
        </>
      ) : (
        <>
          <h2>Choose a new password</h2>
          <p className="muted small">
            Enter the code sent to {destination || 'your registered contact'}.
          </p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <form className="stack" onSubmit={resetPassword}>
            <div className="field">
              <label htmlFor="code">One-time code</label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{4,8}"
                minLength={4}
                maxLength={8}
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="password">New password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setStep('identifier')}
              disabled={busy}
            >
              Use a different email or number
            </button>
          </form>
        </>
      )}
      {step !== 'done' && (
        <p className="small muted" style={{ marginBottom: 0, marginTop: 'var(--space-4)' }}>
          Remembered it? <Link href="/login">Return to sign in</Link>
        </p>
      )}
    </div>
  );
}
