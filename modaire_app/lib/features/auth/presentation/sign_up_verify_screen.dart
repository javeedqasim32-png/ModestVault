import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/auth/signup_controller.dart';

/// Step 2 of signup — 6-digit code entry with 30-second resend cooldown.
/// On success the signup controller writes the returned session to storage
/// and flips AuthController, so the router redirect takes the user to /home
/// automatically.
class SignUpVerifyScreen extends ConsumerStatefulWidget {
  const SignUpVerifyScreen({super.key, required this.email});
  final String email;

  @override
  ConsumerState<SignUpVerifyScreen> createState() => _SignUpVerifyScreenState();
}

class _SignUpVerifyScreenState extends ConsumerState<SignUpVerifyScreen> {
  final _controller = TextEditingController();
  bool _submitting = false;
  String? _errorMessage;
  int _cooldownSec = 0;
  Timer? _cooldownTimer;

  @override
  void dispose() {
    _controller.dispose();
    _cooldownTimer?.cancel();
    super.dispose();
  }

  void _startCooldown(int seconds) {
    _cooldownTimer?.cancel();
    setState(() => _cooldownSec = seconds);
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      if (_cooldownSec <= 1) {
        t.cancel();
        setState(() => _cooldownSec = 0);
      } else {
        setState(() => _cooldownSec -= 1);
      }
    });
  }

  Future<void> _submit(String code) async {
    if (_submitting) return;
    if (code.length != 6) return;
    setState(() {
      _submitting = true;
      _errorMessage = null;
    });
    try {
      await ref
          .read(signupControllerProvider.notifier)
          .verifyCode(code: code);
      // AuthController is now Authenticated — router redirect takes us home.
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = e.message;
        _controller.clear();
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Something went wrong. Please try again.';
        _controller.clear();
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _resend() async {
    if (_cooldownSec > 0 || _submitting) return;
    setState(() {
      _errorMessage = null;
      _controller.clear();
    });
    try {
      await ref.read(signupControllerProvider.notifier).resendCode();
      _startCooldown(30);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'A new code has been sent to ${widget.email}.',
            style: GoogleFonts.jost(fontSize: 13),
          ),
          backgroundColor: ModaireColors.espresso,
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = e.message);
      // The most common resend error is the 30s cooldown itself; start a
      // local timer so the button re-enables when the server would accept.
      if (e.code == 'RATE_LIMITED') _startCooldown(30);
    } catch (_) {
      if (!mounted) return;
      setState(() => _errorMessage = 'Could not resend code. Try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final resendLabel =
        _cooldownSec > 0 ? 'Resend code (${_cooldownSec}s)' : 'Resend code';
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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Verify your email',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.cormorantGaramond(
                      fontSize: 36,
                      fontWeight: FontWeight.w500,
                      color: ModaireColors.espresso,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'We sent a 6-digit code to',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.jost(
                      fontSize: 14,
                      color: ModaireColors.espressoText.withValues(alpha: 0.7),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    widget.email,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.jost(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: ModaireColors.espressoText,
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
                  TextField(
                    controller: _controller,
                    keyboardType: TextInputType.number,
                    textAlign: TextAlign.center,
                    autofocus: true,
                    maxLength: 6,
                    enabled: !_submitting,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(6),
                    ],
                    style: GoogleFonts.jost(
                      fontSize: 28,
                      fontWeight: FontWeight.w500,
                      letterSpacing: 12,
                    ),
                    decoration: const InputDecoration(
                      counterText: '',
                      hintText: '••••••',
                    ),
                    onChanged: (value) {
                      if (value.length == 6) {
                        _submit(value);
                      }
                    },
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton(
                    onPressed:
                        _submitting ? null : () => _submit(_controller.text),
                    child: _submitting
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: ModaireColors.cream,
                            ),
                          )
                        : const Text('Verify'),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: (_cooldownSec > 0 || _submitting) ? null : _resend,
                    child: Text(
                      resendLabel,
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        color: _cooldownSec > 0
                            ? ModaireColors.espressoText.withValues(alpha: 0.4)
                            : ModaireColors.espresso,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: _submitting
                        ? null
                        : () {
                            ref.read(signupControllerProvider.notifier).reset();
                            context.goNamed('signup');
                          },
                    child: Text(
                      'Use a different email',
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        color: ModaireColors.espressoText.withValues(alpha: 0.6),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
