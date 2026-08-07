import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import 'checkout_models.dart';

class CheckoutRepository {
  CheckoutRepository(this._dio);
  final Dio _dio;

  /// Pass exactly one [listingId] OR an array of [listingIds] (same-
  /// seller bundle, 2–20 items). The backend accepts either shape and
  /// returns the same Shippo rate list.
  Future<List<ShippingRate>> getRates({
    String? listingId,
    List<String>? listingIds,
    required ShippingAddress address,
  }) async {
    assert(
      (listingId != null) ^ (listingIds != null && listingIds.length >= 2),
      'Pass either listingId or listingIds (2+); not both.',
    );
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/v1/checkout/rates',
        data: {
          if (listingId != null) 'listingId': listingId,
          if (listingIds != null) 'listingIds': listingIds,
          'address': address.toJson(),
        },
      );
      final rates = (res.data!['rates'] as List<dynamic>);
      return rates
          .map((e) => ShippingRate.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  /// Single-item convenience — kept for callers that don't deal in arrays.
  Future<List<ShippingRate>> getRatesForListing({
    required String listingId,
    required ShippingAddress address,
  }) =>
      getRates(listingId: listingId, address: address);

  Future<PaymentIntentParams> createPaymentIntent({
    String? listingId,
    List<String>? listingIds,
    required ShippingAddress address,
    required ShippingRate selectedRate,
  }) async {
    assert(
      (listingId != null) ^ (listingIds != null && listingIds.length >= 2),
      'Pass either listingId or listingIds (2+); not both.',
    );
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/v1/checkout/payment-intent',
        data: {
          if (listingId != null) 'listingId': listingId,
          if (listingIds != null) 'listingIds': listingIds,
          'address': address.toJson(),
          'selectedRate': selectedRate.toJson(),
        },
      );
      return PaymentIntentParams.fromJson(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<Map<String, dynamic>> finalize(String paymentIntentId) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/v1/checkout/finalize',
        data: {'paymentIntentId': paymentIntentId},
      );
      return res.data!;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final checkoutRepositoryProvider = Provider<CheckoutRepository>((ref) {
  return CheckoutRepository(ref.read(dioProvider));
});
