class Medicine {
  const Medicine({
    required this.id,
    required this.name,
    required this.generic,
    required this.strength,
    required this.category,
    required this.price,
    required this.stockBoxes,
    required this.supplier,
    required this.tint,
    this.categoryId,
    this.supplierCount = 1,
  });

  factory Medicine.fromCatalogApi(
    Map<String, dynamic> data, {
    String categoryName = 'Medicine',
  }) {
    final id = _requiredString(data, 'id');
    final name = _requiredString(data, 'name');
    final generic = data['genericName'] is String
        ? data['genericName'] as String
        : (data['brandName'] is String ? data['brandName'] as String : name);
    final strength = data['strength'] is String
        ? data['strength'] as String
        : 'Sealed wholesale box';
    final packSize = data['packSize'];
    final supplierCount = _intOrZero(data['supplierCount']);
    final sellableQuantity = _intOrZero(data['sellableQuantity']);
    final price = data['minPrice'] is num
        ? (data['minPrice'] as num).round()
        : 0;
    final categoryId = data['categoryId'] is String
        ? data['categoryId'] as String
        : null;

    return Medicine(
      id: id,
      name: name,
      generic: generic,
      strength: [
        strength,
        if (packSize is String && packSize.isNotEmpty) packSize,
      ].join(' · '),
      category: categoryName,
      price: price,
      stockBoxes: sellableQuantity,
      supplier: '$supplierCount verified suppliers',
      tint: _tintFor(id),
      categoryId: categoryId,
      supplierCount: supplierCount,
    );
  }

  final String id;
  final String name;
  final String generic;
  final String strength;
  final String category;
  final int price;
  final int stockBoxes;
  final String supplier;
  final int tint;
  final String? categoryId;
  final int supplierCount;

  static String _requiredString(Map<String, dynamic> data, String key) {
    final value = data[key];
    if (value is! String || value.trim().isEmpty) {
      throw FormatException('Catalog product is missing $key.');
    }
    return value;
  }

  static int _intOrZero(Object? value) => value is num ? value.toInt() : 0;

  static int _tintFor(String id) {
    const palette = [
      0xFFD7E9F4,
      0xFFE6E4F8,
      0xFFFFE9C7,
      0xFFFFE2DC,
      0xFFDDF0E8,
      0xFFE0EAFE,
    ];
    return palette[id.hashCode.abs() % palette.length];
  }
}
