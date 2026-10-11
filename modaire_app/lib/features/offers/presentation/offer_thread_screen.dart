import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/offers/offer_models.dart';
import '../../../core/offers/offer_repository.dart';

class OfferThreadScreen extends ConsumerStatefulWidget {
  const OfferThreadScreen({super.key, required this.offerId});
  final String offerId;

  @override
  ConsumerState<OfferThreadScreen> createState() => _OfferThreadScreenState();
}

class _OfferThreadScreenState extends ConsumerState<OfferThreadScreen> {
  OfferThread? _offer;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final t = await ref.read(offerRepositoryProvider).thread(widget.offerId);
      if (mounted) setState(() { _offer = t; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = 'Couldn\'t load this offer.'; });
    }
  }

  Future<void> _act(Future<OfferThread> Function() fn) async {
    setState(() { _busy = true; _error = null; });
    try {
      final t = await fn();
      if (mounted) setState(() { _offer = t; _busy = false; });
    } on ApiException catch (e) {
      if (mounted) setState(() { _error = e.message; _busy = false; });
    } catch (_) {
      if (mounted) setState(() { _error = 'Something went wrong.'; _busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ModaireColors.browsePageBg,
      appBar: AppBar(
        backgroundColor: ModaireColors.browsePageBg,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text('Offer', style: GoogleFonts.jost(fontWeight: FontWeight.w600, color: ModaireColors.espressoText)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: ModaireColors.espresso, strokeWidth: 2))
          : _offer == null
              ? Center(child: Text(_error ?? 'Not found', style: GoogleFonts.jost(color: ModaireColors.tileTextSubtle)))
              : _body(_offer!),
    );
  }

  Widget _body(OfferThread o) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Listing header
        InkWell(
          onTap: () => context.push('/listings/${o.listing.id}'),
          child: Row(
            children: [
              if (o.listing.imageUrl != null)
                ClipRRect(borderRadius: BorderRadius.circular(8), child: CachedNetworkImage(imageUrl: o.listing.imageUrl!, width: 60, height: 60, fit: BoxFit.cover)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(o.listing.title, style: GoogleFonts.jost(fontWeight: FontWeight.w500, color: ModaireColors.espressoText)),
                    Text('Asking \$${o.listing.price?.toStringAsFixed(2)}', style: GoogleFonts.jost(fontSize: 13, color: ModaireColors.tileTextSubtle)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Current state
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: ModaireColors.pillBg, borderRadius: BorderRadius.circular(12), border: Border.all(color: ModaireColors.tileBorder)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(_statusLabel(o.status), style: GoogleFonts.jost(fontWeight: FontWeight.w600, color: ModaireColors.espressoText)),
                  if (o.isActive && o.expiresAt != null) _Countdown(deadline: o.expiresAt!),
                  if (o.awaitingPayment && o.payWindowExpiresAt != null) _Countdown(deadline: o.payWindowExpiresAt!, label: 'Pay within'),
                ],
              ),
              const SizedBox(height: 6),
              Text('\$${o.currentAmount?.toStringAsFixed(2)}', style: GoogleFonts.cormorantGaramond(fontSize: 30, fontWeight: FontWeight.w600, color: ModaireColors.detailPrice)),
              if (o.isActive)
                Text(o.isMyTurn ? 'It\'s your turn to respond.' : 'Waiting on the ${o.currentTurn == 'SELLER' ? 'seller' : 'buyer'}.',
                    style: GoogleFonts.jost(fontSize: 13, color: ModaireColors.tileTextSubtle)),
            ],
          ),
        ),

        if (_error != null) ...[const SizedBox(height: 12), Text(_error!, style: GoogleFonts.jost(color: ModaireColors.destructive))],

        // Actions
        if (o.awaitingPayment) ...[
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity, height: 48,
            child: ElevatedButton(
              onPressed: () => context.push('/checkout?items=${o.listing.id}'),
              style: ElevatedButton.styleFrom(backgroundColor: ModaireColors.espresso, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99))),
              child: Text('Pay now — \$${o.currentAmount?.toStringAsFixed(2)}', style: GoogleFonts.jost(color: ModaireColors.cream, fontWeight: FontWeight.w600)),
            ),
          ),
        ],

        if (o.isMyTurn) ...[
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: _actionBtn('Accept', filled: true, onTap: _busy ? null : () => _act(() => ref.read(offerRepositoryProvider).accept(o.id)))),
            const SizedBox(width: 8),
            Expanded(child: _actionBtn('Counter', onTap: _busy ? null : () => _openCounter(o))),
            const SizedBox(width: 8),
            Expanded(child: _actionBtn('Decline', subtle: true, onTap: _busy ? null : () => _act(() => ref.read(offerRepositoryProvider).reject(o.id)))),
          ]),
        ],

        if (o.isActive && o.viewerRole == 'BUYER' && !o.isMyTurn) ...[
          const SizedBox(height: 12),
          TextButton(onPressed: _busy ? null : () => _act(() => ref.read(offerRepositoryProvider).withdraw(o.id)),
              child: Text('Withdraw offer', style: GoogleFonts.jost(color: ModaireColors.tileTextSubtle, decoration: TextDecoration.underline))),
        ],

        // History
        const SizedBox(height: 24),
        Text('History', style: GoogleFonts.jost(fontWeight: FontWeight.w600, color: ModaireColors.espressoText)),
        const SizedBox(height: 8),
        ...o.events.map((e) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Flexible(child: Text('${_eventLabel(e.actor, e.type)}${e.amount != null ? ' — \$${e.amount!.toStringAsFixed(2)}' : ''}',
                      style: GoogleFonts.jost(fontSize: 13, color: ModaireColors.espressoText))),
                  Text(_time(e.createdAt), style: GoogleFonts.jost(fontSize: 12, color: ModaireColors.tileTextSubtle)),
                ],
              ),
            )),
      ],
    );
  }

  Widget _actionBtn(String label, {bool filled = false, bool subtle = false, VoidCallback? onTap}) {
    if (filled) {
      return SizedBox(height: 44, child: ElevatedButton(onPressed: onTap, style: ElevatedButton.styleFrom(backgroundColor: ModaireColors.espresso, padding: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99))), child: Text(label, style: GoogleFonts.jost(fontSize: 13, color: ModaireColors.cream, fontWeight: FontWeight.w500))));
    }
    return SizedBox(height: 44, child: OutlinedButton(onPressed: onTap, style: OutlinedButton.styleFrom(side: BorderSide(color: subtle ? ModaireColors.border : ModaireColors.espresso), padding: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99))), child: Text(label, style: GoogleFonts.jost(fontSize: 13, color: subtle ? ModaireColors.tileTextSubtle : ModaireColors.espresso, fontWeight: FontWeight.w500))));
  }

  void _openCounter(OfferThread o) {
    final ctrl = TextEditingController();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.viewInsetsOf(sheetCtx).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Your counteroffer', style: GoogleFonts.jost(fontSize: 16, fontWeight: FontWeight.w600, color: ModaireColors.espressoText)),
            const SizedBox(height: 12),
            TextField(controller: ctrl, autofocus: true, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(prefixText: '\$ ', hintText: '0.00', enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: ModaireColors.border)), focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: ModaireColors.espresso)))),
            const SizedBox(height: 16),
            SizedBox(width: double.infinity, height: 46, child: ElevatedButton(
              onPressed: () {
                final amt = double.tryParse(ctrl.text.trim()) ?? 0;
                if (amt <= 0) return;
                Navigator.of(sheetCtx).pop();
                _act(() => ref.read(offerRepositoryProvider).counter(o.id, amt));
              },
              style: ElevatedButton.styleFrom(backgroundColor: ModaireColors.espresso, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99))),
              child: Text('Send counter', style: GoogleFonts.jost(color: ModaireColors.cream, fontWeight: FontWeight.w500)),
            )),
          ],
        ),
      ),
    );
  }
}

String _statusLabel(String s) => const {
      'PENDING': 'Pending — awaiting response', 'COUNTERED': 'Countered', 'ACCEPTED': 'Accepted',
      'REJECTED': 'Declined', 'EXPIRED': 'Expired', 'WITHDRAWN': 'Withdrawn', 'COMPLETED': 'Purchased',
    }[s] ?? s;

String _eventLabel(String actor, String type) {
  final who = actor == 'BUYER' ? 'Buyer' : actor == 'SELLER' ? 'Seller' : 'System';
  final act = const {'OFFER': 'made an offer', 'COUNTER': 'countered', 'ACCEPT': 'accepted', 'REJECT': 'declined', 'WITHDRAW': 'withdrew', 'EXPIRE': 'expired', 'PAID': 'paid'}[type] ?? type;
  return '$who $act';
}

String _time(DateTime? d) {
  if (d == null) return '';
  final l = d.toLocal();
  return '${l.month}/${l.day} ${l.hour.toString().padLeft(2, '0')}:${l.minute.toString().padLeft(2, '0')}';
}

class _Countdown extends StatefulWidget {
  const _Countdown({required this.deadline, this.label});
  final DateTime deadline;
  final String? label;

  @override
  State<_Countdown> createState() => _CountdownState();
}

class _CountdownState extends State<_Countdown> {
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ms = widget.deadline.difference(DateTime.now()).inMilliseconds;
    final prefix = widget.label != null ? '${widget.label}: ' : '';
    if (ms <= 0) {
      return Text('${prefix}expired', style: GoogleFonts.jost(fontSize: 13, color: ModaireColors.destructive));
    }
    final s = ms ~/ 1000;
    final h = s ~/ 3600, m = (s % 3600) ~/ 60, sec = s % 60;
    final text = h >= 1 ? '${h}h ${m}m' : m >= 1 ? '${m}m ${sec}s' : '${sec}s';
    final urgent = ms < 3600000;
    return Text('$prefix$text left', style: GoogleFonts.jost(fontSize: 13, color: urgent ? ModaireColors.destructive : ModaireColors.tileTextSubtle));
  }
}
