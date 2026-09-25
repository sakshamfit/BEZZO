import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../account/data/buyer_account_repository.dart';
import '../../cart/application/cart_store.dart';
import '../../catalog/data/catalog_repository.dart';
import '../../checkout/data/checkout_repository.dart';
import '../../marketplace/presentation/marketplace_shell.dart';
import '../application/auth_controller.dart';
import 'sign_in_screen.dart';

class AuthGate extends StatelessWidget {
  const AuthGate({
    super.key,
    required this.auth,
    required this.cartStore,
    required this.catalog,
    required this.checkout,
    required this.buyerAccount,
  });

  final AuthController auth;
  final CartStore cartStore;
  final CatalogRepository catalog;
  final CheckoutRepository checkout;
  final BuyerAccountRepository buyerAccount;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: auth,
    builder: (context, _) {
      return switch (auth.status) {
        AuthStatus.restoring => const _StartupScreen(),
        AuthStatus.unavailable => _StartupErrorScreen(
          message: auth.startupError ?? 'Bezzo is temporarily unavailable.',
          onRetry: auth.restore,
        ),
        AuthStatus.signedOut => SignInScreen(auth: auth),
        AuthStatus.signedIn when auth.isBuyer => MarketplaceShell(
          store: cartStore,
          auth: auth,
          catalog: catalog,
          checkout: checkout,
          buyerAccount: buyerAccount,
        ),
        AuthStatus.signedIn => _UnsupportedRoleScreen(
          onSignOut: () async {
            cartStore.clear();
            await auth.signOut();
          },
        ),
      };
    },
  );
}

class _StartupScreen extends StatelessWidget {
  const _StartupScreen();

  @override
  Widget build(BuildContext context) => const Scaffold(
    body: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _BezzoMark(size: 68),
          SizedBox(height: 24),
          CircularProgressIndicator(),
        ],
      ),
    ),
  );
}

class _StartupErrorScreen extends StatelessWidget {
  const _StartupErrorScreen({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_rounded, size: 56, color: muted),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Try again'),
            ),
          ],
        ),
      ),
    ),
  );
}

class _UnsupportedRoleScreen extends StatelessWidget {
  const _UnsupportedRoleScreen({required this.onSignOut});

  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.business_center_outlined, size: 56, color: navy),
            const SizedBox(height: 16),
            const Text(
              'This app is for verified pharmacy buyers.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 20),
            OutlinedButton(onPressed: onSignOut, child: const Text('Sign out')),
          ],
        ),
      ),
    ),
  );
}

class _BezzoMark extends StatelessWidget {
  const _BezzoMark({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: brandYellow,
      borderRadius: BorderRadius.circular(size * .28),
    ),
    child: Icon(Icons.inventory_2_rounded, color: navy, size: size * .52),
  );
}
