import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverGet } from '../../../lib/api';
import { formatDate, formatMoney, formatNumber, prescriptionLabel, statusTone } from '../../../lib/format';
import type { ProductDetail } from '../../../lib/types';
import { AddToCart } from './add-to-cart';

export const dynamic = 'force-dynamic';

export default async function ProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const envelope = await serverGet<ProductDetail>(`/catalog/products/${productId}`);

  if (!envelope) {
    return (
      <div className="empty">
        <h2>The API did not respond</h2>
        <p className="muted small">
          The product could not be loaded. Check the platform status page; the catalogue request is
          retried on every page view.
        </p>
        <Link className="btn" href="/catalog">
          Back to catalogue
        </Link>
      </div>
    );
  }

  const product = envelope.data;
  const offers = product.offers;
  const bestPrice = offers.length ? offers[0]?.sellingPrice ?? null : null;
  const sellable = offers.reduce((total, offer) => total + offer.sellableQuantity, 0);
  const fastestLeadTime = offers
    .map((offer) => offer.leadTimeMinutes)
    .filter((minutes): minutes is number => minutes !== null)
    .sort((a, b) => a - b)[0];

  return (
    <>
      <nav className="small muted" style={{ marginBottom: 'var(--space-3)' }}>
        <Link href="/catalog">Catalogue</Link> · <span>{product.category.name}</span>
      </nav>

      <div className="page-head">
        <div>
          <h1>{product.name}</h1>
          <p>
            {[product.strength, product.packSize, product.packUnit].filter(Boolean).join(' · ') || 'Pack details not recorded'}
            {product.manufacturerName ? ` · ${product.manufacturerName}` : ''}
          </p>
        </div>
        <div className="pill-row">
          <span className={`badge ${product.restricted ? 'danger' : 'info'}`}>
            {prescriptionLabel(product.prescriptionClassification)}
          </span>
          <span className={`badge ${sellable > 0 ? 'ok' : 'danger'}`}>{sellable > 0 ? 'in stock' : 'out of stock'}</span>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 340px)', alignItems: 'start' }}>
        <section className="stack">
          <div className="card">
            <div className="card-title">
              <h2 style={{ margin: 0 }}>Supplier offers</h2>
              <span className="small muted">
                {offers.length} supplier{offers.length === 1 ? '' : 's'}
                {bestPrice !== null ? ` · from ${formatMoney(bestPrice)}` : ''}
              </span>
            </div>

            {product.restricted ? (
              <div className="alert warn">
                This is a scheduled/controlled medicine. Availability is shown, but only a store with a
                verified drug licence can order it.
              </div>
            ) : offers.length === 0 ? (
              <div className="empty" style={{ padding: 'var(--space-5)' }}>
                <p style={{ marginBottom: 'var(--space-2)' }}>
                  <strong>No verified supplier currently offers this product.</strong>
                </p>
                <p className="small muted" style={{ margin: 0 }}>
                  Offers appear here as soon as a verified wholesaler publishes stock. Prices exclude tax
                  unless stated.
                </p>
              </div>
            ) : (
              <div className="stack">
                {offers.map((offer) => (
                  <div className="list-item" key={offer.listingId}>
                    <div>
                      <div className="product-name">{offer.supplierName}</div>
                      <div className="small muted">
                        {offer.supplierCity ?? 'Location not recorded'} · MOQ {offer.minimumOrderQuantity}
                        {offer.leadTimeMinutes ? ` · ready in ~${offer.leadTimeMinutes} min` : ''}
                      </div>
                      <div className="small faint">
                        {offer.batchNumber ? `Batch ${offer.batchNumber}` : 'Batch on dispatch'}
                        {offer.expiryDate ? ` · expires ${formatDate(offer.expiryDate)}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="price">
                        {formatMoney(offer.sellingPrice)}
                        {offer.mrpReference ? <s>{formatMoney(offer.mrpReference)}</s> : null}
                      </div>
                      <div className="small faint">
                        {formatNumber(offer.sellableQuantity)} sellable
                        {offer.taxRate ? ` · GST ${offer.taxRate}%` : ''}
                      </div>
                      <div style={{ marginTop: 'var(--space-2)' }}>
                        <AddToCart
                          listingId={offer.listingId}
                          productName={product.name}
                          supplierName={offer.supplierName}
                          minimumOrderQuantity={offer.minimumOrderQuantity}
                          sellableQuantity={offer.sellableQuantity}
                          unitPrice={offer.sellingPrice}
                          restricted={product.restricted}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="stack">
          <div className="card tight">
            <h3>Product facts</h3>
            <table>
              <tbody>
                <tr>
                  <td className="muted">Generic name</td>
                  <td>{product.genericName ?? '—'}</td>
                </tr>
                <tr>
                  <td className="muted">Brand</td>
                  <td>{product.brandName ?? '—'}</td>
                </tr>
                <tr>
                  <td className="muted">Composition</td>
                  <td>{product.compositionSummary ?? '—'}</td>
                </tr>
                <tr>
                  <td className="muted">Dosage form</td>
                  <td>{product.dosageForm ?? '—'}</td>
                </tr>
                <tr>
                  <td className="muted">Storage</td>
                  <td>{product.storageRequirements ?? 'Standard'}</td>
                </tr>
                <tr>
                  <td className="muted">Fastest lead time</td>
                  <td>{fastestLeadTime ? `${fastestLeadTime} min` : '—'}</td>
                </tr>
                <tr>
                  <td className="muted">Catalogue updated</td>
                  <td>{formatDate(product.updatedAt)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {product.description && (
            <div className="card tight">
              <h3>Description</h3>
              <p className="small muted" style={{ margin: 0 }}>
                {product.description}
              </p>
            </div>
          )}

          <div className="card tight">
            <h3>Ordering rules</h3>
            <ul className="small muted" style={{ paddingLeft: '1.1rem', margin: 0 }}>
              <li>Stock is not reserved by the cart; it is reserved when checkout confirms.</li>
              <li>Every line is supplied by a single wholesaler, so one order can create several fulfilments.</li>
              <li>GST is applied per line from the supplier&apos;s tax rate.</li>
              <li>Status of this product: <span className={`badge ${statusTone('PUBLISHED')}`}>published</span></li>
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
