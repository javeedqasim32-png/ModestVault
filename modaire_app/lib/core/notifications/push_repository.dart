import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/dio_client.dart';

/// Talks to the backend's device-token endpoints so the FCM dispatcher
/// (`/api/internal/dispatch-push-notifications`) knows where to send push.
///
/// Both calls go through the authed [dioProvider] — the server identifies the
/// owning user from the bearer token, so registering is only meaningful while
/// signed in. Failures are swallowed by callers: a missing token registration
/// means "no push for now", never a broken session.
class PushRepository {
  PushRepository(this._dio);

  final Dio _dio;

  /// UPSERT this device's FCM token for the current user. Idempotent — the
  /// server bumps `last_seen_at` when the same token re-registers.
  Future<void> register({
    required String token,
    required String platform, // "ios" | "android"
    String? appVersion,
  }) async {
    await _dio.post<void>(
      '/api/v1/devices/register',
      data: {
        'token': token,
        'platform': platform,
        if (appVersion != null) 'appVersion': appVersion,
      },
    );
  }

  /// Soft-revoke this token (logout, or the old token on refresh). The token
  /// segment is URL-encoded because FCM tokens contain ':' and other
  /// non-path-safe characters.
  Future<void> unregister(String token) async {
    await _dio.delete<void>('/api/v1/devices/${Uri.encodeComponent(token)}');
  }
}

final pushRepositoryProvider = Provider<PushRepository>((ref) {
  return PushRepository(ref.read(dioProvider));
});
