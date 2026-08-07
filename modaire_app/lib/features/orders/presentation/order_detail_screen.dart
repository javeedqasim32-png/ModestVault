import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme.dart';
import '../../../core/orders/order_models.dart';
import '../../../core/orders/order_repository.dart';
import '../../../shared/utils/asset_url.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

class OrderDetailScreen extends ConsumerWidget {
  const OrderDetailScreen({super.key, required this.orderId});
  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orderAsync = ref.watch(orderDetailProvider(orderId));

    return Scaffold(
      backgroundColor: ModaireColors.browsePageBg,
      appBar: const ModaireAppBar(),
      body: orderAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(
            color: ModaireColors.espresso,
            strokeWidth: 2,
          ),
        ),
        error: (e, _) => Center(
          child: Text(
            'Couldn\'t load order',
            style: GoogleFonts.jost(
              fontSize: 14,
              color: ModaireColors.tileTextSubtle,
            ),
          ),
        ),
        data: (order) => _OrderDetailBody(order: order),
      ),
    );
  }
}

class _OrderDetailBody extends StatelessWidget {
  const _OrderDetailBody({required this.order});
  final OrderSummary order;

  String _formatDate(DateTime d) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return '${months[d.month - 1]} ${d.day}, ${d.year}';
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        _itemCard(),
        const SizedBox(height: 20),
        _section('STATUS'),
        const SizedBox(height: 6),
        Text(
          order.status,
          style: GoogleFonts.jost(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: ModaireColors.tileTextPrimary,
          ),
        ),
        if (order.shippedAt != null) ...[
          const SizedBox(height: 4),
          Text(
            'Shipped ${_formatDate(order.shippedAt!)}',
            style: GoogleFonts.jost(
              fontSize: 13,
              color: ModaireColors.tileTextSubtle,
            ),
          ),
        ],
        if (order.deliveredAt != null) ...[
          const SizedBox(height: 4),
          Text(
            'Delivered ${_formatDate(order.deliveredAt!)}',
            style: GoogleFonts.jost(
              fontSize: 13,
              color: ModaireColors.tileTextSubtle,
            ),
          ),
        ],
        if (order.carrier != null || order.trackingNumber != null) ...[
          const SizedBox(height: 16),
          _section('TRACKING'),
          const SizedBox(height: 6),
          if (order.carrier != null)
            Text(
              order.carrier!,
              style: GoogleFonts.jost(
                fontSize: 14,
                color: ModaireColors.tileTextPrimary,
              ),
            ),
          if (order.trackingNumber != null)
            Text(
              order.trackingNumber!,
              style: GoogleFonts.jost(
                fontSize: 13,
                color: ModaireColors.tileTextSubtle,
              ),
            ),
        ],
        const SizedBox(height: 20),
        _section('TOTAL'),
        const SizedBox(height: 10),
        _totalRow('Item', order.itemPrice),
        if (order.shippingAmount != null)
          _totalRow('Shipping', order.shippingAmount!),
        const Divider(color: ModaireColors.tileBorder, height: 18),
        _totalRow('Total', order.total, bold: true),
        const SizedBox(height: 24),
        _section('SELLER'),
        const SizedBox(height: 6),
        Text(
          order.seller.displayName,
          style: GoogleFonts.jost(
            fontSize: 14,
            color: ModaireColors.tileTextPrimary,
          ),
        ),
        const SizedBox(height: 24),
        _section('ORDER ID'),
        const SizedBox(height: 6),
        Text(
          order.id,
          style: GoogleFonts.jost(
            fontSize: 12,
            color: ModaireColors.tileTextSubtle,
          ),
        ),
      ],
    );
  }

  Widget _itemCard() {
    return Container(
      decoration: BoxDecoration(
        color: ModaireColors.tileBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ModaireColors.tileBorder),
      ),
      padding: const EdgeInsets.all(10),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 80,
              height: 100,
              child: CachedNetworkImage(
                imageUrl: resolveAssetUrl(order.listing.mediumUrl),
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
                  order.listing.category.toUpperCase(),
                  style: GoogleFonts.jost(
                    fontSize: 9,
                    letterSpacing: 0.9,
                    color: ModaireColors.tileTextSubtle,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  order.listing.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.jost(
                    fontSize: 14,
                    color: ModaireColors.tileTextPrimary,
                    height: 1.3,
                  ),
                ),
                if (order.listing.size != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Size · ${order.listing.size}',
                    style: GoogleFonts.jost(
                      fontSize: 12,
                      color: ModaireColors.tileTextSubtle,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _section(String label) => Text(
        label,
        style: GoogleFonts.jost(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          letterSpacing: 2.2,
          color: ModaireColors.tileTextSubtle,
        ),
      );

  Widget _totalRow(String label, double amount, {bool bold = false}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: GoogleFonts.jost(
                  fontSize: 14,
                  fontWeight: bold ? FontWeight.w600 : FontWeight.w400,
                  color: ModaireColors.tileTextPrimary,
                ),
              ),
            ),
            Text(
              '\$${amount.toStringAsFixed(2)}',
              style: GoogleFonts.jost(
                fontSize: 14,
                fontWeight: bold ? FontWeight.w600 : FontWeight.w400,
                color: ModaireColors.tileTextPrimary,
              ),
            ),
          ],
        ),
      );
}
