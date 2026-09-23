'use client';

/**
 * Home intro — the only "marketing" surface on the marketplace home.
 *
 * Signed-out visitors get a compact value proposition (what BEZZO is, how to
 * get in). Signed-in buyers get nothing at all: for them the home screen is
 * product surface from the first pixel, because a buyer opening the app wants
 * "what can I buy", not a brochure.
 */
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import { ArrowRightIcon, BoltIcon, ShieldIcon, TruckIcon } from './icons';

export function HomeIntro() {
  const { ready, principal } = useAuth();

  if (!ready || principal) return null;

  return (
    <section className="mk-hero">
      <p className="eyebrow">Verified B2B pharmaceutical marketplace</p>
      <h1>Medicines for your medical store, from verified wholesalers.</h1>
      <p>
        Search by brand, generic or composition. Compare supplier availability and trade prices.
        Order once — BEZZO collects from each wholesaler, receives at its hub, and tracks every
        stage to your counter.
      </p>
      <div className="row">
        <Link className="btn primary" href="/login">
          Sign in to order <ArrowRightIcon size={16} />
        </Link>
        <Link className="btn" href="/apply">
          Apply as a medical store
        </Link>
      </div>
      <div className="hero-stat-row">
        <div className="hero-stat">
          <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldIcon size={13} /> Verified supply
          </span>
          <span className="value">Human-reviewed wholesalers</span>
        </div>
        <div className="hero-stat">
          <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BoltIcon size={13} /> Live prices
          </span>
          <span className="value">Re-read on every request</span>
        </div>
        <div className="hero-stat">
          <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TruckIcon size={13} /> Controlled journey
          </span>
          <span className="value">Picker → Bezzo hub → you</span>
        </div>
      </div>
    </section>
  );
}
