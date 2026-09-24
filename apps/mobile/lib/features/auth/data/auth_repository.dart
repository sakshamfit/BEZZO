import 'package:flutter/foundation.dart';

import '../../../core/network/bezzo_api_client.dart';
import '../../../core/storage/secure_session_store.dart';
import '../domain/auth_session.dart';

class OtpChallenge {
  const OtpChallenge({
    required this.id,
    required this.expiresInSeconds,
    required this.destinationMasked,
    this.developmentCode,
  });

  factory OtpChallenge.fromApi(Map<String, dynamic> data) => OtpChallenge(
    id: data['challengeId'] as String,
    expiresInSeconds: data['expiresInSeconds'] as int,
    destinationMasked: data['destinationMasked'] as String,
    developmentCode: kDebugMode ? data['devOtp'] as String? : null,
  );

  final String id;
  final int expiresInSeconds;
  final String destinationMasked;
  final String? developmentCode;
}

class AuthRepository {
  AuthRepository({
    required this.api,
    required this.store,
  });

  final BezzoApiClient api;
  final SecureSessionStore store;

  Future<AuthSession> signInWithPassword({
    required String identifier,
    required String password,
  }) async {
    final data = await api.post(
      'auth/login',
      authenticated: false,
      body: {
        'identifier': identifier.trim(),
        'password': password,
        'deviceName': 'BEZZO Mobile',
        'deviceType': api.clientPlatform,
      },
    );
    final session = AuthSession.fromApi(data);
    await store.write(session);
    return session;
  }

  Future<OtpChallenge> requestLoginCode(String identifier) async {
    final data = await api.post(
      'auth/otp/request',
      authenticated: false,
      body: {
        'identifier': identifier.trim(),
        'purpose': 'LOGIN',
        'deviceType': api.clientPlatform,
      },
    );
    return OtpChallenge.fromApi(data);
  }

  Future<AuthSession> verifyLoginCode({
    required OtpChallenge challenge,
    required String code,
  }) async {
    final data = await api.post(
      'auth/otp/verify',
      authenticated: false,
      body: {
        'challengeId': challenge.id,
        'code': code.trim(),
        'deviceName': 'BEZZO Mobile',
        'deviceType': api.clientPlatform,
      },
    );
    if (data['verified'] != true || data['accessToken'] is! String) {
      throw const FormatException('The sign-in code could not be verified.');
    }
    final session = AuthSession.fromApi(data);
    await store.write(session);
    return session;
  }

  Future<AuthSession?> currentSession() => store.read();

  Future<Map<String, dynamic>> currentPrincipal() => api.get('me');

  Future<void> updateStoredPrincipal(Map<String, dynamic> principal) async {
    final session = await store.read();
    if (session != null) {
      await store.write(session.copyWith(principal: principal));
    }
  }

  Future<void> signOut() async {
    final session = await store.read();
    await store.clear();
    if (session == null) return;

    try {
      await api
          .postWithSession(
            'auth/logout',
            session: session,
            body: const {},
          )
          .timeout(const Duration(seconds: 4));
    } catch (_) {
      // Local sign-out must complete even when the API cannot be reached.
    }
  }

  Future<void> clearSession() => store.clear();
}
