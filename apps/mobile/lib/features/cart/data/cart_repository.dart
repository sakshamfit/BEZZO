import '../../../core/network/bezzo_api_client.dart';
import '../domain/cart_snapshot.dart';

class CartRepository {
  CartRepository(this._api);

  final BezzoApiClient _api;

  String newIdempotencyKey() => _api.newIdempotencyKey();

  Future<CartSnapshot> load() async =>
      CartSnapshot.fromApi(await _api.get('cart'));

  Future<CartSnapshot> addOffer({
    required String supplierProductId,
    required int quantity,
    required String idempotencyKey,
  }) async => CartSnapshot.fromApi(
    await _api.post(
      'cart/items',
      body: {'supplierProductId': supplierProductId, 'quantity': quantity},
      idempotencyKey: idempotencyKey,
    ),
  );

  Future<CartSnapshot> setQuantity({
    required String itemId,
    required int quantity,
  }) async => CartSnapshot.fromApi(
    await _api.patch('cart/items/$itemId', body: {'quantity': quantity}),
  );

  Future<CartSnapshot> remove(String itemId) async =>
      CartSnapshot.fromApi(await _api.delete('cart/items/$itemId'));

  Future<CartSnapshot> clear() async =>
      CartSnapshot.fromApi(await _api.delete('cart'));
}
