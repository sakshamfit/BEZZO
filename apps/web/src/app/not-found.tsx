import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="stack" style={{ textAlign: 'center', padding: 'var(--space-6) 0', gap: 'var(--space-3)' }}>
      <h1 style={{ fontSize: '2.5rem', margin: 0 }}>404</h1>
      <h2 style={{ margin: 0 }}>Page Not Found</h2>
      <p className="muted" style={{ maxWidth: 440, margin: '0 auto' }}>
        The page you are looking for does not exist or may have been moved.
      </p>
      <div style={{ marginTop: 'var(--space-3)' }}>
        <Link className="btn primary" href="/">
          Return Home
        </Link>
      </div>
    </section>
  );
}
