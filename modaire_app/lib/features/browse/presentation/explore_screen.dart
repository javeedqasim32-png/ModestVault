import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/listings/listing_models.dart';
import '../../../core/listings/listing_repository.dart';
import '../../../shared/widgets/listing_grid.dart';
import '../../../shared/widgets/listing_tile.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

/// Explore tab: a full-viewport grid of listings with a small,
/// glassmorphic search pill floating at the bottom-center — above the
/// tab bar, below the last grid row. Tapping the pill routes to
/// /browse/search (dedicated full-screen search page). Grid gets extra
/// bottom padding so the last row isn't hidden under the pill.
///
/// Grid paginates via cursor as the user scrolls near the bottom (see
/// ExploreListingsController). Previously capped at 24 items regardless
/// of DB size — now loads the full catalog progressively in 50-item pages.
class ExploreScreen extends ConsumerWidget {
  const ExploreScreen({super.key});

  // Floating pill sits just above the nav — a small gap keeps it visually
  // separated but close so the eye reads pill-and-nav as one bottom band.
  static const double _pillBottomOffset = 8;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(exploreListingsProvider);
    // Grid ends above the nav naturally (extendBody:false). Just enough
    // bottom padding so the last row clears the small floating pill
    // (pill: bottom 8 + height 40 = 48 above nav; 60 for a small gap).
    const gridBottomPadding = 60.0;

    return Scaffold(
      backgroundColor: ModaireColors.browsePageBg,
      appBar: const ModaireAppBar(),
      body: Stack(
        children: [
          RefreshIndicator(
            color: ModaireColors.espresso,
            backgroundColor: ModaireColors.cream,
            onRefresh: () =>
                ref.read(exploreListingsProvider.notifier).refresh(),
            child: _buildBody(context, ref, state, gridBottomPadding),
          ),
          Positioned(
            bottom: _pillBottomOffset,
            left: 0,
            right: 0,
            child: Center(child: _FloatingSearchPill()),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(
    BuildContext context,
    WidgetRef ref,
    ExploreListingsState state,
    double bottomPadding,
  ) {
    // Cold-load spinner (only when there are no items to show yet).
    if (state.loading && state.items.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(
          color: ModaireColors.espresso,
          strokeWidth: 2,
        ),
      );
    }
    // First-load error with no cached items.
    if (state.error != null && state.items.isEmpty) {
      return const _EmptyOrError(message: 'Couldn\'t load listings');
    }
    // Legitimately empty result set.
    if (state.items.isEmpty) {
      return const _EmptyOrError(
        message: 'No items found.\nTry a different search.',
      );
    }
    return _ExploreGrid(
      items: state.items,
      bottomPadding: bottomPadding,
      loadingMore: state.loadingMore,
      exhausted: state.exhausted,
      onLoadMore: () => ref.read(exploreListingsProvider.notifier).loadMore(),
    );
  }
}

/// Fixed-column-count grid with pre-computed tile height. Uses a
/// LayoutBuilder so the tile height math is based on the real viewport
/// width, not on flutter_staggered_grid_view's intrinsic sizing (which
/// crashes with AspectRatio children). Text block below the 3:4 image
/// is ~84px — matches _tileTextBlockHeight in home_screen.dart.
///
/// Fires [onLoadMore] when the scroll offset gets within ~2 screen-heights
/// of the bottom so the next page arrives before the user hits the end.
class _ExploreGrid extends StatefulWidget {
  const _ExploreGrid({
    required this.items,
    this.bottomPadding = 24,
    required this.loadingMore,
    required this.exhausted,
    required this.onLoadMore,
  });
  final List<ListingSummary> items;
  final double bottomPadding;
  final bool loadingMore;
  final bool exhausted;
  final VoidCallback onLoadMore;

  @override
  State<_ExploreGrid> createState() => _ExploreGridState();
}

class _ExploreGridState extends State<_ExploreGrid> {
  final _scrollController = ScrollController();

  // Geometry comes from ListingGridMetrics so Explore, Home, Favorites and
  // seller profiles can't drift apart. Explore keeps its own scroll view
  // because it needs a controller for cursor pagination.
  static const double _horizontalPadding = 16;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (widget.exhausted || widget.loadingMore) return;
    // Prefetch when within 2 viewport heights of the bottom — hides the
    // network round-trip so scrolling stays smooth end-to-end.
    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - (position.viewportDimension * 2)) {
      widget.onLoadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final availableWidth =
            constraints.maxWidth - (_horizontalPadding * 2);

        // One extra row worth of footer at the bottom for the loading
        // spinner / "no more listings" cap. Rendered as the last grid
        // cell so it always flows below the last tile row.
        return CustomScrollView(
          controller: _scrollController,
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverPadding(
              padding: EdgeInsets.fromLTRB(
                _horizontalPadding,
                4,
                _horizontalPadding,
                widget.bottomPadding,
              ),
              sliver: SliverGrid(
                gridDelegate:
                    ListingGridMetrics.delegateFor(availableWidth),
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final listing = widget.items[index];
                    return ListingTile(
                      listing: listing,
                      onTap: () => context.push('/browse/listings/${listing.id}'),
                    );
                  },
                  childCount: widget.items.length,
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: _PaginationFooter(
                loadingMore: widget.loadingMore,
                exhausted: widget.exhausted,
                itemCount: widget.items.length,
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Renders a spinner while the next page is loading, or a subtle "You've
/// seen everything" cap once every listing has been shown. Keeps 24px of
/// bottom breathing room in both cases so the last tile row doesn't feel
/// jammed against the floating search pill.
class _PaginationFooter extends StatelessWidget {
  const _PaginationFooter({
    required this.loadingMore,
    required this.exhausted,
    required this.itemCount,
  });
  final bool loadingMore;
  final bool exhausted;
  final int itemCount;

  @override
  Widget build(BuildContext context) {
    if (loadingMore) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(
              color: ModaireColors.espresso,
              strokeWidth: 2,
            ),
          ),
        ),
      );
    }
    // Only show the "seen everything" cap when there's actually a full
    // first page's worth of items — for tiny result sets it's just noise.
    if (exhausted && itemCount >= 24) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Center(
          child: Text(
            'You\'ve seen everything.',
            style: GoogleFonts.jost(
              fontSize: 12,
              color: ModaireColors.tileTextSubtle,
              letterSpacing: 0.4,
            ),
          ),
        ),
      );
    }
    return const SizedBox(height: 24);
  }
}

/// Glassmorphic pill that floats above the grid. Tap routes to
/// /browse/search (the full-screen dedicated search page). BackdropFilter
/// blurs the grid content passing behind it, giving that "transparent
/// through frosted glass" feel — same treatment as the bottom nav pill.
/// Warm Modaire-branded palette for the search surface. Applied to
/// BOTH the floating pill on Explore and the input on SearchScreen so
/// tapping the pill → arriving on the search screen doesn't jar the eye
/// with a color change. Kept as public statics so both files reference
/// the same constants (no drift).
class SearchPalette {
  const SearchPalette._();
  static const Color background = Color(0xFFE8DDD2);
  static const Color foreground = Color(0xFF765C4D);
  static const Color border = Color(0xFFD3C2B4);
}

class _FloatingSearchPill extends StatelessWidget {
  const _FloatingSearchPill();

  @override
  Widget build(BuildContext context) {
    // Compact centered pill — width capped at 220px OR 60% of the
    // viewport (whichever is smaller). Big-brand pattern (Amazon /
    // Depop): search sits at bottom-middle where thumbs naturally reach.
    final maxWidth = MediaQuery.of(context).size.width * 0.6;
    return GestureDetector(
      onTap: () => context.push('/browse/search'),
      behavior: HitTestBehavior.opaque,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: maxWidth < 220 ? maxWidth : 220,
        ),
        child: Container(
          height: 40,
          decoration: BoxDecoration(
            color: SearchPalette.background,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: SearchPalette.border, width: 1),
            boxShadow: const [
              BoxShadow(
                color: Color(0x14000000),
                blurRadius: 10,
                offset: Offset(0, 3),
              ),
            ],
          ),
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                LucideIcons.search,
                size: 16,
                color: SearchPalette.foreground,
              ),
              const SizedBox(width: 8),
              Text(
                'Search',
                style: GoogleFonts.jost(
                  fontSize: 13,
                  color: SearchPalette.foreground,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyOrError extends StatelessWidget {
  const _EmptyOrError({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        const SizedBox(height: 160),
        Center(
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: GoogleFonts.jost(
              fontSize: 14,
              color: ModaireColors.tileTextSubtle,
              height: 1.4,
            ),
          ),
        ),
      ],
    );
  }
}
