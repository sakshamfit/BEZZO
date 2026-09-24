import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../features/auth/domain/auth_session.dart';

abstract interface class SecureSessionStore {
  Future<AuthSession?> read();
  Future<void> write(AuthSession session);
  Future<void> clear();
}

class PlatformSecureSessionStore implements SecureSessionStore {
  PlatformSecureSessionStore(this._storage);

  static const _sessionKey = 'bezzo.auth.session.v1';

  final FlutterSecureStorage _storage;

  @override
  Future<AuthSession?> read() async {
    final encoded = await _storage.read(key: _sessionKey);
    if (encoded == null || encoded.isEmpty) return null;
    try {
      final decoded = jsonDecode(encoded);
      if (decoded is! Map<String, dynamic>) return null;
      return AuthSession.fromJson(decoded);
    } on FormatException {
      await clear();
      return null;
    }
  }

  @override
  Future<void> write(AuthSession session) =>
      _storage.write(key: _sessionKey, value: jsonEncode(session.toJson()));

  @override
  Future<void> clear() => _storage.delete(key: _sessionKey);
}
