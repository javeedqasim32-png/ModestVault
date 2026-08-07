import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import 'cart_models.dart';

class CartRepository {
  CartRepository(this._dio);
  final Dio _dio;

  Future<Set<String>> listIds() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/v1/cart/ids');
      return (res.data!['ids'] as List<dynamic>).cast<String>().toSet();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<Cart> get() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/v1/cart');
      return Cart.fromJson(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> add(String listingId) async {
    try {
      await _dio.put('/api/v1/cart/$listingId');
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> remove(String listingId) async {
    try {
      await _dio.delete('/api/v1/cart/$listingId');
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final cartRepositoryProvider = Provider<CartRepository>((ref) {
  return CartRepository(ref.read(dioProvider));
});
