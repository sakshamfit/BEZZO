# BEZZO Mobile

Flutter buyer app prototype for BEZZO, a B2B medicine marketplace.

## Run and build

From this directory:

```powershell
flutter pub get
flutter run
flutter build apk --debug
```

The debug APK is written to `build/app/outputs/flutter-apk/app-debug.apk`.
The Android emulator points to `http://10.0.2.2:4000/api/v1` by default. For other
environments, provide `--dart-define=BEZZO_API_BASE_URL=https://your-api-host/api/v1`.
Release builds require this HTTPS value at build time; the app has no embedded API secret.
For an Android Play release, build an app bundle and provide the upload-key values through the
`BEZZO_UPLOAD_STORE_FILE`, `BEZZO_UPLOAD_STORE_PASSWORD`, `BEZZO_UPLOAD_KEY_ALIAS`, and
`BEZZO_UPLOAD_KEY_PASSWORD` environment variables. Release builds fail when signing values are
missing; never commit the keystore or those values.

## Structure

`lib/` keeps startup and app configuration separate from feature code:

- `app.dart` wires startup, API configuration and feature repositories.
- `core/` contains shared colors and money formatting.
- `features/catalog/` contains live catalog and category API models.
- `features/cart/` contains the server-backed cart and basket screen.
- `features/auth/` contains password/OTP sign-in, session handling, and authentication UI.
- `features/checkout/` contains delivery addresses, live quotes, COD order placement, and order models.
- `features/marketplace/presentation/` contains the storefront, product cards, and box artwork.

Authentication, catalog browsing, supplier offers, cart, delivery quote, COD checkout, and order history use the BEZZO API. Buyers can open API-backed order details, view supplier fulfilments, delivery address, payment and timeline, and request server-validated cancellation. The UI presents quantities as sealed medicine boxes and applies each supplier offer's MOQ. Session credentials use platform secure storage, restore against `/me`, refresh after an API 401, and are revoked on sign-out. Online payment handoff, buyer compliance-document upload, push notifications, and production signing/release automation remain to be connected/configured in this Flutter client.
