import 'package:flutter/material.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../data/checkout_repository.dart';

class OrderDetailPage extends StatefulWidget {
  const OrderDetailPage({
    super.key,
    required this.repository,
    required this.orderId,
    required this.onChanged,
  });

  final CheckoutRepository repository;
  final String orderId;
  final VoidCallback onChanged;

  @override
  State<OrderDetailPage> createState() => _OrderDetailPageState();
}

class _OrderDetailPageState extends State<OrderDetailPage> {
  Map<String, dynamic>? _order;
  String? _error;
  bool _loading = true;
  bool _cancelling = false;
  String? _cancelIdempotencyKey;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final order = await widget.repository.orderDetail(widget.orderId);
      if (!mounted) return;
      setState(() {
        _order = order;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  Future<void> _cancel() async {
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.warning_amber_rounded, color: Color(0xFFB45A16)),
        title: const Text('Cancel this order?'),
        content: const Text(
          'The server will check the latest fulfilment and payment status before releasing reserved stock.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep order'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Request cancellation'),
          ),
        ],
      ),
    );
    if (accepted != true || !mounted || _cancelling) return;
    _cancelIdempotencyKey ??= widget.repository.newIdempotencyKey();
    setState(() {
      _cancelling = true;
      _error = null;
    });
    try {
      await widget.repository.cancelOrder(
        orderId: widget.orderId,
        idempotencyKey: _cancelIdempotencyKey!,
        reason: 'Buyer requested cancellation in BEZZO mobile app',
      );
      _cancelIdempotencyKey = null;
      widget.onChanged();
      await _load();
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    final status = order?['status'] as String? ?? '';
    final payment = order?['payment'];
    final paymentStatus = payment is Map
        ? payment['status'] as String? ?? ''
        : '';
    final canCancel =
        const {'PENDING_PAYMENT', 'CONFIRMED'}.contains(status) &&
        !const {'PAID', 'PARTIALLY_REFUNDED'}.contains(paymentStatus);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          order?['orderNumber'] is String
              ? 'Order ${order!['orderNumber']}'
              : 'Order details',
        ),
        backgroundColor: brandYellow,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null && order == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error!, textAlign: TextAlign.center),
                    TextButton.icon(
                      onPressed: _load,
                      icon: const Icon(Icons.refresh_rounded),
                      label: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            )
          : order == null
          ? const SizedBox.shrink()
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _statusCard(order),
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  _notice(_error!),
                ],
                const SizedBox(height: 12),
                _section('Items', _items(order['items'])),
                _section(
                  'Supplier fulfilment',
                  _fulfillments(order['fulfillments']),
                ),
                _section('Delivery', [_delivery(order['deliveryAddress'])]),
                _section('Payment', [_payment(payment)]),
                _section('Order timeline', _timeline(order['timeline'])),
              ],
            ),
      bottomNavigationBar: canCancel
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: OutlinedButton.icon(
                  onPressed: _cancelling ? null : _cancel,
                  icon: _cancelling
                      ? const SizedBox.square(
                          dimension: 17,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.cancel_outlined),
                  label: Text(_cancelling ? 'Cancelling…' : 'Cancel order'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF9C2F1C),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
            )
          : null,
    );
  }

  Widget _statusCard(Map<String, dynamic> order) {
    final status = (order['status'] as String? ?? 'UNKNOWN').replaceAll(
      '_',
      ' ',
    );
    final orderNumber = order['orderNumber'] as String? ?? '';
    final date = order['placedAt'] as String? ?? '';
    return Card(
      color: navy,
      child: Padding(
        padding: const EdgeInsets.all(17),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              status,
              style: const TextStyle(
                color: brandYellow,
                fontWeight: FontWeight.w900,
                letterSpacing: .5,
              ),
            ),
            const SizedBox(height: 5),
            Text(
              'Order $orderNumber',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
            if (date.isNotEmpty)
              Text(
                'Placed ${_displayDate(date)}',
                style: const TextStyle(color: Colors.white70, fontSize: 12),
              ),
            const Divider(color: Colors.white24, height: 22),
            Text(
              money(_number(order['grandTotal'])),
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                fontSize: 22,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _section(String title, List<Widget> children) => Padding(
    padding: const EdgeInsets.only(top: 12),
    child: Card(
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(15),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(
                color: navy,
                fontWeight: FontWeight.w900,
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 10),
            ...children,
          ],
        ),
      ),
    ),
  );

  List<Widget> _items(Object? data) => _maps(data)
      .map((item) {
        final quantity = _number(item['quantity']).toInt();
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.inventory_2_outlined, color: teal, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item['productName'] as String? ?? 'Medicine box',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    Text(
                      '${item['supplierName'] ?? 'Supplier'} · $quantity sealed boxes',
                      style: const TextStyle(color: muted, fontSize: 11),
                    ),
                  ],
                ),
              ),
              Text(money(_number(item['lineTotal']))),
            ],
          ),
        );
      })
      .toList(growable: false);

  List<Widget> _fulfillments(Object? data) {
    final rows = _maps(data);
    if (rows.isEmpty) return [const Text('Supplier fulfilment is pending.')];
    return rows
        .map(
          (item) => ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.local_shipping_outlined, color: teal),
            title: Text(item['supplierName'] as String? ?? 'Supplier'),
            subtitle: Text(
              (item['status'] as String? ?? 'PENDING').replaceAll('_', ' '),
            ),
            trailing: Text(money(_number(item['total']))),
          ),
        )
        .toList(growable: false);
  }

  Widget _delivery(Object? data) {
    if (data is! Map) return const Text('Delivery address unavailable.');
    return Text(
      '${data['label'] ?? 'Store'} · ${data['contactName'] ?? ''}\n'
      '${data['addressLine1'] ?? ''}\n'
      '${data['city'] ?? ''}, ${data['state'] ?? ''} ${data['postalCode'] ?? ''}',
      style: const TextStyle(height: 1.45),
    );
  }

  Widget _payment(Object? data) {
    if (data is! Map) return const Text('Payment details unavailable.');
    return Text(
      '${(data['method'] as String? ?? 'PAYMENT').replaceAll('_', ' ')} · '
      '${(data['status'] as String? ?? 'PENDING').replaceAll('_', ' ')}\n'
      '${money(_number(data['amount']))}',
      style: const TextStyle(height: 1.5),
    );
  }

  List<Widget> _timeline(Object? data) {
    final rows = _maps(data);
    if (rows.isEmpty) return [const Text('No status updates yet.')];
    return rows
        .map(
          (event) => ListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            leading: const Icon(Icons.circle, size: 10, color: teal),
            title: Text(
              (event['toStatus'] as String? ?? 'UPDATE').replaceAll('_', ' '),
            ),
            subtitle: Text(
              '${event['reason'] ?? ''} · ${_displayDate(event['createdAt'] as String? ?? '')}',
            ),
          ),
        )
        .toList(growable: false);
  }

  Widget _notice(String text) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: const Color(0xFFFFECE8),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Text(text, style: const TextStyle(color: Color(0xFF9C2F1C))),
  );

  List<Map<String, dynamic>> _maps(Object? value) => value is List
      ? value.whereType<Map<String, dynamic>>().toList(growable: false)
      : const [];

  num _number(Object? value) => value is num ? value : 0;

  String _displayDate(String value) {
    final date = DateTime.tryParse(value)?.toLocal();
    if (date == null) return value;
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')} '
        '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }
}
