import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import 'message_models.dart';

class MessageRepository {
  MessageRepository(this._dio);
  final Dio _dio;

  Future<List<ConversationSummary>> inbox() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/v1/messages');
      return (res.data!['conversations'] as List<dynamic>)
          .map((e) => ConversationSummary.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<ConversationThread> thread(String id) async {
    try {
      final res =
          await _dio.get<Map<String, dynamic>>('/api/v1/messages/$id');
      return ConversationThread.fromJson(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<ChatMessage> send({
    required String conversationId,
    String? body,
    String? imageUrl,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/v1/messages/$conversationId',
        data: {
          if (body != null && body.isNotEmpty) 'body': body,
          if (imageUrl != null) 'imageUrl': imageUrl,
        },
      );
      return ChatMessage.fromJson(
        res.data!['message'] as Map<String, dynamic>,
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  /// Idempotent: returns the existing buyer↔seller conversation id, or
  /// creates a new one. `listingId` attaches context for the thread.
  Future<String> startWithSeller({
    required String sellerId,
    String? listingId,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/v1/messages',
        data: {
          'sellerId': sellerId,
          if (listingId != null) 'listingId': listingId,
        },
      );
      return res.data!['conversationId'] as String;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  /// Opens (or returns) the buyer↔founding-admin support thread.
  Future<String> startWithSupport() async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/v1/messages/support',
      );
      return res.data!['conversationId'] as String;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final messageRepositoryProvider = Provider<MessageRepository>((ref) {
  return MessageRepository(ref.read(dioProvider));
});

final inboxProvider =
    FutureProvider.autoDispose<List<ConversationSummary>>((ref) {
  return ref.read(messageRepositoryProvider).inbox();
});

final threadProvider =
    FutureProvider.family.autoDispose<ConversationThread, String>(
        (ref, id) => ref.read(messageRepositoryProvider).thread(id));
