import 'package:flutter/foundation.dart';

import '../../catalog/data/demo_catalog.dart';
import '../../catalog/domain/medicine.dart';
import '../domain/demo_order.dart';

class CartStore extends ChangeNotifier {
  final Map<String, int> _boxes = {};
  final List<DemoOrder> orders = [];

  int boxesFor(Medicine product) => _boxes[product.id] ?? 0;
  int get totalBoxes => _boxes.values.fold(0, (sum, boxes) => sum + boxes);
  int get total =>
      demoMedicines.fold(0, (sum, item) => sum + item.price * boxesFor(item));
  List<Medicine> get products =>
      demoMedicines.where((item) => boxesFor(item) > 0).toList();

  void add(Medicine product) {
    final next = boxesFor(product) + product.moq;
    if (next > product.stockBoxes) return;
    _boxes[product.id] = next;
    notifyListeners();
  }

  void removeOneMoq(Medicine product) {
    final next = boxesFor(product) - product.moq;
    if (next <= 0) {
      _boxes.remove(product.id);
    } else {
      _boxes[product.id] = next;
    }
    notifyListeners();
  }

  void placeOrder() {
    if (_boxes.isEmpty) return;
    orders.insert(
      0,
      DemoOrder(
        number:
            'BZ-${DateTime.now().millisecondsSinceEpoch.toString().substring(7)}',
        items: totalBoxes,
        total: total,
        time: DateTime.now(),
      ),
    );
    _boxes.clear();
    notifyListeners();
  }

  void clear() {
    _boxes.clear();
    orders.clear();
    notifyListeners();
  }
}
