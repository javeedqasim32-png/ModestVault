import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';

class AiCoverJob {
  const AiCoverJob({
    required this.id,
    required this.status,
    this.resultImageUrl,
    this.errorMessage,
    required this.attempts,
  });

  final String id;
  final String status; // QUEUED | PROCESSING | COMPLETED | FAILED
  final String? resultImageUrl;
  final String? errorMessage;
  final int attempts;

  bool get isTerminal => status == 'COMPLETED' || status == 'FAILED';

  factory AiCoverJob.fromJson(Map<String, dynamic> json) => AiCoverJob(
        id: json['id'] as String,
        status: json['status'] as String,
        resultImageUrl: json['resultImageUrl'] as String?,
        errorMessage: json['errorMessage'] as String?,
        attempts: (json['attempts'] as num?)?.toInt() ?? 0,
      );
}

class AiCoverRepository {
  AiCoverRepository(this._dio);
  final Dio _dio;

  /// Returns the new job id. Re-throws ApiException with code "CONFLICT"
  /// for the one-in-flight gate (the wizard treats that as "resume the
  /// existing job" rather than an error).
  Future<String> startJob({
    required String draftId,
    String modelSkinTone = 'medium',
    bool hijabRequired = false,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/v1/ai/jobs',
        data: {
          'draftId': draftId,
          'modelSkinTone': modelSkinTone,
          'hijabRequired': hijabRequired,
        },
      );
      return res.data!['jobId'] as String;
    } on DioException catch (e) {
      // 409 includes the existing jobId; surface it for resume.
      if (e.response?.statusCode == 409) {
        final body = e.response?.data;
        if (body is Map<String, dynamic> && body['jobId'] is String) {
          return body['jobId'] as String;
        }
      }
      throw ApiException.fromDio(e);
    }
  }

  Future<AiCoverJob> getJob(String id) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/v1/ai/jobs/$id');
      return AiCoverJob.fromJson(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> attachToDraft({
    required String draftId,
    required String imageUrl,
  }) async {
    try {
      await _dio.post(
        '/api/v1/seller/drafts/$draftId/attach-ai-cover',
        data: {'imageUrl': imageUrl},
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final aiCoverRepositoryProvider = Provider<AiCoverRepository>((ref) {
  return AiCoverRepository(ref.read(dioProvider));
});
