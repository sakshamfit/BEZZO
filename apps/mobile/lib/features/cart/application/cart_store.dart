import 'package:flutter/foundation.dart';

import '../../../core/errors/api_exception.dart';
import '../data/cart_repository.dart';
import '../domain/cart_snapshot.dart';

class CartStore extends ChangeNotifier {
  CartStore(this._repository);

  final CartRepository _repository;
  CartSnapshot? snapshot;
  bool loading = true;
  bool mutating = false;
  String? error;
  int _generation = 0;
  final Map<String, String> _pendingAddKeys = {};

  List<CartLine> get products => snapshot?.items ?? const [];
  int get totalBoxes => snapshot?.unitCount ?? 0;
  num get total => snapshot?.estimatedTotal ?? 0;

  Future<void> load() async {
    final generation = ++_generation;
    loading = true;
    error = null;
    notifyListeners();
    try {
      final result = await _repository.load();
      if (generation == _generation) snapshot = result;
    } on ApiException catch (exception) {
      if (generation == _generation) error = exception.message;
    } on FormatException catch (exception) {
      if (generation == _generation) error = exception.message;
    } finally {
      if (generation == _generation) {
        loading = false;
        notifyListeners();
      }
    }
  }

  Future<void> addOffer({
    required String supplierProductId,
    required int quantity,
  }) async {
    final key = _pendingAddKeys.putIfAbsent(
      supplierProductId,
      _repository.newIdempotencyKey,
    );
    await _mutate(
      () => _repository.addOffer(
        supplierProductId: supplierProductId,
        quantity: quantity,
        idempotencyKey: key,
      ),
    );
    if (error == null) _pendingAddKeys.remove(supplierProductId);
  }

  Future<void> setQuantity(CartLine line, int quantity) => _mutate(
    () => _repository.setQuantity(itemId: line.id, quantity: quantity),
  );

  Future<void> remove(CartLine line) =>
      _mutate(() => _repository.remove(line.id));

  Future<void> _mutate(Future<CartSnapshot> Function() action) async {
    if (mutating) return;
    final generation = _generation;
    mutating = true;
    error = null;
    notifyListeners();
    try {
      final result = await action();
      if (generation == _generation) snapshot = result;
    } on ApiException catch (exception) {
      if (generation == _generation) error = exception.message;
    } on FormatException catch (exception) {
      if (generation == _generation) error = exception.message;
    } finally {
      if (generation == _generation) {
        mutating = false;
        notifyListeners();
      }
    }
  }

  void clear() {
    _generation++;
    _pendingAddKeys.clear();
    snapshot = null;
    error = null;
    loading = false;
    mutating = false;
    notifyListeners();
  }
}
