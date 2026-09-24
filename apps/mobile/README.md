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

- `app.dart` wires the app theme and the marketplace screen.
- `core/` contains shared colors and money formatting.
- `features/catalog/` contains the medicine model and illustrative demo catalog.
- `features/cart/` contains cart/order state and the cart screen.
- `features/auth/` contains password/OTP sign-in, session handling, and authentication UI.
- `features/marketplace/presentation/` contains the storefront, product cards, and box artwork.

Authentication uses the BEZZO API. Session credentials are stored through platform secure storage, restored against `/me`, refreshed after an API 401, and revoked on sign-out. The current catalog, prices, stock, cart, and order history are still illustrative local demo data; checkout does not send orders to the BEZZO API or suppliers. Catalog quantities represent sealed medicine boxes, and cart additions follow each product’s minimum order quantity.
