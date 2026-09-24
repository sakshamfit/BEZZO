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

## Structure

`lib/` keeps startup and app configuration separate from feature code:

- `app.dart` wires the app theme and the marketplace screen.
- `core/` contains shared colors and money formatting.
- `features/catalog/` contains the medicine model and illustrative demo catalog.
- `features/cart/` contains cart/order state and the cart screen.
- `features/marketplace/presentation/` contains the storefront, product cards, and box artwork.

Catalog quantities represent sealed medicine boxes, and cart additions follow each product’s minimum order quantity. Product names, suppliers, prices, and stock are illustrative demo data. Cart and order history live in memory; checkout does not send orders to the BEZZO API or suppliers.
