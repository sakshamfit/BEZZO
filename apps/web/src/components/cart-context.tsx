'use client';

/**
 * Cart context — the client half of the cart.
 *
 * Server-authoritative by design (the domain rule the cart screen already
 * documents): every mutation returns the cart and this context simply stores
 * it. The *display* is optimistic where that is safe: tapping ADD shows the
 * stepper immediately and rolls back if the server refuses; quantity values
 * shown between request and response are clearly pending, never committed
 * locally. Money is never computed here — totals always come from the API.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import type { Cart, ProductDetail } from '../lib/types';
import { useToast } from './toast';

interface CartContextValue {
  cart: Cart | null;
  /** True once a load finished (signed-out buyers simply stay false→cart null). */
  ready: boolean;
  isBuyer: boolean;
  /** Units in the cart, for badges. */
  unitCount: number;
  refresh: () => Promise<void>;
  /** Server-known quantity for a product (summed across supplier lines). */
  quantityForProduct: (productId: string) => number;
  /** A product-level add is in flight (pending optimistic state). */
  addingProduct: (productId: string) => boolean;
  /** First (cheapest) cart line for a product, if any. */
  lineForProduct: (productId: string) => Cart['items'][number] | null;
  /**
   * Add the best available offer of a product. `prefetch`-friendly: the product
   * detail is fetched once and cached, then the chosen listing is POSTed.
   */
  addBestOffer: (productId: string, options?: { quantity?: number }) => Promise<boolean>;
  /** Add a specific supplier listing (used by the PDP offer list). */
  addListing: (productId: string, listingId: string, quantity: number) => Promise<boolean>;
  /** Change a cart line's quantity (server clamps and re-prices). */
  setQuantity: (lineId: string, quantity: number) => Promise<boolean>;
  /** Remove a line entirely. */
  removeLine: (lineId: string) => Promise<boolean>;
  /** Clear every line (the API's own DELETE /cart). */
  clear: () => Promise<boolean>;
}

const CartContext = createContext<CartContextValue | null>(null);

/** Product-detail cache so a card ADD does not refetch what it already knows. */
const detailCache = new Map<string, ProductDetail>();
const detailInFlight = new Map<string, Promise<ProductDetail>>();

async function fetchProductDetail(productId: string): Promise<ProductDetail> {
  const cached = detailCache.get(productId);
  if (cached) return cached;
  const existing = detailInFlight.get(productId);
  if (existing) return existing;
  const promise = fetch(`/api/v1/catalog/products/${productId}`, { headers: { accept: 'application/json' } })
    .then(async (response) => {
      const payload = (await response.json()) as { success: boolean; data?: ProductDetail };
      if (!payload.success || !payload.data) throw new Error('Product could not be loaded');
      detailCache.set(productId, payload.data);
      return payload.data;
    })
    .finally(() => {
      detailInFlight.delete(productId);
    });
  detailInFlight.set(productId, promise);
  return promise;
}

/** Public helper: warm the cache when a user shows intent (pointer down on ADD). */
export function prefetchProductDetail(productId: string): void {
  void fetchProductDetail(productId).catch(() => undefined);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { ready: authReady, principal, request } = useAuth();
  const { toast } = useToast();
  const [cart, setCart] = useState<Cart | null>(null);
  const [ready, setReady] = useState(false);
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const loadedFor = useRef<string | null>(null);

  const isBuyer = Boolean(principal?.buyer);

  const refresh = useCallback(async () => {
    if (!principal?.buyer) return;
    try {
      setCart(await request<Cart>('/cart'));
    } catch {
      // The cart screen surfaces load errors; the badge simply stays as-is.
    } finally {
      setReady(true);
    }
  }, [principal, request]);

  useEffect(() => {
    if (!authReady) return;
    if (!principal?.buyer) {
      loadedFor.current = null;
      setCart(null);
      setReady(true);
      return;
    }
    if (loadedFor.current === principal.id) return;
    loadedFor.current = principal.id;
    void refresh();
  }, [authReady, principal, refresh]);

  const quantityForProduct = useCallback(
    (productId: string): number =>
      (cart?.items ?? [])
        .filter((line) => line.productId === productId)
        .reduce((total, line) => total + line.quantity, 0),
    [cart],
  );

  const lineForProduct = useCallback(
    (productId: string) => (cart?.items ?? []).find((line) => line.productId === productId) ?? null,
    [cart],
  );

  const addingProduct = useCallback((productId: string) => adding.has(productId), [adding]);

  const mutate = useCallback(
    async (path: string, method: string, body?: unknown): Promise<Cart | null> => {
      try {
        const next = await request<Cart>(path, { method, body });
        setCart(next);
        return next;
      } catch (caught) {
        const message =
          caught instanceof ApiError ? caught.message : 'That change was not accepted. Please try again.';
        toast({ title: message, tone: 'error' });
        return null;
      }
    },
    [request, toast],
  );

  const addListing = useCallback(
    async (productId: string, listingId: string, quantity: number): Promise<boolean> => {
      setAdding((current) => new Set(current).add(productId));
      try {
        const next = await mutate('/cart/items', 'POST', { supplierProductId: listingId, quantity });
        return next !== null;
      } finally {
        setAdding((current) => {
          const copy = new Set(current);
          copy.delete(productId);
          return copy;
        });
      }
    },
    [mutate],
  );

  const addBestOffer = useCallback(
    async (productId: string, options?: { quantity?: number }): Promise<boolean> => {
      setAdding((current) => new Set(current).add(productId));
      try {
        // Offers arrive best-price-first from the API; prefer the first in-stock offer.
        const detail = await fetchProductDetail(productId).catch(() => null);
        const offer = detail?.offers.find((candidate) => candidate.sellableQuantity > 0) ?? detail?.offers[0];
        if (!offer) {
          toast({ title: 'No verified supplier currently offers this product.', tone: 'error' });
          return false;
        }
        const quantity = Math.max(options?.quantity ?? 1, offer.minimumOrderQuantity);
        // The API's contract is `supplierProductId` (the supplier listing id).
        const next = await mutate('/cart/items', 'POST', { supplierProductId: offer.listingId, quantity });
        return next !== null;
      } finally {
        setAdding((current) => {
          const copy = new Set(current);
          copy.delete(productId);
          return copy;
        });
      }
    },
    [mutate, toast],
  );

  const setQuantity = useCallback(
    async (lineId: string, quantity: number): Promise<boolean> => {
      const next = await mutate(`/cart/items/${lineId}`, 'PATCH', { quantity });
      return next !== null;
    },
    [mutate],
  );

  const removeLine = useCallback(
    async (lineId: string): Promise<boolean> => {
      const next = await mutate(`/cart/items/${lineId}`, 'DELETE');
      return next !== null;
    },
    [mutate],
  );

  const clear = useCallback(async (): Promise<boolean> => {
    const next = await mutate('/cart', 'DELETE');
    return next !== null;
  }, [mutate]);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      ready,
      isBuyer,
      unitCount: cart?.unitCount ?? 0,
      refresh,
      quantityForProduct,
      addingProduct,
      lineForProduct,
      addBestOffer,
      addListing,
      setQuantity,
      removeLine,
      clear,
    }),
    [
      cart,
      ready,
      isBuyer,
      refresh,
      quantityForProduct,
      addingProduct,
      lineForProduct,
      addBestOffer,
      addListing,
      setQuantity,
      removeLine,
      clear,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}
