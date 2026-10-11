import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import 'listing_models.dart';

/// "Similar items" for a listing, from /api/v1/listings/[id]/related. Same
/// mobile summary shape the browse grid uses, so ListingTile renders these
/// unchanged.
class RelatedRepository {
  RelatedRepository(this._dio);
  final Dio _dio;

  Future<List<ListingSummary>> fetchSimilar(String listingId) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/v1/listings/$listingId/related');
      return ((res.data!['similar'] as List<dynamic>?) ?? [])
          .map((e) => ListingSummary.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final relatedRepositoryProvider = Provider<RelatedRepository>((ref) {
  return RelatedRepository(ref.read(dioProvider));
});

final similarListingsProvider = FutureProvider.family<List<ListingSummary>, String>((ref, listingId) {
  return ref.read(relatedRepositoryProvider).fetchSimilar(listingId);
});
