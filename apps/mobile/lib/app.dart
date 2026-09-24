import 'package:flutter/material.dart';

import 'core/theme/app_colors.dart';
import 'features/cart/application/cart_store.dart';
import 'features/marketplace/presentation/marketplace_shell.dart';

class BezzoApp extends StatefulWidget {
  const BezzoApp({super.key});

  @override
  State<BezzoApp> createState() => _BezzoAppState();
}

class _BezzoAppState extends State<BezzoApp> {
  final store = CartStore();

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
      home: MarketplaceShell(store: store),
    );
  }
}
