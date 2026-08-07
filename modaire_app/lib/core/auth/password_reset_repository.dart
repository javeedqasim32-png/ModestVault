import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';

/// POST /api/v1/auth/reset-request wrapper. The endpoint always returns 200,
/// even for unknown emails, so this method surfaces success/failure only for
/// network + server errors — never for "email not found".
class PasswordResetRepository {
  PasswordResetRepository(this._dio);
  final Dio _dio;

  Future<void> requestReset({required String email}) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/reset-request',
        data: {'email': email},
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final passwordResetRepositoryProvider = Provider<PasswordResetRepository>((ref) {
  return PasswordResetRepository(ref.read(bareAuthDioProvider));
});
