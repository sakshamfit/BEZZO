import 'dart:convert';

import '../../../core/network/bezzo_api_client.dart';

class BuyerDocument {
  const BuyerDocument({
    required this.id,
    required this.documentType,
    required this.fileName,
    required this.status,
    this.documentNumber,
    this.expiresAt,
    this.rejectionReason,
    this.downloadUrl,
  });

  factory BuyerDocument.fromApi(Map<String, dynamic> data, Uri apiBaseUri) {
    final rawUrl = data['downloadUrl'] as String?;
    final parsedUrl = rawUrl == null ? null : Uri.tryParse(rawUrl);
    return BuyerDocument(
      id: _requiredString(data, 'id'),
      documentType: _requiredString(data, 'documentType'),
      fileName: data['fileName'] as String? ?? 'Compliance document',
      status: _requiredString(data, 'status'),
      documentNumber: data['documentNumber'] as String?,
      expiresAt: data['expiresAt'] as String?,
      rejectionReason: data['rejectionReason'] as String?,
      downloadUrl: parsedUrl == null
          ? null
          : parsedUrl.hasAuthority
          ? parsedUrl.toString()
          : apiBaseUri.resolve(rawUrl!).toString(),
    );
  }

  final String id;
  final String documentType;
  final String fileName;
  final String status;
  final String? documentNumber;
  final String? expiresAt;
  final String? rejectionReason;
  final String? downloadUrl;
}

class BuyerAccountRepository {
  BuyerAccountRepository(this._api);

  final BezzoApiClient _api;

  Future<Map<String, dynamic>> profile() => _api.get('buyer/profile');

  Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> body) =>
      _api.patch('buyer/profile', body: body);

  Future<List<BuyerDocument>> documents() async {
    final result = await _api.get('buyer/documents');
    final rows = result['items'];
    if (rows is! List) return const [];
    return rows
        .whereType<Map<String, dynamic>>()
        .map((row) => BuyerDocument.fromApi(row, _api.config.baseUri))
        .toList(growable: false);
  }

  Future<BuyerDocument> uploadDocument({
    required String documentType,
    required String fileName,
    required String contentType,
    required List<int> bytes,
    String? documentNumber,
  }) async {
    final result = await _api.post(
      'buyer/documents',
      idempotencyKey: _api.newIdempotencyKey(),
      body: {
        'documentType': documentType,
        'fileName': fileName,
        'contentType': contentType,
        'contentBase64': base64Encode(bytes),
        if (documentNumber != null && documentNumber.trim().isNotEmpty)
          'documentNumber': documentNumber.trim(),
      },
    );
    return BuyerDocument.fromApi(result, _api.config.baseUri);
  }

  Future<void> removeDocument(String id) async {
    await _api.delete('buyer/documents/$id');
  }
}

String _requiredString(Map<String, dynamic> data, String key) {
  final value = data[key];
  if (value is! String || value.trim().isEmpty) {
    throw FormatException('Buyer document response is missing $key.');
  }
  return value;
}
