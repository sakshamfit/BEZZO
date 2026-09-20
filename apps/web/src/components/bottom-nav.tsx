'use client';

/**
 * Bottom navigation — the retailer app's primary navigation on phones.
 *
 * Five destinations (Home, Categories, Orders, Cart, Account), persistent,
 * thumb-reachable, with an obvious active state and a live cart badge. Orders
 * and Cart for a signed-out visitor route through sign-in; suppliers, pickers
 * and operators get no bottom bar — their tools live in the top chrome.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { useCart } from './cart-context';
import { CartIcon, GridIcon, HomeIcon, ReceiptIcon, UserIcon } from './icons';

export function BottomNav() {
  const pathname = usePathname();
  const { ready, principal } = useAuth();
  const { unitCount, isBuyer } = useCart();

  const signedIn = ready && Boolean(principal);
  const buyer = signedIn && Boolean(principal?.buyer);
  const cartHref = buyer ? '/cart' : '/login?next=%2Fcart';
  const ordersHref = buyer ? '/orders' : '/login?next=%2Forders';
  const accountHref = signedIn ? '/account' : '/login?next=%2Faccount';

  const items = [
    { href: '/', label: 'Home', icon: <HomeIcon size={22} />, active: pathname === '/', badge: null },
    {
      href: '/categories',
      label: 'Categories',
      icon: <GridIcon size={22} />,
      active: pathname === '/categories' || pathname.startsWith('/catalog'),
      badge: null,
    },
    {
      href: ordersHref,
      label: 'Orders',
      icon: <ReceiptIcon size={22} />,
      active: pathname.startsWith('/orders'),
      badge: null,
    },
    {
      href: cartHref,
      label: 'Cart',
      icon: <CartIcon size={22} />,
      active: pathname.startsWith('/cart') || pathname.startsWith('/checkout'),
      badge: buyer && unitCount > 0 ? (unitCount > 99 ? '99+' : String(unitCount)) : null,
    },
    {
      href: accountHref,
      label: 'Account',
      icon: <UserIcon size={22} />,
      active: pathname.startsWith('/account'),
      badge: null,
    },
  ];

  return (
    <nav className="bottomnav" aria-label="Primary">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={item.active ? 'active' : undefined}
          aria-current={item.active ? 'page' : undefined}
        >
          <span className="bn-icon">
            {item.icon}
            {item.badge && <span className="bn-badge">{item.badge}</span>}
          </span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Routes where the bottom bar never appears (focused or non-buyer surfaces). */
const HIDDEN_PREFIXES = ['/supplier', '/admin', '/picker', '/login', '/register', '/apply', '/status'];

export function showBottomNavForPath(pathname: string): boolean {
  return !HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
