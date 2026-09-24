import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../auth/application/auth_controller.dart';
import '../../cart/application/cart_store.dart';
import '../../cart/presentation/cart_page.dart';
import '../../catalog/data/catalog_repository.dart';
import '../../catalog/domain/medicine.dart';
import '../../checkout/data/checkout_repository.dart';
import '../../checkout/presentation/checkout_page.dart';
import 'widgets/empty_state.dart';
import 'widgets/product_card.dart';

class MarketplaceShell extends StatefulWidget {
  const MarketplaceShell({
    super.key,
    required this.store,
    required this.auth,
    required this.catalog,
    required this.checkout,
  });

  final CartStore store;
  final AuthController auth;
  final CatalogRepository catalog;
  final CheckoutRepository checkout;

  @override
  State<MarketplaceShell> createState() => _MarketplaceShellState();
}

class _MarketplaceShellState extends State<MarketplaceShell> {
  int tab = 0;
  List<CatalogCategory> categories = const [];
  List<Medicine> products = const [];
  String? categoryId;
  String query = '';
  String? catalogError;
  bool catalogLoading = true;
  List<OrderSummary> orders = const [];
  bool ordersLoading = true;
  String? ordersError;
  int _catalogRequest = 0;
  Timer? _searchDebounce;

  List<Medicine> get visibleProducts => products;

  String get selectedCategoryName {
    for (final item in categories) {
      if (item.id == categoryId) return item.name;
    }
    return 'Medicine boxes';
  }

  @override
  void initState() {
    super.initState();
    unawaited(_loadCatalog());
    unawaited(widget.store.load());
    unawaited(_loadOrders());
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    super.dispose();
  }

  Future<void> _loadCatalog() async {
    setState(() {
      catalogLoading = true;
      catalogError = null;
    });
    try {
      final loadedCategories = await widget.catalog.categories();
      if (!mounted) return;
      setState(() => categories = loadedCategories);
      await _loadProducts(showSpinner: false);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        catalogError = error.message;
        catalogLoading = false;
      });
    } on FormatException catch (error) {
      if (!mounted) return;
      setState(() {
        catalogError = error.message;
        catalogLoading = false;
      });
    }
  }

  Future<void> _loadProducts({bool showSpinner = true}) async {
    final request = ++_catalogRequest;
    if (showSpinner && mounted) setState(() => catalogLoading = true);
    try {
      final results = await widget.catalog.search(
        query: query,
        categoryId: categoryId,
      );
      if (!mounted || request != _catalogRequest) return;
      setState(() {
        products = results;
        catalogLoading = false;
        catalogError = null;
      });
    } on ApiException catch (error) {
      if (!mounted || request != _catalogRequest) return;
      setState(() {
        catalogError = error.message;
        catalogLoading = false;
      });
    } on FormatException catch (error) {
      if (!mounted || request != _catalogRequest) return;
      setState(() {
        catalogError = error.message;
        catalogLoading = false;
      });
    }
  }

  void _onSearchChanged(String value) {
    query = value;
    _searchDebounce?.cancel();
    _searchDebounce = Timer(
      const Duration(milliseconds: 350),
      () => _loadProducts(),
    );
  }

  Future<void> _loadOrders() async {
    setState(() {
      ordersLoading = true;
      ordersError = null;
    });
    try {
      final result = await widget.checkout.orders();
      if (!mounted) return;
      setState(() {
        orders = result;
        ordersLoading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        ordersError = error.message;
        ordersLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[_home(), _categories(), _orders(), _account()];

    return Scaffold(
      body: SafeArea(
        child: IndexedStack(index: tab, children: pages),
      ),
      bottomNavigationBar: AnimatedBuilder(
        animation: widget.store,
        builder: (context, _) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (widget.store.products.isNotEmpty) _basketBar(),
            NavigationBar(
              selectedIndex: tab,
              onDestinationSelected: (index) => setState(() => tab = index),
              backgroundColor: Colors.white,
              indicatorColor: const Color(0xFFE4F4E8),
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.storefront_outlined),
                  selectedIcon: Icon(Icons.storefront),
                  label: 'Home',
                ),
                NavigationDestination(
                  icon: Icon(Icons.grid_view_rounded),
                  selectedIcon: Icon(Icons.grid_view_rounded),
                  label: 'Categories',
                ),
                NavigationDestination(
                  icon: Icon(Icons.receipt_long_outlined),
                  selectedIcon: Icon(Icons.receipt_long),
                  label: 'Orders',
                ),
                NavigationDestination(
                  icon: Icon(Icons.business_outlined),
                  selectedIcon: Icon(Icons.business),
                  label: 'Account',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _home() => CustomScrollView(
    slivers: [
      SliverToBoxAdapter(child: _header()),
      SliverToBoxAdapter(child: _trustStrip()),
      SliverToBoxAdapter(child: _hero()),
      SliverToBoxAdapter(
        child: _sectionTitle(
          'Shop by category',
          'See all',
          onTap: () => setState(() => tab = 1),
        ),
      ),
      SliverToBoxAdapter(child: _categoryRail()),
      SliverToBoxAdapter(
        child: _sectionTitle('Trending near your store', 'Verified stock'),
      ),
      SliverToBoxAdapter(child: _trendingRail()),
      SliverToBoxAdapter(
        child: _sectionTitle(
          'Wholesale medicine boxes',
          'Compare verified suppliers',
        ),
      ),
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 22),
        sliver: SliverGrid.builder(
          itemCount: visibleProducts.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            mainAxisExtent: 314,
          ),
          itemBuilder: (context, index) => ProductCard(
            product: visibleProducts[index],
            onViewOffers: _showOffers,
          ),
        ),
      ),
      if (catalogLoading && visibleProducts.isEmpty)
        const SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.all(32),
            child: Center(child: CircularProgressIndicator()),
          ),
        ),
      if (catalogError != null)
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                Text(catalogError!, textAlign: TextAlign.center),
                TextButton.icon(
                  onPressed: _loadCatalog,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Retry catalog'),
                ),
              ],
            ),
          ),
        ),
      if (visibleProducts.isEmpty && !catalogLoading && catalogError == null)
        const SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.all(32),
            child: Center(child: Text('No boxed products match that search.')),
          ),
        ),
      const SliverToBoxAdapter(
        child: Padding(
          padding: EdgeInsets.fromLTRB(18, 0, 18, 22),
          child: Text(
            'Live catalogue · Server cart · Scheduled COD orders.',
            style: TextStyle(color: muted, fontSize: 12),
            textAlign: TextAlign.center,
          ),
        ),
      ),
    ],
  );

  Widget _header() => Container(
    color: brandYellow,
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 15),
    child: Column(
      children: [
        Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: navy,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.bolt_rounded, color: brandYellow),
            ),
            const SizedBox(width: 9),
            const Text(
              'BEZZO',
              style: TextStyle(
                color: navy,
                fontSize: 20,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.1,
              ),
            ),
            const Spacer(),
            IconButton.filledTonal(
              tooltip: 'Open wholesale basket',
              onPressed: _openCart,
              style: IconButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: navy,
              ),
              icon: AnimatedBuilder(
                animation: widget.store,
                builder: (_, _) => Badge(
                  isLabelVisible: widget.store.totalBoxes > 0,
                  label: Text('${widget.store.totalBoxes}'),
                  backgroundColor: teal,
                  child: const Icon(Icons.shopping_bag_outlined),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        InkWell(
          onTap: _openCheckout,
          child: Row(
            children: [
              const Icon(Icons.location_on_rounded, size: 18, color: navy),
              const SizedBox(width: 4),
              const Text(
                'Delivery address',
                style: TextStyle(color: navy, fontSize: 11),
              ),
              const SizedBox(width: 5),
              const Expanded(
                child: Text(
                  'Choose your pharmacy address',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: navy,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const Icon(
                Icons.keyboard_arrow_down_rounded,
                size: 19,
                color: navy,
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          onChanged: _onSearchChanged,
          decoration: InputDecoration(
            hintText: 'Search medicines, generics, brands',
            prefixIcon: const Icon(Icons.search_rounded, color: muted),
            suffixIcon: IconButton(
              tooltip: 'Search filters',
              onPressed: () => _info(
                'Wholesale filters',
                'Browse by category, supplier, stock, and minimum order quantity.',
              ),
              icon: const Icon(Icons.tune_rounded, color: muted),
            ),
            filled: true,
            fillColor: Colors.white,
            contentPadding: const EdgeInsets.symmetric(vertical: 14),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(15),
              borderSide: BorderSide.none,
            ),
          ),
        ),
      ],
    ),
  );

  Widget _trustStrip() => Padding(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
    child: Row(
      children: [
        const Icon(Icons.verified_rounded, size: 17, color: teal),
        const SizedBox(width: 6),
        const Text(
          'Verified wholesale network',
          style: TextStyle(
            color: navy,
            fontWeight: FontWeight.w700,
            fontSize: 11,
          ),
        ),
        const Spacer(),
        const Icon(Icons.inventory_2_outlined, size: 15, color: muted),
        const SizedBox(width: 4),
        const Text(
          'Sealed boxes only',
          style: TextStyle(
            color: muted,
            fontSize: 10,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    ),
  );

  Widget _hero() => Container(
    margin: const EdgeInsets.fromLTRB(14, 0, 14, 8),
    padding: const EdgeInsets.fromLTRB(17, 16, 15, 16),
    decoration: BoxDecoration(
      color: const Color(0xFFDFF4B8),
      borderRadius: BorderRadius.circular(19),
    ),
    child: Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: .78),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Text(
                  '✓  VERIFIED SUPPLIERS',
                  style: TextStyle(
                    color: teal,
                    fontSize: 9,
                    fontWeight: FontWeight.w900,
                    letterSpacing: .3,
                  ),
                ),
              ),
              const SizedBox(height: 9),
              const Text(
                'Medicines in\nwholesale boxes',
                style: TextStyle(
                  color: ink,
                  fontWeight: FontWeight.w900,
                  fontSize: 20,
                  height: 1.08,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Clear MOQs · reliable supply · one basket',
                style: TextStyle(color: Color(0xFF43533C), fontSize: 10),
              ),
            ],
          ),
        ),
        Container(
          width: 82,
          height: 82,
          decoration: BoxDecoration(
            color: const Color(0xFFBFE68A),
            borderRadius: BorderRadius.circular(22),
          ),
          child: const Icon(Icons.inventory_2_rounded, color: teal, size: 48),
        ),
      ],
    ),
  );

  Widget _categoryRail() => SizedBox(
    height: 112,
    child: ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      scrollDirection: Axis.horizontal,
      itemCount: categories.length,
      separatorBuilder: (_, _) => const SizedBox(width: 10),
      itemBuilder: (context, index) => _categoryTile(categories[index]),
    ),
  );

  Widget _categoryTile(CatalogCategory category) {
    final selected = categoryId == category.id;
    final name = category.name;
    return InkWell(
      onTap: () {
        setState(() => categoryId = selected ? null : category.id);
        unawaited(_loadProducts());
      },
      borderRadius: BorderRadius.circular(15),
      child: Container(
        width: 91,
        padding: const EdgeInsets.fromLTRB(8, 9, 8, 8),
        decoration: BoxDecoration(
          color: _categoryTint(name),
          borderRadius: BorderRadius.circular(15),
          border: Border.all(
            color: selected ? teal : Colors.transparent,
            width: 1.5,
          ),
        ),
        child: Column(
          children: [
            Container(
              height: 48,
              width: 48,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: .75),
                shape: BoxShape.circle,
              ),
              child: Icon(_categoryIcon(name), color: navy, size: 25),
            ),
            const SizedBox(height: 5),
            Text(
              name,
              maxLines: 2,
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: ink,
                fontSize: 10,
                height: 1.05,
                fontWeight: FontWeight.w700,
              ),
            ),
            Text(
              '${category.count} products',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: muted, fontSize: 8),
            ),
          ],
        ),
      ),
    );
  }

  Color _categoryTint(String name) => switch (name) {
    'Pain relief' => const Color(0xFFFFE7DD),
    'Cold & allergy' => const Color(0xFFE4E6FF),
    'Digestive care' => const Color(0xFFE0F2DC),
    _ => const Color(0xFFFFEFC7),
  };

  Widget _sectionTitle(String title, String action, {VoidCallback? onTap}) =>
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 11),
        child: Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  color: ink,
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            InkWell(
              onTap: onTap,
              child: Row(
                children: [
                  Text(
                    action,
                    style: const TextStyle(
                      color: teal,
                      fontWeight: FontWeight.w800,
                      fontSize: 10,
                    ),
                  ),
                  if (onTap != null)
                    const Icon(
                      Icons.chevron_right_rounded,
                      size: 17,
                      color: teal,
                    ),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _trendingRail() => SizedBox(
    height: 307,
    child: ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      scrollDirection: Axis.horizontal,
      itemCount: visibleProducts.length,
      separatorBuilder: (_, _) => const SizedBox(width: 11),
      itemBuilder: (context, index) => SizedBox(
        width: 204,
        child: ProductCard(
          product: visibleProducts[index],
          onViewOffers: _showOffers,
        ),
      ),
    ),
  );

  Widget _basketBar() => Padding(
    padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
    child: Material(
      color: teal,
      borderRadius: BorderRadius.circular(17),
      child: InkWell(
        onTap: _openCart,
        borderRadius: BorderRadius.circular(17),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(13, 10, 8, 10),
          child: Row(
            children: [
              const Icon(
                Icons.shopping_bag_rounded,
                color: brandYellow,
                size: 26,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${widget.store.totalBoxes} boxes · ${money(widget.store.total)}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        fontSize: 13,
                      ),
                    ),
                    const Text(
                      'Minimum order quantities applied',
                      style: TextStyle(color: Color(0xFFD9F3DE), fontSize: 9),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 13,
                  vertical: 11,
                ),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Row(
                  children: [
                    Text(
                      'View basket',
                      style: TextStyle(
                        color: teal,
                        fontWeight: FontWeight.w900,
                        fontSize: 11,
                      ),
                    ),
                    SizedBox(width: 4),
                    Icon(Icons.arrow_forward_rounded, color: teal, size: 15),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );

  Widget _categories() => CustomScrollView(
    slivers: [
      SliverToBoxAdapter(child: _header()),
      SliverToBoxAdapter(
        child: _sectionTitle(
          'Shop by category',
          'Reset',
          onTap: () {
            setState(() => categoryId = null);
            unawaited(_loadProducts());
          },
        ),
      ),
      SliverToBoxAdapter(child: _categoryRail()),
      SliverToBoxAdapter(
        child: _sectionTitle(
          categoryId == null ? 'All medicine boxes' : selectedCategoryName,
          '${visibleProducts.length} products',
        ),
      ),
      if (catalogLoading && visibleProducts.isEmpty)
        const SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.all(32),
            child: Center(child: CircularProgressIndicator()),
          ),
        ),
      if (catalogError != null)
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                Text(catalogError!, textAlign: TextAlign.center),
                TextButton.icon(
                  onPressed: _loadCatalog,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Retry catalog'),
                ),
              ],
            ),
          ),
        ),
      if (visibleProducts.isEmpty && !catalogLoading && catalogError == null)
        const SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.all(32),
            child: Center(child: Text('No medicine boxes match this view.')),
          ),
        ),
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(14, 0, 14, 24),
        sliver: SliverGrid.builder(
          itemCount: visibleProducts.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 11,
            crossAxisSpacing: 11,
            mainAxisExtent: 314,
          ),
          itemBuilder: (context, index) => ProductCard(
            product: visibleProducts[index],
            onViewOffers: _showOffers,
          ),
        ),
      ),
    ],
  );

  Future<void> _showOffers(Medicine product) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: .62,
        minChildSize: .4,
        maxChildSize: .9,
        expand: false,
        builder: (context, scrollController) => Container(
          decoration: const BoxDecoration(
            color: Color(0xFFF6F8F5),
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: FutureBuilder<Map<String, dynamic>>(
            future: widget.catalog.productDetails(product.id),
            builder: (context, snapshot) {
              final offers = snapshot.data?['offers'];
              return ListView(
                controller: scrollController,
                padding: const EdgeInsets.fromLTRB(18, 12, 18, 28),
                children: [
                  Center(
                    child: Container(
                      width: 42,
                      height: 4,
                      decoration: BoxDecoration(
                        color: const Color(0xFFD1D8D2),
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    product.name,
                    style: const TextStyle(
                      color: navy,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${product.generic} · ${product.strength}',
                    style: const TextStyle(color: muted, fontSize: 12),
                  ),
                  const SizedBox(height: 18),
                  if (snapshot.connectionState != ConnectionState.done)
                    const Padding(
                      padding: EdgeInsets.all(28),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (snapshot.hasError)
                    Text(
                      snapshot.error is ApiException
                          ? (snapshot.error as ApiException).message
                          : 'Offers could not be loaded. Try again.',
                      textAlign: TextAlign.center,
                    )
                  else if (offers is! List || offers.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 28),
                      child: Text(
                        'No eligible sealed-box offers are available for this product.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: muted),
                      ),
                    )
                  else ...[
                    const Text(
                      'VERIFIED WHOLESALE OFFERS',
                      style: TextStyle(
                        color: muted,
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        letterSpacing: .7,
                      ),
                    ),
                    const SizedBox(height: 8),
                    ...offers.whereType<Map<String, dynamic>>().map((offer) {
                      final price = offer['sellingPrice'];
                      final moq = offer['minimumOrderQuantity'];
                      final stock = offer['sellableQuantity'];
                      final city = offer['supplierCity'];
                      final listingId = offer['listingId'];
                      return Card(
                        color: Colors.white,
                        margin: const EdgeInsets.only(bottom: 9),
                        child: ListTile(
                          leading: const CircleAvatar(
                            backgroundColor: Color(0xFFE8F5F1),
                            child: Icon(Icons.verified_rounded, color: teal),
                          ),
                          title: Text(
                            (offer['supplierName'] as String?) ??
                                'Verified supplier',
                            style: const TextStyle(
                              color: navy,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          subtitle: Text(
                            '${city is String && city.isNotEmpty ? '$city · ' : ''}'
                            'MOQ ${moq is num ? moq : '—'} boxes · '
                            '${stock is num ? stock : '—'} boxes available',
                          ),
                          trailing: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                price is num ? money(price) : '—',
                                style: const TextStyle(
                                  color: navy,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              IconButton.filledTonal(
                                tooltip: 'Add MOQ to basket',
                                visualDensity: VisualDensity.compact,
                                onPressed: listingId is String && moq is num
                                    ? () => _addOffer(
                                        listingId,
                                        moq.toInt(),
                                        context,
                                      )
                                    : null,
                                icon: const Icon(
                                  Icons.add_shopping_cart_rounded,
                                  size: 18,
                                ),
                              ),
                            ],
                          ),
                          isThreeLine: true,
                        ),
                      );
                    }),
                  ],
                  const SizedBox(height: 12),
                  const Text(
                    'Live supplier prices and inventory · MOQ shown on each offer.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: muted, fontSize: 11),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Future<void> _addOffer(
    String listingId,
    int minimumOrderQuantity,
    BuildContext sheetContext,
  ) async {
    if (widget.store.mutating) return;
    await widget.store.addOffer(
      supplierProductId: listingId,
      quantity: minimumOrderQuantity,
    );
    if (!mounted || !sheetContext.mounted) return;
    final error = widget.store.error;
    if (error == null) {
      Navigator.pop(sheetContext);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              'Added MOQ of $minimumOrderQuantity sealed boxes to your basket.',
            ),
          ),
        );
    } else {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(error)));
    }
  }

  Widget _orders() => CustomScrollView(
    slivers: [
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 18, 12, 16),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Your orders',
                  style: TextStyle(
                    fontSize: 23,
                    fontWeight: FontWeight.w800,
                    color: ink,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Refresh orders',
                onPressed: _loadOrders,
                icon: const Icon(Icons.refresh_rounded, color: navy),
              ),
            ],
          ),
        ),
      ),
      if (ordersLoading && orders.isEmpty)
        const SliverFillRemaining(
          hasScrollBody: false,
          child: Center(child: CircularProgressIndicator()),
        ),
      if (ordersError != null)
        SliverFillRemaining(
          hasScrollBody: false,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(ordersError!, textAlign: TextAlign.center),
                  TextButton.icon(
                    onPressed: _loadOrders,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
        ),
      if (!ordersLoading && ordersError == null && orders.isEmpty)
        const SliverFillRemaining(
          hasScrollBody: false,
          child: EmptyState(
            icon: Icons.receipt_long_outlined,
            title: 'No orders yet',
            message: 'Confirmed wholesale orders will appear here.',
          ),
        ),
      if (orders.isNotEmpty)
        SliverList.builder(
          itemCount: orders.length,
          itemBuilder: (context, index) {
            final order = orders[index];
            return Card(
              margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              color: Colors.white,
              child: ListTile(
                leading: const CircleAvatar(
                  backgroundColor: Color(0xFFE8F5F1),
                  child: Icon(Icons.inventory_2_outlined, color: teal),
                ),
                title: Text(
                  'Order ${order.orderNumber}',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                subtitle: Text(
                  '${order.unitCount} boxes · ${order.status.replaceAll('_', ' ')}\n'
                  '${order.placedAt.toLocal().toString().substring(0, 16)} · ${order.paymentStatus.replaceAll('_', ' ')}',
                ),
                isThreeLine: true,
                trailing: Text(
                  money(order.grandTotal),
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    color: navy,
                  ),
                ),
              ),
            );
          },
        ),
    ],
  );

  Widget _account() {
    final principal = widget.auth.session?.principal ?? const {};
    final buyer = principal['buyer'];
    final organization = principal['organization'];
    final accountName = organization is Map && organization['name'] is String
        ? organization['name'] as String
        : (principal['displayName'] as String?) ?? 'Pharmacy account';
    final accountContact =
        (principal['email'] as String?) ??
        (principal['phone'] as String?) ??
        'Business contact';
    final buyerStatus = buyer is Map && buyer['status'] is String
        ? buyer['status'] as String
        : 'Profile not set up';

    return ListView(
      padding: const EdgeInsets.all(18),
      children: [
        const Text(
          'Business account',
          style: TextStyle(
            fontSize: 23,
            fontWeight: FontWeight.w800,
            color: ink,
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Your retailer profile and buying tools',
          style: TextStyle(color: muted),
        ),
        const SizedBox(height: 20),
        Card(
          color: Colors.white,
          child: ListTile(
            leading: const CircleAvatar(
              backgroundColor: Color(0xFFE8F5F1),
              child: Icon(Icons.store_mall_directory_outlined, color: teal),
            ),
            title: Text(
              accountName,
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            subtitle: Text('$accountContact\nBuyer status: $buyerStatus'),
            isThreeLine: true,
          ),
        ),
        const SizedBox(height: 12),
        _accountTile(
          Icons.location_on_outlined,
          'Delivery addresses',
          'Add or choose an address for an order',
          onTap: _openCheckout,
        ),
        _accountTile(
          Icons.description_outlined,
          'Invoices & documents',
          'Available after buyer profile setup',
        ),
        _accountTile(
          Icons.support_agent_rounded,
          'Help & support',
          'Talk to the BEZZO team',
        ),
        const SizedBox(height: 22),
        const Text(
          'Wholesale orders use live BEZZO prices and availability.',
          style: TextStyle(color: muted, fontSize: 12),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 14),
        Card(
          color: Colors.white,
          child: ListTile(
            leading: const Icon(Icons.logout_rounded, color: navy),
            title: const Text('Sign out'),
            onTap: () async {
              widget.store.clear();
              await widget.auth.signOut();
            },
          ),
        ),
      ],
    );
  }

  Widget _accountTile(
    IconData icon,
    String title,
    String subtitle, {
    VoidCallback? onTap,
  }) => Card(
    color: Colors.white,
    child: ListTile(
      leading: Icon(icon, color: navy),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap ?? () => _info(title, subtitle),
    ),
  );

  void _openCart() => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => CartPage(
        store: widget.store,
        checkout: widget.checkout,
        onOrderPlaced: () {
          unawaited(_loadOrders());
          if (mounted) setState(() => tab = 2);
        },
      ),
    ),
  );

  void _openCheckout() => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => CheckoutPage(
        repository: widget.checkout,
        cartStore: widget.store,
        onOrderPlaced: () {
          unawaited(_loadOrders());
          if (mounted) setState(() => tab = 2);
        },
      ),
    ),
  );
  void _info(String title, String message) => showDialog<void>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Got it'),
        ),
      ],
    ),
  );
  IconData _categoryIcon(String name) => switch (name) {
    'Pain relief' => Icons.healing_outlined,
    'Cold & allergy' => Icons.air_rounded,
    'Digestive care' => Icons.favorite_border_rounded,
    _ => Icons.health_and_safety_outlined,
  };
}
