/**
 * Route-level skeleton for catalogue / search results — the grid's exact shape
 * paints while the server fetches, so results replace structure, not blankness.
 */
export default function CatalogLoading() {
  return (
    <div className="container">
      <div className="skeleton" style={{ height: 26, width: 210, marginBottom: 8 }} aria-hidden="true" />
      <div className="skeleton" style={{ height: 14, width: 320, marginBottom: 20 }} />
      <div className="skeleton" style={{ height: 50, borderRadius: 'var(--radius-lg)', marginBottom: 20 }} />
      <div className="product-grid">
        {Array.from({ length: 12 }, (_, index) => (
          <div className="sk-pcard" key={index}>
            <div className="skeleton sk-visual" />
            <div className="skeleton" style={{ height: 13, width: '88%' }} />
            <div className="skeleton" style={{ height: 10, width: '62%' }} />
            <div className="skeleton" style={{ height: 15, width: '46%', marginTop: 4 }} />
            <div className="skeleton" style={{ height: 36, width: '100%', marginTop: 6 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
