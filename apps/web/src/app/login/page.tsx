'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { ApiError } from '../../lib/api';
import { humanise } from '../../lib/format';

const DEMO_ACCOUNTS = [
  { label: 'Super admin', identifier: 'admin@bezzo.local' },
  { label: 'Operations', identifier: 'ops@bezzo.local' },
  { label: 'Wholesaler', identifier: 'supplier1@bezzo.local' },
  { label: 'Medical store', identifier: 'buyer1@bezzo.local' },
  { label: 'Picker', identifier: 'picker1@bezzo.local' },
];

/** Where each role lands after signing in — the tools they actually work in. */
function landingFor(roles: string[]): string {
  if (roles.some((role) => role.startsWith('SUPPLIER'))) return '/supplier';
  if (roles.some((role) => role.startsWith('BUYER'))) return '/catalog';
  if (roles.some((role) => role.startsWith('PICKER'))) return '/account';
  return '/status';
}

function LoginForm() {
  const { signIn, principal, ready } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDemo] = useState(process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === 'true');

  useEffect(() => {
    if (ready && principal) router.replace(next ?? landingFor(principal.roles));
  }, [ready, principal, router, next]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const signedIn = await signIn(identifier.trim(), password);
      router.replace(next ?? landingFor(signedIn.roles));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Sign-in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="card">
        <h2>Sign in</h2>
        <p className="muted small">
          Use the email or mobile number registered with your business. Sessions are validated on every
          request, so revoking a device takes effect immediately.
        </p>

        {error && (
          <div className="alert error" style={{ marginBottom: 'var(--space-4)' }} role="alert">
            {error}
          </div>
        )}

        <form className="stack" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="identifier">Email or mobile number</label>
            <input
              id="identifier"
              name="identifier"
              autoComplete="username"
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="you@pharmacy.in"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <button className="btn primary" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="small muted" style={{ marginTop: 'var(--space-4)', marginBottom: 0 }}>
          New to BEZZO? <Link href="/register">Register your business</Link>
        </p>
      </div>

      <div className="stack">
        <div className="card">
          <h3>How BEZZO accounts work</h3>
          <ul className="small muted" style={{ paddingLeft: '1.1rem', margin: 0 }}>
            <li>Retailers and wholesalers register themselves; a Bezzo team verifies the licences.</li>
            <li>Picker and hub accounts are provisioned by operations through an invite code.</li>
            <li>
              Registration activates the account, but ordering scheduled medicines additionally requires a
              verified drug licence.
            </li>
            <li>Suspending a supplier or store stops trading immediately on the next request.</li>
          </ul>
        </div>

        {showDemo && (
          <div className="card">
            <div className="card-title">
              <h3 style={{ margin: 0 }}>Development accounts</h3>
              <span className="badge warn">dev seed only</span>
            </div>
            <p className="small muted">
              Seeded for local work. Password <span className="mono">Bezzo@12345</span>. These accounts do
              not exist in staging or production.
            </p>
            <div className="pill-row">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.identifier}
                  type="button"
                  className="btn small"
                  onClick={() => {
                    setIdentifier(account.identifier);
                    setPassword('Bezzo@12345');
                  }}
                >
                  {account.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 240 }} />}>
      <LoginForm />
    </Suspense>
  );
}
