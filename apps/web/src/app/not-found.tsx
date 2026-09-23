import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container">
      <section
        className="empty-card"
        style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-6) var(--space-lg)' }}
      >
        <span
          aria-hidden="true"
          style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}
        >
          404
        </span>
        <span className="ec-title">Page not found</span>
        <p className="ec-body">
          The page you are looking for does not exist or may have been moved.
        </p>
        <div className="ec-actions">
          <Link className="btn primary" href="/">
            Return home
          </Link>
          <Link className="btn" href="/catalog">
            Browse the catalogue
          </Link>
        </div>
      </section>
    </div>
  );
}
