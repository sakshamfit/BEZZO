class ApiException implements Exception {
  const ApiException({
    required this.statusCode,
    required this.code,
    required this.message,
    this.fieldErrors = const {},
  });

  final int statusCode;
  final String code;
  final String message;
  final Map<String, String> fieldErrors;

  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => 'ApiException($statusCode, $code): $message';
}
