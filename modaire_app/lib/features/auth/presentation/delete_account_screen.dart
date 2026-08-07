import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/api/dio_client.dart';
import '../../../core/auth/auth_controller.dart';
import '../../../core/auth/auth_storage.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

/// Apple 5.1.1(v) + Google Play both require an in-app account deletion
/// path. This screen renders the consequences up-front, then a "Type
/// DELETE to confirm" gate before enabling the destructive button — so
/// nobody nukes their account on a mis-tap. On confirm we POST to the
/// existing /api/v1/auth/delete-account, clear local storage, and drop
/// the user back at the sign-in surface.
class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  ConsumerState<DeleteAccountScreen> createState() =>
      _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends ConsumerState<DeleteAccountScreen> {
  final _confirmController = TextEditingController();
  bool _submitting = false;
  String? _errorMessage;
  static const _confirmationPhrase = 'DELETE';

  @override
  void initState() {
    super.initState();
    _confirmController.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _confirmController.dispose();
    super.dispose();
  }

  bool get _confirmed =>
      _confirmController.text.trim().toUpperCase() == _confirmationPhrase;

  Future<void> _submit() async {
    if (_submitting || !_confirmed) return;
    setState(() {
      _submitting = true;
      _errorMessage = null;
    });
    try {
      final dio = ref.read(dioProvider);
      await dio.post<void>('/api/v1/auth/delete-account');
      // Clear local session so the router flips to Unauthenticated → /sign-in.
      // Signing out via the controller also revokes the (already-invalid)
      // refresh token best-effort, then routes us off the tree.
      await ref.read(authStorageProvider).clear();
      await ref.read(authControllerProvider.notifier).signOut();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Account deleted. We\'re sorry to see you go.',
            style: GoogleFonts.jost(fontSize: 13),
          ),
          backgroundColor: ModaireColors.espresso,
        ),
      );
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = ApiException.fromDio(e).message);
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
      backgroundColor: ModaireColors.cream,
      appBar: const ModaireAppBar(),
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 40),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Delete your account',
                style: GoogleFonts.cormorantGaramond(
                  fontSize: 32,
                  fontWeight: FontWeight.w500,
                  color: ModaireColors.espresso,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'This is permanent. Before you tap Delete, here\'s what happens:',
                style: GoogleFonts.jost(
                  fontSize: 14,
                  color: ModaireColors.espressoText.withValues(alpha: 0.85),
                ),
              ),
              const SizedBox(height: 20),
              _bullet('Your account is disabled immediately. You cannot sign back in.'),
              _bullet('Every active session is signed out on all devices.'),
              _bullet(
                'Any active listings are removed from the marketplace so no one can '
                'buy them.',
              ),
              _bullet(
                'Order history and refund records are retained for 30 days for '
                'accounting, then permanently purged.',
              ),
              _bullet(
                'Pending seller payouts (already-earned funds from delivered orders) '
                'still release on the normal 3-day hold schedule to your connected '
                'Stripe account. Deletion does not forfeit money you\'re owed.',
              ),
              _bullet(
                "This action is irreversible. We can't recover a deleted account "
                'once the 30-day purge runs.',
              ),
              const SizedBox(height: 28),
              Text(
                'Type $_confirmationPhrase below to confirm.',
                style: GoogleFonts.jost(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: ModaireColors.espressoText,
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _confirmController,
                enabled: !_submitting,
                textCapitalization: TextCapitalization.characters,
                autocorrect: false,
                enableSuggestions: false,
                decoration: const InputDecoration(hintText: 'DELETE'),
                style: GoogleFonts.jost(
                  fontSize: 15,
                  letterSpacing: 2,
                ),
              ),
              if (_errorMessage != null) ...[
                const SizedBox(height: 14),
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
              ],
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: (_confirmed && !_submitting) ? _submit : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: ModaireColors.destructive,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor:
                      ModaireColors.destructive.withValues(alpha: 0.35),
                  disabledForegroundColor: Colors.white,
                ),
                child: _submitting
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Delete my account'),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: _submitting ? null : () => context.pop(),
                child: Text(
                  'Never mind — keep my account',
                  style: GoogleFonts.jost(
                    fontSize: 14,
                    color: ModaireColors.espresso,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _bullet(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Container(
                width: 5,
                height: 5,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: ModaireColors.espresso,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                text,
                style: GoogleFonts.jost(
                  fontSize: 14,
                  height: 1.55,
                  color: ModaireColors.espressoText.withValues(alpha: 0.85),
                ),
              ),
            ),
          ],
        ),
      );
}
