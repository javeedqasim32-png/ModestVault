import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../listings/listing_models.dart';
import '../listings/listing_repository.dart';

/// The search screen's filter state.
///
/// Deliberately a SEPARATE provider from [exploreFiltersProvider] while
/// holding the same [ExploreFilters] value type. Same shape means text and
/// facets compose here exactly as they do on Explore, and [FilterSheet] works
/// against both; separate identity means refining a search can never reorder
/// the Explore grid behind the user. [ExploreFilters] is immutable, so there
/// is no aliasing path back to Explore either.
///
/// autoDispose so leaving the screen resets the search — arriving with a
/// stale query already applied would be surprising.
final searchFiltersProvider =
    StateProvider.autoDispose<ExploreFilters>((_) => const ExploreFilters());

/// Paginated search results. Mirrors [ExploreListingsController], reusing its
/// [ExploreListingsState] rather than cloning the class.
///
/// Replaces a non-autoDispose `FutureProvider.family<ListingPage, String>`
/// keyed on the raw query, which (a) capped results at 24 with no paging and
/// (b) cached every distinct query string for the process lifetime — typing
/// "kaftan" a character at a time retained six result pages forever.
class SearchResultsController extends AutoDisposeNotifier<ExploreListingsState> {
  // Server's max page size; same as Explore.
  static const int _pageSize = 50;

  /// Set once the provider is torn down. Every `state =` that follows an
  /// `await` has to check it: `build()` kicks off `refresh()` in a microtask,
  /// and popping the screen mid-keystroke disposes the notifier before that
  /// completes — assigning state afterwards throws. Explore's controller has
  /// no such guard only because it's never disposed.
  bool _disposed = false;

  @override
  ExploreListingsState build() {
    ref.onDispose(() => _disposed = true);
    // Re-fetch from scratch whenever the query or any facet changes.
    ref.watch(searchFiltersProvider);
    Future.microtask(refresh);
    return const ExploreListingsState(loading: true);
  }

  Future<void> refresh() async {
    if (_disposed) return;
    // Drops the previous result set rather than keeping it visible under a
    // new query — showing "kaftan" results beneath the word "saree", even
    // briefly, reads as the app having ignored the keystroke.
    state = const ExploreListingsState(loading: true);
    try {
      final page = await _fetchPage(cursor: null);
      if (_disposed) return;
      state = ExploreListingsState(
        items: page.listings,
        nextCursor: page.nextCursor,
        exhausted: page.nextCursor == null,
      );
    } catch (e) {
      if (_disposed) return;
      state = state.copyWith(loading: false, error: e);
    }
  }

  Future<void> loadMore() async {
    if (_disposed) return;
    if (state.loadingMore || state.loading) return;
    if (state.exhausted || state.nextCursor == null) return;
    state = state.copyWith(loadingMore: true);
    try {
      final page = await _fetchPage(cursor: state.nextCursor);
      if (_disposed) return;
      state = state.copyWith(
        items: [...state.items, ...page.listings],
        nextCursor: page.nextCursor,
        loadingMore: false,
        exhausted: page.nextCursor == null,
        clearNextCursor: page.nextCursor == null,
      );
    } catch (e) {
      if (_disposed) return;
      // Keep what's already on screen — a flaky next page shouldn't wipe
      // results the user is reading.
      state = state.copyWith(loadingMore: false, error: e);
    }
  }

  Future<ListingPage> _fetchPage({String? cursor}) {
    final f = ref.read(searchFiltersProvider);
    return ref.read(listingRepositoryProvider).list(
          cursor: cursor,
          limit: _pageSize,
          search: f.search.trim().isEmpty ? null : f.search.trim(),
          styles: f.styles.isEmpty ? null : f.styles,
          categories: f.categories.isEmpty ? null : f.categories,
          sizes: f.sizes.isEmpty ? null : f.sizes,
          conditions: f.conditions.isEmpty ? null : f.conditions,
          minPrice: f.minPrice,
          maxPrice: f.maxPrice,
          sort: f.sort,
        );
  }
}

/// Only mount this where `filters.hasAny` is true — the results subtree is
/// what brings the provider into existence, so a blank query never fires a
/// fetch and the screen opens without an empty-results flicker.
final searchResultsProvider =
    NotifierProvider.autoDispose<SearchResultsController, ExploreListingsState>(
  SearchResultsController.new,
);
