import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import 'auth_models.dart';

/// Multi-field form payload passed from the sign-up details screen to the
/// controller. Field names mirror what `/api/v1/auth/signup` expects.
class SignUpForm {
  const SignUpForm({
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.password,
    required this.phone,
    required this.street1,
    this.street2 = '',
    required this.city,
    required this.state,
    required this.zip,
    required this.country,
    this.smsOptIn = false,
    this.marketingEmailOptIn = false,
  });

  final String firstName;
  final String lastName;
  final String email;
  final String password;
  final String phone;
  final String street1;
  final String street2;
  final String city;
  final String state;
  final String zip;
  final String country;
  final bool smsOptIn;
  final bool marketingEmailOptIn;

  Map<String, dynamic> toJson() => {
        'firstName': firstName,
        'lastName': lastName,
        'email': email,
        'password': password,
        'phone': phone,
        'street1': street1,
        'street2': street2,
        'city': city,
        'state': state,
        'zip': zip,
        'country': country,
        'smsOptIn': smsOptIn,
        'marketingEmailOptIn': marketingEmailOptIn,
      };
}

/// Thin wrapper around /api/v1/auth/signup, /verify, and /resend. Uses the
/// bare Dio (no auth interceptor) so these calls don't participate in the
/// bearer/refresh loop meant for authenticated traffic.
class SignupRepository {
  SignupRepository(this._dio);
  final Dio _dio;

  /// Kicks off signup — server creates PendingUser + emails a 6-digit code.
  /// Returns the (already-lowercased) email the server accepted.
  Future<String> startSignup(SignUpForm form) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/signup',
        data: form.toJson(),
      );
      final body = res.data ?? const {};
      return (body['email'] as String?) ?? form.email;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  /// Confirms the 6-digit code. On success the server auto-logs the user
  /// in and returns the full [AuthSession] — same shape as /auth/login.
  Future<AuthSession> verifyCode({
    required String email,
    required String code,
    String? deviceId,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/verify',
        data: {
          'email': email,
          'code': code,
          if (deviceId != null) 'deviceId': deviceId,
        },
      );
      return AuthSession.fromJson(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  /// Regenerates + re-emails the OTP. Server enforces the 30s cooldown.
  Future<void> resendCode({required String email}) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/api/v1/auth/resend',
        data: {'email': email},
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final signupRepositoryProvider = Provider<SignupRepository>((ref) {
  return SignupRepository(ref.read(bareAuthDioProvider));
});
