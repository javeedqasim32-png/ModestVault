import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/router.dart';
import '../config/env.dart';
import 'push_repository.dart';

/// Owns the device's relationship with Firebase Cloud Messaging:
/// permission, token registration, and routing a tapped notification to the
/// right screen. One instance for the app's lifetime (see [pushServiceProvider]).
///
/// Lifecycle:
///   • [init] once at startup — wires the message listeners and handles a
///     notification that launched the app from a terminated state.
///   • [registerForCurrentUser] after sign-in — asks permission, grabs the
///     token, and POSTs it so this user starts receiving push.
///   • [unregisterCurrentDevice] before sign-out — revokes the token so the
///     next person on this phone doesn't inherit the previous user's alerts.
class PushService {
  PushService(this._ref);

  final Ref _ref;
  final FirebaseMessaging _fm = FirebaseMessaging.instance;

  StreamSubscription<String>? _tokenRefreshSub;
  StreamSubscription<RemoteMessage>? _openedAppSub;
  bool _initialized = false;

  /// Wire the listeners that must run regardless of auth state: foreground
  /// presentation, tap-to-open while backgrounded, and the cold-start tap.
  /// Safe to call more than once; only the first call takes effect.
  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    // iOS: let the system show the banner/sound while the app is foregrounded.
    // Without this, a foreground push is silently delivered to onMessage only.
    await _fm.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    // Tap while the app was backgrounded (not terminated).
    _openedAppSub = FirebaseMessaging.onMessageOpenedApp.listen(_handleTap);

    // Tap that cold-started the app from a terminated state. The router may
    // not have mounted yet, so defer navigation to the next frame.
    final initial = await _fm.getInitialMessage();
    if (initial != null) {
      scheduleMicrotask(() => _handleTap(initial));
    }

    // Keep the server's token current if Firebase rotates it mid-session.
    _tokenRefreshSub = _fm.onTokenRefresh.listen((token) async {
      try {
        await _ref.read(pushRepositoryProvider).register(
              token: token,
              platform: _platform,
              appVersion: Env.appVersion,
            );
      } catch (e) {
        debugPrint('[push] token-refresh re-register failed: $e');
      }
    });
  }

  /// Ask for notification permission (first run shows the OS prompt), then
  /// register this device's token for the signed-in user. No-ops quietly on
  /// any failure — push is a nice-to-have, never a sign-in blocker.
  Future<void> registerForCurrentUser() async {
    try {
      final settings = await _fm.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        // User declined — don't register a token that will never deliver.
        return;
      }

      final token = await _fm.getToken();
      if (token == null) return;

      await _ref.read(pushRepositoryProvider).register(
            token: token,
            platform: _platform,
            appVersion: Env.appVersion,
          );
    } catch (e) {
      debugPrint('[push] registerForCurrentUser failed: $e');
    }
  }

  /// Revoke this device's token on logout so the next account on this phone
  /// doesn't receive the previous user's notifications.
  Future<void> unregisterCurrentDevice() async {
    try {
      final token = await _fm.getToken();
      if (token != null) {
        await _ref.read(pushRepositoryProvider).unregister(token);
      }
    } catch (e) {
      debugPrint('[push] unregisterCurrentDevice failed: $e');
    }
  }

  void dispose() {
    _tokenRefreshSub?.cancel();
    _openedAppSub?.cancel();
  }

  String get _platform => Platform.isIOS ? 'ios' : 'android';

  /// Navigate to the screen a notification points at. The server stores a
  /// *web* path in `data.linkUrl` (shared with the website); map it to the
  /// app's go_router location. Falls back to the notifications list.
  void _handleTap(RemoteMessage message) {
    final route = _appRouteForLink(
      message.data['linkUrl'] as String?,
      message.data['type'] as String?,
    );
    try {
      _ref.read(goRouterProvider).go(route);
    } catch (e) {
      debugPrint('[push] navigation to "$route" failed: $e');
    }
  }
}

/// Translate a backend `linkUrl` (web route) into an app route.
///   /messages/:id          → /messages/:id        (chat thread)
///   /listings/:id          → /listings/:id         (listing detail)
///   /sell | /sell/...      → /sell                 (seller dashboard)
///   /dashboard/purchases   → /orders               (buyer orders)
///   /dashboard/sales       → /orders               (seller sales)
/// Anything unrecognized opens the in-app notifications list.
@visibleForTesting
String appRouteForLink(String? linkUrl, String? type) =>
    _appRouteForLink(linkUrl, type);

String _appRouteForLink(String? linkUrl, String? type) {
  if (linkUrl == null || linkUrl.isEmpty) return '/notifications';
  if (linkUrl.startsWith('/messages')) return linkUrl; // /messages/:id
  if (linkUrl.startsWith('/offers')) return linkUrl; // /offers or /offers/:id
  if (linkUrl.startsWith('/listings/')) return linkUrl; // /listings/:id
  if (linkUrl.startsWith('/sell')) return '/sell';
  if (linkUrl.startsWith('/dashboard/purchases')) return '/orders';
  if (linkUrl.startsWith('/dashboard/sales')) return '/orders';
  return '/notifications';
}

final pushServiceProvider = Provider<PushService>((ref) {
  final service = PushService(ref);
  ref.onDispose(service.dispose);
  return service;
});
