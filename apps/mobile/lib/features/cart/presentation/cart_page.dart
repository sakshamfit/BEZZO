import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../application/cart_store.dart';
import '../domain/cart_snapshot.dart';
import '../../marketplace/presentation/widgets/empty_state.dart';
import '../../checkout/data/checkout_repository.dart';
import '../../checkout/presentation/checkout_page.dart';

class CartPage extends StatelessWidget {
  const CartPage({
    super.key,
    required this.store,
    required this.checkout,
    required this.onOrderPlaced,
  });

  final CartStore store;
  final CheckoutRepository checkout;
  final VoidCallback onOrderPlaced;

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
        if (store.loading) {
          return const Center(child: CircularProgressIndicator());
        }
        if (store.error != null && store.products.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.cloud_off_rounded, color: muted, size: 48),
                  const SizedBox(height: 12),
                  Text(store.error!, textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: store.load,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Retry'),
                  ),
                ],
              ),
            ),
          );
        }
        if (store.products.isEmpty) {
          return const EmptyState(
            icon: Icons.shopping_basket_outlined,
            title: 'Your basket is empty',
            message:
                'Choose a verified supplier offer to add sealed medicine boxes.',
          );
        }
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              color: Colors.white,
              child: const ListTile(
                dense: true,
                leading: Icon(Icons.location_on_rounded, color: teal),
                title: Text(
                  'Delivery address',
                  style: TextStyle(fontSize: 12, color: muted),
                ),
                subtitle: Text(
                  'Choose a verified store address at checkout',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: ink,
                  ),
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
                      'Quantities use full sealed boxes. Each offer enforces its supplier MOQ and live stock.',
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
            if (store.error != null) ...[
              const SizedBox(height: 10),
              _errorMessage(store.error!),
            ],
            const SizedBox(height: 12),
            ...store.products.map((line) => _cartLine(context, line)),
            const SizedBox(height: 12),
            _summary(),
            const SizedBox(height: 12),
            const Text(
              'Server totals are estimates. Checkout rechecks price, stock, address and delivery eligibility.',
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
                  onPressed: store.mutating ? null : () => _checkout(context),
                  style: FilledButton.styleFrom(
                    backgroundColor: teal,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(15),
                    ),
                  ),
                  child: Text(
                    store.snapshot?.hasIssues == true
                        ? 'Review basket issues before checkout'
                        : 'Continue to delivery and checkout',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
              ),
            ),
    ),
  );

  Future<void> _checkout(BuildContext context) async {
    final placed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => CheckoutPage(
          repository: checkout,
          cartStore: store,
          onOrderPlaced: onOrderPlaced,
        ),
      ),
    );
    if (placed == true && context.mounted) Navigator.pop(context);
  }

  Widget _cartLine(BuildContext context, CartLine line) {
    final subtitle = [
      line.supplierName,
      if (line.supplierCity != null && line.supplierCity!.isNotEmpty)
        line.supplierCity!,
    ].join(' · ');
    final canIncrement =
        !store.mutating &&
        line.quantity + line.minimumOrderQuantity <= line.sellableQuantity;
    return Card(
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const CircleAvatar(
                  backgroundColor: Color(0xFFE8F5F1),
                  child: Icon(Icons.inventory_2_outlined, color: teal),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        line.productName,
                        style: const TextStyle(
                          color: ink,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      if (line.strength.isNotEmpty || line.packSize.isNotEmpty)
                        Text(
                          [
                            line.strength,
                            line.packSize,
                          ].where((part) => part.isNotEmpty).join(' · '),
                          style: const TextStyle(color: muted, fontSize: 11),
                        ),
                      Text(
                        subtitle,
                        style: const TextStyle(color: muted, fontSize: 11),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Remove item',
                  onPressed: store.mutating ? null : () => store.remove(line),
                  icon: const Icon(Icons.delete_outline_rounded, color: muted),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Text(
                  '${money(line.unitPrice)} / box · MOQ ${line.minimumOrderQuantity}',
                  style: const TextStyle(color: muted, fontSize: 11),
                ),
                const Spacer(),
                Text(
                  money(line.lineTotal),
                  style: const TextStyle(
                    color: navy,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                _quantityButton(
                  Icons.remove,
                  !store.mutating
                      ? () {
                          final next =
                              line.quantity - line.minimumOrderQuantity;
                          if (next < line.minimumOrderQuantity) {
                            store.remove(line);
                          } else {
                            store.setQuantity(line, next);
                          }
                        }
                      : null,
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Text(
                    '${line.quantity} boxes',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                    ),
                  ),
                ),
                _quantityButton(
                  Icons.add,
                  canIncrement
                      ? () => store.setQuantity(
                          line,
                          line.quantity + line.minimumOrderQuantity,
                        )
                      : null,
                ),
                const Spacer(),
                if (!line.available)
                  const Icon(
                    Icons.warning_amber_rounded,
                    color: Color(0xFFB45A16),
                  ),
              ],
            ),
            for (final issue in line.issues)
              Padding(
                padding: const EdgeInsets.only(top: 7),
                child: _errorMessage(issue.replaceAll('_', ' ').toLowerCase()),
              ),
          ],
        ),
      ),
    );
  }

  Widget _quantityButton(IconData icon, VoidCallback? onTap) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(7),
    child: Container(
      width: 30,
      height: 30,
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
          _summaryRow(
            'Subtotal',
            money(store.snapshot?.estimatedSubtotal ?? 0),
          ),
          const SizedBox(height: 9),
          _summaryRow(
            'Estimated tax',
            money(store.snapshot?.estimatedTax ?? 0),
          ),
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

  Widget _errorMessage(String message) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(
      color: const Color(0xFFFFECE8),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Text(
      message,
      style: const TextStyle(color: Color(0xFF9C2F1C), fontSize: 12),
    ),
  );
}
