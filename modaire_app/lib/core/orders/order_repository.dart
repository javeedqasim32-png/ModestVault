import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import 'order_models.dart';

class OrderRepository {
  OrderRepository(this._dio);
  final Dio _dio;

  Future<List<OrderSummary>> list() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/v1/orders');
      return (res.data!['orders'] as List<dynamic>)
          .map((e) => OrderSummary.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<OrderSummary> get(String id) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/v1/orders/$id');
      return OrderSummary.fromJson(res.data!['order'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final orderRepositoryProvider = Provider<OrderRepository>((ref) {
  return OrderRepository(ref.read(dioProvider));
});

final ordersProvider = FutureProvider.autoDispose<List<OrderSummary>>((ref) {
  return ref.read(orderRepositoryProvider).list();
});

final orderDetailProvider =
    FutureProvider.family.autoDispose<OrderSummary, String>((ref, id) {
  return ref.read(orderRepositoryProvider).get(id);
});
