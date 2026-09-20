# BEZZO UI audit & marketplace redesign (2026-09-20)

Scope: the audit the redesign brief asked for (§29), then the redesign itself. The brief: bring the
usability quality of modern quick-commerce apps to BEZZO's own identity — fast, clean, visual,
category-driven, mobile-first — **without** copying any competitor's brand, colours, assets, copy or
screen designs. Everything below is grounded in the code as it stood at `74b8053`.

---

## 1. Existing design system

`apps/web/src/app/globals.css` — one shared stylesheet ("Clinical Precision"): tokens (navy `#0A2156`,
teal accent `#00BFA5`, Plus Jakarta Sans + Space Mono, 8-pt spacing, 1px slate borders, status chips
with 6px dot), plus component classes (`btn`, `card`, `badge`, `table`, `field`, `choice`, `skeleton`,
`stage-track`…). Strengths: consistent, light-first, documented conflicts. Gaps for a marketplace:
no motion tokens, no touch-target rule, no product-card/category/rail/search/stepper/toast/bottom-nav
primitives, no safe-area handling, no reduced-motion guard.

## 2. Existing screens

Public landing (`/`), catalogue (`/catalog` + product detail), cart, checkout, orders + order detail,
login/register, account, notifications, platform status, partner apply; supplier workspace (dashboard,
fulfilments + detail, inventory, listings); admin (applications queue, payments backoffice).

## 3. Existing components

Only `AppShell` (chrome) and one page-local filter component. Everything else is inlined per page —
no product card, no visual, no stepper, no toast, no skeleton primitives. The web app is a consumer
of the published API contract (envelope unwrapping, idempotency keys, one refresh-and-retry).

## 4. Existing navigation

Single sticky top bar with role-aware links; no bottom navigation, no search in chrome, no cart
indicator. On a phone the nav wraps and consumes the first screen.

## 5. Existing marketplace experience

The landing page is marketing-first: the buyer's actual product surface starts at `/catalog`, which
is a dense, desktop-shaped filter-sidebar table of cards. No home rails, no quick re-order, no
visual categories, no quick add (the only add-to-cart lives on the product detail page, one supplier
offer at a time).

## 6. Current mobile experience

Functional but desktop-shrunk: tables (cart, order items) force horizontal scroll, navigation wraps,
the catalogue sidebar stacks above results, CTAs sit below long content, and every "loading" state is
a text line ("Loading your cart…"). No bottom nav, no sticky purchase actions, no safe-area padding.

## 7. Current desktop experience

Good information density and honesty (per-supplier offer lists, live re-pricing), but wide pages
(1440px) stretch product grids and tables thin; search is a form field inside the filter sidebar.

## 8. UX problems

1. No search-first entry: search is one of several filters, not the primary action.
2. No marketplace home: the buyer lands on marketing, not on "what can I buy".
3. Categories are a text list, not a visual, scannable system.
4. No quick add: every purchase costs a page navigation + scroll.
5. Cart feedback is slow-feeling: quantity edits disable the whole line and wait for the server with
   no optimistic display; no toast on add.
6. No cart badge / count anywhere in the chrome.
7. Order tracking is status chips + a raw timeline table — no visual progress narrative connected to
   the fulfilment state machine (CREATED→ALLOCATED→PICKING→PACKED→READY_FOR_PICKUP→…→DELIVERED).
8. Empty/loading states are text, not structured skeletons or illustrated empty states.
9. Mobile: tables, wrapping nav, no thumb-reachable navigation or sticky CTAs.

## 9. Performance problems

- No route-level skeletons (blank paint while server components fetch).
- No suggestion caching/debounce layer client-side (the type-ahead in filters refetches per keystroke
  without abort).
- `cache: 'no-store'` on every browser call is correct for price-sensitive reads but the catalogue
  list and category reads from server components already revalidate; client suggestion results were
  never cached at all.
- No image discipline — but also no images: the catalogue is text-only, which reads "spreadsheet",
  not "marketplace".

## 10. Missing screens

- A retailer marketplace home (rails: quick order, frequently/Recently ordered, recommended).
- A categories hub page.
- A picker surface (no picker endpoints exist yet — Phase 7 is NOT IMPLEMENTED; the redesign adds an
  honest, role-gated shell, not a fake flow).
- An admin operations home (queues exist as two separate pages only).

## 11. Recommended redesign order (what this slice does)

1. Design-system v2 (tokens, motion, touch, marketplace primitives) — keep every existing class so
   supplier/admin/account pages keep working.
2. Chrome: sticky header with search + deliver-to + cart badge, mobile bottom nav, toasts.
3. Retailer home with rails.
4. Search experience (debounced, cached, keyboard-navigable suggestions; recent searches).
5. Categories hub + visual category rail.
6. Compact product cards with quick add (server-authoritative, optimistic display only).
7. Product detail (offer selection, sticky mobile CTA, related rail).
8. Cart (supplier-grouped compact rows, steppers, sticky checkout bar).
9. Checkout restyle (same two-step server-authoritative flow).
10. Orders + visual tracking timeline bound to the real fulfilment state machine.
11. Supplier dashboard home (operational metrics + queues).
12. Picker shell (honest) + admin home.

## Non-negotiables carried into the redesign

- Server stays authoritative: optimistic UI is display-only and rolls back on error; money and stock
  are never computed in the client; state machines are never advanced by the UI.
- No fake data in production paths: rails are derived from real endpoints; the picker surface states
  the truth (no dispatch backend yet) instead of simulating scans.
- Pharmaceutical trust over urgency: no countdown pressure, no "only 2 left!" on medicines; supplier
  verification, prescription classification, batch/expiry and storage stay visible.
