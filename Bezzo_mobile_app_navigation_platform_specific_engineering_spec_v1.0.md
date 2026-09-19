# Bezzo Mobile App Navigation & Platform-Specific Engineering Specification v1.0

**Product:** Bezzo B2B Pharmaceutical Marketplace  
**Document Type:** Mobile Engineering Specification  
**Version:** 1.0  
**Status:** Implementation Baseline  
**Platforms:** Android + iOS  
**Framework:** React Native + TypeScript  
**Backend:** Bezzo REST API v1  
**Audience:** Mobile, frontend, backend, QA, DevOps, security and product teams

---

# 1. Purpose

This document defines the platform-specific engineering baseline for the Bezzo Android and iOS applications.

It builds on the shared frontend architecture and screen specification while defining mobile-specific behavior for:

- navigation
- authentication
- secure storage
- deep links
- push notifications
- permissions
- app lifecycle
- background behavior
- connectivity
- file and image selection
- camera usage
- document upload
- payment handoff
- delivery tracking
- Android-specific behavior
- iOS-specific behavior
- release engineering
- crash monitoring
- mobile testing

The mobile application must share the same backend contracts and domain rules as the Bezzo web application.

---

# 2. Mobile Architecture Principles

## 2.1 Shared business contract

Android and iOS must consume the same Bezzo API contracts.

The mobile client must not maintain a separate business-rule implementation for:

- pricing
- stock
- order state
- payment state
- supplier allocation
- delivery eligibility
- compliance decisions

## 2.2 Platform-native behavior

The application should share domain and feature logic but respect platform conventions.

Use shared code for:

- API client
- models
- validation
- query/state management
- domain presentation logic

Use platform-specific implementations for:

- secure storage
- notifications
- permissions
- file pickers
- camera
- maps where applicable
- payment/browser handoff
- lifecycle integration

---

# 3. Recommended Project Structure

```text
apps/
  mobile/
    src/
      app/
      navigation/
      screens/
      features/
      components/
      hooks/
      services/
      storage/
      notifications/
      permissions/
      deepLinks/
      analytics/
      platform/
      theme/
      assets/
      config/
```

Platform-specific files may use:

```text
Component.android.tsx
Component.ios.tsx
Component.native.tsx
```

Use platform-specific code only when behavior genuinely differs.

---

# 4. Application Roles

The mobile application supports:

```text
BUYER
SUPPLIER
```

Administrative operations should initially remain optimized for web unless a specific mobile operations requirement is approved.

After authentication:

```text
BUYER
  → Buyer mobile shell

SUPPLIER
  → Supplier mobile shell
```

Role authorization remains server-side.

---

# 5. Buyer Mobile Navigation

Recommended bottom navigation:

```text
Home
Categories
Search
Cart
Account
```

Orders should be accessible prominently from Account and Home, with optional direct access if usability testing supports it.

The navigation bar must remain lightweight and avoid excessive destinations.

---

# 6. Supplier Mobile Navigation

Recommended:

```text
Dashboard
Orders
Inventory
Products
Account
```

The most frequent supplier workflow should be accessible within one or two taps.

---

# 7. Navigation Stack

Use a root navigation structure conceptually equivalent to:

```text
Root
├── AuthStack
├── BuyerStack
│   ├── BuyerTabs
│   ├── ProductStack
│   ├── CheckoutStack
│   └── OrderStack
└── SupplierStack
    ├── SupplierTabs
    ├── OrderStack
    └── InventoryStack
```

Authentication state controls which stack is active.

Do not allow protected screens to render while authentication is unresolved.

---

# 8. Startup Flow

On app launch:

```text
Native startup
 ↓
Load minimal configuration
 ↓
Restore secure session
 ↓
Validate/refresh session
 ↓
Fetch /me
 ↓
Determine role
 ↓
Initialize role shell
 ↓
Load first-screen data
```

Startup must avoid blocking on non-critical API requests.

---

# 9. Splash Screen

The splash screen should remain visually simple.

It should not become a long loading screen.

The app should transition away from splash as soon as minimum startup requirements are complete.

If startup fails:

```text
retry
```

should be offered rather than leaving the user on an indefinite spinner.

---

# 10. Authentication

Authentication uses the shared API:

```text
POST /auth/register
POST /auth/login
POST /auth/verify-otp
POST /auth/refresh
POST /auth/logout
GET /me
```

The mobile app must handle:

- OTP verification
- session restoration
- token refresh
- logout
- expired sessions
- rate limits
- network interruption

---

# 11. Secure Token Storage

Access/refresh credentials must not be stored in ordinary unencrypted application preferences.

Use platform-secure storage:

### Android

Android Keystore-backed secure storage.

### iOS

Keychain-backed secure storage.

The abstraction should expose:

```ts
secureStorage.get()
secureStorage.set()
secureStorage.remove()
```

Application code should not depend directly on platform storage APIs.

---

# 12. Session Refresh

When an API returns an authentication-expired response:

```text
API request
 ↓
401
 ↓
refresh session
 ↓
retry original request once
```

Concurrent requests must share one refresh operation.

Do not start multiple refresh requests simultaneously.

If refresh fails:

```text
clear session
 ↓
navigate to login
```

---

# 13. Logout

Logout must:

1. call server logout where possible
2. clear secure credentials
3. clear user-specific query cache
4. clear private local state
5. unregister user-specific push associations where required
6. reset navigation
7. return to authentication

If the device is offline, local credential removal must still occur safely.

---

# 14. Buyer Home Screen

The buyer home screen should prioritize:

```text
Search
Categories
Recent purchases
Popular/relevant products
Orders
```

The mobile version should minimize vertical complexity.

Non-critical content should load progressively.

---

# 15. Category Navigation

Categories should support:

- top-level categories
- subcategories
- product results
- back navigation
- persistent filter state during navigation

API:

```text
GET /categories
GET /categories/{categoryId}
GET /categories/{categoryId}/children
GET /products
```

---

# 16. Mobile Search

Search should use a focused search screen.

Flow:

```text
tap search
 ↓
keyboard opens
 ↓
enter query
 ↓
debounce
 ↓
suggestions/results
```

Use native keyboard behavior.

The search field should remain accessible while scrolling results where practical.

---

# 17. Search Suggestions

Use:

```text
GET /search/suggestions
```

Suggestions should be lightweight.

Cancel stale requests when the user changes the query rapidly.

Only the latest relevant query should update the visible suggestion state.

---

# 18. Product List

Product list should use virtualized rendering.

Do not render thousands of products simultaneously.

Each card should support:

- image
- product name
- composition/strength where applicable
- pack size
- price
- availability
- quantity/add action

Images should use appropriately sized assets.

---

# 19. Product Detail

The product detail screen should support:

- swipeable image gallery
- medicine information
- composition
- strength
- dosage form
- manufacturer
- pack size
- supplier availability
- price
- quantity
- add to cart

API:

```text
GET /products/{productId}
GET /products/{productId}/listings
```

The UI must clearly distinguish unavailable products from available products.

---

# 20. Cart

Cart should be persistent through the backend.

API:

```text
GET /cart
POST /cart/items
PATCH /cart/items/{itemId}
DELETE /cart/items/{itemId}
```

When the application resumes from background, cart data should be refreshed where appropriate if it may have become stale.

---

# 21. Checkout Navigation

Recommended mobile checkout:

```text
Cart
 ↓
Address
 ↓
Delivery
 ↓
Review
 ↓
Payment
 ↓
Confirmation
```

Use a controlled navigation flow.

Do not allow users to bypass required server validation by jumping directly to payment.

---

# 22. Address Selection

Use:

- saved address cards
- add address
- edit address
- select address

The selected address must be validated by the server for delivery eligibility.

Avoid relying only on device GPS for delivery address.

---

# 23. Delivery Selection

Support:

```text
Instant
Scheduled
```

Scheduled slots are API-driven.

The app should clearly show:

- date
- slot label
- time range where provided
- fee
- availability

---

# 24. Checkout Review

The review screen should display server-authoritative:

- item totals
- discount
- tax
- delivery fee
- final total
- delivery mode
- selected address
- selected slot

Request:

```text
POST /checkout/quote
POST /checkout/validate
```

Refresh the quote when important checkout inputs change.

---

# 25. Payment Flow

Payment flow may require switching to a payment provider SDK or secure web/browser handoff.

The app must:

1. create payment through Bezzo backend
2. launch approved payment mechanism
3. receive return/callback
4. query authoritative payment/order status
5. show result

Never consider the client callback itself proof of successful payment.

---

# 26. Order Creation Idempotency

The mobile client must generate a unique idempotency key for a logical order submission.

If network connectivity disappears after submission:

```text
do not create a new random order request immediately
```

Retry the same logical request with the same idempotency key where appropriate.

---

# 27. Order Confirmation

After order creation/payment:

```text
GET /orders/{orderId}
```

The confirmation screen should be based on authoritative state.

Possible states:

```text
CONFIRMED
PAYMENT_PENDING
PROCESSING
FAILED
```

Do not show a false success screen if the backend has not confirmed the order.

---

# 28. Orders List

The orders screen should support:

- recent orders
- status
- date
- amount
- delivery status

Use paginated API loading.

Refresh when returning from an order detail screen if state may have changed.

---

# 29. Order Detail

The mobile order detail screen should use expandable sections:

```text
Order summary
Items
Delivery
Fulfillments
Payment
Timeline
Returns
Support
```

This reduces excessive vertical density.

---

# 30. Order Tracking

Tracking screen:

```text
Current status
ETA
Timeline
Delivery information
```

API:

```text
GET /orders/{orderId}/tracking
```

Use push/realtime updates when available, but reconcile against the API.

---

# 31. Push Notifications

Push notifications may be used for:

- order confirmation
- payment result
- supplier/order fulfillment updates
- delivery status
- scheduled delivery reminders
- return/refund updates
- support updates
- important account/compliance alerts

The notification should deep-link to the relevant screen.

---

# 32. Push Registration

Flow:

```text
App launch
 ↓
request notification permission when appropriate
 ↓
obtain device token
 ↓
associate token with authenticated user
```

Device tokens should not be treated as permanent.

Refresh/update them when the operating system changes them.

---

# 33. Notification Permission UX

Do not request notification permission immediately without context unless product policy requires it.

Prefer explaining the value first:

```text
Get delivery and order updates from Bezzo.
```

Then request permission.

The app must handle:

```text
granted
denied
restricted
not determined
```

---

# 34. Deep Linking

Deep links should support:

```text
Product
Category
Order
Tracking
Notification
Support ticket
```

Examples:

```text
https://bezzo.com/product/{id}
https://bezzo.com/order/{id}
```

Mobile universal/app links should resolve these into the native application where installed.

---

# 35. Deep-Link Authentication

If a deep link targets a protected resource:

```text
receive link
 ↓
store intended destination
 ↓
authenticate if needed
 ↓
authorize resource
 ↓
navigate
```

Never display private information before authentication and authorization complete.

---

# 36. App Lifecycle

The app must handle:

```text
foreground
background
inactive
resume
terminated
```

On resume:

- restore navigation
- validate session if needed
- refresh time-sensitive state
- reconcile pending operations
- process notification/deep-link state

Do not refetch every endpoint on every foreground event.

---

# 37. Background Processing

Background processing should be minimal.

Allowed use cases may include:

- push handling
- controlled cache refresh
- upload continuation where supported
- notification processing
- telemetry

Do not depend on background execution for critical business transactions.

---

# 38. Offline Behavior

Bezzo is an online-first pharmaceutical commerce application.

Offline support should prioritize:

- graceful error messaging
- cached non-sensitive content
- retry
- session handling
- safe UI state preservation

Do not allow offline creation of authoritative:

- orders
- payments
- inventory changes
- refunds
- supplier fulfillment state

unless a future explicitly approved offline architecture is introduced.

---

# 39. Network State

The app should detect connectivity changes and expose a lightweight state:

```text
ONLINE
OFFLINE
RECONNECTING
```

When offline:

- prevent unsafe mutation attempts
- allow safe browsing of cached data
- show a compact connectivity indicator
- retry safe operations when connectivity returns

---

# 40. Mobile File Upload

For compliance/support uploads:

```text
select file
or
capture image
 ↓
validate
 ↓
compress/resize where appropriate
 ↓
request upload
 ↓
upload
 ↓
complete
```

The UI must show upload progress.

---

# 41. Camera Integration

Camera access may be used for:

- document capture
- product/support evidence
- barcode/identifier workflows if later enabled

Permissions must be requested only when needed.

If permission is denied, provide a file-picker alternative where practical.

---

# 42. Image Compression

Large images should be resized/compressed before upload where business requirements permit.

Do not reduce pharmaceutical labels/documents to a point where important text becomes unreadable.

The original file may need to be preserved for certain compliance/document workflows.

---

# 43. Android-Specific Requirements

The Android implementation must account for:

- Android Keystore
- notification permission behavior on supported Android versions
- back button handling
- app links
- activity lifecycle
- background execution limits
- scoped storage
- Play Store release requirements
- different screen sizes
- low-memory devices

---

# 44. Android Back Navigation

Back behavior must be predictable.

Examples:

```text
Product → Category
Checkout → previous checkout step
Modal → close modal
Nested screen → previous screen
Root → exit/confirm according to platform convention
```

Do not accidentally exit the app when a navigation stack can pop.

---

# 45. iOS-Specific Requirements

The iOS implementation must account for:

- Keychain
- notification authorization
- universal links
- app lifecycle
- background execution restrictions
- camera/photo permissions
- privacy manifests and platform requirements applicable at release
- App Store review requirements
- safe-area layout

---

# 46. Safe Areas

All critical mobile UI must respect:

- status bar
- navigation/home indicator
- notches
- rounded corners
- keyboard

Avoid placing primary actions underneath system UI.

---

# 47. Keyboard Handling

Forms must support:

- automatic keyboard avoidance
- scrolling focused fields into view
- next/previous field navigation
- dismiss keyboard behavior
- visible validation errors

Checkout and onboarding forms are especially important.

---

# 48. Mobile Accessibility

Support:

- VoiceOver
- TalkBack
- dynamic text where practical
- accessible labels
- logical focus order
- sufficient touch target sizes
- non-color-only status indicators

Images carrying essential information require accessible descriptions where appropriate.

---

# 49. Mobile Secure UI

Avoid displaying sensitive information in:

- screenshots where preventable
- notification previews where inappropriate
- debug logs
- crash logs
- clipboard
- insecure local storage

Financial and identity-sensitive screens should follow the security architecture.

---

# 50. App Analytics

Analytics should include platform metadata:

```text
platform
appVersion
osVersion
deviceClass
```

Business events remain aligned with web analytics.

Do not send sensitive compliance or payment data unnecessarily.

---

# 51. Crash Reporting

Crash reports should capture:

- app version
- platform
- OS version
- screen/route
- non-sensitive request ID
- error category

Do not capture:

- access tokens
- refresh tokens
- passwords
- OTPs
- payment credentials
- full identity documents

---

# 52. Performance Monitoring

Track:

- cold start
- warm start
- screen render time
- API latency
- JS thread stalls
- UI frame drops
- memory pressure
- crash-free sessions
- image load performance

The goal is a consistently responsive experience across supported device classes.

---

# 53. Low-End Device Strategy

Bezzo must not assume flagship hardware.

Optimize for:

- memory usage
- image sizes
- list virtualization
- startup work
- bundle size
- expensive re-renders
- unnecessary animations

The buyer marketplace should remain usable on lower-spec devices commonly used by business operators.

---

# 54. Supplier Mobile Performance

Supplier users may need rapid operational actions.

Optimize:

```text
Dashboard → Orders
Orders → Order detail
Order detail → Accept/Reject
Inventory → Update
```

Avoid requiring large dashboard assets or expensive visualizations before operational actions become usable.

---

# 55. Mobile Search Performance

Search must:

- debounce
- cancel stale requests
- avoid unnecessary rerenders
- paginate
- cache useful results
- use compact product cards

The keyboard interaction should remain smooth while results update.

---

# 56. Mobile Error Recovery

Every critical screen must support:

```text
retry
```

where safe.

Examples:

- product load failure → retry
- orders load failure → retry
- payment unknown → verify status
- checkout conflict → refresh quote
- upload failure → retry upload

---

# 57. App Update Strategy

The app should detect when a minimum supported client version is required.

Possible states:

```text
CURRENT
UPDATE_RECOMMENDED
UPDATE_REQUIRED
```

A forced update should be used only when an old client can no longer safely operate.

The API must maintain compatibility during planned rollout windows.

---

# 58. Remote Configuration

Mobile may consume public remote configuration for:

- feature flags
- supported payment methods
- minimum app version
- promotional UI configuration
- operational messaging

Remote configuration must not contain secrets.

---

# 59. Build Environments

Recommended:

```text
development
qa
staging
production
```

Each build should have clear environment identification.

Example:

```text
Bezzo Dev
Bezzo QA
Bezzo
```

Production builds must never point accidentally to development APIs.

---

# 60. Android Build Pipeline

Minimum pipeline:

```text
install dependencies
 ↓
lint
 ↓
typecheck
 ↓
unit tests
 ↓
Android build
 ↓
integration/E2E tests
 ↓
security checks
 ↓
artifact signing
 ↓
release
```

Production signing credentials must remain outside source control.

---

# 61. iOS Build Pipeline

Minimum pipeline:

```text
install dependencies
 ↓
lint
 ↓
typecheck
 ↓
unit tests
 ↓
iOS build
 ↓
integration/E2E tests
 ↓
security checks
 ↓
code signing
 ↓
release
```

Signing certificates and provisioning secrets must be protected.

---

# 62. Release Channels

Recommended:

```text
Development
Internal QA
Closed/Beta
Production
```

Android may use internal/closed testing tracks.

iOS may use internal/beta distribution.

Production release should follow staged rollout practices where supported.

---

# 63. Mobile E2E Tests

Critical scenarios:

### Buyer

1. launch
2. login
3. browse category
4. search product
5. open product
6. add to cart
7. checkout
8. select delivery
9. initiate payment
10. confirm order
11. track order
12. cancel eligible order
13. submit return

### Supplier

1. login
2. dashboard
3. view order
4. accept
5. inventory update
6. listing update
7. settlement view

---

# 64. Device Matrix

Testing must include a representative matrix of:

- supported Android versions
- supported iOS versions
- small screens
- large screens
- low-memory Android devices
- current mainstream devices
- slow network
- intermittent network
- offline/resume scenarios

The exact supported OS matrix should be finalized at release planning.

---

# 65. Network Testing

Test:

```text
fast Wi-Fi
4G
5G
slow network
high latency
packet loss
offline
network reconnect
```

Critical operations must behave correctly under interrupted connectivity.

---

# 66. Push Notification Testing

Test:

- app foreground
- app background
- app terminated
- notification tap
- duplicate notifications
- invalid deep link
- expired order
- logged-out user
- switched user/device

---

# 67. Deep-Link Testing

Test:

```text
app installed
app not installed
logged in
logged out
wrong role
resource not found
resource unauthorized
expired session
```

The app must never expose protected content from an unauthorized deep link.

---

# 68. Payment Testing

Test:

- payment success
- payment failure
- user cancellation
- provider timeout
- app background during payment
- app termination during payment
- duplicate callback
- unknown payment state
- retry
- order/payment mismatch

---

# 69. Document Upload Testing

Test:

- valid file
- unsupported type
- oversized file
- corrupted file
- camera capture
- permission denied
- upload interruption
- retry
- duplicate upload
- server rejection

---

# 70. App Security Testing

Mobile security testing must cover:

- insecure storage
- certificate/network configuration
- exported components where relevant
- deep-link abuse
- intent/link injection
- clipboard exposure
- log leakage
- authentication bypass
- authorization bypass
- reverse-engineering exposure of secrets
- debug build leakage

No client-side control should be treated as authoritative authorization.

---

# 71. Release Checklist

Before production release:

- API environment verified
- production credentials verified
- signing verified
- crash reporting verified
- analytics verified
- deep links verified
- push notifications verified
- payment flows verified
- authentication verified
- secure storage verified
- minimum version policy verified
- privacy disclosures verified
- store metadata verified
- critical E2E tests passed

---

# 72. Mobile Definition of Ready

A mobile feature is ready when:

- navigation route exists
- API contract is available
- loading/empty/error states are defined
- Android behavior is defined
- iOS behavior is defined
- permissions are defined
- analytics requirements are known
- security requirements are known
- offline behavior is defined

---

# 73. Mobile Definition of Done

A mobile feature is done when:

- Android implementation passes tests
- iOS implementation passes tests
- navigation works
- deep links work where applicable
- secure storage is correct
- API integration works
- error handling works
- accessibility checks pass
- performance is acceptable
- analytics work
- crash reporting works
- no secrets are embedded
- critical E2E coverage exists
- code review is approved

---

# 74. Recommended Mobile Implementation Order

## Phase 1 — Foundation

1. React Native project
2. environment configuration
3. navigation
4. secure storage
5. API client
6. authentication/session
7. error handling
8. analytics/crash reporting

## Phase 2 — Buyer

9. home
10. categories
11. search
12. product detail
13. cart

## Phase 3 — Commerce

14. address
15. delivery
16. checkout
17. payment
18. confirmation
19. orders
20. tracking

## Phase 4 — Supplier

21. supplier onboarding
22. dashboard
23. orders
24. inventory
25. listings
26. profile
27. settlements

## Phase 5 — Hardening

28. push notifications
29. deep links
30. offline/reconnect handling
31. accessibility
32. performance optimization
33. device matrix testing
34. store release automation

---

# 75. Final Engineering Position

The Bezzo mobile applications should be treated as first-class clients of the same marketplace backend rather than separate products.

The architecture should maximize shared TypeScript/domain logic while keeping platform-specific integrations isolated behind clean interfaces.

The most important mobile engineering priorities are:

- reliable authentication
- strict data isolation
- fast marketplace browsing
- resilient checkout/payment handling
- safe document uploads
- useful push/deep-link behavior
- operationally efficient supplier workflows
- strong crash/performance monitoring
- secure platform storage
- predictable behavior under poor connectivity

Android and iOS should provide equivalent business capabilities while following their respective platform conventions.

The resulting mobile architecture must remain maintainable as Bezzo scales from an initial marketplace into a larger B2B pharmaceutical commerce platform.
