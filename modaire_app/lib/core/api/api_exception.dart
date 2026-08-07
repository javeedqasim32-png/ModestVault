import 'package:dio/dio.dart';

/// Domain-friendly wrapper around DioException + the backend's
/// `{error: {code, message, fields?}}` envelope from src/lib/api/errors.ts.
///
/// UI code can switch on [code] to render specific messaging without
/// duck-typing the raw Dio response.
class ApiException implements Exception {
  ApiException({
    required this.code,
    required this.message,
    this.statusCode,
    this.fields,
    this.cause,
  });

  final String code;
  final String message;
  final int? statusCode;
  final Map<String, String>? fields;
  final Object? cause;

  bool get isUnauthorized => code == 'UNAUTHORIZED' || statusCode == 401;
  bool get isValidation => code == 'INVALID_INPUT' || statusCode == 400;
  bool get isNetwork => code == 'NETWORK';

  factory ApiException.network(Object cause) => ApiException(
        code: 'NETWORK',
        message: 'Network error. Check your connection and try again.',
        cause: cause,
      );

  factory ApiException.fromDio(DioException err) {
    final res = err.response;
    final data = res?.data;
    if (data is Map<String, dynamic>) {
      final envelope = data['error'];
      if (envelope is Map<String, dynamic>) {
        final fieldsRaw = envelope['fields'];
        final fields = (fieldsRaw is Map<String, dynamic>)
            ? fieldsRaw.map((k, v) => MapEntry(k, v.toString()))
            : null;
        return ApiException(
          code: (envelope['code'] as String?) ?? 'INTERNAL',
          message: (envelope['message'] as String?) ?? 'Something went wrong.',
          statusCode: res?.statusCode,
          fields: fields,
          cause: err,
        );
      }
    }
    if (err.type == DioExceptionType.connectionError ||
        err.type == DioExceptionType.connectionTimeout ||
        err.type == DioExceptionType.receiveTimeout ||
        err.type == DioExceptionType.sendTimeout) {
      return ApiException.network(err);
    }
    return ApiException(
      code: 'INTERNAL',
      message: 'Something went wrong. Please try again.',
      statusCode: res?.statusCode,
      cause: err,
    );
  }

  @override
  String toString() => 'ApiException($code, $statusCode): $message';
}
