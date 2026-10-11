import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/listings/browse_tiles_repository.dart';
import '../../../core/listings/listing_models.dart';
import '../../../core/recently_viewed/recently_viewed_store.dart';
import '../../../core/search/recent_searches_store.dart';
import '../../../shared/utils/asset_url.dart';
import '../../../shared/widgets/listing_grid.dart';
import '../../../shared/widgets/listing_tile.dart';

/// What the search screen shows before there's anything to search.
///
/// Ordered by how personal each section is: your searches, then the
/// catalogue's shape, then what you were just looking at.
///
/// The browse rows fall back to text tiles covering the full taxonomy when
/// [browseTilesProvider] hasn't resolved, so this screen is **never blank** —
/// on a cold install, offline, or with the API down there are still eleven
/// working ways in. Every dynamic section degrades to absent rather than to
/// an error, which is what keeps that true.
class SearchLanding extends ConsumerWidget {
  const SearchLanding({
    super.key,
    required this.onSubmitQuery,
    required this.onSelectStyle,
    required this.onSelectCategory,
    required this.onTapListing,
  });

  /// Re-runs a stored query. Text goes back into the field, so this counts as
  /// a commit and the entry is promoted to the front of recents.
  final void Function(String query) onSubmitQuery;

  /// Browse tiles apply STRUCTURED filters, not text. `styles: {in: [...]}`
  /// hits @@index([style, category, subcategory, type]); routing them through
  /// the text search would be unindexed and would also match the word
  /// appearing halfway through someone's description.
  final void Function(String style) onSelectStyle;
  final void Function(String category) onSelectCategory;

  final void Function(ListingSummary listing) onTapListing;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // valueOrNull, not .when — a failed read drops the section, it never
    // replaces the landing with an error.
    final recents = ref.watch(recentSearchesProvider).valueOrNull ?? const [];
    // Watched HERE rather than in the screen: it's autoDispose and POSTs to
    // /listings/by-ids, so scoping it to this subtree means it isn't touched
    // once the user has typed and results have replaced the landing.
    final recentlyViewed =
        ref.watch(recentlyViewedListingsProvider).valueOrNull ?? const [];
    final tiles =
        ref.watch(browseTilesProvider).valueOrNull ?? BrowseTiles.fallback;

    return ListView(
      // The field autofocuses, so the keyboard covers this on arrival with
      // no other way to dismiss it.
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(top: 4, bottom: 32),
      children: [
        if (recents.isNotEmpty) ...[
          const _SectionHeader('RECENTLY SEARCHED', trailing: _ClearRecents()),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final q in recents)
                  _RecentChip(
                    label: q,
                    onTap: () => onSubmitQuery(q),
                    onRemove: () =>
                        ref.read(recentSearchesProvider.notifier).remove(q),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 26),
        ],

        const _SectionHeader('SHOP YOUR STYLE'),
        const SizedBox(height: 12),
        _TileRail(
          tiles: tiles.styles,
          onTap: onSelectStyle,
          // Portrait crops — these are full-length model shots.
          width: 116,
          height: 168,
          labelInside: true,
        ),
        const SizedBox(height: 26),

        const _SectionHeader('SHOP BY CATEGORY'),
        const SizedBox(height: 12),
        _TileRail(
          tiles: tiles.categories,
          onTap: onSelectCategory,
          // Squarer and shorter — these are inventory photos standing in for
          // artwork we don't have, so they carry less weight than the styles.
          width: 104,
          height: 120,
          labelInside: false,
        ),

        if (recentlyViewed.isNotEmpty) ...[
          const SizedBox(height: 26),
          const _SectionHeader('RECENTLY VIEWED'),
          const SizedBox(height: 12),
          _ListingRail(items: recentlyViewed, onTap: onTapListing),
        ],
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.text, {this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    // Matches FilterSheet's "REFINE RESULTS" treatment. Home's serif headers
    // are too loud for a dense utility surface like this.
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            text,
            style: GoogleFonts.jost(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 2.2,
              color: ModaireColors.tileTextSubtle,
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class _ClearRecents extends ConsumerWidget {
  const _ClearRecents();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () => ref.read(recentSearchesProvider.notifier).clear(),
      behavior: HitTestBehavior.opaque,
      child: Text(
        'Clear',
        style: GoogleFonts.jost(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: ModaireColors.espresso,
        ),
      ),
    );
  }
}

class _RecentChip extends StatelessWidget {
  const _RecentChip({
    required this.label,
    required this.onTap,
    required this.onRemove,
  });

  final String label;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 36,
        padding: const EdgeInsets.only(left: 12, right: 12),
        decoration: BoxDecoration(
          color: ModaireColors.tileBg,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: ModaireColors.pillBorder),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(LucideIcons.clock, size: 13, color: ModaireColors.tileTextSubtle),
            const SizedBox(width: 7),
            ConstrainedBox(
              // A long stored query shouldn't push the chip off-screen.
              constraints: const BoxConstraints(maxWidth: 180),
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.jost(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: ModaireColors.espressoText,
                ),
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: onRemove,
              behavior: HitTestBehavior.opaque,
              child: Icon(
                LucideIcons.x,
                size: 14,
                color: ModaireColors.tileTextSubtle,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Horizontal rail of browse tiles.
///
/// [labelInside] overlays the name on the photo behind a scrim (styles, whose
/// artwork is designed for it); otherwise the name sits underneath, which
/// reads better on arbitrary inventory photos where the bottom of the image
/// may be busy.
class _TileRail extends StatelessWidget {
  const _TileRail({
    required this.tiles,
    required this.onTap,
    required this.width,
    required this.height,
    required this.labelInside,
  });

  final List<BrowseTile> tiles;
  final void Function(String name) onTap;
  final double width;
  final double height;
  final bool labelInside;

  @override
  Widget build(BuildContext context) {
    // Room for the caption when it sits below the image.
    final railHeight = labelInside ? height : height + 30;
    return SizedBox(
      height: railHeight,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: tiles.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (_, i) {
          final tile = tiles[i];
          return GestureDetector(
            onTap: () => onTap(tile.name),
            child: SizedBox(
              width: width,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    height: height,
                    child: _TileImage(
                      tile: tile,
                      overlayLabel: labelInside ? tile.name : null,
                    ),
                  ),
                  if (!labelInside) ...[
                    const SizedBox(height: 7),
                    Text(
                      tile.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.jost(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: ModaireColors.espressoText,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _TileImage extends StatelessWidget {
  const _TileImage({required this.tile, this.overlayLabel});
  final BrowseTile tile;
  final String? overlayLabel;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(14);
    // No artwork (offline fallback, or a category with no inventory) — a
    // labelled panel rather than a broken image.
    final hasImage = tile.image != null && tile.image!.isNotEmpty;

    return ClipRRect(
      borderRadius: radius,
      child: Container(
        color: ModaireColors.tileImageBg,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (hasImage)
              CachedNetworkImage(
                imageUrl: resolveAssetUrl(tile.image!),
                fit: BoxFit.cover,
                placeholder: (_, __) =>
                    Container(color: ModaireColors.tileImageBg),
                errorWidget: (_, __, ___) =>
                    Container(color: ModaireColors.tileImageBg),
              ),
            if (overlayLabel != null) ...[
              // Scrim only across the bottom third — a full-tile wash dulls
              // the photography these tiles exist to show off.
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.center,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Color(0x99000000)],
                  ),
                ),
              ),
              Positioned(
                left: 10,
                right: 10,
                bottom: 10,
                child: Text(
                  overlayLabel!,
                  maxLines: 2,
                  style: GoogleFonts.jost(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    height: 1.15,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
            // Text-only fallback tile.
            if (!hasImage && overlayLabel == null)
              Center(
                child: Padding(
                  padding: const EdgeInsets.all(6),
                  child: Text(
                    tile.name,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.jost(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: ModaireColors.tileTextSubtle,
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

/// Horizontal listing rail.
///
/// Height comes from [ListingGridMetrics] rather than a guessed constant:
/// [ListingTile] pins its price with `Expanded`, so an unbounded height
/// throws in debug (see the warning atop listing_grid.dart).
class _ListingRail extends StatelessWidget {
  const _ListingRail({required this.items, required this.onTap});
  final List<ListingSummary> items;
  final void Function(ListingSummary) onTap;

  static const double _tileWidth = 150;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: ListingGridMetrics.tileHeightFor(_tileWidth),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (_, i) => SizedBox(
          width: _tileWidth,
          child: ListingTile(
            listing: items[i],
            onTap: () => onTap(items[i]),
          ),
        ),
      ),
    );
  }
}
