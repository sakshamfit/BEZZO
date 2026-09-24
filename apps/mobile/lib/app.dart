import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'core/config/api_config.dart';
import 'core/network/bezzo_api_client.dart';
import 'core/storage/secure_session_store.dart';
import 'core/theme/app_colors.dart';
import 'features/cart/application/cart_store.dart';
import 'features/cart/data/cart_repository.dart';
import 'features/catalog/data/catalog_repository.dart';
import 'features/checkout/data/checkout_repository.dart';
import 'features/auth/application/auth_controller.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/auth/presentation/auth_gate.dart';

class BezzoApp extends StatefulWidget {
  const BezzoApp({super.key});

  @override
  State<BezzoApp> createState() => _BezzoAppState();
}

class _BezzoAppState extends State<BezzoApp> {
  late final _cartStore = CartStore(CartRepository(_apiClient));
  late final SecureSessionStore _sessionStore = PlatformSecureSessionStore(
    const FlutterSecureStorage(),
  );
  late final BezzoApiClient _apiClient = BezzoApiClient(
    config: ApiConfig.fromEnvironment(),
    sessionStore: _sessionStore,
  );
  late final CatalogRepository _catalogRepository = CatalogRepository(
    _apiClient,
  );
  late final CheckoutRepository _checkoutRepository = CheckoutRepository(
    _apiClient,
  );
  late final AuthController _authController = AuthController(
    AuthRepository(api: _apiClient, store: _sessionStore),
  );

  @override
  void initState() {
    super.initState();
    unawaited(_authController.restore());
  }

  @override
  void dispose() {
    _authController.dispose();
    _apiClient.close();
    _cartStore.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BEZZO Wholesale',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: canvas,
        colorScheme: ColorScheme.fromSeed(
          seedColor: navy,
        ).copyWith(primary: navy, secondary: teal, surface: Colors.white),
        fontFamily: 'Roboto',
        appBarTheme: const AppBarTheme(
          backgroundColor: canvas,
          foregroundColor: ink,
        ),
      ),
      home: AuthGate(
        auth: _authController,
        cartStore: _cartStore,
        catalog: _catalogRepository,
        checkout: _checkoutRepository,
      ),
    );
  }
}
