'use client';

/**
 * Offer panel + sticky purchase bar — the product page's transactional core.
 *
 * Supplier offers arrive best-price-first from the API. The buyer picks one
 * (default: cheapest in-stock); ADD posts that exact listing with at least its
 * MOQ. The stepper then edits the real cart line server-side. The sticky bar
 * keeps the price and the action reachable on every scroll position.
 */
import { useState } from 'react';
import { useCart } from '../../../components/cart-context';
import { QuantityStepper } from '../../../components/quantity-stepper';
import { BoltIcon, CheckIcon, ClockIcon, PlusIcon, VerifiedIcon } from '../../../components/icons';
import { formatDate, formatMoney, formatNumber } from '../../../lib/format';
import type { SupplierOffer } from '../../../lib/types';

function bestOfferIndex(offers: SupplierOffer[]): number {
  const inStock = offers.findIndex((offer) => offer.sellableQuantity > 0);
  return inStock >= 0 ? inStock : 0;
}

export function OfferPanel({
  productId,
  productName,
  restricted,
  offers,
  currency,
}: {
  productId: string;
  productName: string;
  restricted: boolean;
  offers: SupplierOffer[];
  currency: string;
}) {
  const { lineForProduct, addingProduct, addListing, setQuantity, removeLine, quantityForProduct } =
    useCart();
  const [selected, setSelected] = useState(() => bestOfferIndex(offers));

  const offer = offers[selected];
  const pendingAdd = addingProduct(productId);
  const quantity = quantityForProduct(productId);
  const line = lineForProduct(productId);
  const showStepper = quantity > 0 || (pendingAdd && quantity === 0);

  if (offers.length === 0) {
    return (
      <div className="empty-card">
        <span className="ec-title">No verified supplier currently offers this product</span>
        <p className="ec-body">
          Offers appear here as soon as a verified wholesaler publishes stock. Check back soon —
          availability updates the moment stock is listed.
        </p>
      </div>
    );
  }

  if (!offer) return null;

  return (
    <>
      {restricted && (
        <div className="alert warn" role="note" style={{ marginBottom: 'var(--space-md)' }}>
          This is a scheduled/controlled medicine. Availability is shown, but only a store with a
          verified drug licence can order it.
        </div>
      )}

      <div className="stack tight" role="radiogroup" aria-label="Choose a supplier">
        {offers.map((candidate, index) => {
          const isSelected = index === selected;
          const outOfStock = candidate.sellableQuantity <= 0;
          return (
            <button
              key={candidate.listingId}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`offer-row${isSelected ? ' selected' : ''}`}
              onClick={() => setSelected(index)}
              style={outOfStock ? { opacity: 0.62 } : undefined}
            >
              <span className="or-radio" aria-hidden="true" />
              <span className="or-body">
                <span className="or-name">
                  {candidate.supplierName}
                  <span className="badge ok" style={{ minHeight: 20 }}>
                    <VerifiedIcon size={11} /> Verified
                  </span>
                  {index === bestOfferIndex(offers) && offers.length > 1 && (
                    <span className="chip plain" style={{ minHeight: 20 }}>
                      Best price
                    </span>
                  )}
                </span>
                <span className="or-meta">
                  {candidate.supplierCity ?? 'Location not recorded'} · MOQ{' '}
                  {formatNumber(candidate.minimumOrderQuantity)}
                  {candidate.leadTimeMinutes !== null ? ` · ready in ~${candidate.leadTimeMinutes} min` : ''}
                </span>
                <span className="or-meta">
                  {outOfStock ? (
                    <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Out of stock</span>
                  ) : (
                    <>
                      {formatNumber(candidate.sellableQuantity)} sellable
                      {candidate.batchNumber ? ` · batch ${candidate.batchNumber}` : ''}
                      {candidate.expiryDate ? ` · exp ${formatDate(candidate.expiryDate)}` : ''}
                    </>
                  )}
                </span>
              </span>
              <span className="or-price">
                <span className="price" style={{ fontWeight: 700, fontSize: '1rem' }}>
                  {formatMoney(candidate.sellingPrice, currency)}
                  {candidate.mrpReference ? <s>{formatMoney(candidate.mrpReference, currency)}</s> : null}
                </span>
                <span className="small faint">
                  {candidate.taxRate !== null ? `+${candidate.taxRate}% GST` : 'GST at invoice'}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 'var(--space-md)', maxWidth: 320 }}>
        {showStepper ? (
          <QuantityStepper
            label={productName}
            value={quantity > 0 ? quantity : Math.max(1, offer.minimumOrderQuantity)}
            min={line ? line.minimumOrderQuantity : offer.minimumOrderQuantity}
            max={line ? Math.max(line.sellableQuantity, line.minimumOrderQuantity) : Math.max(offer.sellableQuantity, offer.minimumOrderQuantity)}
            pending={pendingAdd}
            compact
            onDecrease={() => {
              if (!line) return;
              if (line.quantity - 1 < line.minimumOrderQuantity) void removeLine(line.id);
              else void setQuantity(line.id, line.quantity - 1);
            }}
            onIncrease={() => {
              if (line) void setQuantity(line.id, line.quantity + 1);
              else void addListing(productId, offer.listingId, offer.minimumOrderQuantity);
            }}
          />
        ) : (
          <button
            type="button"
            className="add-btn solid"
            disabled={pendingAdd || offer.sellableQuantity <= 0}
            onClick={() => void addListing(productId, offer.listingId, offer.minimumOrderQuantity)}
          >
            <PlusIcon size={16} />
            {offer.sellableQuantity <= 0 ? 'SELECT ANOTHER SUPPLIER' : 'ADD TO CART'}
          </button>
        )}
        <p className="hint" style={{ marginTop: 6 }}>
          Minimum order {formatNumber(offer.minimumOrderQuantity)} unit
          {offer.minimumOrderQuantity === 1 ? '' : 's'} from this supplier. Stock is reserved when the
          order is placed, not by the cart.
        </p>
      </div>

      {/* Sticky mobile purchase bar */}
      <div className="stickybar page-stickybar">
        <div className="container stickybar-inner">
          <div className="sb-info">
            <span className="sb-title">
              {formatMoney(offer.sellingPrice, currency)}
              {offers.length > 1 ? (
                <span className="sb-sub" style={{ display: 'block' }}>
                  {offers.length} suppliers · from {offer.supplierName}
                </span>
              ) : (
                <span className="sb-sub" style={{ display: 'block' }}>
                  {offer.supplierName}
                </span>
              )}
            </span>
          </div>
          {showStepper ? (
            <QuantityStepper
              label={productName}
              value={quantity > 0 ? quantity : Math.max(1, offer.minimumOrderQuantity)}
              min={line ? line.minimumOrderQuantity : offer.minimumOrderQuantity}
              max={line ? Math.max(line.sellableQuantity, line.minimumOrderQuantity) : Math.max(offer.sellableQuantity, offer.minimumOrderQuantity)}
              pending={pendingAdd}
              compact
              onDecrease={() => {
                if (!line) return;
                if (line.quantity - 1 < line.minimumOrderQuantity) void removeLine(line.id);
                else void setQuantity(line.id, line.quantity - 1);
              }}
              onIncrease={() => {
                if (line) void setQuantity(line.id, line.quantity + 1);
                else void addListing(productId, offer.listingId, offer.minimumOrderQuantity);
              }}
            />
          ) : (
            <button
              type="button"
              className="btn accent"
              disabled={pendingAdd || offer.sellableQuantity <= 0}
              onClick={() => void addListing(productId, offer.listingId, offer.minimumOrderQuantity)}
            >
              {offer.sellableQuantity <= 0 ? 'Out of stock' : 'Add to cart'}
              <BoltIcon size={16} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** Availability summary line for the PDP header. */
export function OfferSummary({ offers }: { offers: SupplierOffer[] }) {
  const sellable = offers.reduce((total, offer) => total + offer.sellableQuantity, 0);
  const fastest = offers
    .map((offer) => offer.leadTimeMinutes)
    .filter((minutes): minutes is number => minutes !== null)
    .sort((a, b) => a - b)[0];

  if (sellable <= 0) {
    return <span className="badge danger">Out of stock everywhere</span>;
  }
  return (
    <span className="pill-row">
      <span className="badge ok">
        <CheckIcon size={11} /> {formatNumber(sellable)} units available
      </span>
      {fastest !== undefined && (
        <span className="badge info">
          <ClockIcon size={11} /> fastest ~{fastest} min
        </span>
      )}
    </span>
  );
}
