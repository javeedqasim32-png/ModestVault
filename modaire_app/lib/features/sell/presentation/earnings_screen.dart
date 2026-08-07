import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../app/theme.dart';
import '../../../shared/widgets/modaire_app_bar.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/seller/connect_repository.dart';

/// Earnings — refined "financial statement" treatment. Generous
/// whitespace, hairline rules, large serif numbers, no heavy cards.
/// The hero number is the available balance (centered, ~64px Cormorant);
/// secondary balances sit below it in a quiet two-column row. Awaiting-
/// Stripe is a soft warm callout, not an amber alarm. Footer is a brand
/// statement, not a stack of buttons.
class EarningsScreen extends ConsumerStatefulWidget {
  const EarningsScreen({super.key});

  @override
  ConsumerState<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends ConsumerState<EarningsScreen>
    with WidgetsBindingObserver {
  // Brand palette
  static const _bg = Color(0xFFFBF8F4);
  static const _ink = Color(0xFF2F2925);
  static const _muted = Color(0xFF8A7667);
  static const _hairline = Color(0xFFE3D9D1);
  static const _gold = Color(0xFFC6AB6E);
  static const _espresso = Color(0xFF4A3328);

  bool _openingDashboard = false;

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
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(sellerEarningsProvider);
    }
  }

  Future<void> _openDashboard() async {
    if (_openingDashboard) return;
    setState(() => _openingDashboard = true);
    try {
      final url = await ref.read(connectRepositoryProvider).dashboardLink();
      final uri = Uri.tryParse(url);
      if (uri == null) return;
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    } finally {
      if (mounted) setState(() => _openingDashboard = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(sellerEarningsProvider);
    return Scaffold(
      backgroundColor: _bg,
      appBar: const ModaireAppBar(backgroundColor: _bg),
      body: RefreshIndicator(
        color: ModaireColors.espresso,
        backgroundColor: ModaireColors.cream,
        onRefresh: () async {
          ref.invalidate(sellerEarningsProvider);
          await ref.read(sellerEarningsProvider.future);
        },
        child: async.when(
          loading: () => const Center(
            child: CircularProgressIndicator(
              color: ModaireColors.espresso,
              strokeWidth: 2,
            ),
          ),
          error: (e, _) => ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const SizedBox(height: 60),
              Center(
                child: Text(
                  'Couldn\'t load: $e',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.jost(fontSize: 13, color: _muted),
                ),
              ),
            ],
          ),
          data: (e) => _body(e),
        ),
      ),
    );
  }

  Widget _body(SellerEarnings e) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(0, 16, 0, 48),
      children: [
        _hero(e),
        const SizedBox(height: 36),
        _statementRow(e),
        if (e.awaitingCount > 0) ...[
          const SizedBox(height: 30),
          _awaitingCallout(e),
        ],
        const SizedBox(height: 44),
        _footnote(e),
      ],
    );
  }

  /// Centered hero block — eyebrow → gold hairline → massive serif
  /// amount → quiet "View on Stripe" text link.
  Widget _hero(SellerEarnings e) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 28, 28, 0),
      child: Column(
        children: [
          Text(
            'AVAILABLE BALANCE',
            style: GoogleFonts.jost(
              fontSize: 10,
              fontWeight: FontWeight.w500,
              letterSpacing: 2.6,
              color: _muted,
            ),
          ),
          const SizedBox(height: 14),
          // Gold hairline ornament — 56px wide, 1px tall
          Container(
            width: 56,
            height: 1,
            color: _gold.withValues(alpha: 0.6),
          ),
          const SizedBox(height: 22),
          // Hero number — Cormorant regular, very large, tight leading.
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    '\$',
                    style: GoogleFonts.cormorantGaramond(
                      fontSize: 32,
                      fontWeight: FontWeight.w400,
                      color: _ink,
                      height: 1.0,
                    ),
                  ),
                ),
                Text(
                  _formatAmount(e.balance.available),
                  style: GoogleFonts.cormorantGaramond(
                    fontSize: 72,
                    fontWeight: FontWeight.w400,
                    color: _ink,
                    height: 1.0,
                    letterSpacing: -1.2,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            e.balance.currency.toUpperCase(),
            style: GoogleFonts.jost(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              letterSpacing: 2.0,
              color: _muted,
            ),
          ),
          const SizedBox(height: 24),
          if (e.hasStripeAccount)
            TextButton(
              onPressed: _openingDashboard ? null : _openDashboard,
              style: TextButton.styleFrom(
                foregroundColor: _espresso,
                padding: const EdgeInsets.symmetric(
                    horizontal: 18, vertical: 10),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _openingDashboard
                        ? 'Opening Stripe…'
                        : 'View on Stripe',
                    style: GoogleFonts.jost(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      letterSpacing: 0.3,
                      color: _espresso,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Icon(
                    _openingDashboard
                        ? LucideIcons.loaderCircle
                        : LucideIcons.arrowUpRight,
                    size: 14,
                    color: _espresso,
                  ),
                ],
              ),
            )
          else
            TextButton(
              onPressed: () => context.push('/account/payouts'),
              style: TextButton.styleFrom(
                foregroundColor: _espresso,
                padding: const EdgeInsets.symmetric(
                    horizontal: 18, vertical: 10),
              ),
              child: Text(
                'Connect Stripe to receive payouts',
                style: GoogleFonts.jost(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0.3,
                  color: _espresso,
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// Two-column quiet statement row — Pending + Lifetime (we substitute
  /// "Currency" until lifetime endpoint exists; design stays the same).
  Widget _statementRow(SellerEarnings e) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 28),
      child: Container(
        decoration: const BoxDecoration(
          border: Border(
            top: BorderSide(color: _hairline),
            bottom: BorderSide(color: _hairline),
          ),
        ),
        padding: const EdgeInsets.symmetric(vertical: 22),
        child: Row(
          children: [
            Expanded(
              child: _statementCell(
                label: 'PENDING',
                value: '\$${_formatAmount(e.balance.pending)}',
                hint: 'In transit · 2–7 days',
              ),
            ),
            Container(
              width: 1,
              height: 56,
              color: _hairline,
            ),
            Expanded(
              child: _statementCell(
                label: 'CURRENCY',
                value: e.balance.currency.toUpperCase(),
                hint: 'Powered by Stripe',
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _statementCell({
    required String label,
    required String value,
    required String hint,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: GoogleFonts.jost(
            fontSize: 10,
            fontWeight: FontWeight.w500,
            letterSpacing: 1.8,
            color: _muted,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          value,
          style: GoogleFonts.cormorantGaramond(
            fontSize: 26,
            fontWeight: FontWeight.w500,
            height: 1.0,
            color: _ink,
            letterSpacing: -0.4,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          hint,
          style: GoogleFonts.jost(
            fontSize: 11,
            color: _muted,
          ),
        ),
      ],
    );
  }

  /// Soft warm callout — not an alarm. Cream surface, gold hairline,
  /// brand-toned amount, prose copy, and a quiet text-CTA with arrow.
  Widget _awaitingCallout(SellerEarnings e) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 28),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFFFBF5EC),
          border: Border.all(color: _gold.withValues(alpha: 0.45)),
          borderRadius: BorderRadius.circular(20),
        ),
        padding: const EdgeInsets.fromLTRB(22, 22, 22, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 4,
                  height: 4,
                  decoration: const BoxDecoration(
                    color: _gold,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  'HELD FOR PAYOUT',
                  style: GoogleFonts.jost(
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 2.2,
                    color: const Color(0xFF8A6A40),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '\$${_formatAmount(e.awaitingDollars)}',
                  style: GoogleFonts.cormorantGaramond(
                    fontSize: 34,
                    fontWeight: FontWeight.w500,
                    height: 1.0,
                    color: const Color(0xFF5B3F1F),
                    letterSpacing: -0.6,
                  ),
                ),
                const SizedBox(width: 10),
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    '${e.awaitingCount} ${e.awaitingCount == 1 ? "order" : "orders"}',
                    style: GoogleFonts.jost(
                      fontSize: 12,
                      color: const Color(0xFF8A6A40),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Funds from your completed sales are held safely until your Stripe account is connected. There is no deadline to claim them.',
              style: GoogleFonts.jost(
                fontSize: 13,
                height: 1.55,
                color: const Color(0xFF6F5638),
              ),
            ),
            const SizedBox(height: 14),
            InkWell(
              onTap: () => context.push('/account/payouts'),
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                    horizontal: 2, vertical: 6),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Connect Stripe',
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.3,
                        color: const Color(0xFF5B3F1F),
                      ),
                    ),
                    const SizedBox(width: 6),
                    const Icon(
                      LucideIcons.arrowRight,
                      size: 14,
                      color: Color(0xFF5B3F1F),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Brand footnote — feels like the back of a private-bank statement.
  Widget _footnote(SellerEarnings e) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 0, 28, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 36,
            height: 1,
            color: _gold.withValues(alpha: 0.55),
          ),
          const SizedBox(height: 18),
          Text(
            'In partnership with',
            style: GoogleFonts.jost(
              fontSize: 11,
              letterSpacing: 1.4,
              color: _muted,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'STRIPE EXPRESS',
            style: GoogleFonts.jost(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 3.0,
              color: _ink,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'Funds transition from Pending to Available within 2–7 business days, then are paid directly to your connected bank account. Modaire never touches your money.',
            textAlign: TextAlign.center,
            style: GoogleFonts.jost(
              fontSize: 12.5,
              height: 1.65,
              color: _muted,
            ),
          ),
          if (!e.hasStripeAccount) ...[
            const SizedBox(height: 12),
            Text(
              'Until you connect Stripe, your sales remain held on Modaire — never expiring.',
              textAlign: TextAlign.center,
              style: GoogleFonts.jost(
                fontSize: 12,
                height: 1.6,
                color: _muted,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// Format with thousands separator — "$1,234.56" feels more polished
  /// than "$1234.56" on a luxury financial surface.
  String _formatAmount(double v) {
    final whole = v.truncate();
    final frac = ((v - whole) * 100).round().abs().toString().padLeft(2, '0');
    final s = whole.abs().toString();
    final buf = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
      buf.write(s[i]);
    }
    return '${whole < 0 ? '-' : ''}${buf.toString()}.$frac';
  }
}
