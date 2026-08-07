import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'package:url_launcher/url_launcher.dart';

import '../../../app/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/messages/message_repository.dart';
import '../../../core/orders/order_models.dart';
import '../../../core/orders/order_repository.dart';
import '../../../shared/utils/asset_url.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

/// Orders tab — mirrors MobileOrdersClient.tsx: Orders / Pending /
/// Delivered / Insights tab bar, then either the rows or the buyer
/// analytics view.
class OrdersPlaceholderScreen extends ConsumerStatefulWidget {
  const OrdersPlaceholderScreen({super.key});

  @override
  ConsumerState<OrdersPlaceholderScreen> createState() =>
      _OrdersPlaceholderScreenState();
}

class _OrdersPlaceholderScreenState
    extends ConsumerState<OrdersPlaceholderScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController =
      TabController(length: 4, vsync: this);

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ordersAsync = ref.watch(ordersProvider);

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
              tabs: const [
                Tab(height: 44, text: 'Orders'),
                Tab(height: 44, text: 'Pending'),
                Tab(height: 44, text: 'Delivered'),
                Tab(height: 44, text: 'Insights'),
              ],
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        color: ModaireColors.espresso,
        backgroundColor: ModaireColors.cream,
        onRefresh: () async {
          ref.invalidate(ordersProvider);
          await ref.read(ordersProvider.future);
        },
        child: ordersAsync.when(
          loading: () => const Center(
            child: CircularProgressIndicator(
              color: ModaireColors.espresso,
              strokeWidth: 2,
            ),
          ),
          error: (err, _) => _ErrorBody(
            onRetry: () => ref.invalidate(ordersProvider),
          ),
          data: (all) => TabBarView(
            controller: _tabController,
            children: [
              _OrdersList(orders: all, emptyHint: 'all'),
              _OrdersList(
                orders: all.where(_isPending).toList(),
                emptyHint: 'pending',
              ),
              _OrdersList(
                orders: all.where(_isDelivered).toList(),
                emptyHint: 'delivered',
              ),
              _InsightsView(orders: all),
            ],
          ),
        ),
      ),
    );
  }

  bool _isPending(OrderSummary o) =>
      o.status == 'PROCESSING' ||
      o.status == 'NOT_SHIPPED' ||
      o.status == 'PENDING' ||
      o.status == 'SHIPPED'; // not yet delivered

  bool _isDelivered(OrderSummary o) => o.status == 'DELIVERED';
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.onRetry});
  final VoidCallback onRetry;
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
            'Couldn\'t load orders',
            textAlign: TextAlign.center,
            style: GoogleFonts.jost(
              fontSize: 14,
              color: ModaireColors.tileTextPrimary,
            ),
          ),
          const SizedBox(height: 12),
          Center(
            child: TextButton(onPressed: onRetry, child: const Text('Try again')),
          ),
        ],
      );
}

class _OrdersList extends StatelessWidget {
  const _OrdersList({required this.orders, required this.emptyHint});
  final List<OrderSummary> orders;
  final String emptyHint;

  @override
  Widget build(BuildContext context) {
    if (orders.isEmpty) return _EmptyBody(hint: emptyHint);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'My Orders',
              style: GoogleFonts.cormorantGaramond(
                fontSize: 23,
                fontWeight: FontWeight.w500,
                height: 1.05,
                color: ModaireColors.tileTextPrimary,
              ),
            ),
          ),
        ),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            itemCount: orders.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (context, i) => _OrderCard(order: orders[i]),
          ),
        ),
      ],
    );
  }
}

class _EmptyBody extends StatelessWidget {
  const _EmptyBody({required this.hint});
  final String hint;
  @override
  Widget build(BuildContext context) => ListView(
        children: [
          const SizedBox(height: 80),
          Center(
            child: Container(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 36),
              margin: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                border: Border.all(
                  color: const Color(0xFFD4C7BB),
                  style: BorderStyle.solid,
                ),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    LucideIcons.shoppingBag,
                    size: 56,
                    color: ModaireColors.tileTextSubtle,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    hint == 'all'
                        ? "You don't have any orders yet."
                        : 'No orders in this tab yet.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.jost(
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                      color: const Color(0xFF2F2925),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    hint == 'all'
                        ? 'When you place an order, it will appear here.'
                        : 'Try a different tab or start shopping.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.jost(
                      fontSize: 13,
                      color: ModaireColors.tileTextSubtle,
                    ),
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton(
                    onPressed: () => context.go('/browse'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF7A5A45),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 12,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(99),
                      ),
                    ),
                    child: Text(
                      'Start Shopping',
                      style: GoogleFonts.jost(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
}

/// One order row matching the website's mobile order card.
class _OrderCard extends ConsumerWidget {
  const _OrderCard({required this.order});
  final OrderSummary order;

  Future<void> _messageSeller(BuildContext context, WidgetRef ref) async {
    try {
      final id = await ref
          .read(messageRepositoryProvider)
          .startWithSeller(sellerId: order.seller.id);
      if (!context.mounted) return;
      context.push('/messages/$id');
    } on ApiException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }

  Future<void> _trackOrder() async {
    final t = order.trackingNumber;
    if (t == null || t.isEmpty) return;
    final c = order.carrier?.toUpperCase() ?? '';
    final url = c == 'USPS'
        ? 'https://tools.usps.com/go/TrackConfirmAction?tLabels=$t'
        : 'https://google.com/search?q=${Uri.encodeComponent('${order.carrier ?? 'carrier'} tracking $t')}';
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
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
              GestureDetector(
                onTap: () => context.push('/listings/${order.listing.id}'),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(17),
                  child: Container(
                    width: 96,
                    height: 144,
                    color: const Color(0xFFF2EBE4),
                    child: CachedNetworkImage(
                      imageUrl: resolveAssetUrl(order.listing.mediumUrl),
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
                      _orderLabel(order.id),
                      style: GoogleFonts.jost(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 1.5,
                        color: const Color(0xFF8A7667),
                      ),
                    ),
                    const SizedBox(height: 4),
                    GestureDetector(
                      onTap: () => context.push('/listings/${order.listing.id}'),
                      child: Text(
                        order.listing.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.jost(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          height: 1.2,
                          color: const Color(0xFF2F2925),
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      order.seller.displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        color: const Color(0xFF8A7667),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '\$${order.total.toStringAsFixed(0)}',
                      style: GoogleFonts.jost(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        height: 1.0,
                        color: const Color(0xFF2F2925),
                      ),
                    ),
                    const SizedBox(height: 8),
                    _statusPill(order.status),
                    const SizedBox(height: 8),
                    Text(
                      _formatDate(order.createdAt),
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        color: const Color(0xFF8A7667),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Action chips, indented under the text column on the website
          // (pl-[99px] = 96 image + ~3 gap). We match the offset.
          Padding(
            padding: const EdgeInsets.only(left: 99),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _ActionChip(
                  label: 'Track Order',
                  enabled: order.trackingNumber != null &&
                      order.trackingNumber!.isNotEmpty,
                  onTap: _trackOrder,
                ),
                _ActionChip(
                  label: 'Message Seller',
                  enabled: true,
                  onTap: () => _messageSeller(context, ref),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _orderLabel(String id) {
    final short = id.replaceAll('-', '').substring(0, 4).toUpperCase();
    return 'ORDER #MOD-$short';
  }

  String _formatDate(DateTime d) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return '${months[d.month - 1]} ${d.day}, ${d.year}';
  }

  Widget _statusPill(String status) {
    final (bg, fg, label) = _statusStyle(status);
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

  // Mirrors getOrderStatusTone + getBuyerOrderStatusLabel from the website.
  (Color, Color, String) _statusStyle(String status) {
    switch (status) {
      case 'DELIVERED':
        return (const Color(0xFFDFF3E5), const Color(0xFF1F7A45), 'Delivered');
      case 'SHIPPED':
        return (const Color(0xFFE8F0FB), const Color(0xFF2F5F9A), 'Shipped');
      case 'PROCESSING':
        return (const Color(0xFFEFE9FF), const Color(0xFF5B46A1), 'Processed');
      case 'CANCELLED':
      case 'REFUNDED':
        return (const Color(0xFFFDECEC), const Color(0xFF9A3A3A), 'Cancelled');
      case 'RETURNED':
        return (const Color(0xFFFDECEC), const Color(0xFF9A3A3A), 'Returned');
      case 'NOT_SHIPPED':
      case 'PENDING':
      default:
        return (
          const Color(0xFFFFF4E5),
          const Color(0xFF8A6A46),
          'Order placed',
        );
    }
  }
}

class _ActionChip extends StatelessWidget {
  const _ActionChip({
    required this.label,
    required this.enabled,
    this.onTap,
  });
  final String label;
  final bool enabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: enabled ? onTap : null,
      child: Container(
        height: 32,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: enabled ? Colors.white : const Color(0xFFF6F1EB),
          borderRadius: BorderRadius.circular(99),
          border: Border.all(
            color: enabled
                ? const Color(0xFFD7CDC4)
                : const Color(0xFFE1D8D0),
          ),
        ),
        child: Text(
          label,
          style: GoogleFonts.jost(
            fontSize: 13,
            fontWeight: enabled ? FontWeight.w500 : FontWeight.w400,
            color: enabled
                ? const Color(0xFF5F4A3C)
                : const Color(0xFFA08979),
          ),
        ),
      ),
    );
  }
}

/// Buyer-side Purchase Insights — 2×2 stat cards + spend-by-category
/// progress bars + top sellers list. All numbers computed locally from
/// the orders list (matches the website's useMemo aggregator).
class _InsightsView extends StatelessWidget {
  const _InsightsView({required this.orders});
  final List<OrderSummary> orders;

  @override
  Widget build(BuildContext context) {
    final analytics = _compute(orders);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        Text(
          'Purchase Insights',
          style: GoogleFonts.cormorantGaramond(
            fontSize: 23,
            fontWeight: FontWeight.w500,
            height: 1.05,
            color: const Color(0xFF2F2925),
          ),
        ),
        const SizedBox(height: 14),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          childAspectRatio: 1.85,
          children: [
            _statCard('Total Spent', _money(analytics.totalSpent), 'All orders'),
            _statCard('Orders', '${analytics.orderCount}', 'All time'),
            _statCard('Avg Order', _money(analytics.avgOrder), 'Per purchase'),
            _statCard('Saved', _money(analytics.savedEstimate),
                'vs retail est.'),
          ],
        ),
        const SizedBox(height: 10),
        _panel(
          'SPEND BY CATEGORY',
          child: analytics.categoryRows.isEmpty
              ? Text(
                  'No orders yet.',
                  style: GoogleFonts.jost(
                    fontSize: 13,
                    color: const Color(0xFF8A7667),
                  ),
                )
              : Column(
                  children: analytics.categoryRows
                      .map((r) => Padding(
                            padding: const EdgeInsets.only(top: 10),
                            child: _categoryBar(
                              r.name,
                              r.value,
                              analytics.maxCategoryValue,
                            ),
                          ))
                      .toList(),
                ),
        ),
        const SizedBox(height: 10),
        _panel(
          'TOP SELLERS PURCHASED FROM',
          child: analytics.topSellers.isEmpty
              ? Text(
                  'No seller purchases yet.',
                  style: GoogleFonts.jost(
                    fontSize: 13,
                    color: const Color(0xFF8A7667),
                  ),
                )
              : Column(
                  children: List.generate(analytics.topSellers.length, (i) {
                    final s = analytics.topSellers[i];
                    return Padding(
                      padding: EdgeInsets.only(top: i == 0 ? 12 : 14),
                      child: _sellerRow(s, i),
                    );
                  }),
                ),
        ),
      ],
    );
  }

  Widget _statCard(String label, String value, String caption) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFF8F3EE),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE3DBD3)),
      ),
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
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
              color: const Color(0xFF2F2925),
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

  Widget _panel(String header, {required Widget child}) {
    return Container(
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
            header,
            style: GoogleFonts.jost(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.8,
              color: const Color(0xFF8A7667),
            ),
          ),
          child,
        ],
      ),
    );
  }

  Widget _categoryBar(String name, double value, double max) {
    final pct = max <= 0 ? 0.0 : (value / max);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        SizedBox(
          width: 90,
          child: Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.jost(
              fontSize: 13,
              color: const Color(0xFF5F4A3C),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Stack(
            children: [
              Container(
                height: 12,
                decoration: BoxDecoration(
                  color: const Color(0xFFDFD4CA),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
              FractionallySizedBox(
                widthFactor: pct < 0.08 ? 0.08 : pct,
                child: Container(
                  height: 12,
                  decoration: BoxDecoration(
                    color: const Color(0xFF5F4437),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 56,
          child: Text(
            _money(value),
            textAlign: TextAlign.right,
            style: GoogleFonts.jost(
              fontSize: 13,
              color: const Color(0xFF8A7667),
            ),
          ),
        ),
      ],
    );
  }

  static const _avatarTones = [
    Color(0xFFD7BEA1),
    Color(0xFFC5B0D9),
    Color(0xFFD9B8B8),
  ];

  Widget _sellerRow(_SellerStat s, int index) {
    final initial = s.name.isNotEmpty ? s.name[0].toUpperCase() : 'M';
    return Row(
      children: [
        Container(
          width: 50,
          height: 50,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: _avatarTones[index % _avatarTones.length],
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0xFFDDD3CB)),
          ),
          child: Text(
            initial,
            style: GoogleFonts.cormorantGaramond(
              fontSize: 26,
              color: const Color(0xFF7F6352),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                s.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.jost(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  height: 1.2,
                  color: const Color(0xFF2F2925),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '${s.orders} ${s.orders == 1 ? "order" : "orders"} · ${_money(s.total)}',
                style: GoogleFonts.jost(
                  fontSize: 13,
                  color: const Color(0xFF8A7667),
                ),
              ),
            ],
          ),
        ),
        const Icon(
          LucideIcons.chevronRight,
          size: 18,
          color: Color(0xFF8A7667),
        ),
      ],
    );
  }

  String _money(double v) => '\$${v.round()}';

  // ── Aggregation (mirrors MobileOrdersClient.tsx useMemo) ────────────
  static _Analytics _compute(List<OrderSummary> orders) {
    final totalSpent = orders.fold<double>(0, (s, o) => s + o.total);
    final count = orders.length;
    final avg = count > 0 ? totalSpent / count : 0.0;

    final delivered = orders.where((o) => o.status == 'DELIVERED');
    final deliveredSpend = delivered.fold<double>(0, (s, o) => s + o.total);

    final byCategory = <String, double>{};
    for (final o in orders) {
      final cat = o.listing.category.trim().isNotEmpty
          ? o.listing.category
          : 'Other';
      byCategory[cat] = (byCategory[cat] ?? 0) + o.total;
    }
    final catRows = byCategory.entries
        .map((e) => _CategoryRow(e.key, e.value))
        .toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final topCats = catRows.take(3).toList()
      ..sort((a, b) =>
          a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    final maxCat = topCats.isEmpty
        ? 0.0
        : topCats.map((r) => r.value).reduce((a, b) => a > b ? a : b);

    final bySeller = <String, _SellerStat>{};
    for (final o in orders) {
      final id = o.seller.id;
      final existing = bySeller[id];
      if (existing != null) {
        bySeller[id] = _SellerStat(
          id: id,
          name: existing.name,
          orders: existing.orders + 1,
          total: existing.total + o.total,
        );
      } else {
        bySeller[id] = _SellerStat(
          id: id,
          name: o.seller.displayName,
          orders: 1,
          total: o.total,
        );
      }
    }
    final topSellers = bySeller.values.toList()
      ..sort((a, b) => b.total.compareTo(a.total));

    return _Analytics(
      totalSpent: totalSpent,
      orderCount: count,
      avgOrder: avg,
      savedEstimate: deliveredSpend * 0.22,
      categoryRows: topCats,
      maxCategoryValue: maxCat,
      topSellers: topSellers.take(3).toList(),
    );
  }
}

class _Analytics {
  const _Analytics({
    required this.totalSpent,
    required this.orderCount,
    required this.avgOrder,
    required this.savedEstimate,
    required this.categoryRows,
    required this.maxCategoryValue,
    required this.topSellers,
  });
  final double totalSpent;
  final int orderCount;
  final double avgOrder;
  final double savedEstimate;
  final List<_CategoryRow> categoryRows;
  final double maxCategoryValue;
  final List<_SellerStat> topSellers;
}

class _CategoryRow {
  const _CategoryRow(this.name, this.value);
  final String name;
  final double value;
}

class _SellerStat {
  const _SellerStat({
    required this.id,
    required this.name,
    required this.orders,
    required this.total,
  });
  final String id;
  final String name;
  final int orders;
  final double total;
}
