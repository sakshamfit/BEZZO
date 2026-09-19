# Bezzo Frontend Implementation Standards & Coding Conventions Specification v1.0

**Product:** Bezzo  
**Document:** Frontend Implementation Standards & Coding Conventions  
**Version:** 1.0  
**Status:** Baseline / Engineering Standard  
**Platforms:** Web, Android, iOS  
**Primary Languages:** TypeScript, React, React Native

---

# 1. Purpose

This document defines the engineering standards that frontend developers must follow when implementing Bezzo.

It establishes conventions for:

- TypeScript
- React
- Next.js
- React Native
- project structure
- naming
- components
- hooks
- state management
- API integration
- forms
- validation
- error handling
- asynchronous operations
- testing
- accessibility
- performance
- security
- logging
- analytics
- code review
- Git workflow
- documentation

The objective is to keep the Bezzo frontend consistent, maintainable, testable, secure, and scalable as the product grows.

---

# 2. Engineering Principles

All frontend implementation should follow these principles.

## 2.1 Readability over cleverness

Prefer code that another engineer can understand quickly.

Avoid:

- unnecessary abstractions
- clever one-liners
- deeply nested logic
- implicit behavior
- premature optimization

## 2.2 Explicit boundaries

Features should have clear boundaries.

A catalog feature should not directly manipulate supplier settlement internals.

A UI component should not directly know how the payment backend works.

## 2.3 Strong typing

Avoid `any` unless there is a documented and justified exception.

Prefer:

- explicit interfaces/types
- discriminated unions
- typed API responses
- typed function parameters
- typed navigation parameters

## 2.4 Server authority

The frontend is a client of Bezzo backend services.

The frontend must never assume that local state is authoritative for:

- price
- inventory
- payment
- order status
- permissions
- supplier verification
- delivery status

---

# 3. TypeScript Standards

TypeScript strict mode is required.

Recommended baseline:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

The exact compiler configuration may be adjusted during implementation, but type safety must remain strict.

---

# 4. Type Naming

Use PascalCase for:

- types
- interfaces
- classes
- enums where used

Examples:

```ts
type Product = {};
interface SupplierProfile {}
class ApiClient {}
```

Use camelCase for:

- variables
- functions
- properties
- hooks

Examples:

```ts
const productId = "123";

function loadProducts() {}

function useOrderDetails() {}
```

---

# 5. File Naming

Use predictable names.

Recommended:

```text
product-card.tsx
product-card.test.tsx
product-card.stories.tsx
use-product-search.ts
product-types.ts
product-api.ts
```

React component names remain PascalCase in source:

```tsx
export function ProductCard() {}
```

Avoid inconsistent naming such as:

```text
ProductCardComponent.tsx
productCard.tsx
product_card.tsx
```

unless an established platform convention requires it.

---

# 6. Folder Naming

Use feature-oriented folders.

Example:

```text
features/
  catalog/
    components/
    hooks/
    api/
    screens/
    types/
    validation/
```

Do not create large generic folders where unrelated business logic accumulates.

Avoid:

```text
components/
  Everything.tsx
```

or:

```text
utils/
  500 unrelated functions
```

---

# 7. Import Standards

Imports should follow a predictable order:

1. framework/library imports
2. external packages
3. shared packages
4. feature-local imports
5. relative imports

Example:

```ts
import { useMemo } from "react";

import { ProductCard } from "@bezzo/ui";
import { useProductSearch } from "@bezzo/catalog";

import { SearchFilters } from "./SearchFilters";
```

Prefer path aliases over long relative paths.

---

# 8. Component Standards

Components should generally follow:

```text
Props
↓
Hooks
↓
Derived state
↓
Event handlers
↓
Render
```

Keep components focused.

If a component becomes responsible for:

- API calls
- business rules
- form validation
- complex state
- rendering multiple unrelated sections

consider splitting it.

---

# 9. Component Props

Props should be explicit.

Prefer:

```ts
interface ProductCardProps {
  product: Product;
  onAddToCart?: (productId: string) => void;
}
```

Avoid excessive optional props that create many ambiguous combinations.

If a component has too many modes, split it into focused components or use an explicit variant model.

---

# 10. Component Variants

Use explicit variants.

Example:

```ts
type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost";
```

Prefer this over loosely typed strings.

---

# 11. Hooks

Custom hooks must begin with `use`.

Examples:

```text
useAuth
useCurrentUser
useProductSearch
useCart
useOrder
useSupplierInventory
```

Hooks should have one coherent responsibility.

Avoid a single hook such as:

```text
useEverything()
```

that combines authentication, cart, orders, analytics, and UI state.

---

# 12. Hook Rules

Follow React hook rules strictly.

Hooks must:

- be called at the top level
- not be called conditionally
- not be called inside loops
- not be called inside ordinary helper functions

---

# 13. Derived State

Do not store values that can safely be calculated.

Prefer:

```ts
const total = items.reduce(
  (sum, item) => sum + item.price * item.quantity,
  0
);
```

instead of maintaining a second manually synchronized `total` state.

This reduces inconsistent state.

---

# 14. State Management Rules

Before adding state, determine what type it is.

Ask:

1. Is it server data?
2. Is it form state?
3. Is it local component state?
4. Is it shared application state?
5. Is it URL state?

Use the smallest appropriate scope.

---

# 15. URL State

Use URL parameters for shareable/searchable state where appropriate.

Examples:

```text
/search?q=paracetamol
/search?category=analgesics
/products?manufacturer=...
```

This improves:

- navigation
- browser history
- sharing
- debugging
- reproducibility

---

# 16. Server State

Server state must have a defined caching and invalidation strategy.

After a mutation such as:

```text
inventory update
```

related cached inventory data must be invalidated or updated correctly.

Never assume that changing local state automatically updates backend truth.

---

# 17. API Client Rules

Components must not scatter raw HTTP requests.

Avoid:

```tsx
function ProductPage() {
  fetch("/api/products/123");
}
```

Prefer:

```text
Component
  ↓
Hook
  ↓
Feature API function
  ↓
Shared API client
```

---

# 18. API Functions

API functions should be small and domain-specific.

Example:

```ts
getProduct(productId)
searchProducts(filters)
addCartItem(payload)
updateInventory(payload)
```

Avoid generic functions that hide domain meaning:

```ts
doRequest()
processThing()
callBackend()
```

unless they are low-level infrastructure functions.

---

# 19. API Error Handling

Normalize backend errors into frontend-safe error types.

Example:

```ts
type ApiError = {
  code: string;
  message: string;
  requestId?: string;
  fieldErrors?: Record<string, string[]>;
};
```

UI components should not need to understand raw HTTP library errors.

---

# 20. Error Messages

User-facing messages must be clear and actionable.

Bad:

```text
HTTP 409
```

Better:

```text
This item is no longer available in the selected quantity.
Please update your cart.
```

Technical details should be available through logging/diagnostics rather than exposed directly to users.

---

# 21. Async Operations

Every meaningful asynchronous operation should consider:

```text
idle
loading
success
error
```

Some workflows may additionally require:

```text
retrying
partial
cancelled
expired
```

---

# 22. Duplicate Submission Prevention

Buttons that trigger mutations must prevent accidental duplicate operations.

Examples:

- Place Order
- Pay Now
- Add Product
- Submit Verification
- Confirm Refund

Use:

- disabled/loading states
- request idempotency where supported
- backend idempotency for critical operations

Frontend protection alone is not sufficient.

---

# 23. Forms

Forms should use a consistent structure:

```text
Form
├── Section
├── Field
├── Validation
└── Submission
```

Every field should have:

- label
- input
- validation
- accessible error
- optional helper text

---

# 24. Validation

Validation should exist at multiple layers:

```text
UI validation
     ↓
API validation
     ↓
Backend business validation
     ↓
Database constraints where appropriate
```

Frontend validation is for user experience.

Backend validation remains authoritative.

---

# 25. Sensitive Forms

For forms containing:

- business documents
- payment information
- identity data
- licensing data

do not log field values.

Do not include sensitive values in analytics.

Do not persist sensitive drafts unless explicitly designed and secured.

---

# 26. React Rendering

Avoid unnecessary re-renders.

Use memoization only when there is a measurable benefit or clear expensive computation.

Do not automatically wrap everything in:

```text
useMemo
useCallback
memo
```

Premature memoization increases complexity.

---

# 27. Lists

Large lists must be designed for scale.

Use:

- pagination
- cursor pagination where supported
- virtualization
- incremental loading

Do not render thousands of products/orders simultaneously.

---

# 28. Search Inputs

Search should normally be debounced.

Example conceptual behavior:

```text
User types
   ↓
wait briefly
   ↓
request search
```

Do not issue a backend request for every keystroke unless explicitly required.

Search requests should also support cancellation or stale-response protection.

---

# 29. Forms and Unsaved Changes

For long forms such as:

- supplier onboarding
- product creation
- verification

consider warning users before navigating away when unsaved data would otherwise be lost.

---

# 30. Accessibility Coding Standards

Every interactive element must be keyboard/touch accessible.

Prefer semantic elements:

```html
<button>
<a>
<form>
<label>
<nav>
<header>
<main>
<section>
```

Avoid replacing semantic HTML with generic `div` elements.

---

# 31. Accessibility Labels

Icons that communicate actions must have accessible labels.

Example:

```tsx
<IconButton
  aria-label="Remove product from cart"
/>
```

Decorative icons should not create unnecessary screen-reader noise.

---

# 32. Focus Management

Focus must be intentionally managed for:

- dialogs
- drawers
- navigation changes where required
- validation failures
- dynamically inserted content

Closing a modal should normally return focus to the triggering control.

---

# 33. Keyboard Navigation

Web interfaces must support keyboard navigation for:

- menus
- dialogs
- forms
- filters
- tables
- pagination
- search
- checkout

---

# 34. Mobile Touch Interaction

Mobile controls must provide practical touch targets.

Avoid placing tiny controls next to each other where accidental taps are likely.

Destructive actions should not be triggered by ambiguous gestures.

---

# 35. Styling Standards

Prefer the project's centralized design system.

Do not create arbitrary one-off values when a design token exists.

Avoid:

```text
margin: 13px
```

when the design system already defines an appropriate spacing token.

Exceptions must have a design reason.

---

# 36. Responsive Rules

Responsive behavior should be defined at the component level where appropriate.

Components should specify how they behave at:

- mobile
- tablet
- desktop
- large desktop

Do not simply shrink desktop layouts until they become unusable.

---

# 37. Loading UI Standards

Use skeletons for predictable content layouts.

Use inline loading states for actions.

Example:

```text
Save Inventory
   ↓
Saving...
```

Do not block the entire application for a small background operation.

---

# 38. Empty UI Standards

Every list must define an empty state.

An empty state should answer:

1. What is empty?
2. Why might it be empty?
3. What can the user do next?

---

# 39. Error Boundary Standards

Major application sections should have appropriate error boundaries.

A failure in one non-critical section should not unnecessarily crash the entire application.

Examples:

```text
Product recommendations
Order history
Analytics widget
Supplier dashboard panel
```

---

# 40. Security Coding Rules

Never put secrets in:

- source code
- frontend environment variables intended for public exposure
- mobile bundles
- analytics events
- browser local storage unless explicitly appropriate and non-sensitive

Never trust client-provided:

- role
- price
- inventory
- discount
- payment status
- order ownership

---

# 41. Authentication Storage

Authentication implementation must follow the security architecture.

Prefer secure mechanisms appropriate to each platform.

Do not store sensitive long-lived credentials in ordinary unencrypted storage.

Mobile applications should use platform secure storage.

Web authentication should use the backend-approved session/token model.

---

# 42. Logging

Frontend logs should be:

- structured
- useful
- sanitized

Never log:

- passwords
- access tokens
- payment credentials
- document contents
- unnecessary personal information

---

# 43. Analytics Rules

Analytics events should use stable names.

Example:

```text
product_viewed
cart_item_added
checkout_started
order_placed
```

Avoid changing event names casually because analytics history becomes fragmented.

Event payloads should be documented.

---

# 44. Performance Coding Rules

Developers should avoid:

- huge dependencies for simple operations
- importing entire libraries when tree-shaking cannot remove unused code
- unnecessary client components
- large synchronous computations during render
- unoptimized images
- repeated API calls
- unbounded lists

---

# 45. Next.js Rules

Use server-first architecture where practical.

Keep client components limited to areas requiring:

- browser APIs
- interactive state
- event handlers
- client-only libraries

Avoid turning entire application trees into client components unnecessarily.

---

# 46. React Native Rules

Platform differences should be isolated behind adapters when possible.

Example:

```text
platform/
  storage/
  notifications/
  camera/
  document-picker/
```

Avoid scattering platform checks throughout business logic.

---

# 47. Navigation Standards

Navigation should be typed.

Routes/screens should have explicit parameter definitions.

Protected routes must validate session state.

Navigation must not be treated as authorization.

---

# 48. Deep Link Security

A deep link such as:

```text
bezzo://orders/123
```

must not grant access to order 123.

The backend must verify that the authenticated user can access that order.

---

# 49. File Upload Coding Standards

Uploads must:

- validate file size
- validate permitted file types
- display progress
- support failure/retry
- avoid loading unnecessarily large files into memory
- use secure upload mechanisms

The backend must perform authoritative validation.

---

# 50. Image Coding Standards

Images should specify appropriate sizing behavior.

Use responsive images where available.

Avoid loading high-resolution product images when a thumbnail is sufficient.

Provide fallback behavior for failed image loads.

---

# 51. Date and Currency Utilities

Never duplicate formatting logic across components.

Use centralized utilities:

```text
formatCurrency()
formatDate()
formatTime()
formatDateTime()
formatQuantity()
```

This prevents inconsistent presentation.

---

# 52. Business Logic Placement

Business logic should live in domain/feature services or hooks rather than being embedded deeply inside JSX.

Bad:

```tsx
{price > 1000 &&
  supplier.verified &&
  inventory > quantity &&
  paymentMethod === "COD" && ...}
```

Prefer a named domain decision:

```ts
const canUseCod = canUseCashOnDelivery(context);
```

This improves testing and readability.

---

# 53. Financial Logic

Frontend must not be the authority for:

- tax calculation
- final order total
- discounts
- payment authorization
- supplier settlement
- refunds

The frontend displays backend-confirmed values.

---

# 54. Inventory Logic

Frontend inventory displays are informational.

Never assume:

```text
available === true
```

means inventory remains available until checkout.

Inventory must be revalidated by backend workflows.

---

# 55. Order State Logic

Do not hard-code arbitrary status transitions in UI.

Use backend-defined state values and transition permissions.

For example:

```text
PENDING
CONFIRMED
PROCESSING
READY_FOR_PICKUP
OUT_FOR_DELIVERY
DELIVERED
CANCELLED
```

The exact authoritative state machine is defined by the backend business-rules specification.

---

# 56. Testing Standards

Every production feature should have an appropriate test layer.

Minimum expectations:

- unit tests for reusable logic
- component tests for complex components
- integration tests for important API workflows
- E2E tests for critical user journeys

---

# 57. Test Naming

Tests should describe behavior.

Prefer:

```text
shows validation error when GSTIN is invalid
prevents duplicate order submission
renders out-of-stock state
allows supplier to update inventory
```

Avoid vague names:

```text
works
test1
renders correctly
```

---

# 58. Test Isolation

Tests should not depend on execution order.

Each test should establish its own required state.

Avoid hidden global test state.

---

# 59. API Mocking

Frontend tests should use controlled API mocks.

Mocks must reflect documented API contracts.

Do not create fake response structures that differ from the actual API.

---

# 60. E2E Critical Journeys

The following should have E2E coverage:

### Buyer

```text
login
search
product view
add to cart
checkout
payment result
order confirmation
order tracking
```

### Supplier

```text
login
product creation
inventory update
order processing
fulfillment
```

### Admin

```text
login
supplier review
catalog moderation
order review
dispute handling
```

---

# 61. Git Standards

Use small, focused commits.

Commit messages should communicate intent.

Example:

```text
feat: add supplier inventory table
fix: prevent duplicate checkout submission
refactor: extract product price component
test: add checkout failure coverage
docs: update frontend conventions
```

---

# 62. Branching

A practical workflow:

```text
main
  ↑
feature/*
bugfix/*
hotfix/*
```

Production release strategy may evolve with CI/CD requirements.

Long-lived branches should be avoided where possible.

---

# 63. Pull Request Standards

Every PR should include:

- summary
- scope
- screenshots for UI changes
- test evidence
- migration/configuration notes where applicable
- known limitations

Reviewers should verify:

- correctness
- security
- performance
- accessibility
- maintainability
- test coverage

---

# 64. Code Review Checklist

Reviewers should ask:

### Architecture

- Is the feature in the correct module?
- Are dependencies flowing correctly?

### Type safety

- Is unsafe typing introduced?
- Are API contracts respected?

### UI

- Are states handled?
- Is the UI responsive?

### Accessibility

- Can keyboard/touch users operate it?
- Are labels and focus states correct?

### Security

- Is sensitive information exposed?
- Are permissions incorrectly assumed?

### Performance

- Are there unnecessary requests?
- Are large lists handled correctly?

### Testing

- Is critical behavior covered?

---

# 65. Dependency Management

Dependencies should be added only when they provide clear value.

Before adding a package, evaluate:

- maintenance
- security
- bundle impact
- licensing
- compatibility
- community maturity
- whether existing platform capabilities are sufficient

Avoid multiple libraries solving the same problem.

---

# 66. Feature Flags

Feature flags must be typed where possible.

Avoid scattered literal strings:

```text
"new_checkout"
```

Prefer a centralized feature definition.

Flags should also have owners and cleanup expectations.

Temporary flags must eventually be removed.

---

# 67. Configuration Management

Configuration should be centralized and typed.

Separate:

```text
build configuration
runtime configuration
feature configuration
environment configuration
```

Never silently fall back to dangerous production defaults.

---

# 68. Internationalization Coding Rules

All user-facing text should be translation-ready.

Avoid:

```tsx
<span>Order placed successfully</span>
```

Prefer:

```tsx
<span>{t("orders.placed_successfully")}</span>
```

Do not construct sentences by concatenating translated fragments where grammar can vary by language.

---

# 69. Accessibility and Localization Together

Components must support:

- longer translated strings
- larger text
- different writing systems
- right-to-left support if introduced later

Do not assume every label fits a fixed width.

---

# 70. Documentation Standards

Every major feature should document:

- purpose
- architecture
- API dependencies
- state behavior
- error behavior
- analytics events
- permissions
- tests

Shared components should have component-level documentation.

---

# 71. Frontend Definition of Ready

A feature is ready for implementation when:

- product requirements are understood
- API contract exists or is explicitly defined
- authorization rules are known
- UI states are defined
- loading/error/empty states are defined
- analytics requirements are known
- accessibility requirements are identified
- test scenarios are defined

---

# 72. Frontend Definition of Done

A feature is done when:

- implementation follows the architecture
- TypeScript checks pass
- linting passes
- formatting passes
- tests pass
- accessibility is reviewed
- responsive behavior is verified
- API errors are handled
- loading and empty states are handled
- security review requirements are met
- analytics are implemented
- documentation is updated
- code review is complete

---

# 73. Recommended Tooling Baseline

The implementation should establish standardized tooling for:

- TypeScript
- ESLint
- Prettier
- unit/component testing
- E2E testing
- component documentation
- dependency auditing
- Git hooks where useful
- CI validation

Exact tool versions should be pinned in the repository and upgraded through controlled dependency updates.

---

# 74. Engineering Quality Gates

A pull request should not be considered merge-ready when any required gate fails.

Conceptually:

```text
Install
  ↓
Type Check
  ↓
Lint
  ↓
Format Check
  ↓
Unit/Component Tests
  ↓
Build
  ↓
Integration/E2E as required
  ↓
Security/Dependency Checks
  ↓
Review
  ↓
Merge
```

---

# 75. Final Engineering Position

Bezzo frontend development should follow a **typed, feature-oriented, contract-driven architecture**.

The core standards are:

- strict TypeScript
- small focused components
- feature-based organization
- centralized API access
- explicit state ownership
- backend-authoritative business rules
- reusable design-system components
- accessible interfaces
- responsive layouts
- measurable performance
- secure data handling
- consistent analytics
- strong automated testing
- disciplined Git and code review practices

These standards are intended to prevent frontend complexity from growing faster than the Bezzo product itself.

The frontend must remain easy to understand for a new engineer while being capable of supporting a large B2B marketplace with buyers, suppliers, administrators, payments, logistics, inventory, and pharmaceutical catalog workflows.

---

**End of Specification**
