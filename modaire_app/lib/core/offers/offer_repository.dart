import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import 'offer_models.dart';

/// Client for /api/v1/offers (engine: src/lib/offers). Every mutating call
/// returns the fresh thread so the UI updates in one round-trip.
class OfferRepository {
  OfferRepository(this._dio);
  final Dio _dio;

  Future<List<OfferSummary>> list({required bool selling}) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/v1/offers',
        queryParameters: {'role': selling ? 'selling' : 'buying'},
      );
      return (res.data!['offers'] as List<dynamic>)
          .map((e) => OfferSummary.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<OfferThread> thread(String offerId) => _getThread('/api/v1/offers/$offerId');

  Future<OfferThread> submit({required String listingId, required double amount}) =>
      _postThread('/api/v1/offers', data: {'listingId': listingId, 'amount': amount}, create: true);

  Future<OfferThread> accept(String offerId) => _postThread('/api/v1/offers/$offerId/accept');
  Future<OfferThread> reject(String offerId) => _postThread('/api/v1/offers/$offerId/reject');
  Future<OfferThread> withdraw(String offerId) => _postThread('/api/v1/offers/$offerId/withdraw');
  Future<OfferThread> counter(String offerId, double amount) =>
      _postThread('/api/v1/offers/$offerId/counter', data: {'amount': amount});

  Future<OfferEligibility> eligibility(String listingId) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/v1/listings/$listingId/offer-eligibility');
      return OfferEligibility.fromJson(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<OfferThread> _getThread(String path) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(path);
      return OfferThread.fromJson(res.data!['offer'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<OfferThread> _postThread(String path, {Map<String, dynamic>? data, bool create = false}) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(path, data: data);
      return OfferThread.fromJson(res.data!['offer'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final offerRepositoryProvider = Provider<OfferRepository>((ref) {
  return OfferRepository(ref.read(dioProvider));
});
