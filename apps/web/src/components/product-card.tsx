'use client';

/**
 * Product card — the atom of the marketplace.
 *
 * Compact, scannable, honest: visual, name, strength/pack, manufacturer, buyer
 * price from the cheapest verified supplier, supplier availability, stock flag,
 * prescription flag, and a one-tap add that resolves the best offer server-side.
 * Nothing here invents data — every field comes from `GET /catalog/products`,
 * and the quick add POSTs a real listing, so an error rolls the stepper back to
 * the ADD state with a toast instead of pretending.
 */
import Link from 'next/link';
import { prefetchProductDetail, useCart } from './cart-context';
import { ProductVisual } from './product-visual';
import { QuantityStepper } from './quantity-stepper';
import { BoltIcon, InfoIcon, PlusIcon, VerifiedIcon } from './icons';
import { formatMoney } from '../lib/format';
import type { ProductSummary } from '../lib/types';

const LOW_STOCK_UNITS = 50;

export function ProductCard({ product, href }: { product: ProductSummary; href?: string }) {
  const {
    quantityForProduct,
    lineForProduct,
    addingProduct,
    addBestOffer,
    setQuantity,
    removeLine,
  } = useCart();

  const quantity = quantityForProduct(product.id);
  const pendingAdd = addingProduct(product.id);
  const line = lineForProduct(product.id);
  const productHref = href ?? `/catalog/${product.id}`;

  // Pending add: show the stepper with the requested quantity before the
  // server answers — display-only optimism, rolled back on failure.
  const showStepper = quantity > 0 || (pendingAdd && quantity === 0);
  const displayQuantity = quantity > 0 ? quantity : 1;

  const stockFlag = !product.inStock
    ? 'out'
    : product.sellableQuantity > 0 && product.sellableQuantity <= LOW_STOCK_UNITS
      ? 'low'
      : null;

  const isRx = product.prescriptionClassification === 'PRESCRIPTION_REQUIRED';

  return (
    <article className="pcard">
      {stockFlag && (
        <span className={`stock-flag ${stockFlag}`}>
          {stockFlag === 'out' ? 'Out of stock' : 'Low stock'}
        </span>
      )}
      {isRx && (
        <span className="rx-flag" title="Prescription classification: prescription required">
          <InfoIcon size={14} />
          <span className="sr-only">Prescription required</span>
        </span>
      )}

      <Link href={productHref} className="pvisual-link" aria-label={`View ${product.name}`}>
        <ProductVisual
          productId={product.id}
          dosageForm={product.dosageForm}
          label={product.name}
        />
      </Link>

      <Link href={productHref} className="pcard-name" title={product.name}>
        {product.name}
      </Link>
      <div className="pcard-meta" title={product.manufacturerName ?? undefined}>
        {[product.strength, product.packSize].filter(Boolean).join(' · ') || product.dosageForm || '—'}
        {product.manufacturerName ? ` · ${product.manufacturerName}` : ''}
      </div>

      <div className="pcard-foot">
        <div className="pcard-pricecol">
          <div className="pcard-price">
            <span className="now">{product.minPrice !== null ? formatMoney(product.minPrice) : '—'}</span>
            {product.maxPrice !== null && product.maxPrice !== product.minPrice ? (
              <span className="mrp" title="Highest supplier price">
                to {formatMoney(product.maxPrice)}
              </span>
            ) : null}
          </div>

          <div className="pcard-suppliers">
            {product.supplierCount > 0 ? (
              <>
                <VerifiedIcon size={12} />
                {product.supplierCount} verified supplier{product.supplierCount === 1 ? '' : 's'}
              </>
            ) : (
              <>&nbsp;</>
            )}
          </div>
        </div>

        {showStepper ? (
          <QuantityStepper
            label={product.name}
            value={displayQuantity}
            min={line ? line.minimumOrderQuantity : 1}
            max={line ? Math.max(line.sellableQuantity, line.minimumOrderQuantity) : 9999}
            pending={pendingAdd}
            onDecrease={() => {
              if (!line) return;
              if (line.quantity - 1 < line.minimumOrderQuantity) {
                void removeLine(line.id);
              } else {
                void setQuantity(line.id, line.quantity - 1);
              }
            }}
            onIncrease={() => {
              if (line) void setQuantity(line.id, line.quantity + 1);
              else void addBestOffer(product.id);
            }}
          />
        ) : (
          <button
            type="button"
            className="add-btn"
            disabled={pendingAdd || !product.inStock}
            onPointerDown={() => prefetchProductDetail(product.id)}
            onFocus={() => prefetchProductDetail(product.id)}
            onClick={() => void addBestOffer(product.id)}
            title={product.inStock ? 'Add the best available supplier offer' : 'Out of stock — no supplier currently stocks this'}
          >
            {product.inStock ? (
              <>
                <PlusIcon size={15} /> ADD
              </>
            ) : (
              'Out of stock'
            )}
          </button>
        )}
      </div>
    </article>
  );
}

/** Skeleton twin, so loading states have exactly the card's shape. */
export function ProductCardSkeleton() {
  return (
    <div className="sk-pcard" aria-hidden="true">
      <div className="skeleton sk-visual" />
      <div className="skeleton" style={{ height: 13, width: '88%' }} />
      <div className="skeleton" style={{ height: 10, width: '62%' }} />
      <div className="skeleton" style={{ height: 15, width: '46%', marginTop: 4 }} />
      <div className="skeleton" style={{ height: 36, width: '100%', marginTop: 6 }} />
    </div>
  );
}

/**
 * Rail card for reorder surfaces — built from order line data (name, pack,
 * previous price, the exact listing bought before), so re-ordering is one tap
 * on a known-good supplier line.
 */
export function ReorderCard({
  productId,
  listingId,
  name,
  packSize,
  supplierName,
  unitPrice,
  quantity,
  href,
}: {
  productId: string;
  listingId: string;
  name: string;
  packSize: string | null;
  supplierName: string;
  unitPrice: number;
  quantity: number;
  href: string;
}) {
  const { quantityForProduct, addingProduct, addListing, setQuantity, lineForProduct, removeLine } =
    useCart();
  const inCart = quantityForProduct(productId);
  const pendingAdd = addingProduct(productId);
  const line = lineForProduct(productId);
  const showStepper = inCart > 0 || (pendingAdd && inCart === 0);

  return (
    <article className="pcard">
      <Link href={href} className="pvisual-link" aria-label={`View ${name}`}>
        <ProductVisual productId={productId} dosageForm={null} label={name} />
      </Link>
      <Link href={href} className="pcard-name" title={name}>
        {name}
      </Link>
      <div className="pcard-meta">
        {packSize ?? '—'} · {supplierName}
      </div>
      <div className="pcard-foot">
        <div className="pcard-pricecol">
          <div className="pcard-price">
            <span className="now">{formatMoney(unitPrice)}</span>
          </div>
          <div className="pcard-suppliers">
            <BoltIcon size={12} /> bought {quantity}
          </div>
        </div>
        {showStepper ? (
          <QuantityStepper
            label={name}
            value={inCart > 0 ? inCart : 1}
            min={line ? line.minimumOrderQuantity : 1}
            max={line ? Math.max(line.sellableQuantity, line.minimumOrderQuantity) : 9999}
            pending={pendingAdd}
            onDecrease={() => {
              if (!line) return;
              if (line.quantity - 1 < line.minimumOrderQuantity) void removeLine(line.id);
              else void setQuantity(line.id, line.quantity - 1);
            }}
            onIncrease={() => {
              if (line) void setQuantity(line.id, line.quantity + 1);
              else void addListing(productId, listingId, quantity);
            }}
          />
        ) : (
          <button
            type="button"
            className="add-btn"
            disabled={pendingAdd}
            onClick={() => void addListing(productId, listingId, quantity)}
          >
            <PlusIcon size={15} /> ADD
          </button>
        )}
      </div>
    </article>
  );
}
