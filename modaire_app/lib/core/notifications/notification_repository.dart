import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';

/// Notification types whose unread counts surface as red-dot badges
/// (Sold + Pending tabs). Mirrors `getUnreadNotificationCountsByType`
/// callers on the website.
const String kSoldNotificationType = 'ITEM_SOLD';
const String kRejectedNotificationType = 'LISTING_REJECTED';

class NotificationRepository {
  NotificationRepository(this._dio);
  final Dio _dio;

  /// Returns a per-type unread count map (missing types default to 0
  /// on the caller side). Empty when [types] is empty.
  Future<Map<String, int>> unreadCounts(List<String> types) async {
    if (types.isEmpty) return const {};
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/v1/notifications/unread-counts',
        queryParameters: {'types': types.join(',')},
      );
      final raw = (res.data!['counts'] as Map<String, dynamic>?) ?? const {};
      return raw.map((k, v) => MapEntry(k, (v as num).toInt()));
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  /// Marks notifications read. Three modes (matches the backend):
  ///   - id only        → that single notification
  ///   - type only      → every unread of that type (badge clear)
  ///   - neither        → every unread notification
  Future<void> markRead({String? type, String? id}) async {
    try {
      await _dio.post(
        '/api/v1/notifications/mark-read',
        data: {
          if (type != null) 'type': type,
          if (id != null) 'id': id,
        },
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<List<NotificationRecord>> list({int limit = 50}) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/v1/notifications',
        queryParameters: {'limit': limit},
      );
      return (res.data!['notifications'] as List<dynamic>)
          .map((e) => NotificationRecord.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

class NotificationRecord {
  const NotificationRecord({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    this.linkUrl,
    this.readAt,
    required this.createdAt,
  });

  final String id;
  final String type;
  final String title;
  final String body;
  final String? linkUrl;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get isUnread => readAt == null;

  NotificationRecord copyWithRead() => NotificationRecord(
        id: id,
        type: type,
        title: title,
        body: body,
        linkUrl: linkUrl,
        readAt: readAt ?? DateTime.now(),
        createdAt: createdAt,
      );

  factory NotificationRecord.fromJson(Map<String, dynamic> json) =>
      NotificationRecord(
        id: json['id'] as String,
        type: json['type'] as String,
        title: json['title'] as String,
        body: json['body'] as String,
        linkUrl: json['linkUrl'] as String?,
        readAt: json['readAt'] == null
            ? null
            : DateTime.parse(json['readAt'] as String),
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

final notificationRepositoryProvider = Provider<NotificationRepository>((ref) {
  return NotificationRepository(ref.read(dioProvider));
});

/// Unread counts for the badge-surfacing types the Sell screen cares
/// about. Refresh by invalidating this provider after a tab-tap that
/// clears one of them.
final sellTabBadgesProvider = FutureProvider.autoDispose<Map<String, int>>(
  (ref) => ref.read(notificationRepositoryProvider).unreadCounts(
        const [kSoldNotificationType, kRejectedNotificationType],
      ),
);

/// Notification feed — auto-disposes so re-entering the screen always
/// reflects the latest state without manual invalidation.
final notificationsListProvider =
    FutureProvider.autoDispose<List<NotificationRecord>>(
  (ref) => ref.read(notificationRepositoryProvider).list(),
);
