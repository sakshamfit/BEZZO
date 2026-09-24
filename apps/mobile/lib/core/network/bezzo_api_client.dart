import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../../features/auth/domain/auth_session.dart';
import '../config/api_config.dart';
import '../errors/api_exception.dart';
import '../storage/secure_session_store.dart';

class BezzoApiClient {
  BezzoApiClient({
    required this.config,
    required this.sessionStore,
    http.Client? httpClient,
  }) : _httpClient = httpClient ?? http.Client();

  static const _timeout = Duration(seconds: 20);

  final ApiConfig config;
  final SecureSessionStore sessionStore;
  final http.Client _httpClient;
  Future<AuthSession?>? _refreshInFlight;

  String get _clientPlatform {
    if (kIsWeb) return 'web';
    return switch (defaultTargetPlatform) {
      TargetPlatform.iOS => 'ios',
      _ => 'android',
    };
  }

  String get clientPlatform => _clientPlatform;

  Future<Map<String, dynamic>> get(String path) =>
      _request('GET', path, authenticated: true);

  Future<Map<String, dynamic>> getPublic(
    String path, {
    Map<String, String> query = const {},
  }) => _request('GET', path, authenticated: false, query: query);

  Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? body,
    bool authenticated = true,
    String? idempotencyKey,
  }) => _request(
    'POST',
    path,
    body: body,
    authenticated: authenticated,
    idempotencyKey: idempotencyKey,
  );

  Future<Map<String, dynamic>> patch(
    String path, {
    required Map<String, dynamic> body,
  }) => _request('PATCH', path, body: body, authenticated: true);

  Future<Map<String, dynamic>> postWithSession(
    String path, {
    required AuthSession session,
    Map<String, dynamic>? body,
  }) async {
    final response = await _send('POST', path, body: body, session: session);
    return _decodeResponse(response);
  }

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    required bool authenticated,
    String? idempotencyKey,
    Map<String, String> query = const {},
  }) async {
    final initialSession = authenticated ? await sessionStore.read() : null;
    if (authenticated && initialSession == null) {
      throw const ApiException(
        statusCode: 401,
        code: 'SESSION_REQUIRED',
        message: 'Please sign in to continue.',
      );
    }

    var response = await _send(
      method,
      path,
      query: query,
      body: body,
      session: initialSession,
      idempotencyKey: idempotencyKey,
    );
    if (response.statusCode == 401 && initialSession != null) {
      final refreshed = await _refreshAfterUnauthorized(initialSession);
      if (refreshed != null) {
        response = await _send(
          method,
          path,
          body: body,
          session: refreshed,
          idempotencyKey: idempotencyKey,
        );
        if (response.statusCode == 401) await sessionStore.clear();
      }
    }
    return _decodeResponse(response);
  }

  Future<http.Response> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
    AuthSession? session,
    String? idempotencyKey,
    Map<String, String> query = const {},
  }) async {
    final uri = config
        .endpoint(path)
        .replace(queryParameters: query.isEmpty ? null : query);
    final request = http.Request(method, uri)
      ..headers.addAll({
        'Accept': 'application/json',
        'X-Client-Platform': _clientPlatform,
        'X-Request-ID': _requestId(),
      });
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    if (session != null) {
      request.headers['Authorization'] = 'Bearer ${session.accessToken}';
    }
    if (idempotencyKey != null) {
      request.headers['Idempotency-Key'] = idempotencyKey;
    }

    try {
      final streamed = await _httpClient.send(request).timeout(_timeout);
      return await http.Response.fromStream(streamed).timeout(_timeout);
    } on TimeoutException {
      throw const ApiException(
        statusCode: 0,
        code: 'NETWORK_TIMEOUT',
        message: 'The request timed out. Check your connection and try again.',
      );
    } on http.ClientException {
      throw const ApiException(
        statusCode: 0,
        code: 'NETWORK_UNAVAILABLE',
        message: 'Bezzo could not reach the server. Check your connection.',
      );
    }
  }

  Future<AuthSession?> _refreshAfterUnauthorized(
    AuthSession rejectedSession,
  ) async {
    final storedSession = await sessionStore.read();
    if (storedSession == null) return null;
    if (storedSession.refreshToken != rejectedSession.refreshToken) {
      return storedSession;
    }

    final ongoingRefresh = _refreshInFlight;
    if (ongoingRefresh != null) return ongoingRefresh;

    final refresh = _refresh(storedSession);
    _refreshInFlight = refresh;
    try {
      return await refresh;
    } finally {
      if (identical(_refreshInFlight, refresh)) _refreshInFlight = null;
    }
  }

  Future<AuthSession?> _refresh(AuthSession session) async {
    try {
      final response = await _send(
        'POST',
        'auth/refresh',
        body: {
          'refreshToken': session.refreshToken,
          'deviceType': _clientPlatform,
        },
      );
      final refreshed = AuthSession.fromApi(_decodeResponse(response));
      await sessionStore.write(refreshed);
      return refreshed;
    } on ApiException catch (error) {
      if (error.isUnauthorized) await sessionStore.clear();
      rethrow;
    }
  }

  Map<String, dynamic> _decodeResponse(http.Response response) {
    if (response.statusCode == 204 || response.bodyBytes.isEmpty) return {};

    dynamic decoded;
    try {
      decoded = jsonDecode(utf8.decode(response.bodyBytes));
    } on FormatException {
      throw ApiException(
        statusCode: response.statusCode,
        code: 'INVALID_SERVER_RESPONSE',
        message: 'Bezzo returned a response the app could not read.',
      );
    }

    if (decoded is! Map<String, dynamic>) {
      throw ApiException(
        statusCode: response.statusCode,
        code: 'INVALID_SERVER_RESPONSE',
        message: 'Bezzo returned a response the app could not read.',
      );
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = decoded['error'];
      final details = error is Map<String, dynamic>
          ? error
          : <String, dynamic>{};
      final fieldErrors = <String, String>{};
      final rawFieldErrors = details['fieldErrors'];
      if (rawFieldErrors is Map) {
        for (final entry in rawFieldErrors.entries) {
          if (entry.value is String) {
            fieldErrors[entry.key.toString()] = entry.value as String;
          }
        }
      }
      throw ApiException(
        statusCode: response.statusCode,
        code: details['code'] is String
            ? details['code'] as String
            : 'REQUEST_FAILED',
        message: details['message'] is String
            ? details['message'] as String
            : 'The request failed. Please try again.',
        fieldErrors: fieldErrors,
      );
    }

    final data = decoded['data'];
    if (data == null) return {};
    if (data is Map<String, dynamic>) return data;
    if (data is List) return {'items': data};
    throw const ApiException(
      statusCode: 502,
      code: 'INVALID_SERVER_RESPONSE',
      message: 'Bezzo returned an unexpected response.',
    );
  }

  String _requestId() {
    final random = Random.secure();
    final suffix = List.generate(
      16,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
    return '${DateTime.now().toUtc().microsecondsSinceEpoch}-$suffix';
  }

  void close() => _httpClient.close();
}
