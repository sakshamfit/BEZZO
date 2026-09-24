import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../application/auth_controller.dart';
import '../data/auth_repository.dart';

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.auth});

  final AuthController auth;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _formKey = GlobalKey<FormState>();
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  OtpChallenge? _challenge;
  bool _passwordMode = true;
  bool _obscurePassword = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _signInWithPassword() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.auth.signInWithPassword(
        identifier: _identifier.text,
        password: _password.text,
      );
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on FormatException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _requestCode() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final challenge = await widget.auth.requestLoginCode(_identifier.text);
      if (!mounted) return;
      setState(() => _challenge = challenge);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verifyCode() async {
    final challenge = _challenge;
    if (challenge == null || _code.text.trim().length < 4) {
      setState(() => _error = 'Enter the verification code.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.auth.verifyLoginCode(challenge: challenge, code: _code.text);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on FormatException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String? _validateIdentifier(String? value) {
    final identifier = value?.trim() ?? '';
    if (identifier.length < 3) {
      return 'Enter your email address or phone number.';
    }
    if (identifier.contains('@') && !identifier.contains('.')) {
      return 'Enter a valid email address.';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final challenge = _challenge;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 28, 24, 36),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Center(child: _BrandMark()),
                    const SizedBox(height: 22),
                    const Text(
                      'Wholesale, made simple.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: navy,
                        fontSize: 25,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -.5,
                      ),
                    ),
                    const SizedBox(height: 7),
                    const Text(
                      'Sign in to order sealed medicine boxes for your pharmacy.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: muted, height: 1.4),
                    ),
                    const SizedBox(height: 28),
                    if (challenge == null) _methodSelector(),
                    const SizedBox(height: 18),
                    TextFormField(
                      controller: _identifier,
                      enabled: !_busy && challenge == null,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: _passwordMode
                          ? TextInputAction.next
                          : TextInputAction.done,
                      autofillHints: const [AutofillHints.username],
                      validator: _validateIdentifier,
                      decoration: InputDecoration(
                        labelText: 'Email or phone number',
                        prefixIcon: const Icon(Icons.person_outline_rounded),
                        hintText: 'name@pharmacy.com',
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                    if (challenge != null) ...[
                      const SizedBox(height: 14),
                      Text(
                        'Enter the code sent to ${challenge.destinationMasked}.',
                        style: const TextStyle(color: muted),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _code,
                        autofocus: true,
                        enabled: !_busy,
                        keyboardType: TextInputType.number,
                        textInputAction: TextInputAction.done,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                          LengthLimitingTextInputFormatter(8),
                        ],
                        onSubmitted: (_) => _verifyCode(),
                        decoration: InputDecoration(
                          labelText: 'Verification code',
                          prefixIcon: const Icon(Icons.lock_outline_rounded),
                          filled: true,
                          fillColor: Colors.white,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                      ),
                      if (kDebugMode && challenge.developmentCode != null) ...[
                        const SizedBox(height: 10),
                        Text(
                          'Development code: ${challenge.developmentCode}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: muted, fontSize: 12),
                        ),
                      ],
                    ] else if (_passwordMode) ...[
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _password,
                        enabled: !_busy,
                        obscureText: _obscurePassword,
                        textInputAction: TextInputAction.done,
                        autofillHints: const [AutofillHints.password],
                        validator: (value) => (value?.isEmpty ?? true)
                            ? 'Enter your password.'
                            : null,
                        onFieldSubmitted: (_) => _signInWithPassword(),
                        decoration: InputDecoration(
                          labelText: 'Password',
                          prefixIcon: const Icon(Icons.lock_outline_rounded),
                          suffixIcon: IconButton(
                            onPressed: () => setState(
                              () => _obscurePassword = !_obscurePassword,
                            ),
                            tooltip: _obscurePassword
                                ? 'Show password'
                                : 'Hide password',
                            icon: Icon(
                              _obscurePassword
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined,
                            ),
                          ),
                          filled: true,
                          fillColor: Colors.white,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                      ),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFECE8),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          _error!,
                          style: const TextStyle(color: Color(0xFF9C2F1C)),
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _busy
                          ? null
                          : challenge != null
                          ? _verifyCode
                          : _passwordMode
                          ? _signInWithPassword
                          : _requestCode,
                      style: FilledButton.styleFrom(
                        backgroundColor: teal,
                        minimumSize: const Size.fromHeight(52),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: _busy
                          ? const SizedBox.square(
                              dimension: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              challenge != null
                                  ? 'Verify and sign in'
                                  : _passwordMode
                                  ? 'Sign in'
                                  : 'Send sign-in code',
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                    ),
                    if (challenge != null) ...[
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () {
                                setState(() {
                                  _challenge = null;
                                  _code.clear();
                                  _error = null;
                                });
                              },
                        child: const Text('Use another sign-in method'),
                      ),
                    ],
                    const SizedBox(height: 20),
                    const Text(
                      'For verified medical stores and authorized suppliers.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: muted, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _methodSelector() => SegmentedButton<bool>(
    segments: const [
      ButtonSegment(value: true, label: Text('Password')),
      ButtonSegment(value: false, label: Text('One-time code')),
    ],
    selected: {_passwordMode},
    onSelectionChanged: _busy
        ? null
        : (selection) => setState(() {
            _passwordMode = selection.first;
            _error = null;
          }),
  );
}

class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) => Container(
    width: 72,
    height: 72,
    decoration: BoxDecoration(
      color: brandYellow,
      borderRadius: BorderRadius.circular(22),
    ),
    child: const Icon(Icons.inventory_2_rounded, color: navy, size: 38),
  );
}
