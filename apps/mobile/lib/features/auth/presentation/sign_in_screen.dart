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
  final _displayName = TextEditingController();
  final _businessName = TextEditingController();
  final _confirmPassword = TextEditingController();
  OtpChallenge? _challenge;
  bool _passwordMode = true;
  bool _registerMode = false;
  bool _registrationPending = false;
  bool _obscurePassword = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    _code.dispose();
    _displayName.dispose();
    _businessName.dispose();
    _confirmPassword.dispose();
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
      if (_registrationPending) {
        await widget.auth.verifyAccountCode(
          challenge: challenge,
          code: _code.text,
        );
        await widget.auth.signInWithPassword(
          identifier: _identifier.text,
          password: _password.text,
        );
      } else {
        await widget.auth.verifyLoginCode(
          challenge: challenge,
          code: _code.text,
        );
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on FormatException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _registerBuyer() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_password.text != _confirmPassword.text) {
      setState(() => _error = 'The passwords do not match.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.auth.registerBuyer(
        displayName: _displayName.text,
        businessName: _businessName.text,
        identifier: _identifier.text,
        password: _password.text,
      );
      final challenge = await widget.auth.requestVerificationCode(
        _identifier.text,
      );
      if (!mounted) return;
      setState(() {
        _challenge = challenge;
        _registrationPending = true;
      });
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
                    if (challenge == null && !_registerMode) _methodSelector(),
                    if (challenge == null)
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: _busy
                              ? null
                              : () => setState(() {
                                  _registerMode = !_registerMode;
                                  _passwordMode = true;
                                  _error = null;
                                }),
                          child: Text(
                            _registerMode
                                ? 'Already have an account? Sign in'
                                : 'Create a pharmacy account',
                          ),
                        ),
                      ),
                    if (challenge == null && _registerMode) ...[
                      const SizedBox(height: 4),
                      TextFormField(
                        controller: _displayName,
                        enabled: !_busy,
                        textCapitalization: TextCapitalization.words,
                        validator: (value) => (value?.trim().length ?? 0) < 2
                            ? 'Enter the account holder name.'
                            : null,
                        decoration: const InputDecoration(
                          labelText: 'Account holder name',
                          prefixIcon: Icon(Icons.person_outline_rounded),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _businessName,
                        enabled: !_busy,
                        textCapitalization: TextCapitalization.words,
                        validator: (value) => (value?.trim().length ?? 0) < 2
                            ? 'Enter your pharmacy or business name.'
                            : null,
                        decoration: const InputDecoration(
                          labelText: 'Pharmacy / business name',
                          prefixIcon: Icon(Icons.storefront_outlined),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
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
                    ] else if (_passwordMode || _registerMode) ...[
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
                      if (_registerMode) ...[
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _confirmPassword,
                          enabled: !_busy,
                          obscureText: true,
                          validator: (value) => (value?.isEmpty ?? true)
                              ? 'Confirm your password.'
                              : null,
                          decoration: const InputDecoration(
                            labelText: 'Confirm password',
                            prefixIcon: Icon(Icons.lock_outline_rounded),
                          ),
                        ),
                      ],
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
                          : _registerMode
                          ? _registerBuyer
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
                                  ? _registrationPending
                                        ? 'Verify account and continue'
                                        : 'Verify and sign in'
                                  : _registerMode
                                  ? 'Create account and send code'
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
                                  _registrationPending = false;
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
