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
      // Refetch the full cart only now that the server has actually applied
      // the change. Doing it off the optimistic state write above raced this
      // request — see the note on cartProvider.
      ref.invalidate(cartProvider);
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
  // Deliberately does NOT watch cartIdsProvider.
  //
  // It used to, so an optimistic id change refetched the cart. But the
  // optimistic write in setInCart happens BEFORE the add/remove request
  // completes, so that GET raced the mutation. When the server answered the
  // GET first it returned the pre-delete contents — and because the id set was
  // never written again, nothing ever refetched. The removed item stayed on
  // screen until the app was relaunched. Intermittent, because it came down to
  // which request the server handled first.
  //
  // setInCart is the only path that mutates the cart, and it invalidates this
  // provider once the mutation is durable.
  return ref.read(cartRepositoryProvider).get();
});
