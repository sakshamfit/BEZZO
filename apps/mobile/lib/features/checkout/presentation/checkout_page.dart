import 'dart:convert';

import 'package:flutter/material.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../cart/application/cart_store.dart';
import '../data/checkout_repository.dart';

class CheckoutPage extends StatefulWidget {
  const CheckoutPage({
    super.key,
    required this.repository,
    required this.cartStore,
    required this.onOrderPlaced,
  });

  final CheckoutRepository repository;
  final CartStore cartStore;
  final VoidCallback onOrderPlaced;

  @override
  State<CheckoutPage> createState() => _CheckoutPageState();
}

class _CheckoutPageState extends State<CheckoutPage> {
  List<BuyerAddress> _addresses = const [];
  List<DeliverySlot> _slots = const [];
  String? _addressId;
  String? _slotId;
  CheckoutQuote? _quote;
  String? _error;
  bool _loading = true;
  bool _quoting = false;
  bool _placing = false;
  int _quoteGeneration = 0;
  String? _addressRequestKey;
  String? _addressRequestFingerprint;
  String? _orderRequestKey;
  String? _orderRequestFingerprint;
  late DateTime _deliveryDate;

  @override
  void initState() {
    super.initState();
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    _deliveryDate = DateTime(tomorrow.year, tomorrow.month, tomorrow.day);
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final addresses = await widget.repository.addresses();
      final slots = await widget.repository.deliverySlots();
      if (!mounted) return;
      final defaultAddresses = addresses.where((address) => address.isDefault);
      setState(() {
        _addresses = addresses;
        _slots = slots;
        _addressId = defaultAddresses.isNotEmpty
            ? defaultAddresses.first.id
            : addresses.isNotEmpty
            ? addresses.first.id
            : null;
        _slotId = slots.isNotEmpty ? slots.first.id : null;
        _loading = false;
      });
      await _loadQuote();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    } on FormatException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    }
  }

  Future<void> _loadQuote() async {
    final addressId = _addressId;
    final slotId = _slotId;
    final generation = ++_quoteGeneration;
    if (addressId == null || slotId == null) {
      setState(() {
        _quote = null;
        _quoting = false;
      });
      return;
    }
    setState(() {
      _quoting = true;
      _error = null;
    });
    try {
      final quote = await widget.repository.quote(
        addressId: addressId,
        slotId: slotId,
        deliveryDate: _isoDate(_deliveryDate),
      );
      if (!mounted || generation != _quoteGeneration) return;
      setState(() {
        _quote = quote;
        _quoting = false;
      });
    } on ApiException catch (error) {
      if (!mounted || generation != _quoteGeneration) return;
      setState(() {
        _quote = null;
        _quoting = false;
        _error = error.message;
      });
    }
  }

  Future<void> _addAddress() async {
    final body = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => const _AddressFormDialog(),
    );
    if (body == null || !mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final fingerprint = jsonEncode(body);
      if (_addressRequestFingerprint != fingerprint) {
        _addressRequestFingerprint = fingerprint;
        _addressRequestKey = widget.repository.newIdempotencyKey();
      }
      final address = await widget.repository.createAddress(
        body,
        idempotencyKey: _addressRequestKey!,
      );
      if (!mounted) return;
      setState(() {
        _addresses = [..._addresses, address];
        _addressId = address.id;
        _loading = false;
        _addressRequestKey = null;
        _addressRequestFingerprint = null;
      });
      await _loadQuote();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    }
  }

  Future<void> _chooseDeliveryDate() async {
    final selectedDate = await showDatePicker(
      context: context,
      initialDate: _deliveryDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (selectedDate == null || !mounted) return;
    setState(() => _deliveryDate = selectedDate);
    await _loadQuote();
  }

  Future<void> _placeOrder() async {
    final quote = _quote;
    final addressId = _addressId;
    final slotId = _slotId;
    if (_placing || quote == null || !quote.placeable) return;
    if (addressId == null || slotId == null) return;
    setState(() {
      _placing = true;
      _error = null;
    });
    try {
      final deliveryDate = _isoDate(_deliveryDate);
      final fingerprint = '$addressId|$slotId|$deliveryDate|COD';
      if (_orderRequestFingerprint != fingerprint) {
        _orderRequestFingerprint = fingerprint;
        _orderRequestKey = widget.repository.newIdempotencyKey();
      }
      final order = await widget.repository.placeCashOnDeliveryOrder(
        addressId: addressId,
        slotId: slotId,
        deliveryDate: deliveryDate,
        idempotencyKey: _orderRequestKey!,
      );
      _orderRequestKey = null;
      _orderRequestFingerprint = null;
      final number = order['orderNumber'] as String? ?? 'Your BEZZO order';
      await widget.cartStore.load();
      if (!mounted) return;
      widget.onOrderPlaced();
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          icon: const Icon(Icons.check_circle_rounded, color: teal, size: 48),
          title: const Text('Order placed'),
          content: Text(
            '$number is confirmed. Payment method: cash on delivery.',
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('View orders'),
            ),
          ],
        ),
      );
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _placing = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Delivery & payment'),
      backgroundColor: brandYellow,
    ),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'DELIVER TO',
                style: TextStyle(
                  color: muted,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  letterSpacing: .6,
                ),
              ),
              const SizedBox(height: 8),
              if (_addresses.isEmpty)
                Card(
                  color: Colors.white,
                  child: ListTile(
                    leading: const Icon(Icons.add_location_alt_outlined),
                    title: const Text('Add a store delivery address'),
                    onTap: _addAddress,
                  ),
                )
              else ...[
                RadioGroup<String>(
                  groupValue: _addressId,
                  onChanged: (value) {
                    setState(() => _addressId = value);
                    _loadQuote();
                  },
                  child: Column(
                    children: _addresses
                        .map(
                          (address) => Card(
                            color: Colors.white,
                            child: RadioListTile<String>(
                              value: address.id,
                              title: Text(
                                '${address.label} · ${address.contactName}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              subtitle: Text(
                                '${address.addressLine1}${address.addressLine2 == null ? '' : ', ${address.addressLine2}'}\n'
                                '${address.city}, ${address.state} ${address.postalCode} · ${address.contactPhone}',
                              ),
                              isThreeLine: true,
                            ),
                          ),
                        )
                        .toList(growable: false),
                  ),
                ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: _addAddress,
                    icon: const Icon(Icons.add_location_alt_outlined),
                    label: const Text('Add another address'),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              const Text(
                'DELIVERY',
                style: TextStyle(
                  color: muted,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  letterSpacing: .6,
                ),
              ),
              const SizedBox(height: 8),
              Card(
                color: Colors.white,
                child: Column(
                  children: [
                    ListTile(
                      leading: const Icon(Icons.calendar_month_outlined),
                      title: const Text('Delivery date'),
                      subtitle: Text(_isoDate(_deliveryDate)),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: _chooseDeliveryDate,
                    ),
                    const Divider(height: 1),
                    if (_slots.isEmpty)
                      const ListTile(
                        leading: Icon(Icons.schedule_outlined),
                        title: Text('No delivery slots are available.'),
                      )
                    else
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: DropdownButtonFormField<String>(
                          initialValue: _slotId,
                          decoration: const InputDecoration(
                            labelText: 'Delivery slot',
                            border: InputBorder.none,
                            prefixIcon: Icon(Icons.schedule_outlined),
                          ),
                          items: _slots
                              .map(
                                (slot) => DropdownMenuItem(
                                  value: slot.id,
                                  child: Text(slot.name),
                                ),
                              )
                              .toList(growable: false),
                          onChanged: (value) {
                            setState(() => _slotId = value);
                            _loadQuote();
                          },
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'PAYMENT',
                style: TextStyle(
                  color: muted,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  letterSpacing: .6,
                ),
              ),
              const Card(
                color: Colors.white,
                child: ListTile(
                  leading: Icon(Icons.payments_outlined, color: teal),
                  title: Text('Cash on delivery'),
                  subtitle: Text('Pay your supplier when your order arrives.'),
                  trailing: Icon(Icons.check_circle_rounded, color: teal),
                ),
              ),
              const SizedBox(height: 16),
              if (_quoting)
                const Center(child: CircularProgressIndicator())
              else if (_quote != null)
                _quoteSummary(_quote!),
              if (_quote?.issues case final issues? when issues.isNotEmpty) ...[
                const SizedBox(height: 10),
                for (final issue in issues)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: _warning(issue),
                  ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 10),
                _warning(_error!),
              ],
              const SizedBox(height: 16),
              const Text(
                'The server checks current stock, supplier service area, fees and pricing again before confirming this order.',
                textAlign: TextAlign.center,
                style: TextStyle(color: muted, fontSize: 11),
              ),
            ],
          ),
    bottomNavigationBar: SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: FilledButton(
          onPressed: _placing || _quoting || _quote?.placeable != true
              ? null
              : _placeOrder,
          style: FilledButton.styleFrom(
            backgroundColor: teal,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 16),
          ),
          child: _placing
              ? const SizedBox.square(
                  dimension: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : Text(
                  _quote == null
                      ? 'Review delivery details'
                      : 'Place COD order · ${money(_quote!.grandTotal)}',
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
        ),
      ),
    ),
  );

  Widget _quoteSummary(CheckoutQuote quote) => Card(
    color: Colors.white,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          const Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'SERVER CHECKOUT QUOTE',
              style: TextStyle(
                color: navy,
                fontWeight: FontWeight.w900,
                letterSpacing: .4,
              ),
            ),
          ),
          const SizedBox(height: 12),
          _quoteRow('Subtotal', quote.subtotal),
          _quoteRow('Estimated tax', quote.taxTotal),
          _quoteRow('Delivery', quote.deliveryFee),
          const Divider(height: 24),
          _quoteRow('Total', quote.grandTotal, bold: true),
        ],
      ),
    ),
  );

  Widget _quoteRow(String label, num value, {bool bold = false}) => Padding(
    padding: const EdgeInsets.only(bottom: 7),
    child: Row(
      children: [
        Text(label, style: TextStyle(color: bold ? ink : muted)),
        const Spacer(),
        Text(
          money(value),
          style: TextStyle(
            color: navy,
            fontWeight: bold ? FontWeight.w900 : FontWeight.w700,
          ),
        ),
      ],
    ),
  );

  Widget _warning(String text) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: const Color(0xFFFFF2E2),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Text(text, style: const TextStyle(color: Color(0xFF84480A))),
  );

  String _isoDate(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';
}

class _AddressFormDialog extends StatefulWidget {
  const _AddressFormDialog();

  @override
  State<_AddressFormDialog> createState() => _AddressFormDialogState();
}

class _AddressFormDialogState extends State<_AddressFormDialog> {
  final _formKey = GlobalKey<FormState>();
  final _fields = {
    'label': TextEditingController(text: 'Pharmacy'),
    'contactName': TextEditingController(),
    'contactPhone': TextEditingController(),
    'addressLine1': TextEditingController(),
    'addressLine2': TextEditingController(),
    'landmark': TextEditingController(),
    'city': TextEditingController(),
    'state': TextEditingController(),
    'postalCode': TextEditingController(),
  };

  @override
  void dispose() {
    for (final controller in _fields.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Store delivery address'),
    content: SizedBox(
      width: 440,
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _field('label', 'Address label'),
              _field('contactName', 'Receiver name'),
              _field(
                'contactPhone',
                'Receiver phone',
                type: TextInputType.phone,
              ),
              _field('addressLine1', 'Address line 1'),
              _field('addressLine2', 'Address line 2', required: false),
              _field('landmark', 'Landmark', required: false),
              _field('city', 'City'),
              _field('state', 'State'),
              _field('postalCode', 'Postal code', type: TextInputType.number),
            ],
          ),
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: () {
          if (!(_formKey.currentState?.validate() ?? false)) return;
          Navigator.pop(context, {
            for (final entry in _fields.entries)
              if (entry.value.text.trim().isNotEmpty)
                entry.key: entry.value.text.trim(),
            'country': 'IN',
            'isDefault': true,
          });
        },
        child: const Text('Save address'),
      ),
    ],
  );

  Widget _field(
    String key,
    String label, {
    bool required = true,
    TextInputType? type,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: TextFormField(
      controller: _fields[key],
      keyboardType: type,
      textCapitalization: TextCapitalization.words,
      validator: (value) {
        if (required && (value == null || value.trim().isEmpty)) {
          return 'Enter $label.';
        }
        if (key == 'contactName' && (value?.trim().length ?? 0) < 2) {
          return 'Enter a valid receiver name.';
        }
        if (key == 'contactPhone' && (value?.trim().length ?? 0) < 8) {
          return 'Enter a valid phone number.';
        }
        if (key == 'addressLine1' && (value?.trim().length ?? 0) < 4) {
          return 'Enter a complete street address.';
        }
        if (key == 'city' && (value?.trim().length ?? 0) < 2) {
          return 'Enter a valid city.';
        }
        if (key == 'state' && (value?.trim().length ?? 0) < 2) {
          return 'Enter a valid state.';
        }
        if (key == 'postalCode' && (value?.trim().length ?? 0) < 3) {
          return 'Enter a valid postal code.';
        }
        return null;
      },
      decoration: InputDecoration(
        labelText: label,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        isDense: true,
      ),
    ),
  );
}
