import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/notifications/notification_repository.dart';
import '../../../core/seller/sale_models.dart';
import '../../../core/seller/sales_repository.dart';
import '../../../core/seller/seller_models.dart';
import '../../../core/seller/seller_repository.dart';
import '../../../shared/utils/asset_url.dart';
import '../../../shared/widgets/modaire_app_bar.dart';
import 'package:url_launcher/url_launcher.dart';

/// Sell tab. Mirrors the website's /sell page tab structure:
/// Active / Pending / Sold / Drafts. Drafts come from a separate
/// endpoint; the other three are buckets the backend tags on each
/// listing row so the client doesn't have to know moderation rules.
class SellPlaceholderScreen extends ConsumerStatefulWidget {
  const SellPlaceholderScreen({super.key, this.initialTab});

  /// Optional deep-link from elsewhere in the app — e.g. the Account
  /// hub's "Purchase history" row points sellers at the Sold tab.
  /// Accepted values: `active`, `pending`, `sold`, `draft`, `insights`.
  final String? initialTab;

  @override
  ConsumerState<SellPlaceholderScreen> createState() =>
      _SellPlaceholderScreenState();
}

class _SellPlaceholderScreenState extends ConsumerState<SellPlaceholderScreen>
    with SingleTickerProviderStateMixin {
  // Tab indices (kept aligned with the TabBarView children order below).
  static const int _kActiveIndex = 0;
  static const int _kPendingIndex = 1;
  static const int _kSoldIndex = 2;
  static const int _kDraftIndex = 3;
  static const int _kInsightsIndex = 4;

  late final TabController _tabController = TabController(
    length: 5,
    vsync: this,
    initialIndex: _indexFor(widget.initialTab),
  )..addListener(_onTabChanged);

  int _indexFor(String? tab) {
    switch (tab) {
      case 'pending':
        return _kPendingIndex;
      case 'sold':
        return _kSoldIndex;
      case 'draft':
      case 'drafts':
        return _kDraftIndex;
      case 'insights':
        return _kInsightsIndex;
      case 'active':
      default:
        return _kActiveIndex;
    }
  }

  Future<void> _onTabChanged() async {
    if (_tabController.indexIsChanging) return;
    final i = _tabController.index;
    String? type;
    if (i == _kSoldIndex) {
      type = kSoldNotificationType;
    } else if (i == _kPendingIndex) {
      type = kRejectedNotificationType;
    }
    if (type == null) return;
    // Clear the badge for this type. Best-effort; we invalidate the
    // counts provider so the dot disappears regardless of API latency.
    try {
      await ref.read(notificationRepositoryProvider).markRead(type: type);
    } catch (_) {
      // Network failure leaves the dot up; user can refresh later.
    }
    if (!mounted) return;
    ref.invalidate(sellTabBadgesProvider);
  }

  @override
  void dispose() {
    _tabController.removeListener(_onTabChanged);
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final listingsAsync = ref.watch(sellerListingsProvider);
    final draftsAsync = ref.watch(sellerDraftsProvider);
    final badgeCounts = ref.watch(sellTabBadgesProvider).valueOrNull ??
        const <String, int>{};

    return Scaffold(
      backgroundColor: ModaireColors.browsePageBg,
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
              // Equal-width, all 5 visible. Matches the website's
              // `flex justify-evenly` row.
              isScrollable: false,
              labelPadding: const EdgeInsets.symmetric(horizontal: 4),
              indicatorColor: const Color(0xFF4A3328),
              indicatorWeight: 2,
              indicatorSize: TabBarIndicatorSize.label,
              labelColor: const Color(0xFF2F2925),
              unselectedLabelColor: const Color(0xFF8A7667),
              labelStyle:
                  GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w600),
              unselectedLabelStyle:
                  GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w400),
              tabs: _tabLabels(badgeCounts),
            ),
          ),
        ),
      ),
      // Circular FAB at bottom-right, matches the website's mobile
      // pattern (h-14 w-14, #7a5a45 bg, white +, drop shadow).
      floatingActionButton: SizedBox(
        width: 56,
        height: 56,
        child: FloatingActionButton(
          backgroundColor: const Color(0xFF7A5A45),
          foregroundColor: Colors.white,
          onPressed: () => context.push('/sell/create'),
          elevation: 6,
          shape: const CircleBorder(),
          child: const Icon(LucideIcons.plus, size: 26),
        ),
      ),
      body: RefreshIndicator(
        color: ModaireColors.espresso,
        backgroundColor: ModaireColors.cream,
        onRefresh: () async {
          ref.invalidate(sellerListingsProvider);
          ref.invalidate(sellerDraftsProvider);
          ref.invalidate(sellerSalesProvider);
          await Future.wait([
            ref.read(sellerListingsProvider.future),
            ref.read(sellerDraftsProvider.future),
            ref.read(sellerSalesProvider.future),
          ]);
        },
        child: TabBarView(
          controller: _tabController,
          children: [
            _BucketView(
              listingsAsync: listingsAsync,
              bucket: SellerBucket.active,
              emptyLabel: 'No active listings.',
            ),
            _BucketView(
              listingsAsync: listingsAsync,
              bucket: SellerBucket.pending,
              emptyLabel: 'Nothing waiting on moderation.',
            ),
            const _SalesView(),
            _DraftsView(draftsAsync: draftsAsync),
            const _InsightsView(),
          ],
        ),
      ),
    );
  }

  /// Tabs render with optional red-dot unread-count badges. Per the
  /// website's `tabBadgeCount`, badges only appear on Sold (ITEM_SOLD)
  /// and Pending (LISTING_REJECTED). Active / Draft / Insights never
  /// show a badge — they're navigational, not event surfaces.
  List<Widget> _tabLabels(Map<String, int> badgeCounts) {
    Widget tab(String label, int badge) => Tab(
          height: 44,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(label),
              if (badge > 0) ...[
                const SizedBox(width: 6),
                Container(
                  constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                  padding: const EdgeInsets.symmetric(horizontal: 5),
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    color: Color(0xFFEF4444),
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    badge > 99 ? '99+' : '$badge',
                    style: GoogleFonts.jost(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ],
          ),
        );

    return [
      tab('Active', 0),
      tab('Pending', badgeCounts[kRejectedNotificationType] ?? 0),
      tab('Sold', badgeCounts[kSoldNotificationType] ?? 0),
      tab('Draft', 0),
      tab('Insights', 0),
    ];
  }
}

class _InsightsView extends ConsumerWidget {
  const _InsightsView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final analyticsAsync = ref.watch(sellerAnalyticsProvider);
    return RefreshIndicator(
      color: ModaireColors.espresso,
      backgroundColor: ModaireColors.cream,
      onRefresh: () async {
        ref.invalidate(sellerAnalyticsProvider);
        await ref.read(sellerAnalyticsProvider.future);
      },
      child: analyticsAsync.when(
        loading: () => const _LoadingList(),
        error: (e, _) => _ErrorList(message: e.toString()),
        data: (a) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
          children: [
            Text(
              'Insights',
              style: GoogleFonts.cormorantGaramond(
                fontSize: 22,
                fontWeight: FontWeight.w500,
                height: 1.05,
                color: ModaireColors.tileTextPrimary,
              ),
            ),
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              // Wider/shorter cells so each card hugs its content
              // (label · value · caption) instead of leaving slack space.
              childAspectRatio: 1.85,
              children: [
                _StatCard(
                  label: 'Total Listings',
                  value: '${a.totalListings}',
                  caption: 'All time',
                ),
                _StatCard(
                  label: 'Revenue',
                  value: '\$${a.deliveredRevenue.toStringAsFixed(2)}',
                  caption: 'From sold',
                ),
                _StatCard(
                  label: 'Active',
                  value: '${a.activeListings}',
                  caption: 'Live now',
                ),
                _StatCard(
                  label: 'Avg Price',
                  value: '\$${a.averagePrice.toStringAsFixed(2)}',
                  caption: 'All listings',
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              decoration: BoxDecoration(
                color: const Color(0xFFF8F3EE),
                borderRadius: BorderRadius.circular(26),
                border: Border.all(color: const Color(0xFFE3DBD3)),
              ),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'STATUS BREAKDOWN',
                    style: GoogleFonts.jost(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1.8,
                      color: const Color(0xFF8A7667),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      _BreakdownPill(label: 'Active', count: a.activeListings),
                      _BreakdownPill(label: 'Sold', count: a.soldListings),
                      _BreakdownPill(
                          label: 'Pending', count: a.pendingListings),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.caption,
  });
  final String label;
  final String value;
  final String caption;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFF8F3EE),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE3DBD3)),
      ),
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label.toUpperCase(),
            style: GoogleFonts.jost(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.8,
              color: const Color(0xFF8A7667),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: GoogleFonts.cormorantGaramond(
              fontSize: 28,
              fontWeight: FontWeight.w500,
              height: 1.0,
              color: ModaireColors.tileTextPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            caption,
            style: GoogleFonts.jost(
              fontSize: 12,
              color: const Color(0xFF8A7667),
            ),
          ),
        ],
      ),
    );
  }
}

class _BreakdownPill extends StatelessWidget {
  const _BreakdownPill({required this.label, required this.count});
  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFFBF8F5),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: const Color(0xFFDDD3CB)),
      ),
      child: Text(
        '$label: $count',
        style: GoogleFonts.jost(
          fontSize: 13,
          color: const Color(0xFF5F4A3C),
        ),
      ),
    );
  }
}

class _BucketView extends StatelessWidget {
  const _BucketView({
    required this.listingsAsync,
    required this.bucket,
    required this.emptyLabel,
  });

  final AsyncValue<List<SellerListing>> listingsAsync;
  final SellerBucket bucket;
  final String emptyLabel;

  @override
  Widget build(BuildContext context) {
    return listingsAsync.when(
      loading: () => const _LoadingList(),
      error: (e, _) => _ErrorList(message: e.toString()),
      data: (all) {
        final filtered = all.where((l) => l.bucket == bucket).toList();
        if (filtered.isEmpty) return _EmptyList(label: emptyLabel);
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
          itemCount: filtered.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (context, i) => _ListingRow(listing: filtered[i]),
        );
      },
    );
  }
}

class _DraftsView extends StatelessWidget {
  const _DraftsView({required this.draftsAsync});
  final AsyncValue<List<SellerDraft>> draftsAsync;

  @override
  Widget build(BuildContext context) {
    return draftsAsync.when(
      loading: () => const _LoadingList(),
      error: (e, _) => _ErrorList(message: e.toString()),
      data: (drafts) {
        if (drafts.isEmpty) {
          return const _EmptyList(label: 'No drafts saved.');
        }
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
          itemCount: drafts.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (context, i) => _DraftRow(draft: drafts[i]),
        );
      },
    );
  }
}

class _ListingRow extends ConsumerStatefulWidget {
  const _ListingRow({required this.listing});
  final SellerListing listing;

  @override
  ConsumerState<_ListingRow> createState() => _ListingRowState();
}

class _ListingRowState extends ConsumerState<_ListingRow> {
  bool _deleting = false;

  Future<void> _confirmAndDelete(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete listing?'),
        content: Text(
          '"${widget.listing.title}" will be removed. This can\'t be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _deleting = true);
    try {
      await ref
          .read(sellerRepositoryProvider)
          .deleteListing(widget.listing.id);
      ref.invalidate(sellerListingsProvider);
      ref.invalidate(sellerAnalyticsProvider);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(this.context).showSnackBar(
        const SnackBar(content: Text('Couldn\'t delete listing')),
      );
      setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = widget.listing;
    final isSold = l.bucket == SellerBucket.sold;

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
              GestureDetector(
                onTap: () => context.push('/listings/${l.id}'),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(17),
                  child: Container(
                    width: 96,
                    height: 144, // 2:3 aspect
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
                      _subtitle(l),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
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
                    _statusPill(l),
                    if (!isSold) ...[
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          _chipButton(
                            label: 'Edit',
                            onTap: _deleting
                                ? null
                                : () => context.push('/sell/edit/${l.id}'),
                          ),
                          const SizedBox(width: 10),
                          _chipButton(
                            label: _deleting ? 'Deleting…' : 'Delete',
                            onTap: _deleting
                                ? null
                                : () => _confirmAndDelete(context),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          if (l.isRejected &&
              l.rejectionReason != null &&
              l.rejectionReason!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              'Reason: ${l.rejectionReason!}',
              style: GoogleFonts.jost(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: const Color(0xFFB91C1C),
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _subtitle(SellerListing l) {
    final parts = <String>[
      l.category,
      if (l.size != null && l.size!.isNotEmpty) 'Size ${l.size}',
      if (l.brand != null && l.brand!.isNotEmpty) l.brand!,
    ];
    return parts.join(' · ');
  }

  /// Rounded-full status pill matching the website's `bg-[#efe6dd]
  /// text-[#6f5647]` for active, red for rejected, yellow for pending.
  Widget _statusPill(SellerListing l) {
    Color bg;
    Color fg;
    String label;
    switch (l.bucket) {
      case SellerBucket.active:
        bg = const Color(0xFFEFE6DD);
        fg = const Color(0xFF6F5647);
        label = 'Active';
        break;
      case SellerBucket.sold:
        bg = const Color(0xFFEFE6DD);
        fg = const Color(0xFF6F5647);
        label = l.shippingStatus != null && l.shippingStatus != 'NOT_SHIPPED'
            ? l.shippingStatus!.replaceAll('_', ' ').toLowerCase()
            : 'Sold';
        // Capitalize first letter
        label = label.isEmpty
            ? label
            : '${label[0].toUpperCase()}${label.substring(1)}';
        break;
      case SellerBucket.pending:
        if (l.moderationStatus == 'REJECTED') {
          bg = const Color(0xFFFEE2E2);
          fg = const Color(0xFFB91C1C);
          label = 'Rejected';
        } else {
          bg = const Color(0xFFFEF3C7);
          fg = const Color(0xFF92400E);
          label = 'Pending';
        }
        break;
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
          fontSize: 13,
          fontWeight: FontWeight.w500,
          color: fg,
        ),
      ),
    );
  }

  Widget _chipButton({required String label, required VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 32,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(99),
          border: Border.all(color: const Color(0xFFD7CDC4)),
        ),
        child: Text(
          label,
          style: GoogleFonts.jost(
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: onTap == null
                ? const Color(0xFFA39082)
                : const Color(0xFF5F4A3C),
          ),
        ),
      ),
    );
  }
}

class _DraftRow extends StatelessWidget {
  const _DraftRow({required this.draft});
  final SellerDraft draft;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => context.push('/sell/create?draftId=${draft.id}'),
      child: Container(
      decoration: BoxDecoration(
        color: ModaireColors.tileBg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ModaireColors.tileBorder),
      ),
      padding: const EdgeInsets.all(10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 80,
              height: 100,
              child: draft.coverImage == null
                  ? Container(
                      color: ModaireColors.tileImageBg,
                      child: Center(
                        child: Icon(
                          LucideIcons.imageOff,
                          size: 24,
                          color: ModaireColors.tileTextSubtle,
                        ),
                      ),
                    )
                  : CachedNetworkImage(
                      imageUrl: resolveAssetUrl(draft.coverImage!),
                      fit: BoxFit.cover,
                      placeholder: (_, __) =>
                          Container(color: ModaireColors.tileImageBg),
                      errorWidget: (_, __, ___) =>
                          Container(color: ModaireColors.tileImageBg),
                    ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'DRAFT',
                  style: GoogleFonts.jost(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.6,
                    color: ModaireColors.tileTextSubtle,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  draft.displayTitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.jost(
                    fontSize: 14,
                    color: ModaireColors.tileTextPrimary,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 4),
                if (draft.category.isNotEmpty)
                  Text(
                    draft.category,
                    style: GoogleFonts.jost(
                      fontSize: 12,
                      color: ModaireColors.tileTextSubtle,
                    ),
                  ),
                const SizedBox(height: 6),
                Text(
                  'Last edited ${_relative(draft.updatedAt)}',
                  style: GoogleFonts.jost(
                    fontSize: 11,
                    color: ModaireColors.tileTextSubtle,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      ),
    );
  }

  String _relative(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${(diff.inDays / 7).floor()}w ago';
  }
}

class _LoadingList extends StatelessWidget {
  const _LoadingList();
  @override
  Widget build(BuildContext context) => ListView(
        children: const [
          SizedBox(height: 80),
          Center(
            child: CircularProgressIndicator(
              color: ModaireColors.espresso,
              strokeWidth: 2,
            ),
          ),
        ],
      );
}

class _ErrorList extends StatelessWidget {
  const _ErrorList({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 80),
          const Icon(
            LucideIcons.cloudOff,
            size: 48,
            color: ModaireColors.tileTextSubtle,
          ),
          const SizedBox(height: 12),
          Text(
            'Couldn\'t load',
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
        ],
      );
}

class _EmptyList extends StatelessWidget {
  const _EmptyList({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) => ListView(
        children: [
          const SizedBox(height: 120),
          Center(
            child: Text(
              label,
              style: GoogleFonts.jost(
                fontSize: 14,
                color: ModaireColors.tileTextSubtle,
              ),
            ),
          ),
        ],
      );
}

/// Sold-tab content — sales-shape rows with status pills + label
/// actions. Mirrors src/components/dashboard/SalesClient.tsx.
class _SalesView extends ConsumerWidget {
  const _SalesView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(sellerSalesProvider);
    return async.when(
      loading: () => const _LoadingList(),
      error: (e, _) => _ErrorList(message: e.toString()),
      data: (sales) {
        if (sales.isEmpty) return const _EmptyList(label: 'No sales yet.');
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
          itemCount: sales.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (context, i) => _SaleRow(sale: sales[i]),
        );
      },
    );
  }
}

class _SaleRow extends ConsumerWidget {
  const _SaleRow({required this.sale});
  final SellerSale sale;

  Future<void> _openLabelSheet(BuildContext context, WidgetRef ref) async {
    if (sale.orderId == null) return;
    final result = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _LabelSheet(orderId: sale.orderId!),
    );
    if (result == true) ref.invalidate(sellerSalesProvider);
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  String? _trackingUrl() {
    final t = sale.trackingNumber;
    if (t == null || t.isEmpty) return null;
    final c = sale.carrier?.toUpperCase() ?? '';
    if (c == 'USPS') {
      return 'https://tools.usps.com/go/TrackConfirmAction?tLabels=$t';
    }
    return 'https://google.com/search?q=${Uri.encodeComponent('${sale.carrier ?? 'carrier'} tracking $t')}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
                    imageUrl: resolveAssetUrl(sale.listing.mediumUrl),
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
                      sale.listing.title,
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
                      sale.buyer.displayName,
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        color: const Color(0xFF8A7667),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _dateLabel(sale.createdAt),
                      style: GoogleFonts.jost(
                        fontSize: 12,
                        color: const Color(0xFF8A7667),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '\$${sale.amount.toStringAsFixed(0)}',
                      style: GoogleFonts.jost(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        height: 1.0,
                        color: const Color(0xFF2F2925),
                      ),
                    ),
                    const SizedBox(height: 8),
                    _statusPill(sale.status),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _actions(context, ref),
        ],
      ),
    );
  }

  Widget _actions(BuildContext context, WidgetRef ref) {
    final hasLabel = sale.hasLabel;
    final trackingUrl = _trackingUrl();
    final buttons = <Widget>[];
    if (hasLabel) {
      buttons.add(_filledChip(
        label: 'Print label',
        icon: LucideIcons.printer,
        onTap: () => _openUrl(sale.labelUrl!),
      ));
    } else {
      buttons.add(_filledChip(
        label: 'Generate label',
        icon: LucideIcons.package,
        onTap: sale.orderId == null
            ? null
            : () => _openLabelSheet(context, ref),
      ));
    }
    if (trackingUrl != null) {
      buttons.add(_outlineChip(
        label: 'Track',
        icon: LucideIcons.search,
        onTap: () => _openUrl(trackingUrl),
      ));
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: buttons,
    );
  }

  Widget _filledChip({
    required String label,
    required IconData icon,
    required VoidCallback? onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: onTap == null
              ? const Color(0xFFB3A698)
              : const Color(0xFF4A3328),
          borderRadius: BorderRadius.circular(99),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: Colors.white),
            const SizedBox(width: 6),
            Text(
              label,
              style: GoogleFonts.jost(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _outlineChip({
    required String label,
    required IconData icon,
    required VoidCallback? onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(99),
          border: Border.all(color: const Color(0xFFD7CDC4)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: const Color(0xFF5F4A3C)),
            const SizedBox(width: 6),
            Text(
              label,
              style: GoogleFonts.jost(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: const Color(0xFF5F4A3C),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _statusPill(SaleStatus s) {
    late final Color bg;
    late final Color fg;
    late final String label;
    late final IconData icon;
    switch (s) {
      case SaleStatus.delivered:
        bg = const Color(0xFFD1FADF);
        fg = const Color(0xFF067647);
        label = 'Delivered';
        icon = LucideIcons.circleCheckBig;
        break;
      case SaleStatus.shipped:
        bg = const Color(0xFFDBEAFE);
        fg = const Color(0xFF1D4ED8);
        label = 'Shipped';
        icon = LucideIcons.package;
        break;
      case SaleStatus.processing:
        bg = const Color(0xFFFEF3C7);
        fg = const Color(0xFF92400E);
        label = 'Processing';
        icon = LucideIcons.clock;
        break;
      case SaleStatus.actionRequired:
        bg = const Color(0xFFFEE2E2);
        fg = const Color(0xFFB91C1C);
        label = 'Action required';
        icon = LucideIcons.circleAlert;
        break;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: fg),
          const SizedBox(width: 4),
          Text(
            label,
            style: GoogleFonts.jost(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }

  String _dateLabel(DateTime d) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    return '${months[d.month - 1]} ${d.day}, ${d.year}';
  }
}

/// Bottom sheet for the "Generate label" flow. Mirrors
/// SellerRateSelector.tsx: load the buyer's selected rate, show its
/// carrier/service/amount, and let the seller purchase the label.
/// Pops `true` once the label is bought so the parent invalidates.
class _LabelSheet extends ConsumerStatefulWidget {
  const _LabelSheet({required this.orderId});
  final String orderId;

  @override
  ConsumerState<_LabelSheet> createState() => _LabelSheetState();
}

class _LabelSheetState extends ConsumerState<_LabelSheet> {
  late Future<SaleLabelSelection> _selection;
  bool _purchasing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _selection = ref
        .read(sellerSalesRepositoryProvider)
        .labelSelection(widget.orderId);
  }

  Future<void> _purchase() async {
    setState(() {
      _purchasing = true;
      _error = null;
    });
    try {
      await ref
          .read(sellerSalesRepositoryProvider)
          .purchaseLabel(widget.orderId);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _purchasing = false;
      });
    }
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
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 26),
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
              'Shipping label',
              style: GoogleFonts.cormorantGaramond(
                fontSize: 22,
                fontWeight: FontWeight.w600,
                color: const Color(0xFF2F2925),
              ),
            ),
            const SizedBox(height: 12),
            FutureBuilder<SaleLabelSelection>(
              future: _selection,
              builder: (context, snap) {
                if (snap.connectionState == ConnectionState.waiting) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Center(
                      child: CircularProgressIndicator(
                        color: ModaireColors.espresso,
                        strokeWidth: 2,
                      ),
                    ),
                  );
                }
                if (snap.hasError) {
                  return _noticeBox(
                    icon: LucideIcons.circleAlert,
                    title: 'Couldn\'t load',
                    body: snap.error.toString(),
                    tone: _NoticeTone.error,
                  );
                }
                final s = snap.data!;
                if (s.hasLabel) {
                  return _noticeBox(
                    icon: LucideIcons.circleCheckBig,
                    title: 'Label already generated',
                    body:
                        'Tracking ${s.trackingNumber ?? '—'} (${s.carrier ?? 'carrier'}).',
                    tone: _NoticeTone.success,
                  );
                }
                if (!s.hasBuyerAddress) {
                  return _noticeBox(
                    icon: LucideIcons.circleAlert,
                    title: 'Waiting for buyer address',
                    body:
                        'The buyer hasn\'t finalized shipping details yet.',
                    tone: _NoticeTone.warning,
                  );
                }
                if (!s.hasBuyerSelection || s.selection == null) {
                  return _noticeBox(
                    icon: LucideIcons.circleAlert,
                    title: 'Waiting for buyer\'s shipping choice',
                    body:
                        'The buyer has provided an address but hasn\'t picked carrier/speed.',
                    tone: _NoticeTone.warning,
                  );
                }
                return _selectionCard(s.selection!);
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _selectionCard(SelectedRate r) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Buyer-selected shipping option',
          style: GoogleFonts.jost(
            fontSize: 13,
            color: const Color(0xFF8A7667),
          ),
        ),
        const SizedBox(height: 10),
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFDDD3CB)),
          ),
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              const Icon(
                LucideIcons.truck,
                size: 22,
                color: Color(0xFF4A3328),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      r.carrier ?? 'Carrier',
                      style: GoogleFonts.jost(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFF2F2925),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      r.serviceLevel ?? 'Selected service',
                      style: GoogleFonts.jost(
                        fontSize: 12,
                        color: const Color(0xFF8A7667),
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                r.amount == null ? '—' : '\$${r.amount!.toStringAsFixed(2)}',
                style: GoogleFonts.jost(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF2F2925),
                ),
              ),
            ],
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 10),
          Text(
            _error!,
            style: GoogleFonts.jost(
              fontSize: 12,
              color: const Color(0xFFB91C1C),
            ),
          ),
        ],
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          height: 46,
          child: ElevatedButton.icon(
            onPressed: _purchasing ? null : _purchase,
            icon: _purchasing
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  )
                : const Icon(LucideIcons.printer, size: 16),
            label: Text(
              _purchasing ? 'Generating…' : 'Print shipping label',
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
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _noticeBox({
    required IconData icon,
    required String title,
    required String body,
    required _NoticeTone tone,
  }) {
    late final Color bg;
    late final Color border;
    late final Color fg;
    switch (tone) {
      case _NoticeTone.success:
        bg = const Color(0xFFECFDF3);
        border = const Color(0xFFA6F4C5);
        fg = const Color(0xFF067647);
        break;
      case _NoticeTone.warning:
        bg = const Color(0xFFFFFBEB);
        border = const Color(0xFFFDE68A);
        fg = const Color(0xFF92400E);
        break;
      case _NoticeTone.error:
        bg = const Color(0xFFFEF2F2);
        border = const Color(0xFFFECACA);
        fg = const Color(0xFFB91C1C);
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
          Icon(icon, color: fg, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.jost(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: fg,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  body,
                  style: GoogleFonts.jost(
                    fontSize: 13,
                    color: fg.withValues(alpha: 0.85),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

enum _NoticeTone { success, warning, error }
