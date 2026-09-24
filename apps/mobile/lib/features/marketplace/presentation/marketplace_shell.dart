import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../auth/application/auth_controller.dart';
import '../../cart/application/cart_store.dart';
import '../../cart/presentation/cart_page.dart';
import '../../catalog/data/demo_catalog.dart';
import '../../catalog/domain/medicine.dart';
import 'widgets/empty_state.dart';
import 'widgets/product_card.dart';

class MarketplaceShell extends StatefulWidget {
  const MarketplaceShell({super.key, required this.store, required this.auth});

  final CartStore store;
  final AuthController auth;

  @override
  State<MarketplaceShell> createState() => _MarketplaceShellState();
}

class _MarketplaceShellState extends State<MarketplaceShell> {
  int tab = 0;
  String category = categories.first;
  String query = '';

  List<Medicine> get visibleProducts => demoMedicines.where((product) {
    final matchesCategory =
        category == categories.first || product.category == category;
    final haystack = '${product.name} ${product.generic} ${product.category}'
        .toLowerCase();
    return matchesCategory && haystack.contains(query.toLowerCase());
  }).toList();

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
          'MOQ shown on every item',
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
          itemBuilder: (context, index) =>
              ProductCard(product: visibleProducts[index], store: widget.store),
        ),
      ),
      if (visibleProducts.isEmpty)
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
            'Demo storefront · All prices and availability are illustrative.',
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
          onTap: () => _info(
            'Delivery location',
            'Demo delivery address: Sector 56, Gurugram.',
          ),
          child: Row(
            children: [
              const Icon(Icons.location_on_rounded, size: 18, color: navy),
              const SizedBox(width: 4),
              const Text(
                'Delivering to',
                style: TextStyle(color: navy, fontSize: 11),
              ),
              const SizedBox(width: 5),
              const Expanded(
                child: Text(
                  'Sector 56, Gurugram',
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
          onChanged: (value) => setState(() => query = value.trim()),
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
      itemCount: categories.length - 1,
      separatorBuilder: (_, _) => const SizedBox(width: 10),
      itemBuilder: (context, index) => _categoryTile(categories[index + 1]),
    ),
  );

  Widget _categoryTile(String name) {
    final selected = category == name;
    final count = demoMedicines.where((item) => item.category == name).length;
    return InkWell(
      onTap: () =>
          setState(() => category = selected ? categories.first : name),
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
              '$count products',
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
          store: widget.store,
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
          onTap: () => setState(() => category = categories.first),
        ),
      ),
      SliverToBoxAdapter(child: _categoryRail()),
      SliverToBoxAdapter(
        child: _sectionTitle(
          category == categories.first ? 'All medicine boxes' : category,
          '${visibleProducts.length} products',
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
          itemBuilder: (context, index) =>
              ProductCard(product: visibleProducts[index], store: widget.store),
        ),
      ),
    ],
  );

  Widget _orders() => AnimatedBuilder(
    animation: widget.store,
    builder: (context, _) {
      final orders = widget.store.orders;
      return CustomScrollView(
        slivers: [
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(18, 18, 18, 16),
              child: Text(
                'Your orders',
                style: TextStyle(
                  fontSize: 23,
                  fontWeight: FontWeight.w800,
                  color: ink,
                ),
              ),
            ),
          ),
          if (orders.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: EmptyState(
                icon: Icons.receipt_long_outlined,
                title: 'No orders yet',
                message: 'Your demo orders will appear here after checkout.',
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
                      'Order ${order.number}',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    subtitle: Text(
                      '${order.items} boxes · ${order.status}\n${order.time.toLocal().toString().substring(0, 16)}',
                    ),
                    isThreeLine: true,
                    trailing: Text(
                      money(order.total),
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
    },
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
          'Connect a verified pharmacy address',
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
          'Prototype account · no real medicine orders are submitted.',
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

  Widget _accountTile(IconData icon, String title, String subtitle) => Card(
    color: Colors.white,
    child: ListTile(
      leading: Icon(icon, color: navy),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: () => _info(title, subtitle),
    ),
  );

  void _openCart() => Navigator.of(
    context,
  ).push(MaterialPageRoute(builder: (_) => CartPage(store: widget.store)));
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
