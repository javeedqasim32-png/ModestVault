import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../app/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/seller/connect_repository.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

/// Mobile mirror of /sell/setup + /sell/onboarding-complete. Drives the
/// Stripe Connect Express onboarding flow:
///
///   1. POST /onboard to mint a hosted onboarding URL
///   2. open URL in the system browser (Stripe-hosted form)
///   3. user finishes onboarding in Safari; returns to the app
///   4. on AppLifecycleState.resumed, GET /status to flip seller_enabled
///   5. show either the success state (charges/payouts enabled) or the
///      requirements-still-due state
class ConnectSetupScreen extends ConsumerStatefulWidget {
  const ConnectSetupScreen({super.key});

  @override
  ConsumerState<ConnectSetupScreen> createState() => _ConnectSetupScreenState();
}

class _ConnectSetupScreenState extends ConsumerState<ConnectSetupScreen>
    with WidgetsBindingObserver {
  bool _launching = false;
  String? _launchError;
  bool _checkingAfterReturn = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // When the user comes back from Safari (Stripe onboarding), re-check
    // the connect status. This mirrors what the website's
    // onboarding-complete page does on render.
    if (state == AppLifecycleState.resumed) {
      _refreshStatus();
    }
  }

  Future<void> _refreshStatus() async {
    if (_checkingAfterReturn) return;
    setState(() => _checkingAfterReturn = true);
    ref.invalidate(connectStatusProvider);
    try {
      await ref.read(connectStatusProvider.future);
    } catch (_) {
      // Surface via the AsyncValue.error path below.
    }
    if (mounted) setState(() => _checkingAfterReturn = false);
  }

  Future<void> _startOnboarding() async {
    if (_launching) return;
    setState(() {
      _launching = true;
      _launchError = null;
    });
    try {
      final url = await ref.read(connectRepositoryProvider).onboardLink();
      final uri = Uri.parse(url);
      // External Safari so the user has the full Stripe domain visible
      // (trust + autofill); we re-check status on app resume.
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _launchError = e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _launchError = 'Couldn\'t open Stripe onboarding.');
    } finally {
      if (mounted) setState(() => _launching = false);
    }
  }

  Future<void> _openDashboard() async {
    try {
      final url = await ref.read(connectRepositoryProvider).dashboardLink();
      final uri = Uri.parse(url);
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final statusAsync = ref.watch(connectStatusProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFFBF8F4),
      appBar: const ModaireAppBar(),
      body: statusAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(
            color: ModaireColors.espresso,
            strokeWidth: 2,
          ),
        ),
        error: (e, _) => _errorBody(e.toString()),
        data: (s) => _body(s),
      ),
    );
  }

  Widget _body(ConnectStatus s) {
    if (s.sellerEnabled && s.payoutsEnabled) {
      return _readyState(s);
    }
    if (s.hasAccount && !s.payoutsEnabled) {
      return _inProgressState(s);
    }
    return _notStartedState();
  }

  Widget _notStartedState() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
      children: [
        _hero(
          icon: LucideIcons.wallet,
          tone: _Tone.brand,
          eyebrow: 'PAYOUTS',
          title: 'Set up Stripe Connect',
          body:
              'Modaire uses Stripe to pay sellers directly. Set up your account once — it takes a few minutes and only needs to be done from this device.',
        ),
        const SizedBox(height: 20),
        _bulletCard(
          items: const [
            'Verify your identity with Stripe',
            'Add a bank account or debit card',
            'Receive payouts after the 3-day buyer-protection hold',
          ],
        ),
        const SizedBox(height: 24),
        _primaryButton(
          label: _launching ? 'Opening Stripe…' : 'Start onboarding',
          onPressed: _launching ? null : _startOnboarding,
          loading: _launching,
        ),
        if (_launchError != null) ...[
          const SizedBox(height: 12),
          _noticeBox(
            tone: _Tone.error,
            icon: LucideIcons.circleAlert,
            text: _launchError!,
          ),
        ],
        const SizedBox(height: 12),
        Text(
          'Onboarding opens in Safari. Once you finish, return here and we\'ll check your status.',
          textAlign: TextAlign.center,
          style: GoogleFonts.jost(
            fontSize: 12,
            color: const Color(0xFF8A7667),
          ),
        ),
      ],
    );
  }

  Widget _inProgressState(ConnectStatus s) {
    final due = s.currentlyDue.take(8).toList();
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
      children: [
        _hero(
          icon: LucideIcons.circleAlert,
          tone: _Tone.warning,
          eyebrow: 'ONBOARDING INCOMPLETE',
          title: 'Stripe needs more details',
          body:
              'You\'ve started setup but Stripe still needs a few details before you can receive payouts.',
        ),
        const SizedBox(height: 20),
        if (due.isNotEmpty)
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFFFBF7F4),
              border: Border.all(color: const Color(0xFFE3D9D1)),
              borderRadius: BorderRadius.circular(24),
            ),
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'STILL REQUIRED',
                  style: GoogleFonts.jost(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 1.6,
                    color: const Color(0xFF8A7667),
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: due
                      .map((field) => Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(99),
                              border: Border.all(
                                color: const Color(0xFFDDD3CB),
                              ),
                            ),
                            child: Text(
                              field,
                              style: GoogleFonts.jost(
                                fontSize: 13,
                                color: const Color(0xFF2F2925),
                              ),
                            ),
                          ))
                      .toList(),
                ),
              ],
            ),
          ),
        const SizedBox(height: 24),
        _primaryButton(
          label: _launching ? 'Opening Stripe…' : 'Continue onboarding',
          onPressed: _launching ? null : _startOnboarding,
          loading: _launching,
        ),
        if (_checkingAfterReturn) ...[
          const SizedBox(height: 12),
          Center(
            child: Text(
              'Re-checking status…',
              style: GoogleFonts.jost(
                fontSize: 12,
                color: const Color(0xFF8A7667),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _readyState(ConnectStatus s) {
    final released = s.releasedDollars;
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
      children: [
        _hero(
          icon: LucideIcons.circleCheckBig,
          tone: _Tone.success,
          eyebrow: 'STRIPE CONNECTED',
          title: 'Payouts active',
          body:
              'You\'re fully set up. Payouts land in your bank account 3 days after each delivery.',
        ),
        if (released > 0) ...[
          const SizedBox(height: 16),
          _noticeBox(
            tone: _Tone.success,
            icon: LucideIcons.circleCheckBig,
            text:
                'We just released \$${released.toStringAsFixed(2)} for orders that were waiting on payout setup.',
          ),
        ],
        const SizedBox(height: 24),
        _primaryButton(
          label: 'Open Stripe Dashboard',
          onPressed: _openDashboard,
          loading: false,
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          height: 48,
          child: OutlinedButton(
            onPressed: () => context.go('/sell'),
            style: OutlinedButton.styleFrom(
              backgroundColor: const Color(0xFFFBF8F4),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(999),
              ),
              side: const BorderSide(color: Color(0xFFD7CAC0)),
              padding: const EdgeInsets.symmetric(horizontal: 28),
            ),
            child: Text(
              'Go to Sell',
              style: GoogleFonts.jost(
                fontSize: 14,
                fontWeight: FontWeight.w400,
                color: const Color(0xFF2F2925),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _errorBody(String message) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 60),
        const Icon(
          LucideIcons.cloudOff,
          size: 48,
          color: ModaireColors.tileTextSubtle,
        ),
        const SizedBox(height: 12),
        Text(
          'Couldn\'t load payout status',
          textAlign: TextAlign.center,
          style: GoogleFonts.jost(
            fontSize: 14,
            color: ModaireColors.tileTextPrimary,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          message,
          textAlign: TextAlign.center,
          style: GoogleFonts.jost(
            fontSize: 12,
            color: ModaireColors.tileTextSubtle,
          ),
        ),
        const SizedBox(height: 18),
        Center(
          child: SizedBox(
            width: 180,
            height: 44,
            child: OutlinedButton(
              onPressed: _refreshStatus,
              style: OutlinedButton.styleFrom(
                backgroundColor: const Color(0xFFFBF8F4),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
                side: const BorderSide(color: Color(0xFFD7CAC0)),
              ),
              child: Text(
                'Retry',
                style: GoogleFonts.jost(
                  fontSize: 13,
                  color: const Color(0xFF2F2925),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _hero({
    required IconData icon,
    required _Tone tone,
    required String eyebrow,
    required String title,
    required String body,
  }) {
    late final Color iconBg;
    late final Color iconFg;
    switch (tone) {
      case _Tone.brand:
        iconBg = const Color(0xFFEDE2D5);
        iconFg = const Color(0xFF7A5A45);
        break;
      case _Tone.warning:
        iconBg = const Color(0xFFFFFBEB);
        iconFg = const Color(0xFF92400E);
        break;
      case _Tone.success:
        iconBg = const Color(0xFFECFDF3);
        iconFg = const Color(0xFF067647);
        break;
      case _Tone.error:
        iconBg = const Color(0xFFFEF2F2);
        iconFg = const Color(0xFFB91C1C);
        break;
    }

    return Column(
      children: [
        Container(
          width: 80,
          height: 80,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: iconBg,
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: iconFg, size: 36),
        ),
        const SizedBox(height: 18),
        Text(
          eyebrow,
          style: GoogleFonts.jost(
            fontSize: 11,
            fontWeight: FontWeight.w500,
            letterSpacing: 2.4,
            color: const Color(0xFF8A7667),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          title,
          textAlign: TextAlign.center,
          style: GoogleFonts.cormorantGaramond(
            fontSize: 28,
            fontWeight: FontWeight.w600,
            height: 1.1,
            color: const Color(0xFF2F2925),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          body,
          textAlign: TextAlign.center,
          style: GoogleFonts.jost(
            fontSize: 14,
            height: 1.5,
            color: const Color(0xFF6F6054),
          ),
        ),
      ],
    );
  }

  Widget _bulletCard({required List<String> items}) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFFBF8F5),
        border: Border.all(color: const Color(0xFFE3D9D1)),
        borderRadius: BorderRadius.circular(24),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: items
            .map((it) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Padding(
                        padding: EdgeInsets.only(top: 4, right: 10),
                        child: Icon(
                          LucideIcons.circleCheckBig,
                          size: 16,
                          color: Color(0xFF7A5A45),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          it,
                          style: GoogleFonts.jost(
                            fontSize: 14,
                            height: 1.45,
                            color: const Color(0xFF2F2925),
                          ),
                        ),
                      ),
                    ],
                  ),
                ))
            .toList(),
      ),
    );
  }

  Widget _primaryButton({
    required String label,
    required VoidCallback? onPressed,
    required bool loading,
  }) {
    return SizedBox(
      width: double.infinity,
      height: 50,
      child: ElevatedButton.icon(
        onPressed: onPressed,
        icon: loading
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(
                  color: Colors.white,
                  strokeWidth: 2,
                ),
              )
            : const Icon(LucideIcons.externalLink, size: 16),
        label: Text(
          label,
          style: GoogleFonts.jost(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF4A3328),
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(999),
          ),
        ),
      ),
    );
  }

  Widget _noticeBox({
    required _Tone tone,
    required IconData icon,
    required String text,
  }) {
    late final Color bg;
    late final Color fg;
    late final Color border;
    switch (tone) {
      case _Tone.success:
        bg = const Color(0xFFECFDF3);
        fg = const Color(0xFF067647);
        border = const Color(0xFFA6F4C5);
        break;
      case _Tone.error:
        bg = const Color(0xFFFEF2F2);
        fg = const Color(0xFFB91C1C);
        border = const Color(0xFFFECACA);
        break;
      case _Tone.warning:
        bg = const Color(0xFFFFFBEB);
        fg = const Color(0xFF92400E);
        border = const Color(0xFFFDE68A);
        break;
      case _Tone.brand:
        bg = const Color(0xFFEDE2D5);
        fg = const Color(0xFF7A5A45);
        border = const Color(0xFFDDD3CB);
        break;
    }
    return Container(
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(14),
      ),
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: fg, size: 16),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: GoogleFonts.jost(
                fontSize: 13,
                color: fg,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

enum _Tone { brand, success, warning, error }
