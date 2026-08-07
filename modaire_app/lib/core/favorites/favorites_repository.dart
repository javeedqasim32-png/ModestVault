import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import '../listings/listing_models.dart';

class FavoritesRepository {
  FavoritesRepository(this._dio);
  final Dio _dio;

  Future<Set<String>> listIds() async {
    try {
      final res =
          await _dio.get<Map<String, dynamic>>('/api/v1/favorites/ids');
      final ids = (res.data!['ids'] as List<dynamic>).cast<String>();
      return ids.toSet();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<List<ListingSummary>> list() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/v1/favorites');
      return (res.data!['favorites'] as List<dynamic>)
          .map((e) => ListingSummary.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> add(String listingId) async {
    try {
      await _dio.put('/api/v1/favorites/$listingId');
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> remove(String listingId) async {
    try {
      await _dio.delete('/api/v1/favorites/$listingId');
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final favoritesRepositoryProvider = Provider<FavoritesRepository>((ref) {
  return FavoritesRepository(ref.read(dioProvider));
});
