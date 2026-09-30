import 'package:bezzo_mobile/features/demo/application/demo_store.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DemoStore', () {
    test('keeps a local box basket and confirms a local COD demo order', () {
      final store = DemoStore();
      addTearDown(store.dispose);

      store.addBox('demo-paracetamol');
      store.addBox('demo-paracetamol');
      store.addBox('demo-cetirizine');

      expect(store.totalBoxes, 3);
      expect(store.subtotal, 230);

      final order = store.placeCodOrder();

      expect(order, isNotNull);
      expect(order!.number, 'DEMO-0001');
      expect(order.items, 3);
      expect(order.total, 230);
      expect(order.status, 'Confirmed (demo)');
      expect(order.paymentMethod, 'Cash on delivery (demo)');
      expect(store.basket, isEmpty);
      expect(store.orders, [order]);
    });

    test('does not create an order for an empty basket', () {
      final store = DemoStore();
      addTearDown(store.dispose);

      expect(store.placeCodOrder(), isNull);
      expect(store.orders, isEmpty);
    });
  });
}
