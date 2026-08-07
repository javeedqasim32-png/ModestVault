import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/auth/password_reset_repository.dart';

/// Single-shot forgot-password screen. After submit the form is replaced by
/// a success card telling the user to check their inbox — this is always
/// shown, regardless of whether the email is registered (the server never
/// leaks that fact, to prevent email enumeration).
///
/// The reset link in the email points at shopmodaire.com/reset-password?token=...
/// which opens in the phone's browser and lets the user complete the reset
/// on web. When universal / app links land in a later slice, the same link
/// will open the app instead.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  bool _submitting = false;
  bool _sent = false;
  String? _errorMessage;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _submitting = true;
      _errorMessage = null;
    });
    try {
      await ref
          .read(passwordResetRepositoryProvider)
          .requestReset(email: _emailController.text.trim());
      if (!mounted) return;
      setState(() => _sent = true);
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
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: _sent ? _buildSuccess(context) : _buildForm(context),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildForm(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Reset your password',
            textAlign: TextAlign.center,
            style: GoogleFonts.cormorantGaramond(
              fontSize: 36,
              fontWeight: FontWeight.w500,
              color: ModaireColors.espresso,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Enter your email and we\'ll send you a reset link.',
            textAlign: TextAlign.center,
            style: GoogleFonts.jost(
              fontSize: 14,
              color: ModaireColors.espressoText.withValues(alpha: 0.7),
            ),
          ),
          const SizedBox(height: 32),
          if (_errorMessage != null) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: ModaireColors.destructive.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: ModaireColors.destructive.withValues(alpha: 0.3),
                ),
              ),
              child: Text(
                _errorMessage!,
                style: GoogleFonts.jost(
                  fontSize: 14,
                  color: ModaireColors.destructive,
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            enableSuggestions: false,
            textInputAction: TextInputAction.done,
            onFieldSubmitted: (_) => _submit(),
            decoration: const InputDecoration(labelText: 'Email'),
            validator: (value) {
              final v = value?.trim() ?? '';
              if (v.isEmpty) return 'Email is required';
              if (!v.contains('@')) return 'Enter a valid email';
              return null;
            },
          ),
          const SizedBox(height: 24),
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
                : const Text('Send reset link'),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed:
                _submitting ? null : () => context.goNamed('sign-in'),
            child: Text(
              'Back to sign in',
              style: GoogleFonts.jost(
                fontSize: 13,
                color: ModaireColors.espresso,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSuccess(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Icon(
          Icons.mark_email_read_outlined,
          size: 56,
          color: ModaireColors.espresso.withValues(alpha: 0.75),
        ),
        const SizedBox(height: 16),
        Text(
          'Check your inbox',
          textAlign: TextAlign.center,
          style: GoogleFonts.cormorantGaramond(
            fontSize: 32,
            fontWeight: FontWeight.w500,
            color: ModaireColors.espresso,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'If ${_emailController.text.trim()} is a Modaire account, we sent a reset link. It expires in 1 hour. The link opens on shopmodaire.com — set your new password there, then return here to sign in.',
          textAlign: TextAlign.center,
          style: GoogleFonts.jost(
            fontSize: 14,
            height: 1.55,
            color: ModaireColors.espressoText.withValues(alpha: 0.8),
          ),
        ),
        const SizedBox(height: 28),
        ElevatedButton(
          onPressed: () => context.goNamed('sign-in'),
          child: const Text('Back to sign in'),
        ),
      ],
    );
  }
}
