import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'cart_repository.dart';

/// Holds the `Set<String>` of listing IDs currently in the user's cart.
/// Same optimistic-mutation pattern as FavoriteIdsController — the UI
/// flips the "Add to Bag" button instantly and rolls back if the
/// backend rejects.
class CartIdsController extends AsyncNotifier<Set<String>> {
  @override
  Future<Set<String>> build() {
    return ref.read(cartRepositoryProvider).listIds();
  }

  bool contains(String listingId) =>
      state.valueOrNull?.contains(listingId) ?? false;

  Future<void> setInCart(String listingId, bool wantInCart) async {
    final prior = state.valueOrNull ?? <String>{};
    final next = {...prior};
    if (wantInCart) {
      if (!next.add(listingId)) return;
    } else {
      if (!next.remove(listingId)) return;
    }
    state = AsyncData(next);
    try {
      final repo = ref.read(cartRepositoryProvider);
      if (wantInCart) {
        await repo.add(listingId);
      } else {
        await repo.remove(listingId);
      }
    } catch (_) {
      state = AsyncData(prior);
      rethrow;
    }
  }
}

final cartIdsProvider =
    AsyncNotifierProvider<CartIdsController, Set<String>>(
        CartIdsController.new);

final cartProvider = FutureProvider.autoDispose((ref) {
  // Re-fetch the full cart whenever the ID set changes so subtotal +
  // line items stay in sync after Add to Bag / remove.
  ref.watch(cartIdsProvider);
  return ref.read(cartRepositoryProvider).get();
});
