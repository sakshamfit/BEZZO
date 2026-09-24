import '../../../core/network/bezzo_api_client.dart';

class BuyerAddress {
  const BuyerAddress({
    required this.id,
    required this.label,
    required this.contactName,
    required this.contactPhone,
    required this.addressLine1,
    required this.city,
    required this.state,
    required this.postalCode,
    required this.isDefault,
    this.addressLine2,
    this.landmark,
  });

  factory BuyerAddress.fromApi(Map<String, dynamic> data) => BuyerAddress(
    id: _requiredString(data, 'id'),
    label: _requiredString(data, 'label'),
    contactName: _requiredString(data, 'contactName'),
    contactPhone: _requiredString(data, 'contactPhone'),
    addressLine1: _requiredString(data, 'addressLine1'),
    city: _requiredString(data, 'city'),
    state: _requiredString(data, 'state'),
    postalCode: _requiredString(data, 'postalCode'),
    isDefault: data['isDefault'] == true,
    addressLine2: data['addressLine2'] as String?,
    landmark: data['landmark'] as String?,
  );

  final String id;
  final String label;
  final String contactName;
  final String contactPhone;
  final String addressLine1;
  final String? addressLine2;
  final String? landmark;
  final String city;
  final String state;
  final String postalCode;
  final bool isDefault;

  static String _requiredString(Map<String, dynamic> data, String key) {
    final value = data[key];
    if (value is! String || value.trim().isEmpty) {
      throw FormatException('Address response is missing $key.');
    }
    return value;
  }
}

class DeliverySlot {
  const DeliverySlot({required this.id, required this.name});

  factory DeliverySlot.fromApi(Map<String, dynamic> data) => DeliverySlot(
    id: BuyerAddress._requiredString(data, 'id'),
    name: BuyerAddress._requiredString(data, 'name'),
  );

  final String id;
  final String name;
}

class CheckoutQuote {
  const CheckoutQuote({
    required this.placeable,
    required this.subtotal,
    required this.taxTotal,
    required this.deliveryFee,
    required this.grandTotal,
    required this.issues,
  });

  factory CheckoutQuote.fromApi(Map<String, dynamic> data) => CheckoutQuote(
    placeable: data['placeable'] == true,
    subtotal: _number(data['subtotal']),
    taxTotal: _number(data['taxTotal']),
    deliveryFee: _number(data['deliveryFee']),
    grandTotal: _number(data['grandTotal']),
    issues: data['issues'] is List
        ? (data['issues'] as List)
              .whereType<Map<String, dynamic>>()
              .map((issue) => issue['message'] as String? ?? 'Review checkout.')
              .toList(growable: false)
        : const [],
  );

  final bool placeable;
  final num subtotal;
  final num taxTotal;
  final num deliveryFee;
  final num grandTotal;
  final List<String> issues;

  static num _number(Object? value) => value is num ? value : 0;
}

class OrderSummary {
  const OrderSummary({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.paymentStatus,
    required this.grandTotal,
    required this.unitCount,
    required this.placedAt,
  });

  factory OrderSummary.fromApi(Map<String, dynamic> data) => OrderSummary(
    id: BuyerAddress._requiredString(data, 'id'),
    orderNumber: BuyerAddress._requiredString(data, 'orderNumber'),
    status: BuyerAddress._requiredString(data, 'status'),
    paymentStatus: data['paymentStatus'] as String? ?? 'PENDING',
    grandTotal: data['grandTotal'] is num ? data['grandTotal'] as num : 0,
    unitCount: data['unitCount'] is num
        ? (data['unitCount'] as num).toInt()
        : 0,
    placedAt:
        DateTime.tryParse(data['placedAt'] as String? ?? '') ??
        DateTime.fromMillisecondsSinceEpoch(0),
  );

  final String id;
  final String orderNumber;
  final String status;
  final String paymentStatus;
  final num grandTotal;
  final int unitCount;
  final DateTime placedAt;
}

class CheckoutRepository {
  CheckoutRepository(this._api);

  final BezzoApiClient _api;

  String newIdempotencyKey() => _api.newIdempotencyKey();

  Future<List<BuyerAddress>> addresses() async =>
      _list(await _api.get('buyer/addresses'), BuyerAddress.fromApi);

  Future<BuyerAddress> createAddress(
    Map<String, dynamic> body, {
    required String idempotencyKey,
  }) async => BuyerAddress.fromApi(
    await _api.post(
      'buyer/addresses',
      body: body,
      idempotencyKey: idempotencyKey,
    ),
  );

  Future<List<DeliverySlot>> deliverySlots() async => _list(
    await _api.getPublic('catalog/delivery-slots'),
    DeliverySlot.fromApi,
  );

  Future<CheckoutQuote> quote({
    required String addressId,
    required String slotId,
    required String deliveryDate,
  }) async => CheckoutQuote.fromApi(
    await _api.post(
      'checkout/quote',
      body: {
        'deliveryAddressId': addressId,
        'deliveryMode': 'SCHEDULED',
        'deliverySlotId': slotId,
        'deliveryDate': deliveryDate,
      },
    ),
  );

  Future<Map<String, dynamic>> placeCashOnDeliveryOrder({
    required String addressId,
    required String slotId,
    required String deliveryDate,
    required String idempotencyKey,
    String? buyerNote,
  }) => _api.post(
    'orders',
    body: {
      'deliveryAddressId': addressId,
      'deliveryMode': 'SCHEDULED',
      'deliverySlotId': slotId,
      'deliveryDate': deliveryDate,
      'paymentMethod': 'COD',
      if (buyerNote != null && buyerNote.trim().isNotEmpty)
        'buyerNote': buyerNote.trim(),
    },
    idempotencyKey: idempotencyKey,
  );

  Future<List<OrderSummary>> orders() async => _list(
    await _api.get('orders', query: {'page': '1', 'pageSize': '100'}),
    OrderSummary.fromApi,
  );

  Future<Map<String, dynamic>> orderDetail(String orderId) =>
      _api.get('orders/$orderId');

  Future<Map<String, dynamic>> cancelOrder({
    required String orderId,
    required String idempotencyKey,
    String? reason,
  }) => _api.post(
    'orders/$orderId/cancel',
    body: {
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
    },
    idempotencyKey: idempotencyKey,
  );

  static List<T> _list<T>(
    Map<String, dynamic> data,
    T Function(Map<String, dynamic>) parse,
  ) {
    final rows = data['items'];
    if (rows is! List) return const [];
    return rows
        .whereType<Map<String, dynamic>>()
        .map(parse)
        .toList(growable: false);
  }
}
