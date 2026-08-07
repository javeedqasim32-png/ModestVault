import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import 'listing_models.dart';

class ListingRepository {
  ListingRepository(this._dio);
  final Dio _dio;

  Future<ListingPage> list({
    String? cursor,
    int limit = 24,
    String? search,
    String? category,
    Set<String>? styles,
    Set<String>? categories,
    Set<String>? sizes,
    Set<String>? conditions,
    double? minPrice,
    double? maxPrice,
  }) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/v1/listings',
        queryParameters: {
          if (cursor != null) 'cursor': cursor,
          'limit': limit,
          if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
          if (category != null && category.trim().isNotEmpty) 'category': category,
          if (styles != null && styles.isNotEmpty) 'styles': styles.join(','),
          if (categories != null && categories.isNotEmpty)
            'categories': categories.join(','),
          if (sizes != null && sizes.isNotEmpty) 'sizes': sizes.join(','),
          if (conditions != null && conditions.isNotEmpty)
            'conditions': conditions.join(','),
          if (minPrice != null) 'minPrice': minPrice,
          if (maxPrice != null) 'maxPrice': maxPrice,
        },
      );
      final body = res.data!;
      final items = (body['listings'] as List<dynamic>)
          .map((e) => ListingSummary.fromJson(e as Map<String, dynamic>))
          .toList();
      return ListingPage(
        listings: items,
        nextCursor: body['nextCursor'] as String?,
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<ListingDetail> get(String id) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/v1/listings/$id');
      return ListingDetail.fromJson(res.data!['listing'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final listingRepositoryProvider = Provider<ListingRepository>((ref) {
  return ListingRepository(ref.read(dioProvider));
});

/// Plain unfiltered browse (used by the legacy Home grid fallback).
final browseListingsProvider = FutureProvider<ListingPage>((ref) {
  return ref.read(listingRepositoryProvider).list(limit: 24);
});

/// Immutable Explore filter snapshot — the search bar + filter sheet
/// mutate this through [exploreFiltersProvider]. Empty fields mean
/// "no filter on that axis".
class ExploreFilters {
  const ExploreFilters({
    this.search = '',
    this.styles = const {},
    this.categories = const {},
    this.sizes = const {},
    this.conditions = const {},
    this.minPrice,
    this.maxPrice,
  });

  final String search;
  final Set<String> styles;
  final Set<String> categories;
  final Set<String> sizes;
  final Set<String> conditions;
  final double? minPrice;
  final double? maxPrice;

  bool get hasAny =>
      search.trim().isNotEmpty ||
      styles.isNotEmpty ||
      categories.isNotEmpty ||
      sizes.isNotEmpty ||
      conditions.isNotEmpty ||
      minPrice != null ||
      maxPrice != null;

  int get activeFacetCount =>
      (styles.isNotEmpty ? 1 : 0) +
      (categories.isNotEmpty ? 1 : 0) +
      (sizes.isNotEmpty ? 1 : 0) +
      (conditions.isNotEmpty ? 1 : 0) +
      (minPrice != null || maxPrice != null ? 1 : 0);

  ExploreFilters copyWith({
    String? search,
    Set<String>? styles,
    Set<String>? categories,
    Set<String>? sizes,
    Set<String>? conditions,
    Object? minPrice = _sentinel,
    Object? maxPrice = _sentinel,
  }) {
    return ExploreFilters(
      search: search ?? this.search,
      styles: styles ?? this.styles,
      categories: categories ?? this.categories,
      sizes: sizes ?? this.sizes,
      conditions: conditions ?? this.conditions,
      minPrice: identical(minPrice, _sentinel) ? this.minPrice : minPrice as double?,
      maxPrice: identical(maxPrice, _sentinel) ? this.maxPrice : maxPrice as double?,
    );
  }
}

// Distinguishes "leave as-is" from "set to null" in copyWith.
const Object _sentinel = Object();

final exploreFiltersProvider =
    StateProvider<ExploreFilters>((_) => const ExploreFilters());

/// Convenience read of just the search field — bound by the search bar
/// widget that doesn't want to rebuild on price-slider changes etc.
final exploreSearchQueryProvider = Provider<String>(
  (ref) => ref.watch(exploreFiltersProvider).search,
);

/// Paginated Explore state — holds the accumulated list of items across
/// pages, plus the cursor for the next page. The Explore screen watches
/// this and calls `loadMore()` as the grid nears the bottom.
///
/// Previously a single-shot FutureProvider capped at 24 items; users
/// with more inventory in the DB only ever saw the first page. Cursor
/// pagination pulls the full catalog progressively.
class ExploreListingsState {
  const ExploreListingsState({
    this.items = const [],
    this.nextCursor,
    this.loading = false,
    this.loadingMore = false,
    this.exhausted = false,
    this.error,
  });

  final List<ListingSummary> items;
  final String? nextCursor;
  final bool loading;
  final bool loadingMore;
  final bool exhausted;
  final Object? error;

  ExploreListingsState copyWith({
    List<ListingSummary>? items,
    String? nextCursor,
    bool? loading,
    bool? loadingMore,
    bool? exhausted,
    Object? error,
    bool clearNextCursor = false,
    bool clearError = false,
  }) =>
      ExploreListingsState(
        items: items ?? this.items,
        nextCursor: clearNextCursor ? null : (nextCursor ?? this.nextCursor),
        loading: loading ?? this.loading,
        loadingMore: loadingMore ?? this.loadingMore,
        exhausted: exhausted ?? this.exhausted,
        error: clearError ? null : (error ?? this.error),
      );
}

class ExploreListingsController extends Notifier<ExploreListingsState> {
  // Server accepts up to 50 per page (see limit validator on the route).
  // Larger pages = fewer roundtrips as the user scrolls.
  static const int _pageSize = 50;

  @override
  ExploreListingsState build() {
    // Re-fetch from scratch whenever any filter facet changes. Watching
    // exploreFiltersProvider triggers this whole rebuild path.
    ref.watch(exploreFiltersProvider);
    Future.microtask(refresh);
    return const ExploreListingsState(loading: true);
  }

  Future<void> refresh() async {
    state = state.copyWith(
      loading: true,
      loadingMore: false,
      exhausted: false,
      clearError: true,
    );
    try {
      final page = await _fetchPage(cursor: null);
      state = ExploreListingsState(
        items: page.listings,
        nextCursor: page.nextCursor,
        exhausted: page.nextCursor == null,
      );
    } catch (e) {
      state = state.copyWith(loading: false, error: e);
    }
  }

  Future<void> loadMore() async {
    // Guard: already fetching, no more pages, or in an error state.
    if (state.loadingMore || state.loading) return;
    if (state.exhausted || state.nextCursor == null) return;
    state = state.copyWith(loadingMore: true);
    try {
      final page = await _fetchPage(cursor: state.nextCursor);
      state = state.copyWith(
        items: [...state.items, ...page.listings],
        nextCursor: page.nextCursor,
        loadingMore: false,
        exhausted: page.nextCursor == null,
        clearNextCursor: page.nextCursor == null,
      );
    } catch (e) {
      // Keep prior items visible on paging error — swallow so a flaky
      // next-page fetch doesn't wipe the grid the user is already reading.
      state = state.copyWith(loadingMore: false, error: e);
    }
  }

  Future<ListingPage> _fetchPage({String? cursor}) {
    final f = ref.read(exploreFiltersProvider);
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
        );
  }
}

final exploreListingsProvider =
    NotifierProvider<ExploreListingsController, ExploreListingsState>(
        ExploreListingsController.new);

final listingDetailProvider =
    FutureProvider.family<ListingDetail, String>((ref, id) {
  return ref.read(listingRepositoryProvider).get(id);
});
