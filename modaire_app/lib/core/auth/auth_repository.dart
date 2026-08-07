import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import 'auth_models.dart';

class AuthRepository {
  AuthRepository(this._dio);
  final Dio _dio;

  Future<AuthSession> login({
    required String email,
    required String password,
    String? deviceId,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/login',
        data: {
          'email': email,
          'password': password,
          if (deviceId != null) 'deviceId': deviceId,
        },
      );
      final body = res.data!;
      return AuthSession.fromJson(body);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<AuthSession> refresh({required String refreshToken}) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      return AuthSession.fromJson(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  /// Best-effort — server revoke. Caller still clears local storage even
  /// if the network call fails (offline sign-out).
  Future<void> logout({required String refreshToken}) async {
    try {
      await _dio.post(
        '/api/v1/auth/logout',
        data: {'refreshToken': refreshToken},
      );
    } on DioException {
      // intentionally swallowed
    }
  }
}

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  // Uses the bare Dio so /auth/refresh inside the 401 interceptor can also
  // safely call us without recursing into the bearer/refresh path.
  return AuthRepository(ref.read(bareAuthDioProvider));
});
