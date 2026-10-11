import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/listings/listing_models.dart';
import '../../../core/listings/listing_repository.dart';
import '../../../core/listings/taxonomy.dart';
import '../../../core/search/recent_searches_store.dart';
import '../../../core/search/search_controller.dart';
import '../../../shared/widgets/listing_grid.dart';
import '../../../shared/widgets/listing_tile.dart';
import '../widgets/filter_sheet.dart';
import '../widgets/search_landing.dart';
import 'explore_screen.dart' show SearchPalette;

/// Dedicated search page, reached from the floating pill on Explore.
///
/// Text query and facet filters compose in one [ExploreFilters] value held by
/// [searchFiltersProvider] — separate from Explore's provider, so refining a
/// search never reorders the Explore grid.
///
/// The body switches on `filters.hasAny`, not on the text field: that's what
/// lets a taxonomy chip show results with the field still empty.
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    // Autofocus after the first frame so the keyboard opens as the screen
    // slides in, rather than racing the route transition.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  ExploreFilters get _filters => ref.read(searchFiltersProvider);

  void _setFilters(ExploreFilters next) =>
      ref.read(searchFiltersProvider.notifier).state = next;

  /// Live typing. Debounced, and a no-op when the trimmed text already
  /// matches what's applied — typing a character then deleting it shouldn't
  /// refetch. Deliberately does NOT record to recents: that would store
  /// "k", "ka", "kaf"… one per keystroke.
  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (!mounted) return;
      final trimmed = value.trim();
      if (trimmed == _filters.search) return;
      _setFilters(_filters.copyWith(search: trimmed));
    });
  }

  /// A committed search — submitted from the keyboard, or replayed by
  /// tapping a recent chip. This is the only path that writes to recents.
  void _commitQuery(String query) {
    _debounce?.cancel();
    final trimmed = query.trim();
    if (trimmed.isEmpty) return;
    // Assigning `.text` alone would leave the caret at offset 0, so the next
    // character typed gets PREPENDED. Matters when replaying a recent chip.
    _controller.value = TextEditingValue(
      text: trimmed,
      selection: TextSelection.collapsed(offset: trimmed.length),
    );
    _setFilters(_filters.copyWith(search: trimmed));
    ref.read(recentSearchesProvider.notifier).record(trimmed);
    _focusNode.unfocus();
  }

  /// Facet-only change (taxonomy chip, filter sheet, chip removal). Leaves
  /// the text field untouched, and isn't recorded — the chips that produce
  /// these are already one tap away on the landing.
  void _applyFacets(ExploreFilters next) {
    _setFilters(next);
    _focusNode.unfocus();
  }

  /// X in the search bar. One rule the user can hold: **X means start over**
  /// — text and facets both. Removing a single facet lives on the chip row.
  void _clearAll() {
    _debounce?.cancel();
    _controller.clear();
    _setFilters(const ExploreFilters());
    _focusNode.requestFocus();
  }

  Future<void> _openFilters() async {
    _focusNode.unfocus();
    final result = await FilterSheet.show(context, initial: _filters);
    // null = dismissed without applying, which is distinct from an empty
    // ExploreFilters ("cleared everything").
    if (result != null) _setFilters(result);
  }

  void _openListing(ListingSummary listing) {
    // Search lives inside the Explore shell branch, so it must use that
    // branch's detail route — '/listings/:id' belongs to the Home branch.
    context.push('/browse/listings/${listing.id}');
  }

  @override
  Widget build(BuildContext context) {
    final filters = ref.watch(searchFiltersProvider);
    return Scaffold(
      backgroundColor: ModaireColors.browsePageBg,
      body: SafeArea(
        child: Column(
          children: [
            _buildSearchHeader(context, filters),
            _SortAndFilterBar(
              sort: filters.sort,
              facetCount: filters.activeFacetCount,
              onSort: (s) => _setFilters(_filters.copyWith(sort: s)),
              onFilters: _openFilters,
            ),
            Expanded(
              child: filters.hasAny
                  ? _SearchResultsView(
                      filters: filters,
                      onApplyFacets: _applyFacets,
                      onClearAll: _clearAll,
                      onTapListing: _openListing,
                    )
                  : SearchLanding(
                      onSubmitQuery: _commitQuery,
                      onSelectStyle: (s) =>
                          _applyFacets(_filters.copyWith(styles: {s})),
                      onSelectCategory: (c) =>
                          _applyFacets(_filters.copyWith(categories: {c})),
                      onTapListing: _openListing,
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchHeader(BuildContext context, ExploreFilters filters) {
    final facetCount = filters.activeFacetCount;
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 12, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            color: ModaireColors.tileTextPrimary,
            onPressed: () => context.pop(),
          ),
          Expanded(
            child: Container(
              height: 44,
              decoration: BoxDecoration(
                color: SearchPalette.background,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: SearchPalette.border, width: 1),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Row(
                children: [
                  Icon(
                    LucideIcons.search,
                    size: 18,
                    color: SearchPalette.foreground,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      focusNode: _focusNode,
                      textInputAction: TextInputAction.search,
                      onChanged: _onChanged,
                      onSubmitted: _commitQuery,
                      // Typed text uses the same warm foreground brown as the
                      // icon/hint — reinforces the palette instead of falling
                      // back to the default input theme's darker charcoal.
                      style: GoogleFonts.jost(
                        fontSize: 14,
                        color: SearchPalette.foreground,
                      ),
                      cursorColor: SearchPalette.foreground,
                      decoration: InputDecoration(
                        filled: false,
                        isCollapsed: true,
                        contentPadding:
                            const EdgeInsets.symmetric(vertical: 12),
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        disabledBorder: InputBorder.none,
                        errorBorder: InputBorder.none,
                        focusedErrorBorder: InputBorder.none,
                        hintText: 'Search outfits, styles, colors...',
                        hintStyle: GoogleFonts.jost(
                          fontSize: 14,
                          color:
                              SearchPalette.foreground.withValues(alpha: 0.65),
                        ),
                      ),
                    ),
                  ),
                  // Tracks the controller directly rather than reading
                  // `_controller.text` during build: build only ran on the
                  // debounced setState, so the X used to appear ~300ms after
                  // the first keystroke and linger after submit.
                  ValueListenableBuilder<TextEditingValue>(
                    valueListenable: _controller,
                    builder: (context, value, __) {
                      final show = value.text.isNotEmpty || facetCount > 0;
                      if (!show) return const SizedBox.shrink();
                      return GestureDetector(
                        onTap: _clearAll,
                        behavior: HitTestBehavior.opaque,
                        child: Padding(
                          padding: const EdgeInsets.only(left: 6),
                          child: Icon(
                            LucideIcons.x,
                            size: 16,
                            color: SearchPalette.foreground,
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 4),
          _FilterButton(count: facetCount, onTap: _openFilters),
        ],
      ),
    );
  }
}

/// Sort selector + Filters button, sitting under the search bar.
///
/// Present on the landing as well as on results: choosing "Price: Low to
/// High" before browsing a style is a reasonable thing to want, and sort
/// isn't part of `hasAny`, so setting it alone doesn't trigger a search.
class _SortAndFilterBar extends StatelessWidget {
  const _SortAndFilterBar({
    required this.sort,
    required this.facetCount,
    required this.onSort,
    required this.onFilters,
  });

  final ListingSort sort;
  final int facetCount;
  final void Function(ListingSort) onSort;
  final VoidCallback onFilters;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Row(
        children: [
          Expanded(
            child: PopupMenuButton<ListingSort>(
              initialValue: sort,
              onSelected: onSort,
              position: PopupMenuPosition.under,
              color: ModaireColors.tileBg,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
              itemBuilder: (_) => [
                for (final option in ListingSort.values)
                  PopupMenuItem(
                    value: option,
                    child: Text(
                      option.label,
                      style: GoogleFonts.jost(
                        fontSize: 14,
                        fontWeight: option == sort
                            ? FontWeight.w600
                            : FontWeight.w400,
                        color: ModaireColors.espressoText,
                      ),
                    ),
                  ),
              ],
              child: _BarButton(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'Sort: ',
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        color: ModaireColors.tileTextSubtle,
                      ),
                    ),
                    Flexible(
                      child: Text(
                        sort.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.jost(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: ModaireColors.espressoText,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Icon(
                      LucideIcons.chevronDown,
                      size: 15,
                      color: ModaireColors.tileTextSubtle,
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: GestureDetector(
              onTap: onFilters,
              behavior: HitTestBehavior.opaque,
              child: _BarButton(
                active: facetCount > 0,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      LucideIcons.slidersHorizontal,
                      size: 15,
                      color: facetCount > 0
                          ? ModaireColors.cream
                          : ModaireColors.tileTextSubtle,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      facetCount > 0 ? 'Filters ($facetCount)' : 'Filters',
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: facetCount > 0
                            ? ModaireColors.cream
                            : ModaireColors.espressoText,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BarButton extends StatelessWidget {
  const _BarButton({required this.child, this.active = false});
  final Widget child;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 42,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: active ? ModaireColors.espresso : ModaireColors.tileBg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: active ? ModaireColors.espresso : ModaireColors.pillBorder,
        ),
      ),
      child: Center(child: child),
    );
  }
}

class _FilterButton extends StatelessWidget {
  const _FilterButton({required this.count, required this.onTap});
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 44,
        height: 44,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Icon(
              LucideIcons.slidersHorizontal,
              size: 20,
              color: count > 0
                  ? ModaireColors.espresso
                  : ModaireColors.tileTextPrimary,
            ),
            if (count > 0)
              Positioned(
                top: 6,
                right: 4,
                child: Container(
                  width: 16,
                  height: 16,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    color: ModaireColors.espresso,
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    '$count',
                    style: GoogleFonts.jost(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: ModaireColors.cream,
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

/// Results + the active-filter chip row. Mounting this is what brings
/// [searchResultsProvider] into existence, so a blank query never fetches.
class _SearchResultsView extends ConsumerStatefulWidget {
  const _SearchResultsView({
    required this.filters,
    required this.onApplyFacets,
    required this.onClearAll,
    required this.onTapListing,
  });

  final ExploreFilters filters;
  final void Function(ExploreFilters) onApplyFacets;
  final VoidCallback onClearAll;
  final void Function(ListingSummary) onTapListing;

  @override
  ConsumerState<_SearchResultsView> createState() => _SearchResultsViewState();
}

class _SearchResultsViewState extends ConsumerState<_SearchResultsView> {
  final ScrollController _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_maybeLoadMore);
  }

  @override
  void dispose() {
    _scroll.removeListener(_maybeLoadMore);
    _scroll.dispose();
    super.dispose();
  }

  /// Prefetch two viewports out, matching Explore's grid.
  void _maybeLoadMore() {
    if (!_scroll.hasClients) return;
    final remaining = _scroll.position.maxScrollExtent - _scroll.position.pixels;
    if (remaining < _scroll.position.viewportDimension * 2) {
      ref.read(searchResultsProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(searchResultsProvider);

    if (state.loading && state.items.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(
          color: ModaireColors.espresso,
          strokeWidth: 2,
        ),
      );
    }
    if (state.error != null && state.items.isEmpty) {
      return _CenteredMessage(
        icon: LucideIcons.cloudOff,
        title: 'Couldn\'t load results.',
        action: 'Retry',
        onAction: () => ref.read(searchResultsProvider.notifier).refresh(),
      );
    }

    final chips = _ActiveFilterChips(
      filters: widget.filters,
      onApplyFacets: widget.onApplyFacets,
      onClearAll: widget.onClearAll,
    );

    if (state.items.isEmpty) {
      return Column(
        children: [
          chips,
          Expanded(
            child: _EmptyResults(
              filters: widget.filters,
              onClearFacets: () => widget.onApplyFacets(
                // Keeps the text, drops the facets — over-filtering is the
                // usual way to reach zero results, so this is the recovery.
                ExploreFilters(search: widget.filters.search),
              ),
            ),
          ),
        ],
      );
    }

    return Column(
      children: [
        chips,
        Expanded(
          child: LayoutBuilder(
            builder: (context, constraints) {
              // delegateFor solves the tile height for us — ListingTile pins
              // its price with Expanded and throws on unbounded height.
              final gridWidth = constraints.maxWidth - 32;
              return CustomScrollView(
                controller: _scroll,
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                    sliver: SliverGrid(
                      gridDelegate:
                          ListingGridMetrics.delegateFor(gridWidth),
                      delegate: SliverChildBuilderDelegate(
                        (context, i) => ListingTile(
                          listing: state.items[i],
                          onTap: () => widget.onTapListing(state.items[i]),
                        ),
                        childCount: state.items.length,
                      ),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: _PaginationFooter(
                      loadingMore: state.loadingMore,
                      exhausted: state.exhausted,
                      itemCount: state.items.length,
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }
}

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
        padding: EdgeInsets.symmetric(vertical: 20),
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
    // Only worth saying once the list is long enough that the user might
    // wonder whether more is coming.
    if (exhausted && itemCount >= 24) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Center(
          child: Text(
            'You\'ve seen everything.',
            style: GoogleFonts.jost(
              fontSize: 12,
              color: ModaireColors.tileTextSubtle,
            ),
          ),
        ),
      );
    }
    return const SizedBox(height: 16);
  }
}

/// One removable chip per active facet, plus Clear all.
///
/// Without this, tapping a taxonomy chip on the landing is a one-way door —
/// there'd be no visible way back short of the header X.
class _ActiveFilterChips extends StatelessWidget {
  const _ActiveFilterChips({
    required this.filters,
    required this.onApplyFacets,
    required this.onClearAll,
  });

  final ExploreFilters filters;
  final void Function(ExploreFilters) onApplyFacets;
  final VoidCallback onClearAll;

  @override
  Widget build(BuildContext context) {
    final entries = <({String label, ExploreFilters without})>[
      for (final s in filters.styles)
        (label: s, without: filters.copyWith(styles: {...filters.styles}..remove(s))),
      for (final c in filters.categories)
        (
          label: c,
          without: filters.copyWith(categories: {...filters.categories}..remove(c))
        ),
      for (final s in filters.sizes)
        (label: s, without: filters.copyWith(sizes: {...filters.sizes}..remove(s))),
      for (final c in filters.conditions)
        (
          label: c,
          without: filters.copyWith(conditions: {...filters.conditions}..remove(c))
        ),
      if (filters.minPrice != null || filters.maxPrice != null)
        (
          label:
              '\$${(filters.minPrice ?? ModaireTaxonomy.priceMin).round()}–\$${(filters.maxPrice ?? ModaireTaxonomy.priceMax).round()}',
          without: filters.copyWith(minPrice: null, maxPrice: null)
        ),
    ];

    if (entries.isEmpty) return const SizedBox.shrink();

    return SizedBox(
      height: 46,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 2, 16, 2),
        children: [
          for (final e in entries) ...[
            _RemovableChip(
              label: e.label,
              onRemove: () => onApplyFacets(e.without),
            ),
            const SizedBox(width: 8),
          ],
          GestureDetector(
            onTap: onClearAll,
            behavior: HitTestBehavior.opaque,
            child: Center(
              child: Text(
                'Clear all',
                style: GoogleFonts.jost(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: ModaireColors.espresso,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RemovableChip extends StatelessWidget {
  const _RemovableChip({required this.label, required this.onRemove});
  final String label;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        height: 32,
        padding: const EdgeInsets.only(left: 12, right: 8),
        decoration: BoxDecoration(
          color: ModaireColors.secondary,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: GoogleFonts.jost(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: ModaireColors.espressoText,
              ),
            ),
            const SizedBox(width: 4),
            GestureDetector(
              onTap: onRemove,
              behavior: HitTestBehavior.opaque,
              child: Icon(
                LucideIcons.x,
                size: 13,
                color: ModaireColors.tileTextSubtle,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Zero results. Three phrasings, because "No matches for ''" is what the
/// single-message version rendered once facets could exist without text.
class _EmptyResults extends StatelessWidget {
  const _EmptyResults({required this.filters, required this.onClearFacets});

  final ExploreFilters filters;
  final VoidCallback onClearFacets;

  @override
  Widget build(BuildContext context) {
    final query = filters.search.trim();
    final facetLabels = [
      ...filters.styles,
      ...filters.categories,
      ...filters.sizes,
      ...filters.conditions,
    ];
    final hasFacets =
        facetLabels.isNotEmpty || filters.minPrice != null || filters.maxPrice != null;
    final facetText = facetLabels.isEmpty ? 'those filters' : facetLabels.join(', ');

    final String title;
    final String? subtitle;
    if (query.isNotEmpty && hasFacets) {
      title = 'No matches for "$query" in $facetText.';
      subtitle = 'Filters may be narrowing this too far.';
    } else if (query.isNotEmpty) {
      title = 'No matches for "$query".';
      subtitle = 'Try a shorter word, or check the spelling.';
    } else {
      title = 'Nothing in $facetText right now.';
      subtitle = 'Try a different filter.';
    }

    return _CenteredMessage(
      icon: LucideIcons.search,
      title: title,
      subtitle: subtitle,
      action: query.isNotEmpty && hasFacets ? 'Clear filters' : null,
      onAction: query.isNotEmpty && hasFacets ? onClearFacets : null,
    );
  }
}

class _CenteredMessage extends StatelessWidget {
  const _CenteredMessage({
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: ModaireColors.tileBorder),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: GoogleFonts.jost(
                fontSize: 15,
                fontWeight: FontWeight.w500,
                color: ModaireColors.tileTextPrimary,
                height: 1.4,
              ),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(
                subtitle!,
                textAlign: TextAlign.center,
                style: GoogleFonts.jost(
                  fontSize: 13,
                  color: ModaireColors.tileTextSubtle,
                  height: 1.4,
                ),
              ),
            ],
            if (action != null) ...[
              const SizedBox(height: 18),
              GestureDetector(
                onTap: onAction,
                behavior: HitTestBehavior.opaque,
                child: Container(
                  height: 40,
                  padding: const EdgeInsets.symmetric(horizontal: 22),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: ModaireColors.espresso,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    action!,
                    style: GoogleFonts.jost(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: ModaireColors.cream,
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
