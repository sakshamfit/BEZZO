import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../data/buyer_account_repository.dart';

class BuyerAccountPage extends StatefulWidget {
  const BuyerAccountPage({
    super.key,
    required this.repository,
    required this.onSignOut,
    required this.onManageAddresses,
  });

  final BuyerAccountRepository repository;
  final Future<void> Function() onSignOut;
  final VoidCallback onManageAddresses;

  @override
  State<BuyerAccountPage> createState() => _BuyerAccountPageState();
}

class _BuyerAccountPageState extends State<BuyerAccountPage> {
  static const _documentTypes = <(String, String)>[
    ('RETAIL_DRUG_LICENSE', 'Retail drug licence'),
    ('GST_CERTIFICATE', 'GST certificate'),
    ('PAN', 'PAN'),
    ('BUSINESS_REGISTRATION', 'Business registration'),
    ('PREMISES_PROOF', 'Premises proof'),
    ('AUTHORIZED_PERSON_PROOF', 'Authorised person proof'),
    ('QUALIFIED_PERSON_DOCUMENT', 'Qualified person document'),
    ('BANK_DOCUMENT', 'Bank document'),
    ('OTHER', 'Other'),
  ];

  final _businessName = TextEditingController();
  final _storeName = TextEditingController();
  final _gstin = TextEditingController();
  final _licenseReference = TextEditingController();
  final _documentNumber = TextEditingController();
  Map<String, dynamic>? _profile;
  List<BuyerDocument> _documents = const [];
  PlatformFile? _selectedFile;
  String _documentType = _documentTypes.first.$1;
  String? _error;
  String? _notice;
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _businessName.dispose();
    _storeName.dispose();
    _gstin.dispose();
    _licenseReference.dispose();
    _documentNumber.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        widget.repository.profile(),
        widget.repository.documents(),
      ]);
      if (!mounted) return;
      final profile = results[0] as Map<String, dynamic>;
      setState(() {
        _profile = profile;
        _documents = results[1] as List<BuyerDocument>;
        _businessName.text = profile['businessName'] as String? ?? '';
        _storeName.text = profile['storeName'] as String? ?? '';
        _gstin.text = profile['gstin'] as String? ?? '';
        _licenseReference.text = profile['licenseReference'] as String? ?? '';
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    } on FormatException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  Future<void> _saveProfile() async {
    final profile = _profile;
    if (profile == null || _saving) return;
    setState(() {
      _saving = true;
      _error = null;
      _notice = null;
    });
    try {
      final updated = await widget.repository.updateProfile({
        'businessName': _businessName.text.trim(),
        'storeName': _storeName.text.trim(),
        if (profile['businessType'] is String)
          'businessType': profile['businessType'],
        if (_gstin.text.trim().isNotEmpty) 'gstin': _gstin.text.trim(),
        if (_licenseReference.text.trim().isNotEmpty)
          'licenseReference': _licenseReference.text.trim(),
      });
      if (!mounted) return;
      setState(() {
        _profile = updated;
        _notice = 'Business profile saved.';
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickFile() async {
    try {
      final file = await FilePicker.pickFile(
        dialogTitle: 'Choose a compliance document',
        type: FileType.custom,
        allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
      );
      if (!mounted || file == null) return;
      final length = file.lengthSync() ?? await file.length();
      if (length == null || length == 0) {
        setState(
          () => _error = 'The selected document is empty or unreadable.',
        );
        return;
      }
      if (length > 1 * 1024 * 1024) {
        setState(() => _error = 'Choose a document no larger than 1 MB.');
        return;
      }
      setState(() {
        _selectedFile = file;
        _error = null;
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not open the file picker.');
    }
  }

  Future<void> _uploadDocument() async {
    final file = _selectedFile;
    if (file == null || _saving) return;
    setState(() {
      _saving = true;
      _error = null;
      _notice = null;
    });
    try {
      final extension = file.extension?.toLowerCase();
      final contentType = switch (extension) {
        'pdf' => 'application/pdf',
        'jpg' || 'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        _ => null,
      };
      if (contentType == null) {
        throw const FormatException(
          'Choose a PDF, JPG, PNG, or WEBP document.',
        );
      }
      await widget.repository.uploadDocument(
        documentType: _documentType,
        fileName: file.name,
        contentType: contentType,
        bytes: await file.readAsBytes(),
        documentNumber: _documentNumber.text,
      );
      _documentNumber.clear();
      if (!mounted) return;
      setState(() {
        _selectedFile = null;
        _notice = 'Document uploaded for BEZZO review.';
      });
      await _load();
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on FormatException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _removeDocument(BuyerDocument document) async {
    setState(() {
      _saving = true;
      _error = null;
      _notice = null;
    });
    try {
      await widget.repository.removeDocument(document.id);
      if (!mounted) return;
      setState(() {
        _documents = _documents
            .where((item) => item.id != document.id)
            .toList();
        _notice = 'Document removed.';
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _openDocument(BuyerDocument document) async {
    final rawUrl = document.downloadUrl;
    final uri = rawUrl == null ? null : Uri.tryParse(rawUrl);
    if (uri == null ||
        (uri.scheme != 'https' && !(kDebugMode && uri.scheme == 'http'))) {
      setState(
        () => _error =
            'A secure document link is not available. Refresh and try again.',
      );
      return;
    }
    try {
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication) &&
          mounted) {
        setState(() => _error = 'Could not open the document on this device.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not open the document on this device.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = _profile;
    return Scaffold(
      backgroundColor: canvas,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(18, 20, 18, 28),
                children: [
                  const Text(
                    'Business account',
                    style: TextStyle(
                      fontSize: 23,
                      fontWeight: FontWeight.w800,
                      color: ink,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Your retailer profile and compliance documents',
                    style: TextStyle(color: muted),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    _message(_error!, error: true),
                  ],
                  if (_notice != null) ...[
                    const SizedBox(height: 14),
                    _message(_notice!),
                  ],
                  if (profile != null) ...[
                    const SizedBox(height: 18),
                    Card(
                      color: Colors.white,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Icon(
                                  Icons.store_mall_directory_outlined,
                                  color: teal,
                                ),
                                const SizedBox(width: 8),
                                const Expanded(
                                  child: Text(
                                    'Store profile',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 16,
                                    ),
                                  ),
                                ),
                                _status(
                                  profile['verificationStatus'] as String? ??
                                      'REGISTERED',
                                ),
                              ],
                            ),
                            const SizedBox(height: 14),
                            _field(_businessName, 'Business name'),
                            const SizedBox(height: 10),
                            _field(_storeName, 'Store name'),
                            const SizedBox(height: 10),
                            _field(
                              _gstin,
                              'GSTIN',
                              textCapitalization: TextCapitalization.characters,
                            ),
                            const SizedBox(height: 10),
                            _field(_licenseReference, 'Drug licence reference'),
                            const SizedBox(height: 14),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton.icon(
                                onPressed: _saving ? null : _saveProfile,
                                icon: const Icon(Icons.save_outlined),
                                label: Text(
                                  _saving ? 'Saving…' : 'Save business profile',
                                ),
                              ),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Changes are sent to BEZZO operations for verification when required.',
                              style: TextStyle(color: muted, fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 10),
                  Card(
                    color: Colors.white,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Compliance documents',
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Upload a private PDF or image up to 1 MB for operations review.',
                            style: TextStyle(color: muted, fontSize: 12),
                          ),
                          const SizedBox(height: 14),
                          DropdownButtonFormField<String>(
                            initialValue: _documentType,
                            decoration: const InputDecoration(
                              labelText: 'Document type',
                              border: OutlineInputBorder(),
                            ),
                            items: _documentTypes
                                .map(
                                  (item) => DropdownMenuItem(
                                    value: item.$1,
                                    child: Text(item.$2),
                                  ),
                                )
                                .toList(),
                            onChanged: _saving
                                ? null
                                : (value) => setState(
                                    () => _documentType =
                                        value ?? _documentTypes.first.$1,
                                  ),
                          ),
                          const SizedBox(height: 10),
                          _field(_documentNumber, 'Document number (optional)'),
                          const SizedBox(height: 10),
                          OutlinedButton.icon(
                            onPressed: _saving ? null : _pickFile,
                            icon: const Icon(Icons.attach_file_rounded),
                            label: Text(
                              _selectedFile?.name ?? 'Choose PDF or image',
                            ),
                          ),
                          const SizedBox(height: 8),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton.icon(
                              onPressed: _saving || _selectedFile == null
                                  ? null
                                  : _uploadDocument,
                              icon: const Icon(Icons.cloud_upload_outlined),
                              label: Text(
                                _saving ? 'Working…' : 'Upload for review',
                              ),
                            ),
                          ),
                          const Divider(height: 28),
                          if (_documents.isEmpty)
                            const Text(
                              'No compliance documents uploaded.',
                              style: TextStyle(color: muted),
                            )
                          else
                            ..._documents.map(_documentTile),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Card(
                    color: Colors.white,
                    child: Column(
                      children: [
                        ListTile(
                          leading: const Icon(
                            Icons.location_on_outlined,
                            color: navy,
                          ),
                          title: const Text('Delivery addresses'),
                          subtitle: const Text(
                            'Manage addresses during checkout',
                          ),
                          trailing: const Icon(Icons.chevron_right_rounded),
                          onTap: widget.onManageAddresses,
                        ),
                        const Divider(height: 1),
                        ListTile(
                          leading: const Icon(
                            Icons.logout_rounded,
                            color: navy,
                          ),
                          title: const Text('Sign out'),
                          onTap: widget.onSignOut,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _documentTile(BuyerDocument document) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: const Icon(Icons.description_outlined, color: teal),
    title: Text(
      _label(document.documentType),
      style: const TextStyle(fontWeight: FontWeight.w700),
    ),
    subtitle: Text(
      [
        document.fileName,
        if (document.documentNumber?.isNotEmpty == true)
          document.documentNumber!,
        if (document.rejectionReason?.isNotEmpty == true)
          document.rejectionReason!,
      ].join(' · '),
    ),
    trailing: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (document.downloadUrl != null)
          IconButton(
            tooltip: 'View document',
            onPressed: () => _openDocument(document),
            icon: const Icon(Icons.open_in_new_rounded, color: navy),
          ),
        _status(document.status),
        if (document.status == 'PENDING' || document.status == 'REJECTED')
          IconButton(
            tooltip: 'Remove document',
            onPressed: _saving ? null : () => _removeDocument(document),
            icon: const Icon(
              Icons.delete_outline_rounded,
              color: Color(0xFF9C2F1C),
            ),
          ),
      ],
    ),
  );

  Widget _field(
    TextEditingController controller,
    String label, {
    TextCapitalization textCapitalization = TextCapitalization.words,
  }) => TextField(
    controller: controller,
    textCapitalization: textCapitalization,
    decoration: InputDecoration(
      labelText: label,
      border: const OutlineInputBorder(),
      isDense: true,
    ),
  );

  Widget _status(String value) {
    final color = switch (value) {
      'APPROVED' || 'VERIFIED' => const Color(0xFF287044),
      'REJECTED' => const Color(0xFF9C2F1C),
      _ => const Color(0xFF6C5B17),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .10),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        value.replaceAll('_', ' '),
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }

  Widget _message(String text, {bool error = false}) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: error ? const Color(0xFFFFECE8) : const Color(0xFFE8F5F1),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Text(
      text,
      style: TextStyle(
        color: error ? const Color(0xFF9C2F1C) : const Color(0xFF287044),
      ),
    ),
  );

  String _label(String value) => value
      .split('_')
      .map(
        (word) => word.isEmpty
            ? word
            : '${word[0]}${word.substring(1).toLowerCase()}',
      )
      .join(' ');
}
