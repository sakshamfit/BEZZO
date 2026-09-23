'use client';

/**
 * Picker surface — an operational task app shell, honestly wired.
 *
 * The picker collection system (Phase 7) is not yet live on the backend: no
 * pickup tasks are dispatched, so this screen shows the picker's real account
 * state and an explicit "no pickups assigned" state — never a simulated scan
 * flow. The task lifecycle below documents exactly what will appear here the
 * moment operations starts dispatching: accept → navigate → arrive → scan
 * packages → hub handover, all server-authoritative with atomic claiming.
 */
import Link from 'next/link';
import { useAuth } from '../../lib/auth-context';
import { humanise } from '../../lib/format';
import {
  ArrowRightIcon,
  BoxIcon,
  CheckCircleIcon,
  HubIcon,
  ScanIcon,
  ShieldIcon,
  TruckIcon,
} from '../../components/icons';

const PICKUP_FLOW: Array<{ title: string; body: string; icon: React.ReactNode }> = [
  {
    title: 'Accept a pickup',
    body: 'Available pickups show the supplier, distance, order count and package count. Exactly one picker can claim a task.',
    icon: <TruckIcon size={18} />,
  },
  {
    title: 'Navigate to the supplier',
    body: 'The pickup address and window come from the fulfilment; arrive and confirm.',
    icon: <ArrowRightIcon size={18} />,
  },
  {
    title: 'Scan every package',
    body: 'Expected vs scanned counts stay visible — a missing or unexpected package is recorded, not hidden.',
    icon: <ScanIcon size={18} />,
  },
  {
    title: 'Hand over at the Bezzo hub',
    body: 'The hub receives each package by scan; discrepancies stay attached to the fulfilment.',
    icon: <HubIcon size={18} />,
  },
];

export default function PickerPage() {
  const { ready, principal } = useAuth();

  if (!ready) {
    return (
      <div className="container container-narrow" aria-busy="true">
        <div className="skeleton" style={{ height: 30, width: 220, marginBottom: 14 }} />
        <div className="skeleton" style={{ height: 160, borderRadius: 'var(--radius-lg)' }} />
      </div>
    );
  }

  if (!principal) {
    return (
      <div className="container container-narrow">
        <div className="empty-card" style={{ marginTop: 'var(--space-lg)' }}>
          <span className="ec-icon">
            <BoxIcon size={24} />
          </span>
          <span className="ec-title">Sign in to the picker app</span>
          <p className="ec-body">
            Pickers collect packed fulfilments from wholesalers and hand them over at the Bezzo
            collection hub.
          </p>
          <div className="ec-actions">
            <Link className="btn primary small" href="/login?next=%2Fpicker">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!principal.picker) {
    return (
      <div className="container container-narrow">
        <div className="empty-card" style={{ marginTop: 'var(--space-lg)' }}>
          <span className="ec-icon">
            <ShieldIcon size={24} />
          </span>
          <span className="ec-title">This account is not linked to a picker profile</span>
          <p className="ec-body">
            Your roles: {principal.roles.map(humanise).join(', ')}. Picker access is granted by BEZZO
            operations after onboarding.
          </p>
          <div className="ec-actions">
            <Link className="btn small" href="/account">
              Go to account
            </Link>
            <Link className="btn small" href="/apply">
              Apply as a picker
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container container-narrow">
      <header style={{ marginBottom: 'var(--space-4)' }}>
        <p className="eyebrow" style={{ marginBottom: 4 }}>
          Picker
        </p>
        <h1 style={{ fontSize: '1.375rem', margin: 0 }}>
          {principal.displayName}
        </h1>
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          Status{' '}
          <span className={`badge ${principal.picker.status === 'ACTIVE' ? 'ok' : 'warn'}`}>
            {humanise(principal.picker.status)}
          </span>{' '}
          · pickup tasks are dispatched by BEZZO operations
        </p>
      </header>

      {/* The honest current state: no dispatch backend yet. */}
      <section className="empty-card" style={{ marginBottom: 'var(--space-4)' }}>
        <span className="ec-icon">
          <ScanIcon size={24} />
        </span>
        <span className="ec-title">Available pickups</span>
        <p className="ec-body">
          No pickups are assigned to you right now. When BEZZO operations dispatches collection tasks,
          they appear here — supplier, distance, orders and packages — ready to accept in one tap.
          Nothing on this screen is simulated.
        </p>
      </section>

      <section className="card">
        <h2 className="card-title">How a pickup will run</h2>
        <ol className="track" style={{ marginTop: 'var(--space-3)' }}>
          {PICKUP_FLOW.map((step) => (
            <li key={step.title} className="todo">
              <span className="ts-node" style={{ color: 'var(--accent-deep)' }}>
                {step.icon}
              </span>
              <span className="ts-body">
                <span className="ts-title">{step.title}</span>
                <span className="ts-sub">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="hint" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
          <CheckCircleIcon size={13} style={{ verticalAlign: '-2px' }} /> Every step is recorded
          server-side with idempotent commands — a double-tap can never scan a package twice, and two
          pickers can never claim one task.
        </p>
      </section>
    </div>
  );
}
