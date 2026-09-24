import '../../../core/network/bezzo_api_client.dart';
import '../domain/medicine.dart';

class CatalogCategory {
  const CatalogCategory({required this.id, required this.name, this.count = 0});

  final String id;
  final String name;
  final int count;

  factory CatalogCategory.fromApi(Map<String, dynamic> data) => CatalogCategory(
    id: _string(data, 'id'),
    name: _string(data, 'name'),
    count: data['productCount'] is int ? data['productCount'] as int : 0,
  );

  static String _string(Map<String, dynamic> data, String key) {
    final value = data[key];
    if (value is! String || value.trim().isEmpty) {
      throw FormatException('Catalog response is missing $key.');
    }
    return value;
  }
}

class CatalogRepository {
  CatalogRepository(this._api);

  final BezzoApiClient _api;
  Map<String, String> _categoryNames = const {};

  Future<List<CatalogCategory>> categories() async {
    final data = await _api.getPublic('catalog/categories');
    final rows = data['items'];
    if (rows is! List) return const [];
    final result = rows
        .whereType<Map<String, dynamic>>()
        .map(CatalogCategory.fromApi)
        .toList(growable: false);
    _categoryNames = {
      for (final category in result) category.id: category.name,
    };
    return result;
  }

  Future<List<Medicine>> search({
    String query = '',
    String? categoryId,
    bool inStockOnly = true,
  }) async {
    final parameters = <String, String>{
      'page': '1',
      'pageSize': '100',
      'sort': query.trim().length >= 2 ? 'relevance' : 'name_asc',
      if (inStockOnly) 'inStockOnly': 'true',
      if (query.trim().length >= 2) 'q': query.trim(),
    };
    if (categoryId case final selectedCategoryId?) {
      parameters['categoryId'] = selectedCategoryId;
    }
    final data = await _api.getPublic('catalog/products', query: parameters);
    final rows = data['items'];
    if (rows is! List) return const [];
    return rows
        .whereType<Map<String, dynamic>>()
        .map(
          (row) => Medicine.fromCatalogApi(
            row,
            categoryName: _categoryNames[row['categoryId']] ?? 'Medicine',
          ),
        )
        .toList(growable: false);
  }

  Future<Map<String, dynamic>> productDetails(String productId) =>
      _api.get('catalog/products/$productId');
}
