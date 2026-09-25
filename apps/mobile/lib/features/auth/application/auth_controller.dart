import 'package:flutter/foundation.dart';

import '../../../core/errors/api_exception.dart';
import '../data/auth_repository.dart';
import '../domain/auth_session.dart';

enum AuthStatus { restoring, signedOut, signedIn, unavailable }

class AuthController extends ChangeNotifier {
  AuthController(this._repository);

  final AuthRepository _repository;
  AuthStatus status = AuthStatus.restoring;
  AuthSession? session;
  String? startupError;

  Future<void> registerBuyer({
    required String displayName,
    required String businessName,
    required String identifier,
    required String password,
  }) => _repository.registerBuyer(
    displayName: displayName,
    businessName: businessName,
    identifier: identifier,
    password: password,
  );

  Future<OtpChallenge> requestVerificationCode(String identifier) =>
      _repository.requestVerificationCode(identifier);

  Future<void> verifyAccountCode({
    required OtpChallenge challenge,
    required String code,
  }) => _repository.verifyAccountCode(challenge: challenge, code: code);

  Future<void> restore() async {
    status = AuthStatus.restoring;
    startupError = null;
    notifyListeners();

    try {
      final existing = await _repository.currentSession();
      if (existing == null) {
        session = null;
        status = AuthStatus.signedOut;
        notifyListeners();
        return;
      }
      final principal = await _repository.currentPrincipal();
      await _repository.updateStoredPrincipal(principal);
      session = existing.copyWith(principal: principal);
      status = AuthStatus.signedIn;
    } on ApiException catch (error) {
      if (error.isUnauthorized) {
        await _repository.clearSession();
        session = null;
        status = AuthStatus.signedOut;
      } else {
        startupError = error.message;
        status = AuthStatus.unavailable;
      }
    } catch (_) {
      startupError =
          'Bezzo could not restore your session. Check your connection.';
      status = AuthStatus.unavailable;
    }
    notifyListeners();
  }

  Future<void> signInWithPassword({
    required String identifier,
    required String password,
  }) async {
    final authenticated = await _repository.signInWithPassword(
      identifier: identifier,
      password: password,
    );
    session = authenticated;
    status = AuthStatus.signedIn;
    notifyListeners();
  }

  Future<OtpChallenge> requestLoginCode(String identifier) =>
      _repository.requestLoginCode(identifier);

  Future<void> verifyLoginCode({
    required OtpChallenge challenge,
    required String code,
  }) async {
    session = await _repository.verifyLoginCode(
      challenge: challenge,
      code: code,
    );
    status = AuthStatus.signedIn;
    notifyListeners();
  }

  Future<void> signOut() async {
    try {
      await _repository.signOut();
    } catch (_) {
      // The repository still clears local credentials if the device is offline.
    } finally {
      session = null;
      status = AuthStatus.signedOut;
      notifyListeners();
    }
  }

  bool get isBuyer {
    final roles = session?.principal['roles'];
    if (roles is! List) return false;
    return roles.any(
      (role) => role == 'BUYER' || role.toString().startsWith('BUYER_'),
    );
  }
}
