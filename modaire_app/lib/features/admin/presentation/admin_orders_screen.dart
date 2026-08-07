import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/admin/admin_repository.dart';
import '../../../core/api/api_exception.dart';
import '../../../shared/utils/asset_url.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

/// Admin orders list — every order in the system with shipping +
/// refund actions per row. Mirrors AdminOrdersClient on the website.
class AdminOrdersScreen extends ConsumerWidget {
  const AdminOrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminOrdersProvider);
    return Scaffold(
      backgroundColor: const Color(0xFFFBF8F4),
      appBar: const ModaireAppBar(),
      body: RefreshIndicator(
        color: ModaireColors.espresso,
        backgroundColor: ModaireColors.cream,
        onRefresh: () async {
          ref.invalidate(adminOrdersProvider);
          await ref.read(adminOrdersProvider.future);
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
                  style: GoogleFonts.jost(
                    fontSize: 13,
                    color: const Color(0xFF8A7667),
                  ),
                ),
              ),
            ],
          ),
          data: (orders) {
            if (orders.isEmpty) {
              return ListView(
                children: [
                  const SizedBox(height: 120),
                  Center(
                    child: Text(
                      'No orders yet.',
                      style: GoogleFonts.jost(
                        fontSize: 14,
                        color: const Color(0xFF8A7667),
                      ),
                    ),
                  ),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              itemCount: orders.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, i) =>
                  _OrderRow(order: orders[i]),
            );
          },
        ),
      ),
    );
  }
}

class _OrderRow extends ConsumerStatefulWidget {
  const _OrderRow({required this.order});
  final AdminOrder order;

  @override
  ConsumerState<_OrderRow> createState() => _OrderRowState();
}

class _OrderRowState extends ConsumerState<_OrderRow> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() op) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await op();
      ref.invalidate(adminOrdersProvider);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _showActions() async {
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _OrderActionsSheet(order: widget.order),
    );
    if (action == null) return;
    final repo = ref.read(adminRepositoryProvider);
    switch (action) {
      case 'mark_shipped':
        await _run(() => repo.updateShipping(widget.order.id,
            shippingStatus: 'SHIPPED'));
        break;
      case 'mark_delivered':
        await _run(() => repo.updateShipping(widget.order.id,
            shippingStatus: 'DELIVERED'));
        break;
      case 'edit_tracking':
        await _editTracking();
        break;
      case 'refund':
        await _showRefundSheet();
        break;
    }
  }

  Future<void> _editTracking() async {
    final order = widget.order;
    final carrierCtrl = TextEditingController(text: order.carrier ?? '');
    final trackingCtrl =
        TextEditingController(text: order.trackingNumber ?? '');
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFFFBF8F5),
        title: Text(
          'Tracking details',
          style: GoogleFonts.cormorantGaramond(
            fontSize: 20,
            fontWeight: FontWeight.w600,
            color: const Color(0xFF2F2925),
          ),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: carrierCtrl,
              decoration: InputDecoration(
                labelText: 'Carrier',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: trackingCtrl,
              decoration: InputDecoration(
                labelText: 'Tracking number',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(
              'Cancel',
              style: GoogleFonts.jost(color: const Color(0xFF8A7667)),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF4A3328),
              foregroundColor: Colors.white,
            ),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (saved != true) return;
    await _run(() => ref.read(adminRepositoryProvider).updateShipping(
          widget.order.id,
          carrier: carrierCtrl.text.trim(),
          trackingNumber: trackingCtrl.text.trim(),
        ));
  }

  Future<void> _showRefundSheet() async {
    final result = await showModalBottomSheet<_RefundResult>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => const _RefundSheet(),
    );
    if (result == null) return;
    await _run(() => ref.read(adminRepositoryProvider).refund(
          widget.order.id,
          reason: result.reason,
          note: result.note,
        ));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Refund issued')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.order;
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFFBF8F5),
        borderRadius: BorderRadius.circular(23),
        border: Border.all(color: const Color(0xFFDDD3CB)),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  width: 76,
                  height: 100,
                  color: const Color(0xFFF2EBE4),
                  child: CachedNetworkImage(
                    imageUrl: resolveAssetUrl(o.listing.mediumUrl),
                    fit: BoxFit.cover,
                    errorWidget: (_, __, ___) =>
                        Container(color: const Color(0xFFF2EBE4)),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      o.listing.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.jost(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        height: 1.2,
                        color: const Color(0xFF2F2925),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Buyer: ${o.buyer?.displayName ?? '—'}',
                      style: GoogleFonts.jost(
                        fontSize: 12,
                        color: const Color(0xFF8A7667),
                      ),
                    ),
                    Text(
                      'Seller: ${o.seller.displayName}',
                      style: GoogleFonts.jost(
                        fontSize: 12,
                        color: const Color(0xFF8A7667),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '\$${o.amount.toStringAsFixed(0)}',
                      style: GoogleFonts.jost(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFF2F2925),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        _statusPill(o),
                        if (o.trackingNumber != null &&
                            o.trackingNumber!.isNotEmpty)
                          _trackPill(o),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (o.isRefunded) ...[
            const SizedBox(height: 10),
            Text(
              'Refunded${o.refundReason != null ? ' · ${o.refundReason}' : ''}',
              style: GoogleFonts.jost(
                fontSize: 12,
                color: const Color(0xFFB91C1C),
              ),
            ),
          ],
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 40,
            child: OutlinedButton.icon(
              onPressed: _busy ? null : _showActions,
              icon: _busy
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(
                        color: Color(0xFF4A3328),
                        strokeWidth: 2,
                      ),
                    )
                  : const Icon(LucideIcons.chevronDown,
                      size: 16, color: Color(0xFF4A3328)),
              label: Text(
                _busy ? 'Working…' : 'Actions',
                style: GoogleFonts.jost(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF4A3328),
                ),
              ),
              style: OutlinedButton.styleFrom(
                backgroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(99),
                ),
                side: const BorderSide(color: Color(0xFFD7CDC4)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _statusPill(AdminOrder o) {
    Color bg;
    Color fg;
    String label;
    if (o.isRefunded) {
      bg = const Color(0xFFFEE2E2);
      fg = const Color(0xFFB91C1C);
      label = o.orderStatus == 'CANCELLED' ? 'Cancelled' : 'Refunded';
    } else if (o.shippingStatus == 'DELIVERED') {
      bg = const Color(0xFFD1FADF);
      fg = const Color(0xFF067647);
      label = 'Delivered';
    } else if (o.shippingStatus == 'SHIPPED') {
      bg = const Color(0xFFDBEAFE);
      fg = const Color(0xFF1D4ED8);
      label = 'Shipped';
    } else {
      bg = const Color(0xFFFEF3C7);
      fg = const Color(0xFF92400E);
      label = 'Processing';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label,
        style: GoogleFonts.jost(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: fg,
        ),
      ),
    );
  }

  Widget _trackPill(AdminOrder o) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: const Color(0xFFFBF8F5),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: const Color(0xFFDDD3CB)),
      ),
      child: Text(
        '${o.carrier ?? "Carrier"} · ${o.trackingNumber}',
        style: GoogleFonts.jost(
          fontSize: 11,
          color: const Color(0xFF5F4A3C),
        ),
      ),
    );
  }
}

class _OrderActionsSheet extends StatelessWidget {
  const _OrderActionsSheet({required this.order});
  final AdminOrder order;

  @override
  Widget build(BuildContext context) {
    final canShip = order.shippingStatus != 'SHIPPED' &&
        order.shippingStatus != 'DELIVERED' &&
        !order.isRefunded;
    final canDeliver = order.shippingStatus != 'DELIVERED' && !order.isRefunded;
    final canRefund = !order.isRefunded;
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFFFBF8F5),
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: const Color(0xFFDDD3CB),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (canShip)
            _SheetItem(
              icon: LucideIcons.package,
              color: const Color(0xFF1D4ED8),
              label: 'Mark shipped',
              onTap: () => Navigator.of(context).pop('mark_shipped'),
            ),
          if (canDeliver)
            _SheetItem(
              icon: LucideIcons.circleCheckBig,
              color: const Color(0xFF067647),
              label: 'Mark delivered',
              onTap: () => Navigator.of(context).pop('mark_delivered'),
            ),
          _SheetItem(
            icon: LucideIcons.truck,
            color: const Color(0xFF7A5A45),
            label: 'Edit carrier / tracking',
            onTap: () => Navigator.of(context).pop('edit_tracking'),
          ),
          if (canRefund)
            _SheetItem(
              icon: LucideIcons.banknote,
              color: const Color(0xFFB91C1C),
              label: 'Issue refund',
              onTap: () => Navigator.of(context).pop('refund'),
            ),
        ],
      ),
    );
  }
}

class _SheetItem extends StatelessWidget {
  const _SheetItem({
    required this.icon,
    required this.color,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final Color color;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
        child: Row(
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                label,
                style: GoogleFonts.jost(
                  fontSize: 15,
                  color: const Color(0xFF2F2925),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RefundResult {
  const _RefundResult({required this.reason, this.note});
  final String reason;
  final String? note;
}

class _RefundSheet extends StatefulWidget {
  const _RefundSheet();

  @override
  State<_RefundSheet> createState() => _RefundSheetState();
}

class _RefundSheetState extends State<_RefundSheet> {
  ModaireRefundReason _selected = kModaireRefundReasons.first;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xFFFBF8F5),
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFDDD3CB),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Text(
              'Issue refund',
              style: GoogleFonts.cormorantGaramond(
                fontSize: 22,
                fontWeight: FontWeight.w600,
                color: const Color(0xFF2F2925),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Full refund to buyer. Reverses seller transfer if already released.',
              style: GoogleFonts.jost(
                fontSize: 12,
                color: const Color(0xFF8A7667),
              ),
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<ModaireRefundReason>(
              initialValue: _selected,
              isExpanded: true,
              items: kModaireRefundReasons
                  .map((r) => DropdownMenuItem(
                        value: r,
                        child: Text(
                          r.label,
                          style: GoogleFonts.jost(
                            fontSize: 14,
                            color: const Color(0xFF2F2925),
                          ),
                        ),
                      ))
                  .toList(),
              onChanged: (v) {
                if (v != null) setState(() => _selected = v);
              },
              decoration: InputDecoration(
                labelText: 'Reason',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _note,
              maxLines: 3,
              decoration: InputDecoration(
                labelText:
                    'Note${_selected.requiresNote ? " (required for Other)" : " (optional)"}',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              height: 46,
              child: ElevatedButton(
                onPressed: () {
                  final note = _note.text.trim();
                  if (_selected.requiresNote && note.isEmpty) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                          content: Text(
                              'A note is required when the reason is Other.')),
                    );
                    return;
                  }
                  Navigator.of(context).pop(_RefundResult(
                    reason: _selected.value,
                    note: note.isEmpty ? null : note,
                  ));
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFB91C1C),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
                child: Text(
                  'Issue refund',
                  style: GoogleFonts.jost(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
