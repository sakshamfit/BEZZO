import 'package:flutter/material.dart';

import '../../catalog/domain/medicine.dart';
import '../../marketplace/presentation/widgets/box_art.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../application/demo_store.dart';

class DemoShowcaseApp extends StatefulWidget {
  const DemoShowcaseApp({super.key});

  @override
  State<DemoShowcaseApp> createState() => _DemoShowcaseAppState();
}

class _DemoShowcaseAppState extends State<DemoShowcaseApp> {
  final DemoStore _store = DemoStore();
  bool _signedIn = false;

  @override
  void dispose() {
    _store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'BEZZO Demo',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: canvas,
      colorScheme: ColorScheme.fromSeed(seedColor: electricBlue).copyWith(
        primary: brandBlue,
        secondary: electricBlue,
        surface: Colors.white,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: ink,
        surfaceTintColor: Colors.transparent,
      ),
    ),
    home: _signedIn
        ? _DemoShopShell(store: _store)
        : _DemoBuyerSignIn(onContinue: () => setState(() => _signedIn = true)),
  );
}

class _DemoBuyerSignIn extends StatelessWidget {
  const _DemoBuyerSignIn({required this.onContinue});

  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _DemoModeBanner(),
                const SizedBox(height: 30),
                Container(
                  width: 64,
                  height: 64,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: surfaceBlue,
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Icon(
                    Icons.inventory_2_rounded,
                    color: brandBlue,
                    size: 34,
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'BEZZO',
                  style: TextStyle(
                    color: brandBlue,
                    fontSize: 30,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Wholesale ordering for pharmacies',
                  style: TextStyle(color: muted, fontSize: 16),
                ),
                const SizedBox(height: 26),
                const Text(
                  'Buyer demo sign-in',
                  style: TextStyle(
                    color: ink,
                    fontSize: 21,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Explore a sample pharmacy account. No account or password is needed.',
                  style: TextStyle(color: muted, height: 1.45),
                ),
                const SizedBox(height: 22),
                FilledButton.icon(
                  onPressed: onContinue,
                  icon: const Icon(Icons.storefront_outlined),
                  label: const Text('Continue as demo buyer'),
                ),
                const SizedBox(height: 14),
                const Text(
                  'Sample products and prices are for demonstration only.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: muted, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class _DemoModeBanner extends StatelessWidget {
  const _DemoModeBanner();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    decoration: BoxDecoration(
      color: const Color(0xFFFFF4D6),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0xFFF3D88A)),
    ),
    child: const Row(
      children: [
        Icon(Icons.science_outlined, color: Color(0xFF805B00), size: 19),
        SizedBox(width: 8),
        Expanded(
          child: Text(
            'DEMO MODE · Offline sample only · No real orders or payments',
            style: TextStyle(
              color: Color(0xFF684A00),
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    ),
  );
}

class _DemoShopShell extends StatefulWidget {
  const _DemoShopShell({required this.store});

  final DemoStore store;

  @override
  State<_DemoShopShell> createState() => _DemoShopShellState();
}

class _DemoShopShellState extends State<_DemoShopShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.store,
    builder: (context, _) => Scaffold(
      appBar: AppBar(
        title: const Text(
          'BEZZO · DEMO',
          style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: .4),
        ),
        actions: [
          IconButton(
            tooltip: 'Open basket',
            onPressed: () => setState(() => _tab = 1),
            icon: Badge(
              isLabelVisible: widget.store.totalBoxes > 0,
              label: Text('${widget.store.totalBoxes}'),
              child: const Icon(Icons.shopping_bag_outlined),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: IndexedStack(
          index: _tab,
          children: [
            _DemoCatalogPage(
              store: widget.store,
              onOpenBasket: () => setState(() => _tab = 1),
            ),
            _DemoBasketPage(
              store: widget.store,
              onOrderPlaced: () => setState(() => _tab = 2),
            ),
            _DemoOrdersPage(store: widget.store),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (index) => setState(() => _tab = index),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.storefront_outlined),
            selectedIcon: Icon(Icons.storefront),
            label: 'Shop',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: widget.store.totalBoxes > 0,
              label: Text('${widget.store.totalBoxes}'),
              child: const Icon(Icons.shopping_basket_outlined),
            ),
            selectedIcon: const Icon(Icons.shopping_basket),
            label: 'Basket',
          ),
          const NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long),
            label: 'Orders',
          ),
        ],
      ),
    ),
  );
}

class _DemoCatalogPage extends StatelessWidget {
  const _DemoCatalogPage({required this.store, required this.onOpenBasket});

  final DemoStore store;
  final VoidCallback onOpenBasket;

  @override
  Widget build(BuildContext context) => CustomScrollView(
    slivers: [
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _DemoModeBanner(),
              const SizedBox(height: 18),
              const Text(
                'Medicine boxes for your pharmacy',
                style: TextStyle(
                  color: ink,
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 5),
              const Text(
                'Sample wholesale catalog · each unit is a sealed box',
                style: TextStyle(color: muted),
              ),
              if (store.totalBoxes > 0) ...[
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: onOpenBasket,
                  icon: const Icon(Icons.shopping_basket_outlined),
                  label: Text('View basket · ${store.totalBoxes} sealed boxes'),
                ),
              ],
            ],
          ),
        ),
      ),
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
        sliver: SliverGrid.builder(
          itemCount: DemoStore.products.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            mainAxisExtent: 290,
          ),
          itemBuilder: (context, index) => _DemoProductCard(
            product: DemoStore.products[index],
            onAdd: () => store.addBox(DemoStore.products[index].id),
          ),
        ),
      ),
    ],
  );
}

class _DemoProductCard extends StatelessWidget {
  const _DemoProductCard({required this.product, required this.onAdd});

  final Medicine product;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) => Card(
    clipBehavior: Clip.antiAlias,
    color: Colors.white,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(16),
      side: const BorderSide(color: borderSubtle),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Stack(
          children: [
            BoxArt(product: product),
            Positioned(
              top: 8,
              left: 8,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(7),
                ),
                child: const Text(
                  'SEALED BOX',
                  style: TextStyle(
                    color: brandBlue,
                    fontSize: 8,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ),
          ],
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 0),
          child: Text(
            product.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w800, color: ink),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 3, 10, 0),
          child: Text(
            product.strength,
            maxLines: 1,
            style: const TextStyle(color: muted, fontSize: 11),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 5, 10, 0),
          child: Text(
            '${product.supplier} · sample price',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: muted, fontSize: 9),
          ),
        ),
        const Spacer(),
        Padding(
          padding: const EdgeInsets.all(8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                '${money(product.price)} / box',
                style: const TextStyle(
                  color: brandBlue,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 6),
              SizedBox(
                height: 36,
                child: FilledButton.tonalIcon(
                  onPressed: onAdd,
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Add sealed box'),
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    textStyle: const TextStyle(fontSize: 11),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _DemoBasketPage extends StatelessWidget {
  const _DemoBasketPage({required this.store, required this.onOrderPlaced});

  final DemoStore store;
  final VoidCallback onOrderPlaced;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: store,
    builder: (context, _) {
      final items = store.basket.entries.toList(growable: false);
      return Column(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: _DemoModeBanner(),
          ),
          Expanded(
            child: items.isEmpty
                ? const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.shopping_basket_outlined,
                          size: 48,
                          color: muted,
                        ),
                        SizedBox(height: 10),
                        Text('Your demo basket is empty'),
                        SizedBox(height: 4),
                        Text(
                          'Add sealed boxes from the sample catalog.',
                          style: TextStyle(color: muted),
                        ),
                      ],
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      const Text(
                        'Wholesale basket',
                        style: TextStyle(
                          fontSize: 21,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 10),
                      for (final entry in items)
                        _DemoBasketRow(
                          product: _product(entry.key),
                          quantity: entry.value,
                          onIncrement: () => store.addBox(entry.key),
                          onDecrement: () => store.removeBox(entry.key),
                        ),
                    ],
                  ),
          ),
          if (items.isNotEmpty)
            SafeArea(
              top: false,
              child: Container(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(top: BorderSide(color: borderSubtle)),
                ),
                child: Column(
                  children: [
                    _SummaryRow(
                      label: 'Sealed boxes',
                      value: '${store.totalBoxes}',
                    ),
                    _SummaryRow(
                      label: 'Sample subtotal',
                      value: money(store.subtotal),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: () => _checkout(context),
                        child: Text(
                          'Continue to demo checkout · ${money(store.subtotal)}',
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      );
    },
  );

  Future<void> _checkout(BuildContext context) async {
    final placed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => _DemoCheckoutPage(store: store)),
    );
    if (placed == true) onOrderPlaced();
  }

  Medicine _product(String id) =>
      DemoStore.products.firstWhere((product) => product.id == id);
}

class _DemoBasketRow extends StatelessWidget {
  const _DemoBasketRow({
    required this.product,
    required this.quantity,
    required this.onIncrement,
    required this.onDecrement,
  });

  final Medicine product;
  final int quantity;
  final VoidCallback onIncrement;
  final VoidCallback onDecrement;

  @override
  Widget build(BuildContext context) => Card(
    color: Colors.white,
    child: Padding(
      padding: const EdgeInsets.all(10),
      child: Row(
        children: [
          SizedBox(width: 56, child: BoxArt(product: product, compact: true)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.name,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                const Text(
                  'Sealed medicine box',
                  style: TextStyle(color: muted, fontSize: 12),
                ),
                Text(
                  '${money(product.price)} / box',
                  style: const TextStyle(
                    color: brandBlue,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Remove one box',
            onPressed: onDecrement,
            icon: const Icon(Icons.remove_circle_outline),
          ),
          Text(
            '$quantity',
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
          IconButton(
            tooltip: 'Add one box',
            onPressed: onIncrement,
            icon: const Icon(Icons.add_circle_outline),
          ),
        ],
      ),
    ),
  );
}

class _DemoCheckoutPage extends StatelessWidget {
  const _DemoCheckoutPage({required this.store});

  final DemoStore store;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: store,
    builder: (context, _) => Scaffold(
      appBar: AppBar(title: const Text('Demo checkout')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const _DemoModeBanner(),
          const SizedBox(height: 18),
          const Text(
            'Delivery address',
            style: TextStyle(fontWeight: FontWeight.w900),
          ),
          const Card(
            color: Colors.white,
            child: ListTile(
              leading: Icon(
                Icons.store_mall_directory_outlined,
                color: brandBlue,
              ),
              title: Text('Demo Pharmacy'),
              subtitle: Text('12 Sample Market Road · Demo City · 000000'),
              trailing: Icon(Icons.check_circle, color: successGreen),
            ),
          ),
          const SizedBox(height: 10),
          const Text('Payment', style: TextStyle(fontWeight: FontWeight.w900)),
          const Card(
            color: Colors.white,
            child: ListTile(
              leading: Icon(Icons.payments_outlined, color: brandBlue),
              title: Text('Cash on delivery · simulation'),
              subtitle: Text('This demo does not collect or process money.'),
              trailing: Icon(Icons.check_circle, color: successGreen),
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'Order summary',
            style: TextStyle(fontWeight: FontWeight.w900),
          ),
          for (final entry in store.basket.entries)
            _SummaryRow(
              label:
                  '${_product(entry.key).name} · ${entry.value} sealed box${entry.value == 1 ? '' : 'es'}',
              value: money(_product(entry.key).price * entry.value),
            ),
          const Divider(height: 26),
          _SummaryRow(
            label: 'Demo total',
            value: money(store.subtotal),
            bold: true,
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: store.basket.isEmpty
                  ? null
                  : () => _placeOrder(context),
              icon: const Icon(Icons.check_circle_outline),
              label: const Text('Place demo COD order'),
            ),
          ),
        ),
      ),
    ),
  );

  Future<void> _placeOrder(BuildContext context) async {
    final order = store.placeCodOrder();
    if (order == null || !context.mounted) return;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.check_circle, color: successGreen, size: 44),
        title: const Text('Demo order placed'),
        content: Text(
          '${order.number} was saved on this device only. Nothing was sent to a supplier and no payment was made.',
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('View demo order'),
          ),
        ],
      ),
    );
    if (context.mounted) Navigator.pop(context, true);
  }

  Medicine _product(String id) =>
      DemoStore.products.firstWhere((product) => product.id == id);
}

class _DemoOrdersPage extends StatelessWidget {
  const _DemoOrdersPage({required this.store});

  final DemoStore store;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: store,
    builder: (context, _) => ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _DemoModeBanner(),
        const SizedBox(height: 16),
        const Text(
          'Demo order history',
          style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 10),
        if (store.orders.isEmpty)
          const Card(
            color: Colors.white,
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Column(
                children: [
                  Icon(Icons.receipt_long_outlined, color: muted, size: 40),
                  SizedBox(height: 8),
                  Text('Demo orders will appear here.'),
                ],
              ),
            ),
          ),
        for (final order in store.orders)
          Card(
            color: Colors.white,
            child: ListTile(
              leading: const CircleAvatar(
                backgroundColor: surfaceBlue,
                child: Icon(Icons.inventory_2_outlined, color: brandBlue),
              ),
              title: Text(
                order.number,
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              subtitle: Text(
                '${order.items} sealed box${order.items == 1 ? '' : 'es'} · ${order.status}\n${order.paymentMethod}',
              ),
              isThreeLine: true,
              trailing: Text(
                money(order.total),
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => _DemoOrderStatusPage(order: order),
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

class _DemoOrderStatusPage extends StatelessWidget {
  const _DemoOrderStatusPage({required this.order});

  final DemoOrder order;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(order.number)),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _DemoModeBanner(),
        const SizedBox(height: 16),
        Card(
          color: Colors.white,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Demo order status',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 12),
                const _StatusLine(title: 'Order received', complete: true),
                const _StatusLine(
                  title: 'Supplier confirmation',
                  complete: true,
                ),
                const _StatusLine(
                  title: 'Delivery pending (demo)',
                  complete: false,
                ),
                const SizedBox(height: 12),
                Text('Payment: ${order.paymentMethod}'),
                Text('Demo total: ${money(order.total)}'),
                const SizedBox(height: 8),
                const Text(
                  'Status is simulated for this showcase; no supplier or courier is involved.',
                  style: TextStyle(color: muted, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

class _StatusLine extends StatelessWidget {
  const _StatusLine({required this.title, required this.complete});

  final String title;
  final bool complete;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Row(
      children: [
        Icon(
          complete ? Icons.check_circle : Icons.radio_button_unchecked,
          color: complete ? successGreen : muted,
          size: 19,
        ),
        const SizedBox(width: 9),
        Text(title, style: TextStyle(color: complete ? ink : muted)),
      ],
    ),
  );
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.label,
    required this.value,
    this.bold = false,
  });

  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              color: bold ? ink : muted,
              fontWeight: bold ? FontWeight.w900 : FontWeight.w600,
            ),
          ),
        ),
        Text(
          value,
          style: TextStyle(
            color: ink,
            fontWeight: bold ? FontWeight.w900 : FontWeight.w700,
          ),
        ),
      ],
    ),
  );
}
