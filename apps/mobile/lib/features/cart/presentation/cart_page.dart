import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../catalog/domain/medicine.dart';
import '../application/cart_store.dart';
import '../../marketplace/presentation/widgets/box_art.dart';
import '../../marketplace/presentation/widgets/empty_state.dart';

class CartPage extends StatelessWidget {
  const CartPage({super.key, required this.store});
  final CartStore store;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text(
        'Wholesale basket',
        style: TextStyle(fontWeight: FontWeight.w800),
      ),
      backgroundColor: brandYellow,
    ),
    body: AnimatedBuilder(
      animation: store,
      builder: (context, _) {
        if (store.products.isEmpty) {
          return const EmptyState(
            icon: Icons.shopping_basket_outlined,
            title: 'Your basket is empty',
            message: 'Add sealed-box products to start a wholesale order.',
          );
        }
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              color: Colors.white,
              child: ListTile(
                dense: true,
                leading: const Icon(Icons.location_on_rounded, color: teal),
                title: const Text(
                  'Delivering to your store',
                  style: TextStyle(fontSize: 12, color: muted),
                ),
                subtitle: const Text(
                  'Sector 56, Gurugram',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: ink,
                  ),
                ),
                trailing: const Icon(
                  Icons.keyboard_arrow_down_rounded,
                  color: ink,
                ),
              ),
            ),
            const SizedBox(height: 9),
            Container(
              padding: const EdgeInsets.all(13),
              decoration: BoxDecoration(
                color: const Color(0xFFE8F5F1),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Row(
                children: [
                  Icon(Icons.inventory_2_outlined, color: teal),
                  SizedBox(width: 9),
                  Expanded(
                    child: Text(
                      'Every line is ordered in full boxes and respects the supplier MOQ.',
                      style: TextStyle(
                        color: navy,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            ...store.products.map((product) => _cartLine(context, product)),
            const SizedBox(height: 12),
            _summary(),
            const SizedBox(height: 12),
            const Text(
              'Demo checkout · no payment is collected and no real order is sent.',
              style: TextStyle(color: muted, fontSize: 11),
              textAlign: TextAlign.center,
            ),
          ],
        );
      },
    ),
    bottomNavigationBar: AnimatedBuilder(
      animation: store,
      builder: (context, _) => store.products.isEmpty
          ? const SizedBox.shrink()
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: FilledButton(
                  onPressed: () => _checkout(context),
                  style: FilledButton.styleFrom(
                    backgroundColor: teal,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(15),
                    ),
                  ),
                  child: Text(
                    'Place demo order  ·  ${money(store.total)}',
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
              ),
            ),
    ),
  );

  Widget _cartLine(BuildContext context, Medicine product) => Card(
    color: Colors.white,
    margin: const EdgeInsets.only(bottom: 10),
    child: Padding(
      padding: const EdgeInsets.all(11),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 58,
              height: 64,
              child: BoxArt(product: product, compact: true),
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.name,
                  style: const TextStyle(
                    color: ink,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  '${money(product.price)} / box · MOQ ${product.moq}',
                  style: const TextStyle(color: muted, fontSize: 11),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    _quantityButton(
                      Icons.remove,
                      () => store.removeOneMoq(product),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 9),
                      child: Text(
                        '${store.boxesFor(product)} boxes',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    _quantityButton(
                      Icons.add,
                      store.boxesFor(product) + product.moq <=
                              (product.stockBoxes ~/ product.moq) * product.moq
                          ? () => store.add(product)
                          : null,
                    ),
                  ],
                ),
              ],
            ),
          ),
          Text(
            money(product.price * store.boxesFor(product)),
            style: const TextStyle(color: navy, fontWeight: FontWeight.w900),
          ),
        ],
      ),
    ),
  );

  Widget _quantityButton(IconData icon, VoidCallback? onTap) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(7),
    child: Container(
      width: 27,
      height: 27,
      decoration: BoxDecoration(
        color: const Color(0xFFE8F5F1),
        borderRadius: BorderRadius.circular(7),
      ),
      child: Icon(icon, size: 16, color: onTap == null ? muted : navy),
    ),
  );

  Widget _summary() => Card(
    color: Colors.white,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          const Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Bill details',
              style: TextStyle(
                color: ink,
                fontSize: 16,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          const SizedBox(height: 14),
          _summaryRow('Boxes', '${store.totalBoxes} boxes'),
          const SizedBox(height: 9),
          _summaryRow('Subtotal', money(store.total)),
          const SizedBox(height: 9),
          _summaryRow('Delivery', 'Calculated at checkout'),
          const Divider(height: 24),
          _summaryRow('Estimated total', money(store.total), bold: true),
        ],
      ),
    ),
  );

  Widget _summaryRow(String label, String value, {bool bold = false}) => Row(
    children: [
      Text(
        label,
        style: TextStyle(
          color: bold ? ink : muted,
          fontWeight: bold ? FontWeight.w800 : FontWeight.normal,
        ),
      ),
      const Spacer(),
      Text(
        value,
        style: TextStyle(
          color: navy,
          fontWeight: bold ? FontWeight.w900 : FontWeight.w700,
        ),
      ),
    ],
  );

  void _checkout(BuildContext context) {
    store.placeOrder();
    final orderNumber = store.orders.first.number;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        icon: const Icon(Icons.check_circle_rounded, color: teal, size: 48),
        title: const Text('Demo order placed'),
        content: Text(
          'Order $orderNumber is saved in Your orders. This prototype does not send it to a supplier.',
        ),
        actions: [
          FilledButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              Navigator.pop(context);
            },
            child: const Text('Continue shopping'),
          ),
        ],
      ),
    );
  }
}
