import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../app/theme.dart';
import '../../core/favorites/favorites_controller.dart';
import '../../core/listings/listing_models.dart';
import '../utils/asset_url.dart';

/// Mirrors the mobile tile rendered in src/app/browse/page.tsx (the
/// sm:hidden block): white card, 16px radius, 3/4 image, category eyebrow,
/// title (2 lines), price + size code at the bottom. Favorite button is
/// a small white circle pinned top-right of the image — wired directly
/// to FavoriteIdsController so the heart fills consistently everywhere.
class ListingTile extends ConsumerWidget {
  const ListingTile({
    super.key,
    required this.listing,
    required this.onTap,
  });

  final ListingSummary listing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isFavorited = ref
            .watch(favoriteIdsProvider)
            .valueOrNull
            ?.contains(listing.id) ??
        false;

    return Material(
      color: ModaireColors.tileBg,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: ModaireColors.tileBorder, width: 1),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AspectRatio(
                aspectRatio: 3 / 4,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Container(color: ModaireColors.tileImageBg),
                    CachedNetworkImage(
                      imageUrl: resolveAssetUrl(listing.mediumUrl),
                      fit: BoxFit.cover,
                      fadeInDuration: const Duration(milliseconds: 200),
                      placeholder: (_, __) =>
                          Container(color: ModaireColors.tileImageBg),
                      errorWidget: (_, __, ___) => Container(
                        color: ModaireColors.tileImageBg,
                        child: const Icon(
                          Icons.image_outlined,
                          color: ModaireColors.tileBorder,
                        ),
                      ),
                    ),
                    Positioned(
                      top: 6,
                      right: 6,
                      child: _FavoriteButton(
                        listingId: listing.id,
                        isFavorited: isFavorited,
                      ),
                    ),
                    // Top-left slot is shared: SOLD wins if both could apply.
                    // In practice they're mutually exclusive — the server
                    // only resolves promo pricing for AVAILABLE listings —
                    // but ordering the check makes that explicit.
                    if (listing.isSold)
                      Positioned(
                        top: 6,
                        left: 6,
                        child: _badge('SOLD', ModaireColors.destructive),
                      )
                    else if (listing.hasPromo)
                      Positioned(
                        top: 6,
                        left: 6,
                        child: _badge(
                          '${listing.effectivePrice!.discountPercent}% OFF',
                          ModaireColors.promoBadgeBg,
                        ),
                      ),
                  ],
                ),
              ),
              // Expanded lets the text block fill whatever height the grid
              // cell demands. Mirrors the website tile's `flex-1 flex-col`
              // + `mt-auto` pattern so the price always hugs the bottom.
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        listing.category.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.jost(
                          fontSize: 9,
                          color: ModaireColors.tileTextSubtle,
                          letterSpacing: 0.9,
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        listing.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.jost(
                          fontSize: 12,
                          height: 1.3,
                          color: ModaireColors.tileTextPrimary,
                        ),
                      ),
                      const Spacer(),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          // Discounted price first, original struck through
                          // beside it — mirrors the web mobile tile's
                          // `items-baseline gap-1.5` price block.
                          Expanded(
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.baseline,
                              textBaseline: TextBaseline.alphabetic,
                              children: [
                                Flexible(
                                  child: Text(
                                    _formatPrice(listing.displayPrice),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: GoogleFonts.jost(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: ModaireColors.tileTextPrimary,
                                    ),
                                  ),
                                ),
                                if (listing.hasPromo) ...[
                                  const SizedBox(width: 6),
                                  Flexible(
                                    child: Text(
                                      _formatPrice(
                                        listing.effectivePrice!.originalPrice,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: GoogleFonts.jost(
                                        fontSize: 11,
                                        color: ModaireColors.tileTextSubtle,
                                        decoration:
                                            TextDecoration.lineThrough,
                                        decorationColor:
                                            ModaireColors.tileTextSubtle,
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          if (listing.size != null && listing.size!.isNotEmpty)
                            Text(
                              _toSizeCode(listing.size!),
                              style: GoogleFonts.jost(
                                fontSize: 12,
                                color: ModaireColors.tileTextSubtle,
                                letterSpacing: 0.5,
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _badge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: GoogleFonts.jost(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: ModaireColors.cream,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  String _formatPrice(double price) {
    if (price == price.roundToDouble()) return '\$${price.toStringAsFixed(0)}';
    return '\$${price.toStringAsFixed(2)}';
  }

  String _toSizeCode(String size) {
    final n = size.trim().toLowerCase();
    if (n.isEmpty) return '';
    if (n == 'small') return 'S';
    if (n == 'medium') return 'M';
    if (n == 'large') return 'L';
    if (n == 'xlarge' || n == 'x-large' || n == 'extra large') return 'XL';
    if (n == 'xxlarge' || n == 'xx-large') return 'XXL';
    return size.toUpperCase();
  }
}

class _FavoriteButton extends ConsumerWidget {
  const _FavoriteButton({
    required this.listingId,
    required this.isFavorited,
  });

  final String listingId;
  final bool isFavorited;

  Future<void> _toggle(BuildContext context, WidgetRef ref) async {
    try {
      await ref
          .read(favoriteIdsProvider.notifier)
          .setFavorite(listingId, !isFavorited);
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Couldn\'t update favorite')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () => _toggle(context, ref),
      child: Container(
        width: 28,
        height: 28,
        decoration: const BoxDecoration(
          color: Color(0xE6FFFFFF),
          shape: BoxShape.circle,
        ),
        // Lucide is stroke-only, so the "filled heart" state uses Material's
        // solid heart while inactive keeps the Lucide outline for parity.
        child: Icon(
          isFavorited ? Icons.favorite : LucideIcons.heart,
          size: 16,
          color: isFavorited
              ? ModaireColors.destructive
              : ModaireColors.tileTextPrimary,
        ),
      ),
    );
  }
}
