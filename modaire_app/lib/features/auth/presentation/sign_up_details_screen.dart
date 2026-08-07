import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/auth/signup_controller.dart';
import '../../../core/auth/signup_repository.dart';

/// Step 1 of signup — collects the same field-set the web signup form does.
/// Matches sign_in_screen.dart's overall shape (ConstrainedBox maxWidth 420,
/// scroll, elevated button, red error banner) so the flow feels of-a-piece.
class SignUpDetailsScreen extends ConsumerStatefulWidget {
  const SignUpDetailsScreen({super.key});

  @override
  ConsumerState<SignUpDetailsScreen> createState() => _SignUpDetailsScreenState();
}

class _SignUpDetailsScreenState extends ConsumerState<SignUpDetailsScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _phone = TextEditingController();
  final _street1 = TextEditingController();
  final _street2 = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _zip = TextEditingController();
  final _country = TextEditingController(text: 'US');
  bool _smsOptIn = false;
  bool _marketingEmailOptIn = true; // default-checked to match web
  bool _obscurePassword = true;
  bool _submitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    for (final c in [
      _firstName,
      _lastName,
      _email,
      _password,
      _phone,
      _street1,
      _street2,
      _city,
      _state,
      _zip,
      _country,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  int _digitsOnlyLength(String value) =>
      value.replaceAll(RegExp(r'\D'), '').length;

  Future<void> _submit() async {
    if (_submitting) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _submitting = true;
      _errorMessage = null;
    });
    final form = SignUpForm(
      firstName: _firstName.text.trim(),
      lastName: _lastName.text.trim(),
      email: _email.text.trim(),
      password: _password.text,
      phone: _phone.text.trim(),
      street1: _street1.text.trim(),
      street2: _street2.text.trim(),
      city: _city.text.trim(),
      state: _state.text.trim(),
      zip: _zip.text.trim(),
      country: _country.text.trim(),
      smsOptIn: _smsOptIn,
      marketingEmailOptIn: _marketingEmailOptIn,
    );
    try {
      await ref.read(signupControllerProvider.notifier).startSignup(form);
      if (!mounted) return;
      context.goNamed(
        'signup-verify',
        queryParameters: {'email': form.email.toLowerCase()},
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _errorMessage = 'Something went wrong. Please try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: ModaireColors.cream,
        elevation: 0,
        foregroundColor: ModaireColors.espressoText,
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Create your account',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.cormorantGaramond(
                        fontSize: 36,
                        fontWeight: FontWeight.w500,
                        color: ModaireColors.espresso,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Join the Modaire community.',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.jost(
                        fontSize: 14,
                        color: ModaireColors.espressoText.withValues(alpha: 0.7),
                      ),
                    ),
                    const SizedBox(height: 24),
                    if (_errorMessage != null) ...[
                      _ErrorBanner(message: _errorMessage!),
                      const SizedBox(height: 14),
                    ],
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _firstName,
                            textInputAction: TextInputAction.next,
                            textCapitalization: TextCapitalization.words,
                            decoration: const InputDecoration(labelText: 'First name'),
                            validator: (v) =>
                                (v?.trim().isEmpty ?? true) ? 'Required' : null,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextFormField(
                            controller: _lastName,
                            textInputAction: TextInputAction.next,
                            textCapitalization: TextCapitalization.words,
                            decoration: const InputDecoration(labelText: 'Last name'),
                            validator: (v) =>
                                (v?.trim().isEmpty ?? true) ? 'Required' : null,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      enableSuggestions: false,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Email'),
                      validator: (v) {
                        final s = v?.trim() ?? '';
                        if (s.isEmpty) return 'Email is required';
                        if (!s.contains('@')) return 'Enter a valid email';
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _password,
                      obscureText: _obscurePassword,
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        labelText: 'Password (8+ characters)',
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                            color: ModaireColors.espressoText.withValues(alpha: 0.6),
                          ),
                          onPressed: () =>
                              setState(() => _obscurePassword = !_obscurePassword),
                        ),
                      ),
                      validator: (v) {
                        if ((v ?? '').isEmpty) return 'Password is required';
                        if ((v ?? '').length < 8) return 'Minimum 8 characters';
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Phone'),
                      validator: (v) {
                        final s = v?.trim() ?? '';
                        if (s.isEmpty) return 'Phone is required';
                        final digits = _digitsOnlyLength(s);
                        if (digits < 8 || digits > 15) {
                          return 'Between 8 and 15 digits';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Shipping address',
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: ModaireColors.espressoText.withValues(alpha: 0.75),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _street1,
                      textInputAction: TextInputAction.next,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(labelText: 'Street address'),
                      validator: (v) =>
                          (v?.trim().isEmpty ?? true) ? 'Required' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _street2,
                      textInputAction: TextInputAction.next,
                      decoration:
                          const InputDecoration(labelText: 'Apt / suite (optional)'),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          flex: 3,
                          child: TextFormField(
                            controller: _city,
                            textInputAction: TextInputAction.next,
                            textCapitalization: TextCapitalization.words,
                            decoration: const InputDecoration(labelText: 'City'),
                            validator: (v) =>
                                (v?.trim().isEmpty ?? true) ? 'Required' : null,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          flex: 2,
                          child: TextFormField(
                            controller: _state,
                            textInputAction: TextInputAction.next,
                            textCapitalization: TextCapitalization.characters,
                            decoration: const InputDecoration(labelText: 'State'),
                            validator: (v) =>
                                (v?.trim().isEmpty ?? true) ? 'Required' : null,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          flex: 2,
                          child: TextFormField(
                            controller: _zip,
                            keyboardType: TextInputType.number,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(labelText: 'ZIP'),
                            validator: (v) =>
                                (v?.trim().isEmpty ?? true) ? 'Required' : null,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          flex: 3,
                          child: TextFormField(
                            controller: _country,
                            textInputAction: TextInputAction.done,
                            textCapitalization: TextCapitalization.characters,
                            decoration: const InputDecoration(labelText: 'Country'),
                            validator: (v) =>
                                (v?.trim().isEmpty ?? true) ? 'Required' : null,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    CheckboxListTile(
                      value: _marketingEmailOptIn,
                      onChanged: (v) =>
                          setState(() => _marketingEmailOptIn = v ?? false),
                      title: Text(
                        'Send me editorial picks + occasional promos',
                        style: GoogleFonts.jost(fontSize: 13),
                      ),
                      controlAffinity: ListTileControlAffinity.leading,
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                    ),
                    CheckboxListTile(
                      value: _smsOptIn,
                      onChanged: (v) => setState(() => _smsOptIn = v ?? false),
                      title: Text(
                        'Text me order updates (SMS)',
                        style: GoogleFonts.jost(fontSize: 13),
                      ),
                      controlAffinity: ListTileControlAffinity.leading,
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                    ),
                    const SizedBox(height: 20),
                    ElevatedButton(
                      onPressed: _submitting ? null : _submit,
                      child: _submitting
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: ModaireColors.cream,
                              ),
                            )
                          : const Text('Create account'),
                    ),
                    const SizedBox(height: 12),
                    _LegalConsentText(disabled: _submitting),
                    const SizedBox(height: 6),
                    TextButton(
                      onPressed: _submitting
                          ? null
                          : () => context.goNamed('sign-in'),
                      child: Text(
                        'Already have an account? Sign in',
                        style: GoogleFonts.jost(
                          fontSize: 13,
                          color: ModaireColors.espresso,
                        ),
                      ),
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
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ModaireColors.destructive.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: ModaireColors.destructive.withValues(alpha: 0.3),
        ),
      ),
      child: Text(
        message,
        style: GoogleFonts.jost(
          fontSize: 14,
          color: ModaireColors.destructive,
        ),
      ),
    );
  }
}

/// "By tapping Create account, you agree to our Terms & Privacy" with
/// inline tap targets to the in-app legal screens. Rendered below the
/// submit button so acceptance is bound to the action.
class _LegalConsentText extends StatelessWidget {
  const _LegalConsentText({required this.disabled});
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final base = GoogleFonts.jost(
      fontSize: 12,
      color: ModaireColors.espressoText.withValues(alpha: 0.7),
      height: 1.5,
    );
    final link = base.copyWith(
      color: ModaireColors.espresso,
      decoration: TextDecoration.underline,
    );
    return Text.rich(
      TextSpan(
        children: [
          const TextSpan(text: 'By tapping Create account, you agree to our '),
          TextSpan(
            text: 'Terms',
            style: link,
            recognizer: _tap(context, '/legal/terms', disabled),
          ),
          const TextSpan(text: ' and '),
          TextSpan(
            text: 'Privacy Policy',
            style: link,
            recognizer: _tap(context, '/legal/privacy', disabled),
          ),
          const TextSpan(text: '.'),
        ],
      ),
      textAlign: TextAlign.center,
      style: base,
    );
  }

  TapGestureRecognizer _tap(BuildContext context, String route, bool disabled) {
    final r = TapGestureRecognizer();
    if (!disabled) {
      r.onTap = () => context.push(route);
    }
    return r;
  }
}
