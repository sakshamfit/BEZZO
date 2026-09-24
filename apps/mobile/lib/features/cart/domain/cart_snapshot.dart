class CartSnapshot {
  const CartSnapshot({
    required this.cartId,
    required this.currency,
    required this.items,
    required this.unitCount,
    required this.estimatedSubtotal,
    required this.estimatedTax,
    required this.estimatedTotal,
    required this.hasIssues,
    required this.issues,
  });

  factory CartSnapshot.fromApi(Map<String, dynamic> data) {
    final rawItems = data['items'];
    final rawIssues = data['issues'];
    return CartSnapshot(
      cartId: data['cartId'] as String? ?? '',
      currency: data['currency'] as String? ?? 'INR',
      items: rawItems is List
          ? rawItems
                .whereType<Map<String, dynamic>>()
                .map(CartLine.fromApi)
                .toList(growable: false)
          : const [],
      unitCount: _int(data['unitCount']),
      estimatedSubtotal: _number(data['estimatedSubtotal']),
      estimatedTax: _number(data['estimatedTax']),
      estimatedTotal: _number(data['estimatedTotal']),
      hasIssues: data['hasIssues'] == true,
      issues: rawIssues is List
          ? rawIssues
                .whereType<Map<String, dynamic>>()
                .map(CartIssue.fromApi)
                .toList(growable: false)
          : const [],
    );
  }

  final String cartId;
  final String currency;
  final List<CartLine> items;
  final int unitCount;
  final num estimatedSubtotal;
  final num estimatedTax;
  final num estimatedTotal;
  final bool hasIssues;
  final List<CartIssue> issues;

  static int _int(Object? value) => value is num ? value.toInt() : 0;
  static num _number(Object? value) => value is num ? value : 0;
}

class CartLine {
  const CartLine({
    required this.id,
    required this.supplierProductId,
    required this.productId,
    required this.productName,
    required this.strength,
    required this.packSize,
    required this.supplierName,
    required this.supplierCity,
    required this.quantity,
    required this.minimumOrderQuantity,
    required this.sellableQuantity,
    required this.unitPrice,
    required this.lineTotal,
    required this.available,
    required this.issues,
  });

  factory CartLine.fromApi(Map<String, dynamic> data) => CartLine(
    id: _string(data, 'id'),
    supplierProductId: _string(data, 'supplierProductId'),
    productId: _string(data, 'productId'),
    productName: _string(data, 'productName'),
    strength: data['strength'] as String? ?? '',
    packSize: data['packSize'] as String? ?? '',
    supplierName: data['supplierName'] as String? ?? 'Verified supplier',
    supplierCity: data['supplierCity'] as String?,
    quantity: _int(data['quantity']),
    minimumOrderQuantity: _int(data['minimumOrderQuantity']),
    sellableQuantity: _int(data['sellableQuantity']),
    unitPrice: _number(data['unitPrice']),
    lineTotal: _number(data['lineTotal']),
    available: data['available'] == true,
    issues: data['issues'] is List
        ? (data['issues'] as List).whereType<String>().toList(growable: false)
        : const [],
  );

  final String id;
  final String supplierProductId;
  final String productId;
  final String productName;
  final String strength;
  final String packSize;
  final String supplierName;
  final String? supplierCity;
  final int quantity;
  final int minimumOrderQuantity;
  final int sellableQuantity;
  final num unitPrice;
  final num lineTotal;
  final bool available;
  final List<String> issues;

  static String _string(Map<String, dynamic> data, String key) {
    final value = data[key];
    if (value is! String || value.isEmpty) {
      throw FormatException('Cart response is missing $key.');
    }
    return value;
  }

  static int _int(Object? value) => value is num ? value.toInt() : 0;
  static num _number(Object? value) => value is num ? value : 0;
}

class CartIssue {
  const CartIssue(this.code, this.message);

  factory CartIssue.fromApi(Map<String, dynamic> data) => CartIssue(
    data['code'] as String? ?? 'CART_ISSUE',
    data['message'] as String? ?? 'Review this cart item.',
  );

  final String code;
  final String message;
}
