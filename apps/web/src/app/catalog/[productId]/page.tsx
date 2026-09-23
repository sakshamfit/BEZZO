import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverGet } from '../../../lib/api';
import { formatDate, humanise, prescriptionLabel } from '../../../lib/format';
import type { Paginated, ProductDetail, ProductSummary } from '../../../lib/types';
import { ProductVisual } from '../../../components/product-visual';
import { ProductCard } from '../../../components/product-card';
import { OfferPanel, OfferSummary } from './offer-panel';
import { InfoIcon, ShieldIcon } from '../../../components/icons';

export const dynamic = 'force-dynamic';

/**
 * Product detail — the pharmaceutical answer to "can I stock this?".
 *
 * Everything a pharmacist needs to decide: composition, strength, pack,
 * manufacturer, storage, prescription classification, and every verified
 * supplier offer with batch, expiry, MOQ and lead time. Related products come
 * from the same live category query. The purchase action stays server-backed:
 * the offer panel posts a real listing id and renders the API's own cart
 * response.
 */
export default async function ProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const envelope = await serverGet<ProductDetail>(`/catalog/products/${productId}`);

  if (!envelope) {
    return (
      <div className="container">
        <div className="empty-card" style={{ marginTop: 'var(--space-lg)' }}>
          <span className="ec-icon">
            <InfoIcon size={24} />
          </span>
          <span className="ec-title">This product could not be loaded</span>
          <p className="ec-body">
            The API did not respond. The request is retried on every page view — check the platform
            status page if this continues.
          </p>
          <div className="ec-actions">
            <Link className="btn small" href="/status">
              Platform status
            </Link>
            <Link className="btn primary small" href="/catalog">
              Back to catalogue
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const product = envelope.data;
  if (!product) notFound();

  const offers = product.offers;
  const relatedEnvelope = await serverGet<Paginated<ProductSummary>>('/catalog/products', {
    query: { categoryId: product.category?.id, pageSize: 8 },
  });
  const related = (relatedEnvelope?.data?.items ?? [])
    .filter((candidate) => candidate.id !== product.id)
    .slice(0, 6);

  const isRx = product.prescriptionClassification === 'PRESCRIPTION_REQUIRED';

  return (
    <div className="container page-footroom">
      <nav className="small muted" style={{ marginBottom: 'var(--space-3)' }} aria-label="Breadcrumb">
        <Link href="/">Home</Link> · <Link href="/categories">Categories</Link> ·{' '}
        <Link href={`/catalog?categoryId=${product.category?.id ?? ''}`}>{product.category?.name ?? 'Catalogue'}</Link>
      </nav>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--space-lg)' }}>
        {/* Visual + identity */}
        <section className="card" style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 1 240px', minWidth: 160 }}>
            <ProductVisual
              productId={product.id}
              dosageForm={product.dosageForm}
              size="lg"
              label={product.name}
            />
          </div>
          <div style={{ flex: '2 1 320px', minWidth: 0 }}>
            <h1 style={{ fontSize: '1.375rem', marginBottom: 6 }}>{product.name}</h1>
            <p className="muted" style={{ margin: '0 0 var(--space-3)', fontSize: '0.875rem' }}>
              {[
                product.compositionSummary ?? product.genericName,
                product.strength,
                product.packSize,
                product.manufacturerName,
              ]
                .filter(Boolean)
                .join(' · ') || 'Product details not recorded'}
            </p>
            <div className="pill-row" style={{ marginBottom: 'var(--space-3)' }}>
              <span className={`badge ${product.restricted ? 'danger' : isRx ? 'info' : ''}`}>
                {prescriptionLabel(product.prescriptionClassification)}
              </span>
              {product.dosageForm && <span className="chip plain">{product.dosageForm}</span>}
              <OfferSummary offers={offers} />
            </div>
            <dl className="definition-grid" style={{ gap: '0.375rem var(--space-lg)' }}>
              {product.genericName && (
                <div style={{ display: 'contents' }}>
                  <dt>Generic</dt>
                  <dd>{product.genericName}</dd>
                </div>
              )}
              {product.brandName && (
                <div style={{ display: 'contents' }}>
                  <dt>Brand</dt>
                  <dd>{product.brandName}</dd>
                </div>
              )}
              {product.compositionSummary && (
                <div style={{ display: 'contents' }}>
                  <dt>Composition</dt>
                  <dd>{product.compositionSummary}</dd>
                </div>
              )}
              {product.packUnit && (
                <div style={{ display: 'contents' }}>
                  <dt>Pack unit</dt>
                  <dd>{product.packUnit}</dd>
                </div>
              )}
              <div style={{ display: 'contents' }}>
                <dt>Storage</dt>
                <dd>{product.storageRequirements ?? 'Standard storage'}</dd>
              </div>
              <div style={{ display: 'contents' }}>
                <dt>Catalogue updated</dt>
                <dd>{formatDate(product.updatedAt)}</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Offers */}
        <section className="card">
          <div className="spread" style={{ alignItems: 'baseline', marginBottom: 'var(--space-3)' }}>
            <h2 style={{ margin: 0, fontSize: '1.0625rem' }}>
              Supplier offers <span className="small muted">({offers.length})</span>
            </h2>
            <span className="small faint">
              Best price first · every line is supplied by a single wholesaler
            </span>
          </div>
          <OfferPanel
            productId={product.id}
            productName={product.name}
            restricted={product.restricted}
            offers={offers}
            currency="INR"
          />
        </section>

        {/* Facts + rules */}
        <section className="grid grid-sidebar">
          <div className="stack tight">
            {product.description && (
              <div className="card tight">
                <h3 style={{ fontSize: '0.9375rem' }}>About this product</h3>
                <p className="small muted" style={{ margin: 0 }}>
                  {product.description}
                </p>
              </div>
            )}
            <div className="card tight">
              <h3 style={{ fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldIcon size={16} /> Ordering rules
              </h3>
              <ul className="small muted" style={{ paddingLeft: '1.1rem', margin: 0 }}>
                <li>Stock is not reserved by the cart; it is reserved when checkout confirms.</li>
                <li>Every line is supplied by a single wholesaler, so one order can create several fulfilments.</li>
                <li>GST is applied per line from the supplier&apos;s tax rate.</li>
                <li>
                  Catalogue status: <span className="badge ok" style={{ verticalAlign: 'middle' }}>{humanise('PUBLISHED')}</span>
                </li>
              </ul>
            </div>
          </div>
          <aside className="card tight">
            <h3 style={{ fontSize: '0.9375rem' }}>At a glance</h3>
            <table>
              <tbody>
                <tr>
                  <td className="muted">Dosage form</td>
                  <td>{product.dosageForm ?? '—'}</td>
                </tr>
                <tr>
                  <td className="muted">Strength</td>
                  <td>{product.strength ?? '—'}</td>
                </tr>
                <tr>
                  <td className="muted">Pack size</td>
                  <td>{product.packSize ?? '—'}</td>
                </tr>
                <tr>
                  <td className="muted">Manufacturer</td>
                  <td>{product.manufacturerName ?? '—'}</td>
                </tr>
                <tr>
                  <td className="muted">Category</td>
                  <td>{product.category?.name ?? '—'}</td>
                </tr>
                <tr>
                  <td className="muted">Classification</td>
                  <td>{prescriptionLabel(product.prescriptionClassification)}</td>
                </tr>
              </tbody>
            </table>
          </aside>
        </section>

        {/* Related */}
        {related.length > 0 && (
          <section className="mk-section" style={{ marginBottom: 0 }}>
            <div className="section-head">
              <div>
                <h2>More in {product.category?.name ?? 'this category'}</h2>
                <p className="sub">Live availability from verified wholesalers</p>
              </div>
              <Link className="see-all" href={`/catalog?categoryId=${product.category?.id ?? ''}`}>
                See all <ChevronRightInline />
              </Link>
            </div>
            <div className="rail">
              {related.map((candidate) => (
                <ProductCard key={candidate.id} product={candidate} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ChevronRightInline() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-2px' }}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}
