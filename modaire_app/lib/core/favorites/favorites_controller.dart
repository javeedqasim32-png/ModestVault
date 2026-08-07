import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'favorites_repository.dart';

/// Single source of truth for which listing IDs the current user has
/// favorited. Loaded once after sign-in, then mutated optimistically by
/// `setFavorite` — if the backend call fails we roll back to the prior
/// snapshot so the heart icons stay accurate.
class FavoriteIdsController extends AsyncNotifier<Set<String>> {
  @override
  Future<Set<String>> build() async {
    final repo = ref.read(favoritesRepositoryProvider);
    return repo.listIds();
  }

  bool contains(String listingId) {
    return state.valueOrNull?.contains(listingId) ?? false;
  }

  Future<void> setFavorite(String listingId, bool wantFavorited) async {
    final prior = state.valueOrNull ?? <String>{};
    final next = {...prior};
    if (wantFavorited) {
      if (!next.add(listingId)) return; // already in set, no-op
    } else {
      if (!next.remove(listingId)) return; // not in set, no-op
    }
    state = AsyncData(next);
    try {
      final repo = ref.read(favoritesRepositoryProvider);
      if (wantFavorited) {
        await repo.add(listingId);
      } else {
        await repo.remove(listingId);
      }
    } catch (_) {
      // Roll back so the heart icon matches what the backend actually has.
      // Caller handles the exception (SnackBar etc.).
      state = AsyncData(prior);
      rethrow;
    }
  }
}

final favoriteIdsProvider =
    AsyncNotifierProvider<FavoriteIdsController, Set<String>>(
        FavoriteIdsController.new);

final favoritesListProvider = FutureProvider.autoDispose((ref) {
  // Watch the IDs so that when the user un-favorites something the list
  // refetches and stays in sync without a manual invalidate from every
  // caller that mutated.
  ref.watch(favoriteIdsProvider);
  return ref.read(favoritesRepositoryProvider).list();
});
