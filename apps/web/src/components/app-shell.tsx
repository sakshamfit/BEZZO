'use client';

/**
 * Application chrome: brand, role-aware navigation and the session menu.
 *
 * Navigation is role-aware because BEZZO's four audiences see genuinely different tools; it is not a
 * security boundary (every endpoint re-authorizes server-side) but it keeps each user in their lane.
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth-context';
import { humanise } from '../lib/format';

interface NavItem {
  href: string;
  label: string;
  visible: (context: { signedIn: boolean; hasRole: (...roles: string[]) => boolean }) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/catalog', label: 'Catalogue', visible: () => true },
  // Public partner intake: the apply form routes every submission to the operations WhatsApp line.
  { href: '/apply', label: 'Apply to partner', visible: () => true },
  {
    href: '/cart',
    label: 'Cart',
    visible: ({ signedIn, hasRole }) => signedIn && hasRole('BUYER', 'BUYER_OWNER', 'BUYER_STAFF'),
  },
  {
    href: '/orders',
    label: 'Orders',
    visible: ({ signedIn, hasRole }) => signedIn && hasRole('BUYER', 'BUYER_OWNER', 'BUYER_STAFF'),
  },
  {
    href: '/supplier',
    label: 'Supplier workspace',
    visible: ({ signedIn, hasRole }) =>
      signedIn && hasRole('SUPPLIER', 'SUPPLIER_OWNER', 'SUPPLIER_INVENTORY', 'SUPPLIER_FINANCE'),
  },
  {
    href: '/admin/applications',
    label: 'Applications',
    visible: ({ signedIn, hasRole }) =>
      signedIn &&
      hasRole('ADMIN', 'SUPER_ADMIN', 'OPERATIONS_AGENT', 'SUPPORT_AGENT'),
  },
  {
    href: '/admin/payments',
    label: 'Payments',
    visible: ({ signedIn, hasRole }) =>
      signedIn &&
      hasRole('ADMIN', 'SUPER_ADMIN', 'OPERATIONS_AGENT', 'SUPPORT_AGENT', 'FINANCE_AGENT', 'COMPLIANCE_AGENT'),
  },
  {
    href: '/account',
    label: 'Account',
    visible: ({ signedIn }) => signedIn,
  },
  {
    href: '/notifications',
    label: 'Notifications',
    visible: ({ signedIn }) => signedIn,
  },
  { href: '/status', label: 'Platform status', visible: () => true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, principal, signOut, hasRole } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const signedIn = Boolean(principal);

  // A signed-out user on a private route is redirected exactly once, after the session was restored.
  useEffect(() => {
    if (!ready) return;
    const isPrivate = ['/cart', '/checkout', '/orders', '/account', '/notifications', '/supplier', '/admin'].some(
      (prefix) => pathname.startsWith(prefix),
    );
    if (isPrivate && !signedIn) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [ready, signedIn, pathname, router]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="container topbar-inner">
          <Link href="/" className="brand" aria-label="BEZZO home">
            BEZZO <span>Healthcare. Simplified.</span>
          </Link>
          <nav className="nav" aria-label="Primary">
            {NAV_ITEMS.filter((item) => item.visible({ signedIn, hasRole })).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={pathname.startsWith(item.href) ? 'active' : undefined}
              >
                {item.label}
              </Link>
            ))}
            {ready && !signedIn && <Link href="/login">Sign in</Link>}
            {ready && signedIn && (
              <button
                type="button"
                className="btn small"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  await signOut();
                  setSigningOut(false);
                  router.push('/');
                }}
                title={principal ? `${principal.displayName} · ${principal.roles.map(humanise).join(', ')}` : undefined}
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            )}
          </nav>
        </div>
      </header>

      <main>
        <div className="container">{children}</div>
      </main>

      <footer className="footer">
        <div className="container">
          <span>
            BEZZO · verified wholesalers to verified pharmacies · pickup, hub receiving and delivery are
            tracked as separate stages. Partner enquiries: <Link className="link" href="/apply">apply here</Link>.
          </span>
          <span>
            {principal ? `${principal.displayName} · ${principal.roles.map(humanise).join(', ')}` : 'Not signed in'}
          </span>
        </div>
      </footer>
    </div>
  );
}
