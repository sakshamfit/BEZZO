/**
 * Route-level skeleton for the marketplace home — the page paints its final
 * structure instantly while the server components fetch, never a blank screen.
 */
export default function HomeLoading() {
  return (
    <div className="container container-narrow" style={{ paddingTop: 'var(--space-md)' }} aria-busy="true">
      <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-xl)', marginBottom: 'var(--space-lg)' }} />

      <section className="mk-section">
        <div className="skeleton" style={{ height: 18, width: 160, marginBottom: 12 }} />
        <div className="cat-rail">
          {Array.from({ length: 8 }, (_, index) => (
            <div className="cat-tile sk-cat" key={index}>
              <span className="skeleton sk-circle" />
              <span className="skeleton sk-bar" />
            </div>
          ))}
        </div>
      </section>

      <section className="mk-section">
        <div className="skeleton" style={{ height: 18, width: 190, marginBottom: 12 }} />
        <div className="rail">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="sk-pcard" key={index} style={{ flex: '0 0 160px' }}>
              <div className="skeleton sk-visual" />
              <div className="skeleton" style={{ height: 13, width: '85%' }} />
              <div className="skeleton" style={{ height: 10, width: '60%' }} />
              <div className="skeleton" style={{ height: 36, width: '100%', marginTop: 6 }} />
            </div>
          ))}
        </div>
      </section>

      <section className="mk-section">
        <div className="skeleton" style={{ height: 18, width: 150, marginBottom: 12 }} />
        <div className="rail">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="sk-pcard" key={index} style={{ flex: '0 0 160px' }}>
              <div className="skeleton sk-visual" />
              <div className="skeleton" style={{ height: 13, width: '78%' }} />
              <div className="skeleton" style={{ height: 10, width: '55%' }} />
              <div className="skeleton" style={{ height: 36, width: '100%', marginTop: 6 }} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
