import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';

class UploadResult {
  const UploadResult({
    required this.publicUrl,
    required this.key,
    this.thumbUrl,
    this.mediumUrl,
  });
  final String publicUrl;
  final String key;
  final String? thumbUrl;
  final String? mediumUrl;
}

class UploadRepository {
  UploadRepository(this._dio);
  final Dio _dio;

  /// Three-step upload for a draft photo:
  ///   1. presign — server returns a PUT URL + S3 key
  ///   2. PUT bytes — direct to S3 (or the local-dev shim)
  ///   3. finalize — server reads the bytes back, runs the sharp
  ///      normalization pipeline (300px thumb + 800px medium webp),
  ///      and appends the public URL to draft.photo_urls
  Future<UploadResult> uploadDraftPhoto({
    required String draftId,
    required Uint8List bytes,
    required String contentType,
  }) =>
      _upload(
        purpose: 'draft',
        extraPresign: {'draftId': draftId},
        bytes: bytes,
        contentType: contentType,
      );

  /// Seller-side photo upload for an existing listing. Same three-step
  /// flow as drafts, just a different `purpose` so the server keys it
  /// under `listings/<userId>/<listingId>/...`. The caller then commits
  /// the new ordered set via PUT /api/v1/seller/listings/[id]/images.
  Future<UploadResult> uploadListingPhoto({
    required String listingId,
    required Uint8List bytes,
    required String contentType,
  }) =>
      _upload(
        purpose: 'listing',
        extraPresign: {'listingId': listingId},
        bytes: bytes,
        contentType: contentType,
      );

  Future<UploadResult> _upload({
    required String purpose,
    required Map<String, dynamic> extraPresign,
    required Uint8List bytes,
    required String contentType,
  }) async {
    try {
      final presign = await _dio.post<Map<String, dynamic>>(
        '/api/v1/uploads/presign',
        data: {
          'purpose': purpose,
          'contentType': contentType,
          ...extraPresign,
        },
      );
      final key = presign.data!['key'] as String;
      final uploadUrl = presign.data!['uploadUrl'] as String;

      // PUT bytes. In dev the uploadUrl is /api/uploads-dev/<key> served
      // by the same Next.js process; in prod it's a real S3 presigned URL.
      // Either way the request shape is identical: a PUT with the bytes
      // body and matching Content-Type.
      final putDio = Dio(BaseOptions(
        connectTimeout: const Duration(seconds: 30),
        sendTimeout: const Duration(minutes: 2),
        receiveTimeout: const Duration(minutes: 2),
      ));
      // If the dev shim returned a relative path, the main dio's baseUrl
      // applies; for an absolute https URL we hit it directly.
      final url = uploadUrl.startsWith('http')
          ? uploadUrl
          : '${_dio.options.baseUrl}$uploadUrl';
      // Send the raw bytes (not a Stream) so Dio sets a proper
      // Content-Length and never falls back to chunked-transfer encoding —
      // the dev shim's req.arrayBuffer() is happier that way, and S3
      // presigned PUTs reject chunked bodies entirely.
      await putDio.put<void>(
        url,
        data: bytes,
        options: Options(
          headers: {
            'Content-Type': contentType,
          },
          contentType: contentType,
        ),
      );

      final finalize = await _dio.post<Map<String, dynamic>>(
        '/api/v1/uploads/finalize',
        data: {
          'key': key,
          'purpose': purpose,
        },
      );
      return UploadResult(
        publicUrl: finalize.data!['imageUrl'] as String,
        key: key,
        thumbUrl: finalize.data!['thumbUrl'] as String?,
        mediumUrl: finalize.data!['mediumUrl'] as String?,
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final uploadRepositoryProvider = Provider<UploadRepository>((ref) {
  return UploadRepository(ref.read(dioProvider));
});
