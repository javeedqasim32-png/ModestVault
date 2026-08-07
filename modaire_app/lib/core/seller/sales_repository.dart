import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import 'sale_models.dart';

class SellerSalesRepository {
  SellerSalesRepository(this._dio);
  final Dio _dio;

  Future<List<SellerSale>> list() async {
    try {
      final res =
          await _dio.get<Map<String, dynamic>>('/api/v1/seller/sales');
      return (res.data!['sales'] as List<dynamic>)
          .map((e) => SellerSale.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<SaleLabelSelection> labelSelection(String orderId) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/v1/seller/sales/$orderId/label',
      );
      return SaleLabelSelection.fromJson(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<PurchasedLabel> purchaseLabel(String orderId) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/v1/seller/sales/$orderId/label',
      );
      return PurchasedLabel.fromJson(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final sellerSalesRepositoryProvider = Provider<SellerSalesRepository>((ref) {
  return SellerSalesRepository(ref.read(dioProvider));
});

final sellerSalesProvider =
    FutureProvider.autoDispose<List<SellerSale>>((ref) {
  return ref.read(sellerSalesRepositoryProvider).list();
});
