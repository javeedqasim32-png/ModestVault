import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/admin/admin_repository.dart';
import '../../../core/api/api_exception.dart';
import '../../../shared/utils/asset_url.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

/// 4-tab listings moderation queue. Mirrors AdminListingsClient.tsx:
/// PENDING / APPROVED / PARTIAL_APPROVED / REJECTED with per-row
/// approve / partial / reject (with reason) / feature actions.
class AdminListingsScreen extends ConsumerStatefulWidget {
  const AdminListingsScreen({super.key});

  @override
  ConsumerState<AdminListingsScreen> createState() =>
      _AdminListingsScreenState();
}

class _AdminListingsScreenState extends ConsumerState<AdminListingsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController =
      TabController(length: 4, vsync: this);

  static const _statuses = [
    'PENDING',
    'APPROVED',
    'PARTIAL_APPROVED',
    'REJECTED',
  ];

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFFBF8F4),
      appBar: ModaireAppBar(
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(44),
          child: DecoratedBox(
            decoration: const BoxDecoration(
              border: Border(
                bottom: BorderSide(color: Color(0xFFDDD3CB)),
              ),
            ),
            child: TabBar(
              controller: _tabController,
              isScrollable: true,
              labelPadding: const EdgeInsets.symmetric(horizontal: 16),
              indicatorColor: const Color(0xFF4A3328),
              indicatorWeight: 2,
              indicatorSize: TabBarIndicatorSize.label,
              labelColor: const Color(0xFF2F2925),
              unselectedLabelColor: const Color(0xFF8A7667),
              labelStyle: GoogleFonts.jost(
                  fontSize: 14, fontWeight: FontWeight.w600),
              unselectedLabelStyle: GoogleFonts.jost(
                  fontSize: 14, fontWeight: FontWeight.w400),
              tabs: const [
                Tab(height: 44, text: 'Pending'),
                Tab(height: 44, text: 'Approved'),
                Tab(height: 44, text: 'Partial'),
                Tab(height: 44, text: 'Rejected'),
              ],
            ),
          ),
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: _statuses
            .map((s) => _ModerationList(status: s))
            .toList(),
      ),
    );
  }
}

class _ModerationList extends ConsumerWidget {
  const _ModerationList({required this.status});
  final String status;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminListingsProvider(status));
    return RefreshIndicator(
      color: ModaireColors.espresso,
      backgroundColor: ModaireColors.cream,
      onRefresh: () async {
        ref.invalidate(adminListingsProvider(status));
        await ref.read(adminListingsProvider(status).future);
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
                style: GoogleFonts.jost(
                  fontSize: 13,
                  color: const Color(0xFF8A7667),
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ),
        data: (listings) {
          if (listings.isEmpty) {
            return ListView(
              children: [
                const SizedBox(height: 120),
                Center(
                  child: Text(
                    'Nothing here.',
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
            itemCount: listings.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, i) =>
                _ModerationRow(listing: listings[i], status: status),
          );
        },
      ),
    );
  }
}

class _ModerationRow extends ConsumerStatefulWidget {
  const _ModerationRow({required this.listing, required this.status});
  final AdminListing listing;
  final String status;

  @override
  ConsumerState<_ModerationRow> createState() => _ModerationRowState();
}

class _ModerationRowState extends ConsumerState<_ModerationRow> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() op) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await op();
      ref.invalidate(adminListingsProvider(widget.status));
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String?> _promptReason() async {
    final ctrl = TextEditingController();
    final reason = await showDialog<String?>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFFFBF8F5),
        title: Text(
          'Reject listing',
          style: GoogleFonts.cormorantGaramond(
            fontSize: 20,
            fontWeight: FontWeight.w600,
            color: const Color(0xFF2F2925),
          ),
        ),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          maxLines: 4,
          decoration: InputDecoration(
            hintText: 'Reason (optional, shown to the seller)',
            hintStyle: GoogleFonts.jost(
              fontSize: 13,
              color: const Color(0xFFB3A698),
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFDDD3CB)),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(null),
            child: Text(
              'Cancel',
              style: GoogleFonts.jost(color: const Color(0xFF8A7667)),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(ctrl.text.trim()),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFB91C1C),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
    return reason;
  }

  Future<void> _showActions() async {
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _ActionsSheet(listing: widget.listing),
    );
    if (action == null) return;
    final repo = ref.read(adminRepositoryProvider);
    switch (action) {
      case 'approve':
        await _run(() => repo.approve(widget.listing.id));
        break;
      case 'approve_and_feature':
        await _run(() => repo.approve(widget.listing.id, feature: true));
        break;
      case 'partial':
        await _run(() => repo.partialApprove(widget.listing.id));
        break;
      case 'reject':
        final reason = await _promptReason();
        if (reason == null) return;
        await _run(() => repo.reject(widget.listing.id,
            reason: reason.isEmpty ? null : reason));
        break;
      case 'toggle_feature':
        await _run(() =>
            repo.setFeatured(widget.listing.id, !widget.listing.isFeatured));
        break;
      case 'edit_photos':
        if (!mounted) return;
        context.push(
            '/account/admin/listings/${widget.listing.id}/images');
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = widget.listing;
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
                borderRadius: BorderRadius.circular(17),
                child: Container(
                  width: 96,
                  height: 144,
                  color: const Color(0xFFF2EBE4),
                  child: CachedNetworkImage(
                    imageUrl: resolveAssetUrl(l.mediumUrl),
                    fit: BoxFit.cover,
                    placeholder: (_, __) =>
                        Container(color: const Color(0xFFF2EBE4)),
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
                      l.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.jost(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        height: 1.2,
                        color: const Color(0xFF2F2925),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      l.sellerName.isEmpty ? 'Unknown seller' : l.sellerName,
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        color: const Color(0xFF8A7667),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '\$${l.price.toStringAsFixed(0)}',
                      style: GoogleFonts.jost(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        height: 1.0,
                        color: const Color(0xFF2F2925),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        _statusPill(l.moderationStatus),
                        if (l.isFeatured) _featuredPill(),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (l.rejectionReason != null && l.rejectionReason!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              'Reason: ${l.rejectionReason!}',
              style: GoogleFonts.jost(
                fontSize: 13,
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

  Widget _statusPill(String s) {
    late final Color bg;
    late final Color fg;
    late final String label;
    switch (s) {
      case 'APPROVED':
        bg = const Color(0xFFD1FADF);
        fg = const Color(0xFF067647);
        label = 'Approved';
        break;
      case 'PARTIAL_APPROVED':
        bg = const Color(0xFFDBEAFE);
        fg = const Color(0xFF1D4ED8);
        label = 'Partial';
        break;
      case 'REJECTED':
        bg = const Color(0xFFFEE2E2);
        fg = const Color(0xFFB91C1C);
        label = 'Rejected';
        break;
      default:
        bg = const Color(0xFFFEF3C7);
        fg = const Color(0xFF92400E);
        label = 'Pending';
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

  Widget _featuredPill() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: const Color(0xFFEDE2D5),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(LucideIcons.star, size: 12, color: Color(0xFF7A5A45)),
          const SizedBox(width: 4),
          Text(
            'Featured',
            style: GoogleFonts.jost(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: const Color(0xFF7A5A45),
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionsSheet extends StatelessWidget {
  const _ActionsSheet({required this.listing});
  final AdminListing listing;

  @override
  Widget build(BuildContext context) {
    final isApproved = listing.moderationStatus == 'APPROVED';
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
          _SheetAction(
            icon: LucideIcons.check,
            label: 'Approve',
            color: const Color(0xFF067647),
            onTap: () => Navigator.of(context).pop('approve'),
          ),
          _SheetAction(
            icon: LucideIcons.star,
            label: 'Approve + feature',
            color: const Color(0xFF7A5A45),
            onTap: () => Navigator.of(context).pop('approve_and_feature'),
          ),
          _SheetAction(
            icon: LucideIcons.circleAlert,
            label: 'Partial approve (Explore only)',
            color: const Color(0xFF1D4ED8),
            onTap: () => Navigator.of(context).pop('partial'),
          ),
          if (isApproved)
            _SheetAction(
              icon: listing.isFeatured ? LucideIcons.starOff : LucideIcons.star,
              label: listing.isFeatured ? 'Unfeature' : 'Feature',
              color: const Color(0xFF7A5A45),
              onTap: () => Navigator.of(context).pop('toggle_feature'),
            ),
          _SheetAction(
            icon: LucideIcons.images,
            label: 'Edit photo order',
            color: const Color(0xFF4A3328),
            onTap: () => Navigator.of(context).pop('edit_photos'),
          ),
          _SheetAction(
            icon: LucideIcons.x,
            label: 'Reject',
            color: const Color(0xFFB91C1C),
            onTap: () => Navigator.of(context).pop('reject'),
          ),
        ],
      ),
    );
  }
}

class _SheetAction extends StatelessWidget {
  const _SheetAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final Color color;
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
