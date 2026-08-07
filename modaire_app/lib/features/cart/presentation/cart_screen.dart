import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/cart/cart_controller.dart';
import '../../../core/cart/cart_models.dart';
import '../../../shared/utils/asset_url.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

/// Bag screen — mirrors src/app/cart/page.tsx + SellerCartSection.tsx.
/// One "Your Bag" header card on top, then one card per seller with
/// checkboxes per item and a "Checkout Selected Items (N)" CTA.
class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});

  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen> {
  // Local per-cart-item deselection state. The website persists this
  // in localStorage so the choice survives navigation; mobile keeps it
  // session-local for v1 (defaulting to "everything selected").
  final Set<String> _deselected = <String>{};

  @override
  Widget build(BuildContext context) {
    final cartAsync = ref.watch(cartProvider);
    return Scaffold(
      backgroundColor: ModaireColors.browsePageBg,
      appBar: const ModaireAppBar(),
      body: cartAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(
            color: ModaireColors.espresso,
            strokeWidth: 2,
          ),
        ),
        error: (err, _) => Center(
          child: Text(
            'Couldn\'t load bag',
            style: GoogleFonts.jost(
              fontSize: 14,
              color: ModaireColors.tileTextSubtle,
            ),
          ),
        ),
        data: (cart) {
          if (cart.isEmpty) return const _EmptyBag();
          // Drop SOLD items into a sticky pile at the end; available
          // items get the seller-grouping treatment.
          final available =
              cart.items.where((i) => i.listing.isSold == false).toList();
          final sold = cart.items.where((i) => i.listing.isSold).toList();
          final groups = _groupBySeller(available);
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              _BagHeader(itemCount: available.length),
              const SizedBox(height: 12),
              for (final g in groups) ...[
                _SellerSection(
                  seller: g.seller,
                  items: g.items,
                  isDeselected: (id) => _deselected.contains(id),
                  onToggle: (id) {
                    setState(() {
                      if (_deselected.contains(id)) {
                        _deselected.remove(id);
                      } else {
                        _deselected.add(id);
                      }
                    });
                  },
                  onRemove: (listingId) => _removeItem(listingId),
                  onCheckout: () => _onCheckout(g.items),
                ),
                const SizedBox(height: 12),
              ],
              if (sold.isNotEmpty) ...[
                const SizedBox(height: 6),
                _SoldOutSection(
                  items: sold,
                  onRemove: (listingId) => _removeItem(listingId),
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  Future<void> _removeItem(String listingId) async {
    try {
      await ref.read(cartIdsProvider.notifier).setInCart(listingId, false);
      setState(() => _deselected.remove(listingId));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Couldn\'t remove from bag')),
      );
    }
  }

  Future<void> _onCheckout(List<CartItem> sellerItems) async {
    final selected =
        sellerItems.where((i) => !_deselected.contains(i.listing.id)).toList();
    if (selected.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one item to check out')),
      );
      return;
    }
    // Hand the exact selected listing ids to /checkout so it stays in
    // sync with what the user ticked — independent of cart-row order.
    // Single-item → ?items=<id>, bundle → ?items=<id1>,<id2>,...
    final ids = selected.map((i) => i.listing.id).join(',');
    context.push('/checkout?items=$ids');
  }

  List<_SellerGroup> _groupBySeller(List<CartItem> items) {
    final map = <String, List<CartItem>>{};
    for (final it in items) {
      map.putIfAbsent(it.seller.id, () => []).add(it);
    }
    return map.entries
        .map((e) => _SellerGroup(seller: e.value.first.seller, items: e.value))
        .toList();
  }
}

class _SellerGroup {
  const _SellerGroup({required this.seller, required this.items});
  final CartSellerRef seller;
  final List<CartItem> items;
}

/// "Your Bag" rounded header card — title + "N items · Select items to
/// checkout" subtitle, matching the web.
class _BagHeader extends StatelessWidget {
  const _BagHeader({required this.itemCount});
  final int itemCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFFBF8F5),
        border: Border.all(color: const Color(0xFFE3D9D1)),
        borderRadius: BorderRadius.circular(22),
      ),
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Your Bag',
            style: GoogleFonts.cormorantGaramond(
              fontSize: 26,
              height: 1.0,
              fontWeight: FontWeight.w500,
              color: const Color(0xFF2F2925),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '$itemCount ${itemCount == 1 ? "item" : "items"} · Select items to checkout',
            style: GoogleFonts.jost(
              fontSize: 13,
              color: const Color(0xFF8A7667),
            ),
          ),
        ],
      ),
    );
  }
}

/// One rounded card per seller with header row + item rows + bottom
/// summary + Checkout CTA, mirroring SellerCartSection.tsx.
class _SellerSection extends StatelessWidget {
  const _SellerSection({
    required this.seller,
    required this.items,
    required this.isDeselected,
    required this.onToggle,
    required this.onRemove,
    required this.onCheckout,
  });
  final CartSellerRef seller;
  final List<CartItem> items;
  final bool Function(String listingId) isDeselected;
  final void Function(String listingId) onToggle;
  final void Function(String listingId) onRemove;
  final VoidCallback onCheckout;

  @override
  Widget build(BuildContext context) {
    final selected =
        items.where((i) => !isDeselected(i.listing.id)).toList();
    // displayPrice, not price — otherwise a discounted item shows its
    // promo price on the tile but its full price in this subtotal.
    final subtotal = selected.fold<double>(
        0, (sum, it) => sum + it.listing.displayPrice);
    final selectedCount = selected.length;

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFFBF8F5),
        border: Border.all(color: const Color(0xFFE3D9D1)),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _sellerHeader(context),
          const Divider(height: 1, color: Color(0xFFE3D9D1)),
          for (int i = 0; i < items.length; i++) ...[
            _itemRow(context, items[i]),
            if (i < items.length - 1)
              const Divider(height: 1, color: Color(0xFFEAE0D6)),
          ],
          const Divider(height: 1, color: Color(0xFFE3D9D1)),
          _summaryRow(
            label: 'Items selected ($selectedCount)',
            value: '\$${_formatPrice(subtotal)}',
            bold: false,
          ),
          _summaryRow(
            label: 'Subtotal',
            value: '\$${_formatPrice(subtotal)}',
            bold: true,
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 14),
            child: SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: selectedCount == 0 ? null : onCheckout,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF4A3328),
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: const Color(0xFFB3A698),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
                child: Text(
                  'Checkout Selected Items ($selectedCount)',
                  style: GoogleFonts.jost(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  LucideIcons.shieldCheck,
                  size: 14,
                  color: Color(0xFF8A7667),
                ),
                const SizedBox(width: 6),
                Text(
                  'Secure checkout · Your items are safe with us',
                  style: GoogleFonts.jost(
                    fontSize: 11.5,
                    color: const Color(0xFF8A7667),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _sellerHeader(BuildContext context) {
    return InkWell(
      onTap: () => context.push('/sellers/${seller.id}'),
      borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Row(
          children: [
            // AT-style avatar circle
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: const Color(0xFFE6DACE),
                shape: BoxShape.circle,
              ),
              child: (seller.profileImage != null &&
                      seller.profileImage!.isNotEmpty)
                  ? CachedNetworkImage(
                      imageUrl: resolveAssetUrl(seller.profileImage!),
                      fit: BoxFit.cover,
                      errorWidget: (_, __, ___) => _initialAvatar(),
                    )
                  : _initialAvatar(),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          seller.displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.jost(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: const Color(0xFF2F2925),
                          ),
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Icon(
                        LucideIcons.chevronRight,
                        size: 14,
                        color: Color(0xFF8A7667),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${items.length} ${items.length == 1 ? "item" : "items"} · Ships from ${seller.displayName}',
                    style: GoogleFonts.jost(
                      fontSize: 12,
                      color: const Color(0xFF8A7667),
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

  Widget _initialAvatar() => Text(
        seller.initials,
        style: GoogleFonts.jost(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: const Color(0xFF6F5538),
          letterSpacing: 0.5,
        ),
      );

  Widget _itemRow(BuildContext context, CartItem item) {
    final l = item.listing;
    final selected = !isDeselected(l.id);
    final details = [
      l.category,
      if (l.size != null && l.size!.isNotEmpty) 'Size ${l.size}',
      if (l.brand != null && l.brand!.isNotEmpty) l.brand,
    ].whereType<String>().toList();

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Selection checkbox — espresso when checked.
          GestureDetector(
            onTap: () => onToggle(l.id),
            child: Container(
              margin: const EdgeInsets.only(top: 4, right: 10),
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: selected
                    ? const Color(0xFF4A3328)
                    : Colors.transparent,
                border: Border.all(
                  color: selected
                      ? const Color(0xFF4A3328)
                      : const Color(0xFFB3A698),
                  width: 1.5,
                ),
                borderRadius: BorderRadius.circular(5),
              ),
              child: selected
                  ? const Icon(LucideIcons.check,
                      size: 14, color: Colors.white)
                  : null,
            ),
          ),
          // Product image
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Container(
              width: 76,
              height: 92,
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
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  l.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.jost(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    height: 1.25,
                    color: const Color(0xFF2F2925),
                  ),
                ),
                if (details.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    details.join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jost(
                      fontSize: 12,
                      color: const Color(0xFF8A7667),
                    ),
                  ),
                ],
                const SizedBox(height: 6),
                Text(
                  '\$${_formatPrice(l.price)}',
                  style: GoogleFonts.jost(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFF2F2925),
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 30,
                  child: OutlinedButton(
                    onPressed: () => context.push('/listings/${l.id}'),
                    style: OutlinedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: const Color(0xFF2F2925),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999),
                      ),
                      side: const BorderSide(color: Color(0xFFD7CDC4)),
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      minimumSize: const Size(0, 30),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: Text(
                      'View Item',
                      style: GoogleFonts.jost(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: const Color(0xFF2F2925),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          // Trash button (circular outline)
          InkWell(
            onTap: () => onRemove(l.id),
            customBorder: const CircleBorder(),
            child: Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFFD7CDC4)),
              ),
              child: const Icon(
                LucideIcons.trash2,
                size: 16,
                color: Color(0xFF8A7667),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _summaryRow({
    required String label,
    required String value,
    required bool bold,
  }) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: GoogleFonts.jost(
                fontSize: 14,
                fontWeight: bold ? FontWeight.w600 : FontWeight.w400,
                color: const Color(0xFF2F2925),
              ),
            ),
          ),
          Text(
            value,
            style: GoogleFonts.jost(
              fontSize: 14,
              fontWeight: bold ? FontWeight.w600 : FontWeight.w500,
              color: const Color(0xFF2F2925),
            ),
          ),
        ],
      ),
    );
  }

  String _formatPrice(double price) {
    if (price == price.roundToDouble()) return price.toStringAsFixed(0);
    return price.toStringAsFixed(2);
  }
}

class _SoldOutSection extends StatelessWidget {
  const _SoldOutSection({required this.items, required this.onRemove});
  final List<CartItem> items;
  final void Function(String listingId) onRemove;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFFBF8F5),
        border: Border.all(color: const Color(0xFFE3D9D1)),
        borderRadius: BorderRadius.circular(22),
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'No longer available',
            style: GoogleFonts.jost(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: const Color(0xFFB91C1C),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'These items have been sold. Remove them to checkout the rest.',
            style: GoogleFonts.jost(
              fontSize: 12,
              color: const Color(0xFF8A7667),
            ),
          ),
          const SizedBox(height: 10),
          for (final it in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      it.listing.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        color: const Color(0xFF8A7667),
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: () => onRemove(it.listing.id),
                    style: TextButton.styleFrom(
                      foregroundColor: const Color(0xFFB91C1C),
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                    ),
                    child: Text(
                      'Remove',
                      style: GoogleFonts.jost(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
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

class _EmptyBag extends StatelessWidget {
  const _EmptyBag();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              LucideIcons.shoppingBag,
              size: 56,
              color: ModaireColors.tileTextSubtle,
            ),
            const SizedBox(height: 16),
            Text(
              'Your bag is empty',
              style: GoogleFonts.jost(
                fontSize: 15,
                fontWeight: FontWeight.w500,
                color: ModaireColors.tileTextPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Add items from any listing to check out.',
              textAlign: TextAlign.center,
              style: GoogleFonts.jost(
                fontSize: 13,
                color: ModaireColors.tileTextSubtle,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
