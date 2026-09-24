import 'package:flutter/foundation.dart';

class ApiConfig {
  ApiConfig._(this.baseUri);

  static const _configuredBaseUrl = String.fromEnvironment(
    'BEZZO_API_BASE_URL',
  );

  static const _debugDefaultBaseUrl = 'http://10.0.2.2:4000/api/v1';

  static ApiConfig fromEnvironment() {
    final configuredUrl = _configuredBaseUrl.trim();
    if (configuredUrl.isEmpty && kReleaseMode) {
      throw StateError(
        'Set BEZZO_API_BASE_URL to the production HTTPS API URL at build time.',
      );
    }

    final baseUri = Uri.parse(
      configuredUrl.isEmpty ? _debugDefaultBaseUrl : configuredUrl,
    );
    if (!baseUri.hasAuthority || baseUri.host.isEmpty) {
      throw StateError('BEZZO_API_BASE_URL must be an absolute URL.');
    }
    if (baseUri.scheme != 'https' &&
        !(kDebugMode && baseUri.scheme == 'http')) {
      throw StateError(
        'BEZZO_API_BASE_URL must use HTTPS outside debug builds.',
      );
    }
    if (baseUri.query.isNotEmpty || baseUri.fragment.isNotEmpty) {
      throw StateError(
        'BEZZO_API_BASE_URL cannot contain a query string or fragment.',
      );
    }

    final normalizedPath = baseUri.path.replaceFirst(RegExp(r'/+$'), '');
    return ApiConfig._(baseUri.replace(path: '$normalizedPath/'));
  }

  final Uri baseUri;

  Uri endpoint(String path) {
    final normalizedPath = path.replaceFirst(RegExp(r'^/+'), '');
    return baseUri.resolve(normalizedPath);
  }
}
