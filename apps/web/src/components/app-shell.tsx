'use client';

/**
 * Application chrome v2 — marketplace-first.
 *
 * One sticky header for every audience: brand, the buyer's "delivering to"
 * anchor, the global search (the primary interaction), role-aware navigation,
 * and a cart button whose badge is the live server count. Phones add a
 * persistent bottom bar (Home / Categories / Orders / Cart / Account) for
 * buyers and visitors; operational audiences (supplier, admin, picker) keep
 * the top navigation because their tools are not storefront destinations.
 *
 * Navigation is role-aware for orientation only — every endpoint re-authorizes
 * server-side.
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth-context';
import { humanise } from '../lib/format';
import { BottomNav, showBottomNavForPath } from './bottom-nav';
import { BrandLogo } from './brand';
import { SearchBar } from './search-bar';
import { useCart } from './cart-context';
import { CartIcon, ChevronDown, MenuIcon, PinIcon, WifiOffIcon } from './icons';

/**
 * Connectivity banner — visible only while the browser reports itself offline.
 * It is informational: every request the app makes already fails loudly and
 * every mutation keeps the server's last confirmed state, so no data can
 * silently diverge while the banner is up.
 */
function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;
  return (
    <div role="status" aria-live="polite" style={{ background: 'var(--warn-bg)', color: 'var(--warn)', borderBottom: '1px solid #fde68a', padding: '8px var(--space-md)', fontSize: '0.8125rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <WifiOffIcon size={15} />
      You&apos;re offline. We&apos;ll reconnect automatically — nothing you confirmed is lost.
    </div>
  );
}

interface NavItem {
  href: string;
  label: string;
  visible: (context: { signedIn: boolean; hasRole: (...roles: string[]) => boolean }) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/catalog', label: 'Catalogue', visible: () => true },
  { href: '/categories', label: 'Categories', visible: () => true },
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
    href: '/picker',
    label: 'Picker',
    visible: ({ signedIn, hasRole }) => signedIn && hasRole('PICKER'),
  },
  {
    href: '/admin',
    label: 'Operations',
    visible: ({ signedIn, hasRole }) =>
      signedIn &&
      hasRole('ADMIN', 'SUPER_ADMIN', 'OPERATIONS_AGENT', 'SUPPORT_AGENT', 'FINANCE_AGENT', 'COMPLIANCE_AGENT'),
  },
  {
    href: '/apply',
    label: 'Apply to partner',
    visible: () => true,
  },
];

const PRIVATE_PREFIXES = ['/cart', '/checkout', '/orders', '/account', '/notifications', '/supplier', '/admin', '/picker'];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, principal, signOut, hasRole } = useAuth();
  const { unitCount, isBuyer } = useCart();
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const signedIn = Boolean(principal);

  // Live badge with a one-shot bump whenever the count rises.
  const [bump, setBump] = useState(false);
  const previousCount = useRef(unitCount);
  useEffect(() => {
    if (unitCount > previousCount.current) {
      setBump(true);
      const timer = setTimeout(() => setBump(false), 320);
      previousCount.current = unitCount;
      return () => clearTimeout(timer);
    }
    previousCount.current = unitCount;
    return undefined;
  }, [unitCount]);

  // A signed-out user on a private route is redirected exactly once, after the
  // session was restored.
  useEffect(() => {
    if (!ready) return;
    const isPrivate = PRIVATE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    if (isPrivate && !signedIn) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [ready, signedIn, pathname, router]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const buyerNavVisible = !signedIn || isBuyer;
  const bottomNavVisible = showBottomNavForPath(pathname) && buyerNavVisible;
  const visibleNav = NAV_ITEMS.filter((item) =>
    item.visible({ signedIn, hasRole }),
  );
  const cartHref = isBuyer ? '/cart' : '/login?next=%2Fcart';
  const storeName = principal?.buyer ? (principal.organization?.name ?? principal.displayName) : null;

  return (
    <div className={`shell${bottomNavVisible ? ' has-bottomnav' : ''}`}>
      <OfflineBanner />
      <header className="mk-header">
        <div className="container mk-header-inner">
          <Link href="/" aria-label="BEZZO home" style={{ order: 1 }}>
            <BrandLogo />
          </Link>

          {storeName && (
            <Link href="/account" className="deliver-to" style={{ order: 2 }} title="Delivery destination — manage addresses in your account">
              <span className="dt-icon">
                <PinIcon size={18} />
              </span>
              <span>
                <span className="dt-label">Delivering to</span>
                <span className="dt-name">{storeName}</span>
              </span>
            </Link>
          )}

          <div className="mk-search-slot" style={{ order: 3 }}>
            <SearchBar />
          </div>

          <nav className="mk-nav" aria-label="Primary" style={{ order: 5 }}>
            {visibleNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={pathname.startsWith(item.href) ? 'active' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mk-actions" style={{ order: 6 }}>
            <Link href={cartHref} className="cart-btn" aria-label={`Cart${unitCount > 0 ? ` — ${unitCount} units` : ''}`}>
              <CartIcon size={23} />
              {isBuyer && unitCount > 0 && (
                <span className={`count on${bump ? ' bump' : ''}`}>
                  {unitCount > 99 ? '99+' : unitCount}
                </span>
              )}
            </Link>

            {ready && !signedIn && (
              <Link href="/login" className="btn small" style={{ marginLeft: 4 }}>
                Sign in
              </Link>
            )}

            {ready && signedIn && (
              <Link
                href="/account"
                className="icon-btn"
                title={principal ? `${principal.displayName} · ${principal.roles.map(humanise).join(', ')}` : undefined}
              >
                <span className="avatar">{initials(principal?.displayName ?? 'BZ')}</span>
                <ChevronDown size={14} />
              </Link>
            )}

            <button
              type="button"
              className="icon-btn"
              aria-expanded={menuOpen}
              aria-label="Menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MenuIcon size={22} />
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="mk-menu" role="menu">
            {visibleNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className={pathname.startsWith(item.href) ? 'active' : undefined}
              >
                {item.label}
              </Link>
            ))}
            <Link href="/notifications" role="menuitem" className={pathname.startsWith('/notifications') ? 'active' : undefined}>
              Notifications
            </Link>
            <Link href="/status" role="menuitem" className={pathname.startsWith('/status') ? 'active' : undefined}>
              Platform status
            </Link>
            {ready && signedIn ? (
              <button
                type="button"
                role="menuitem"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  await signOut();
                  setSigningOut(false);
                  router.push('/');
                }}
              >
                {signingOut ? 'Signing out…' : `Sign out (${principal?.displayName ?? ''})`}
              </button>
            ) : (
              <Link href="/login" role="menuitem">
                Sign in
              </Link>
            )}
          </div>
        )}
      </header>

      <main>{children}</main>

      {bottomNavVisible && <BottomNav />}

      <footer className="footer">
        <div className="container">
          <span>
            BEZZO · verified wholesalers to verified pharmacies · pickup, hub receiving and delivery are
            tracked as separate stages. Partner enquiries:{' '}
            <Link className="link" href="/apply">
              apply here
            </Link>
            .
          </span>
          <span>
            {principal ? `${principal.displayName} · ${principal.roles.map(humanise).join(', ')}` : 'Not signed in'}
          </span>
        </div>
      </footer>
    </div>
  );
}
