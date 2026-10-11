import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

const String _kKey = 'modaire.recent_searches';

/// These are chips on a landing page, not a feed — eight already wraps to
/// two rows on a narrow phone. (RecentlyViewedStore keeps 30 because it
/// backs a scrolling rail.)
const int _kMaxEntries = 8;

/// Matches the server's `search: z.string().trim().min(1).max(120)`, so a
/// stored query can always be replayed.
const int _kMaxQueryLength = 120;

/// Persists the seller's recent search queries on-device, most recent first.
///
/// Same SharedPreferences/`setStringList` shape as [RecentlyViewedStore].
/// Dedupe is case-insensitive but the user's own casing is what gets stored
/// and displayed — searching "Kaftan" then "kaftan" should leave one chip,
/// and it should read the way they last typed it.
class RecentSearchesStore {
  RecentSearchesStore(this._prefs);
  final SharedPreferences _prefs;

  List<String> read() => _prefs.getStringList(_kKey) ?? const [];

  /// Adds [query] at the front, promoting it if already present.
  ///
  /// Callers must only invoke this on a COMMITTED search (submit, or tapping
  /// an existing chip) — never on a debounce tick, or typing "kaftan" writes
  /// six entries and the chip row is immediately useless.
  Future<List<String>> record(String query) async {
    var trimmed = query.trim();
    if (trimmed.isEmpty) return read();
    if (trimmed.length > _kMaxQueryLength) {
      trimmed = trimmed.substring(0, _kMaxQueryLength);
    }
    final folded = trimmed.toLowerCase();
    final next = [
      trimmed,
      ...read().where((q) => q.toLowerCase() != folded),
    ];
    if (next.length > _kMaxEntries) next.removeRange(_kMaxEntries, next.length);
    await _prefs.setStringList(_kKey, next);
    return next;
  }

  Future<List<String>> remove(String query) async {
    final folded = query.trim().toLowerCase();
    final next = read().where((q) => q.toLowerCase() != folded).toList();
    await _prefs.setStringList(_kKey, next);
    return next;
  }

  Future<List<String>> clear() async {
    await _prefs.remove(_kKey);
    return const [];
  }
}

final recentSearchesStoreProvider =
    FutureProvider<RecentSearchesStore>((ref) async {
  final prefs = await SharedPreferences.getInstance();
  return RecentSearchesStore(prefs);
});

/// Live view of the recent-search list.
///
/// An AsyncNotifier rather than a plain FutureProvider because the chip row
/// has to update while the user is standing on the screen — submit a query
/// and the chip should already be there when they clear the field. Writes go
/// through to disk and update state in one step, the same shape as
/// [FavoriteIdsController]. Deliberately NOT autoDispose: the list should
/// outlive the search screen.
class RecentSearchesController extends AsyncNotifier<List<String>> {
  @override
  Future<List<String>> build() async {
    final store = await ref.read(recentSearchesStoreProvider.future);
    return store.read();
  }

  Future<void> record(String query) => _mutate((s) => s.record(query));
  Future<void> remove(String query) => _mutate((s) => s.remove(query));
  Future<void> clear() => _mutate((s) => s.clear());

  Future<void> _mutate(
    Future<List<String>> Function(RecentSearchesStore) op,
  ) async {
    final store = await ref.read(recentSearchesStoreProvider.future);
    state = AsyncData(await op(store));
  }
}

final recentSearchesProvider =
    AsyncNotifierProvider<RecentSearchesController, List<String>>(
  RecentSearchesController.new,
);
