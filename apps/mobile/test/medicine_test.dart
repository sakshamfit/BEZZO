import 'package:flutter_test/flutter_test.dart';
import 'package:bezzo_mobile/features/catalog/domain/medicine.dart';

void main() {
  group('Medicine.fromCatalogApi', () {
    test('maps a wholesale listing to sealed box stock and price', () {
      final medicine = Medicine.fromCatalogApi({
        'id': 'product-1',
        'name': 'Amoxicillin',
        'genericName': 'Amoxicillin',
        'strength': '500 mg',
        'packSize': '100 capsules per box',
        'supplierCount': 3,
        'sellableQuantity': 12,
        'minPrice': 124.5,
        'categoryId': 'anti-infectives',
      }, categoryName: 'Anti infectives');

      expect(medicine.name, 'Amoxicillin');
      expect(medicine.strength, '500 mg · 100 capsules per box');
      expect(medicine.price, 125);
      expect(medicine.stockBoxes, 12);
      expect(medicine.supplierCount, 3);
      expect(medicine.categoryId, 'anti-infectives');
    });

    test('rejects an API product without an identifier', () {
      expect(
        () => Medicine.fromCatalogApi({'name': 'Amoxicillin'}),
        throwsFormatException,
      );
    });
  });
}
