import 'package:flutter/foundation.dart';

import '../../catalog/domain/medicine.dart';

class DemoOrder {
  const DemoOrder({
    required this.number,
    required this.items,
    required this.total,
    required this.placedAt,
  });

  final String number;
  final int items;
  final int total;
  final DateTime placedAt;
  String get status => 'Confirmed (demo)';
  String get paymentMethod => 'Cash on delivery (demo)';
}

class DemoStore extends ChangeNotifier {
  static const products = <Medicine>[
    Medicine(
      id: 'demo-paracetamol',
      name: 'Paracetamol',
      generic: 'Paracetamol',
      strength: '500 mg · sealed box',
      category: 'Pain relief',
      price: 84,
      stockBoxes: 250,
      supplier: 'Demo verified supplier',
      tint: 0xFFE0EAFE,
    ),
    Medicine(
      id: 'demo-cetirizine',
      name: 'Cetirizine',
      generic: 'Cetirizine',
      strength: '10 mg · sealed box',
      category: 'Cold & allergy',
      price: 62,
      stockBoxes: 180,
      supplier: 'Demo verified supplier',
      tint: 0xFFDDF0E8,
    ),
    Medicine(
      id: 'demo-omeprazole',
      name: 'Omeprazole',
      generic: 'Omeprazole',
      strength: '20 mg · sealed box',
      category: 'Digestive care',
      price: 105,
      stockBoxes: 125,
      supplier: 'Demo verified supplier',
      tint: 0xFFFFE9C7,
    ),
    Medicine(
      id: 'demo-vitamin-c',
      name: 'Vitamin C',
      generic: 'Ascorbic acid',
      strength: '500 mg · sealed box',
      category: 'Vitamins',
      price: 128,
      stockBoxes: 90,
      supplier: 'Demo verified supplier',
      tint: 0xFFE6E4F8,
    ),
  ];

  final Map<String, int> _basket = {};
  final List<DemoOrder> _orders = [];

  Map<String, int> get basket => Map.unmodifiable(_basket);
  List<DemoOrder> get orders => List.unmodifiable(_orders);
  int get totalBoxes =>
      _basket.values.fold(0, (sum, quantity) => sum + quantity);
  int get subtotal => _basket.entries.fold(
    0,
    (sum, entry) => sum + _product(entry.key).price * entry.value,
  );

  int quantityFor(String productId) => _basket[productId] ?? 0;

  void addBox(String productId) {
    _basket.update(productId, (quantity) => quantity + 1, ifAbsent: () => 1);
    notifyListeners();
  }

  void removeBox(String productId) {
    final quantity = _basket[productId];
    if (quantity == null) return;
    if (quantity <= 1) {
      _basket.remove(productId);
    } else {
      _basket[productId] = quantity - 1;
    }
    notifyListeners();
  }

  DemoOrder? placeCodOrder() {
    if (_basket.isEmpty) return null;
    final order = DemoOrder(
      number: 'DEMO-${(_orders.length + 1).toString().padLeft(4, '0')}',
      items: totalBoxes,
      total: subtotal,
      placedAt: DateTime.now(),
    );
    _orders.insert(0, order);
    _basket.clear();
    notifyListeners();
    return order;
  }

  static Medicine _product(String id) => products.firstWhere(
    (product) => product.id == id,
    orElse: () => throw ArgumentError.value(id, 'productId'),
  );
}
