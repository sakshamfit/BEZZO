class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.accessTokenExpiresAt,
    required this.refreshTokenExpiresAt,
    required this.principal,
  });

  factory AuthSession.fromApi(Map<String, dynamic> data) {
    final now = DateTime.now().toUtc();
    return AuthSession(
      accessToken: _requiredString(data, 'accessToken'),
      refreshToken: _requiredString(data, 'refreshToken'),
      accessTokenExpiresAt: now.add(
        Duration(seconds: _requiredInt(data, 'accessTokenExpiresIn')),
      ),
      refreshTokenExpiresAt: now.add(
        Duration(seconds: _requiredInt(data, 'refreshTokenExpiresIn')),
      ),
      principal: _requiredMap(data, 'principal'),
    );
  }

  factory AuthSession.fromJson(Map<String, dynamic> json) => AuthSession(
    accessToken: _requiredString(json, 'accessToken'),
    refreshToken: _requiredString(json, 'refreshToken'),
    accessTokenExpiresAt: DateTime.parse(
      _requiredString(json, 'accessTokenExpiresAt'),
    ),
    refreshTokenExpiresAt: DateTime.parse(
      _requiredString(json, 'refreshTokenExpiresAt'),
    ),
    principal: _requiredMap(json, 'principal'),
  );

  final String accessToken;
  final String refreshToken;
  final DateTime accessTokenExpiresAt;
  final DateTime refreshTokenExpiresAt;
  final Map<String, dynamic> principal;

  Map<String, dynamic> toJson() => {
    'accessToken': accessToken,
    'refreshToken': refreshToken,
    'accessTokenExpiresAt': accessTokenExpiresAt.toIso8601String(),
    'refreshTokenExpiresAt': refreshTokenExpiresAt.toIso8601String(),
    'principal': principal,
  };

  AuthSession copyWith({Map<String, dynamic>? principal}) => AuthSession(
    accessToken: accessToken,
    refreshToken: refreshToken,
    accessTokenExpiresAt: accessTokenExpiresAt,
    refreshTokenExpiresAt: refreshTokenExpiresAt,
    principal: principal ?? this.principal,
  );

  static String _requiredString(Map<String, dynamic> data, String key) {
    final value = data[key];
    if (value is! String || value.isEmpty) {
      throw FormatException('Authentication response is missing $key.');
    }
    return value;
  }

  static int _requiredInt(Map<String, dynamic> data, String key) {
    final value = data[key];
    if (value is! int || value <= 0) {
      throw FormatException('Authentication response has an invalid $key.');
    }
    return value;
  }

  static Map<String, dynamic> _requiredMap(
    Map<String, dynamic> data,
    String key,
  ) {
    final value = data[key];
    if (value is! Map<String, dynamic>) {
      throw FormatException('Authentication response is missing $key.');
    }
    return value;
  }
}
