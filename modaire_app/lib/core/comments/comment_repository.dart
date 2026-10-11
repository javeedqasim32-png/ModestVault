import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import 'comment_models.dart';

/// Client for listing comments. Reads are public (the Dio interceptor only
/// attaches a bearer when a session exists); posting / deleting / reporting
/// require sign-in and the server enforces every guardrail — the app just
/// surfaces its message.
class CommentRepository {
  CommentRepository(this._dio);
  final Dio _dio;

  Future<List<ListingComment>> list(String listingId) => _getThread('/api/v1/listings/$listingId/comments');

  /// Returns the fresh thread so the UI updates in one round-trip.
  Future<List<ListingComment>> post(String listingId, String body, {String? parentId}) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/v1/listings/$listingId/comments',
        data: {'body': body, if (parentId != null) 'parentId': parentId},
      );
      return _parse(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> delete(String commentId) async {
    try {
      await _dio.delete<void>('/api/v1/comments/$commentId');
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> report(String commentId) async {
    try {
      await _dio.post<Map<String, dynamic>>('/api/v1/comments/$commentId/report');
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<List<ListingComment>> _getThread(String path) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(path);
      return _parse(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  List<ListingComment> _parse(Map<String, dynamic> data) => ((data['comments'] as List<dynamic>?) ?? [])
      .map((e) => ListingComment.fromJson(e as Map<String, dynamic>))
      .toList();
}

final commentRepositoryProvider = Provider<CommentRepository>((ref) {
  return CommentRepository(ref.read(dioProvider));
});
