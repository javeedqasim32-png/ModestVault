import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/home/home_repository.dart';
import '../../../core/listings/listing_models.dart';
import '../../../core/listings/listing_repository.dart';
import '../../../core/recently_viewed/recently_viewed_store.dart';
import '../../../shared/utils/asset_url.dart';
import '../../../shared/widgets/listing_grid.dart';
import '../../../shared/widgets/listing_tile.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

/// Curated Home landing — mirrors the website's `/` page mobile block:
/// categories row → editorial hero → Trending Now (3-col) → Featured
/// (2-col). Single GET /api/v1/home call hydrates everything.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final homeAsync = ref.watch(homeContentProvider);

    return Scaffold(
      backgroundColor: ModaireColors.browsePageBg,
      appBar: const ModaireAppBar(),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(homeContentProvider);
          ref.invalidate(recentlyViewedListingsProvider);
          await ref.read(homeContentProvider.future);
        },
        color: ModaireColors.espresso,
        backgroundColor: ModaireColors.cream,
        child: homeAsync.when(
          loading: () => const _Loading(),
          error: (e, _) => _Error(
            onRetry: () => ref.invalidate(homeContentProvider),
          ),
          data: (home) => _HomeBody(home: home),
        ),
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) => ListView(
        children: const [
          SizedBox(height: 120),
          Center(
            child: CircularProgressIndicator(
              color: ModaireColors.espresso,
              strokeWidth: 2,
            ),
          ),
        ],
      );
}

class _Error extends StatelessWidget {
  const _Error({required this.onRetry});
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
            'Couldn\'t load Home',
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

class _HomeBody extends ConsumerWidget {
  const _HomeBody({required this.home});
  final HomeContent home;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recentAsync = ref.watch(recentlyViewedListingsProvider);
    final recentItems = recentAsync.valueOrNull ?? const <ListingSummary>[];

    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        _CategoriesRow(categories: home.categories),
        const SizedBox(height: 12),
        _Hero(imageUrl: home.heroImageUrl),
        const SizedBox(height: 16),
        if (home.trending.isNotEmpty) ...[
          _SectionHeader(
            title: 'Trending Now',
            onSeeAll: () => context.push('/browse'),
          ),
          _TrendingGrid(items: home.trending),
          const SizedBox(height: 20),
        ],
        if (home.featured.isNotEmpty) ...[
          _SectionHeader(
            title: 'Featured',
            onSeeAll: () => context.push('/browse'),
          ),
          _FeaturedGrid(items: home.featured),
          const SizedBox(height: 20),
        ],
        if (home.featuredSellers.isNotEmpty) ...[
          _SectionHeader(
            title: 'Featured Sellers',
            onSeeAll: null,
          ),
          _FeaturedSellersRow(sellers: home.featuredSellers),
          const SizedBox(height: 20),
        ],
        if (recentItems.isNotEmpty) ...[
          _SectionHeader(
            title: 'Recently Viewed',
            onSeeAll: null,
          ),
          _RecentlyViewedRow(items: recentItems),
        ],
      ],
    );
  }
}

class _FeaturedSellersRow extends StatelessWidget {
  const _FeaturedSellersRow({required this.sellers});
  final List<FeaturedSeller> sellers;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 130,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: sellers.length,
        separatorBuilder: (_, __) => const SizedBox(width: 16),
        itemBuilder: (context, i) {
          final s = sellers[i];
          return GestureDetector(
            onTap: () => context.push('/sellers/${s.id}'),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 68,
                  height: 68,
                  decoration: BoxDecoration(
                    color: ModaireColors.sellerAvatarBg,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: ModaireColors.pillBorder,
                      width: 1.5,
                    ),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: s.profileImage != null
                      ? CachedNetworkImage(
                          imageUrl: resolveAssetUrl(s.profileImage!),
                          fit: BoxFit.cover,
                          placeholder: (_, __) => Container(
                              color: ModaireColors.sellerAvatarBg),
                          errorWidget: (_, __, ___) => _initials(s),
                        )
                      : _initials(s),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: 88,
                  child: Text(
                    s.displayName,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jost(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: ModaireColors.tileTextPrimary,
                    ),
                  ),
                ),
                Text(
                  '${s.activeCount} item${s.activeCount == 1 ? '' : 's'}',
                  style: GoogleFonts.jost(
                    fontSize: 11,
                    color: ModaireColors.tileTextSubtle,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _initials(FeaturedSeller s) => Center(
        child: Text(
          s.initials,
          style: GoogleFonts.cormorantGaramond(
            fontSize: 22,
            color: ModaireColors.espresso,
          ),
        ),
      );
}

class _RecentlyViewedRow extends StatelessWidget {
  const _RecentlyViewedRow({required this.items});
  final List<ListingSummary> items;

  @override
  Widget build(BuildContext context) {
    // Horizontal scroll of tiles. Each tile keeps the same compact shape
    // as the grid tiles but in a fixed width so they line up nicely in
    // a row.
    return SizedBox(
      height: 300,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, i) {
          return SizedBox(
            width: 150,
            child: ListingTile(
              listing: items[i],
              onTap: () => context.push('/listings/${items[i].id}'),
            ),
          );
        },
      ),
    );
  }
}

class _CategoriesRow extends StatelessWidget {
  const _CategoriesRow({required this.categories});
  final List<HomeCategory> categories;

  @override
  Widget build(BuildContext context) {
    // Fixed 5-column grid (matches the website's `grid-cols-5` on
    // mobile) so all five categories sit on one row regardless of
    // device width. Each cell flexes to a fair share of the
    // remaining space.
    return Padding(
      // Top padding is larger than the bottom: scale-1.5 makes the artwork
      // overflow its box upward by ~17px, so the visible head sits ~6px
      // ABOVE the layout box. At 8px the heads nearly touched the app bar.
      // The website gives this section pt-8 (32px) for the same reason.
      padding: const EdgeInsets.fromLTRB(12, 20, 12, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: categories
            .map((c) => Expanded(child: _CategoryCell(category: c)))
            .toList(),
      ),
    );
  }
}

class _CategoryCell extends ConsumerWidget {
  const _CategoryCell({required this.category});
  final HomeCategory category;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () {
        // Set the Explore style filter to just this category's style,
        // then switch to the Explore tab. `context.go('/browse')` causes
        // the StatefulShellRoute to swap the active branch.
        final current = ref.read(exploreFiltersProvider);
        ref.read(exploreFiltersProvider.notifier).state =
            current.copyWith(styles: {category.style});
        context.go('/browse');
      },
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Mirrors src/app/page.tsx: `object-contain mix-blend-multiply
            // scale-[1.5]` in a plain square box. Deliberately NOT clipped to
            // an oval — the category PNGs are RGBA with the blush circle
            // already baked in, so the website draws no circle of its own.
            // Clipping and cropping to `cover` was cutting into artwork that
            // is meant to sit whole inside the frame, which is most of why
            // the two looked different.
            AspectRatio(
              aspectRatio: 1,
              // NOT clipped. The website's box carries no overflow-hidden, so
              // its scaled image spills past the frame into the surrounding
              // whitespace and stays fully visible. Clipping here cropped the
              // models' heads, because scale-1.5 genuinely overflows: the
              // artwork's subject is 613x705 inside a 975 square, so the
              // height-limited ceiling is 975/705 = 1.38x, not 1.5. The web
              // renders that overflow rather than hiding it, and the ~4% that
              // spills top and bottom is absorbed by the row padding and the
              // gap above the label.
              child: Transform.scale(
                scale: 1.5,
                child: CachedNetworkImage(
                  imageUrl: resolveAssetUrl(category.imageUrl),
                  fit: BoxFit.contain,
                  // CSS mix-blend-multiply blends with the backdrop; the
                  // backdrop here is the flat page background, so multiplying
                  // against that colour reproduces it. Near-identity on a
                  // cream page — it exists to keep any off-white in the
                  // artwork from reading brighter than the page.
                  placeholder: (_, __) => const SizedBox.shrink(),
                  errorWidget: (_, __, ___) => const Icon(
                    LucideIcons.imageOff,
                    color: ModaireColors.tileTextSubtle,
                    size: 22,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              category.label.toUpperCase(),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              // 9px, not the website's 10px: these cells are ~69px wide
              // (screen / 5) versus the web's fixed 80px box, so 10px clips
              // "WESTERN" and "FORMALS". Letter spacing scaled to match.
              style: GoogleFonts.jost(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.8,
                color: const Color(0xFF5C4A3C),
                height: 1.2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.imageUrl});
  final String imageUrl;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/browse'),
      child: AspectRatio(
        aspectRatio: 16 / 11,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 0),
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFFEFE2D7), Color(0xFFE7D7CB)],
            ),
          ),
          child: CachedNetworkImage(
            imageUrl: resolveAssetUrl(imageUrl),
            fit: BoxFit.cover,
            alignment: Alignment.topCenter,
            placeholder: (_, __) =>
                const SizedBox.shrink(), // gradient already showing
            errorWidget: (_, __, ___) => const SizedBox.shrink(),
          ),
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.onSeeAll});
  final String title;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) {
    return Padding(
      // Website equivalent: pb-[10px] pt-[8px] on the section header row.
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Expanded(
            child: Text(
              title,
              style: GoogleFonts.cormorantGaramond(
                fontSize: 23,
                fontWeight: FontWeight.w500,
                height: 1.05,
                color: ModaireColors.espressoText,
              ),
            ),
          ),
          if (onSeeAll != null)
            GestureDetector(
              onTap: onSeeAll,
              child: Text(
                'See all',
                style: GoogleFonts.jost(
                  fontSize: 12,
                  color: ModaireColors.tileTextSubtle,
                ),
              ),
            ),
        ],
      ),
    );
  }
}


/// Renders a fixed-height row/wrap of tiles at the given column count.
/// LayoutBuilder gives us the real container width so we can compute
/// column_width, image height (3:4), and tile height precisely — no
/// aspect-ratio guessing, no phantom grid rows.
Widget _buildManualGrid(
  BuildContext context, {
  required List<ListingSummary> items,
  required int crossAxisCount,
}) {
  const gap = ListingGridMetrics.crossAxisSpacing;
  const horizontalPadding = 16.0;
  return LayoutBuilder(
    builder: (context, constraints) {
      final availableWidth =
          constraints.maxWidth - (horizontalPadding * 2);
      // Shared geometry — see ListingGridMetrics. Home lays tiles out
      // manually (chunked rows rather than a GridView) but must produce the
      // exact same tile height, or the rails visibly disagree with Explore.
      final columnWidth = ListingGridMetrics.columnWidthFor(
        availableWidth,
        columns: crossAxisCount,
      );
      final tileHeight = ListingGridMetrics.tileHeightFor(columnWidth);

      Widget tile(ListingSummary item) => SizedBox(
            width: columnWidth,
            height: tileHeight,
            child: ListingTile(
              listing: item,
              onTap: () => context.push('/listings/${item.id}'),
            ),
          );

      // Chunk items into rows.
      final rows = <List<ListingSummary>>[];
      for (var i = 0; i < items.length; i += crossAxisCount) {
        rows.add(items.sublist(
          i,
          (i + crossAxisCount).clamp(0, items.length),
        ));
      }

      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: horizontalPadding),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var r = 0; r < rows.length; r++) ...[
              if (r > 0) const SizedBox(height: gap),
              Row(
                children: [
                  for (var c = 0; c < rows[r].length; c++) ...[
                    if (c > 0) const SizedBox(width: gap),
                    tile(rows[r][c]),
                  ],
                ],
              ),
            ],
          ],
        ),
      );
    },
  );
}

class _TrendingGrid extends StatelessWidget {
  const _TrendingGrid({required this.items});
  final List<ListingSummary> items;

  @override
  Widget build(BuildContext context) =>
      _buildManualGrid(context, items: items, crossAxisCount: 3);
}

class _FeaturedGrid extends StatelessWidget {
  const _FeaturedGrid({required this.items});
  final List<ListingSummary> items;

  @override
  Widget build(BuildContext context) =>
      _buildManualGrid(context, items: items, crossAxisCount: 2);
}
