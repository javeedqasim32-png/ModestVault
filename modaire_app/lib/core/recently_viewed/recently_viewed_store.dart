import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import '../listings/listing_models.dart';

const String _kKey = 'modaire.recently_viewed_ids';
const int _kMaxIds = 30;

/// Persists the most-recently-viewed listing ids on-device (most recent
/// first). Mirrors the website's recently-viewed-cookie pattern but
/// uses SharedPreferences so it survives app kills and reinstalls
/// across the same iOS sandbox.
class RecentlyViewedStore {
  RecentlyViewedStore(this._prefs);
  final SharedPreferences _prefs;

  List<String> readIds() {
    return _prefs.getStringList(_kKey) ?? const [];
  }

  Future<void> record(String listingId) async {
    final current = readIds();
    final next = [listingId, ...current.where((id) => id != listingId)];
    if (next.length > _kMaxIds) next.removeRange(_kMaxIds, next.length);
    await _prefs.setStringList(_kKey, next);
  }

  Future<void> clear() => _prefs.remove(_kKey);
}

final recentlyViewedStoreProvider =
    FutureProvider<RecentlyViewedStore>((ref) async {
  final prefs = await SharedPreferences.getInstance();
  return RecentlyViewedStore(prefs);
});

/// Fetches mobile-shape summaries for the device's recently viewed ids.
/// The backend silently drops rows that are no longer
/// APPROVED + AVAILABLE; we use that response to also prune the
/// local cache so future renders don't show ghosts.
final recentlyViewedListingsProvider =
    FutureProvider.autoDispose<List<ListingSummary>>((ref) async {
  final store = await ref.read(recentlyViewedStoreProvider.future);
  final ids = store.readIds();
  if (ids.isEmpty) return const [];
  try {
    final dio = ref.read(dioProvider);
    final res = await dio.post<Map<String, dynamic>>(
      '/api/v1/listings/by-ids',
      data: {'ids': ids.take(20).toList()},
    );
    final listings = (res.data!['listings'] as List<dynamic>)
        .map((e) => ListingSummary.fromJson(e as Map<String, dynamic>))
        .toList();
    // Prune ids the backend dropped (sold/rejected) — keeps the
    // device cache from accumulating stale entries.
    final liveSet = listings.map((l) => l.id).toSet();
    final survivors = ids.where(liveSet.contains).toList();
    if (survivors.length != ids.length) {
      // Best-effort rewrite; no await chain needed by the caller.
      unawaited(
        SharedPreferences.getInstance().then(
          (p) => p.setStringList(_kKey, survivors),
        ),
      );
    }
    return listings;
  } on DioException catch (e) {
    throw ApiException.fromDio(e);
  }
});
