import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_models.dart';
import '../auth/auth_storage.dart';
import '../config/env.dart';

const Set<String> _kUnauthenticatedPaths = {
  '/api/v1/auth/login',
  '/api/v1/auth/signup',
  '/api/v1/auth/refresh',
  '/api/v1/auth/verify',
  '/api/v1/auth/resend',
  '/api/v1/auth/reset-request',
  '/api/v1/auth/reset-confirm',
  '/api/v1/meta/min-version',
};

bool _isUnauthenticatedRequest(String path) {
  for (final p in _kUnauthenticatedPaths) {
    if (path == p || path.endsWith(p)) return true;
  }
  return false;
}

BaseOptions _baseOptions() => BaseOptions(
      baseUrl: Env.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      sendTimeout: const Duration(seconds: 30),
      contentType: 'application/json',
      responseType: ResponseType.json,
      headers: {
        'X-App-Version': Env.appVersion,
        'X-App-Platform': 'mobile',
      },
    );

/// Bare Dio with no auth interceptor. Used exclusively by AuthRepository
/// (login/refresh/logout) and by the 401 refresh path inside the main Dio
/// — both need to hit /api/v1/auth/* without recursing through this file's
/// own refresh-on-401 logic.
final bareAuthDioProvider = Provider<Dio>((ref) {
  return Dio(_baseOptions());
});

/// Stream of "auth lost" signals. The Dio refresh interceptor pushes here
/// when refresh fails and we've wiped storage; AuthController listens and
/// flips state to unauthenticated, which the router redirect picks up.
///
/// A broadcast StreamController so multiple subscribers (controller +
/// debug logger) can listen without contention.
final authLossSignalProvider = Provider<StreamController<void>>((ref) {
  final controller = StreamController<void>.broadcast();
  ref.onDispose(controller.close);
  return controller;
});

/// Main app Dio.
///
/// - Bearer header attached automatically from secure storage (except for
///   the allowlist in [_kUnauthenticatedPaths]).
/// - 401 → single-flight refresh via the bare Dio → retry original request
///   transparently. If refresh fails, storage is cleared and a signal is
///   pushed onto [authLossSignalProvider] so AuthController can sign out.
final dioProvider = Provider<Dio>((ref) {
  final storage = ref.read(authStorageProvider);
  final dio = Dio(_baseOptions());

  Completer<void>? refreshInFlight;

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        if (_isUnauthenticatedRequest(options.path)) {
          return handler.next(options);
        }
        final session = await storage.readSession();
        if (session != null) {
          options.headers['Authorization'] = 'Bearer ${session.accessToken}';
        }
        handler.next(options);
      },
      onError: (err, handler) async {
        final shouldAttempt = err.response?.statusCode == 401 &&
            !_isUnauthenticatedRequest(err.requestOptions.path);
        if (!shouldAttempt) return handler.next(err);

        // Single-flight: only one refresh in flight at a time. Concurrent
        // 401s wait for the in-flight result instead of all spawning
        // their own refresh.
        if (refreshInFlight == null) {
          final completer = Completer<void>();
          refreshInFlight = completer;
          try {
            final current = await storage.readSession();
            if (current == null || current.refreshExpired) {
              await storage.clear();
              ref.read(authLossSignalProvider).add(null);
              completer.completeError(err);
              refreshInFlight = null;
              return handler.next(err);
            }
            final bare = ref.read(bareAuthDioProvider);
            final res = await bare.post<Map<String, dynamic>>(
              '/api/v1/auth/refresh',
              data: {'refreshToken': current.refreshToken},
            );
            final next = AuthSession.fromJson(res.data!);
            await storage.writeSession(next);
            completer.complete();
            refreshInFlight = null;
          } catch (refreshErr) {
            // Only wipe the session when the SERVER rejected the token.
            // Dio throws the same way for timeouts, connection drops, DNS
            // failures and 5xx, and clearing on those signs out anyone who
            // hits a momentary network blip — permanently, because refresh
            // tokens are single-use and we'd be discarding the only copy.
            // Access tokens live 15 minutes, so every user runs this path
            // several times an hour; it has to tolerate transient failure.
            //
            // On a non-rejection we keep the session: the current refresh
            // token was never consumed server-side, so the next 401 can
            // simply try again.
            final status = refreshErr is DioException
                ? refreshErr.response?.statusCode
                : null;
            if (status == 401 || status == 403) {
              await storage.clear();
              ref.read(authLossSignalProvider).add(null);
            }
            completer.completeError(refreshErr);
            refreshInFlight = null;
            return handler.next(err);
          }
        } else {
          try {
            await refreshInFlight!.future;
          } catch (_) {
            return handler.next(err);
          }
        }

        // Replay the original request with the freshly-rotated bearer.
        final newSession = await storage.readSession();
        if (newSession == null) return handler.next(err);
        try {
          final retried = await dio.fetch(
            err.requestOptions
              ..headers['Authorization'] = 'Bearer ${newSession.accessToken}',
          );
          return handler.resolve(retried);
        } on DioException catch (retryErr) {
          return handler.next(retryErr);
        }
      },
    ),
  );

  return dio;
});
