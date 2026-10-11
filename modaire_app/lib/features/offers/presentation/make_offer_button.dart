import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/auth/auth_controller.dart';
import '../../../core/offers/offer_repository.dart';

/// "Make an Offer" entry on the listing detail (3.1). Hidden on the viewer's
/// own listing. Tapping opens a two-step sheet: enter amount -> confirm ->
/// submit. If the buyer already has an active offer the API returns a
/// duplicate error and we route them to /offers.
class MakeOfferButton extends ConsumerWidget {
  const MakeOfferButton({super.key, required this.listingId, required this.askingPrice, required this.sellerId});

  final String listingId;
  final double askingPrice;
  final String? sellerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final viewerId = auth is AuthAuthenticated ? auth.session.user.id : null;
    if (viewerId != null && sellerId != null && viewerId == sellerId) {
      return const SizedBox.shrink(); // don't offer on your own listing
    }

    return SizedBox(
      width: double.infinity,
      height: 40,
      child: OutlinedButton.icon(
        onPressed: () {
          if (viewerId == null) {
            context.push('/sign-in');
            return;
          }
          _openSheet(context, ref);
        },
        icon: const Icon(LucideIcons.tag, size: 16, color: ModaireColors.espresso),
        style: OutlinedButton.styleFrom(
          side: const BorderSide(color: ModaireColors.espresso),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
        ),
        label: Text('Make an Offer', style: GoogleFonts.jost(fontSize: 13, fontWeight: FontWeight.w500, color: ModaireColors.espresso)),
      ),
    );
  }

  void _openSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _OfferSheet(listingId: listingId, askingPrice: askingPrice, ref: ref),
    );
  }
}

class _OfferSheet extends StatefulWidget {
  const _OfferSheet({required this.listingId, required this.askingPrice, required this.ref});
  final String listingId;
  final double askingPrice;
  final WidgetRef ref;

  @override
  State<_OfferSheet> createState() => _OfferSheetState();
}

class _OfferSheetState extends State<_OfferSheet> {
  final _ctrl = TextEditingController();
  bool _confirming = false;
  bool _submitting = false;
  String? _error;

  double get _amount => double.tryParse(_ctrl.text.trim()) ?? 0;
  bool get _valid => _amount > 0 && _amount <= widget.askingPrice;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final thread = await widget.ref.read(offerRepositoryProvider).submit(listingId: widget.listingId, amount: _amount);
      if (!mounted) return;
      Navigator.of(context).pop();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Offer sent')));
        context.push('/offers/${thread.id}');
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      // Duplicate active offer -> send them to their offers list.
      if (e.message.toLowerCase().contains('already have an active offer')) {
        Navigator.of(context).pop();
        if (context.mounted) context.push('/offers');
        return;
      }
      setState(() {
        _error = e.message;
        _submitting = false;
        _confirming = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_confirming ? 'Confirm your offer' : 'Make an offer',
              style: GoogleFonts.jost(fontSize: 18, fontWeight: FontWeight.w600, color: ModaireColors.espressoText)),
          const SizedBox(height: 6),
          Text(
            _confirming
                ? 'You\'re offering \$${_amount.toStringAsFixed(2)}. The seller has 48 hours to accept, decline, or counter.'
                : 'Asking price \$${widget.askingPrice.toStringAsFixed(2)}. Enter your offer below.',
            style: GoogleFonts.jost(fontSize: 13, color: ModaireColors.tileTextSubtle),
          ),
          const SizedBox(height: 16),
          if (!_confirming)
            TextField(
              controller: _ctrl,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                prefixText: '\$ ',
                hintText: '0.00',
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: ModaireColors.border)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: ModaireColors.espresso)),
              ),
              onChanged: (_) => setState(() {}),
            ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: GoogleFonts.jost(fontSize: 13, color: ModaireColors.destructive)),
          ],
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _submitting ? null : () => _confirming ? setState(() => _confirming = false) : Navigator.of(context).pop(),
                  style: OutlinedButton.styleFrom(side: const BorderSide(color: ModaireColors.border), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)), padding: const EdgeInsets.symmetric(vertical: 12)),
                  child: Text(_confirming ? 'Back' : 'Cancel', style: GoogleFonts.jost(color: ModaireColors.espressoText)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: (_confirming ? !_submitting : _valid) ? () => _confirming ? _submit() : setState(() => _confirming = true) : null,
                  style: ElevatedButton.styleFrom(backgroundColor: ModaireColors.espresso, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)), padding: const EdgeInsets.symmetric(vertical: 12)),
                  child: Text(_confirming ? (_submitting ? 'Sending…' : 'Submit offer') : 'Review', style: GoogleFonts.jost(color: ModaireColors.cream, fontWeight: FontWeight.w500)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
