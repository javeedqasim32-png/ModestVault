import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import 'auth_models.dart';
import 'auth_repository.dart';
import 'auth_storage.dart';

/// Splash → Authenticated → Unauthenticated lifecycle.
///
/// Using sealed classes (Dart 3) instead of a single nullable session field
/// so the UI can switch over states exhaustively and never has to ask
/// "are we still loading from storage?" separately.
sealed class AuthState {
  const AuthState();
}

class AuthInitial extends AuthState {
  const AuthInitial();
}

class AuthAuthenticated extends AuthState {
  const AuthAuthenticated(this.session);
  final AuthSession session;
}

class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated({this.message});

  /// Optional banner message — set when sign-in fails or session was lost.
  final String? message;
}

class AuthController extends Notifier<AuthState> {
  late final AuthStorage _storage;
  late final AuthRepository _repo;
  StreamSubscription<void>? _lossSub;

  @override
  AuthState build() {
    _storage = ref.read(authStorageProvider);
    _repo = ref.read(authRepositoryProvider);

    // Subscribe to "auth lost" signals from the Dio refresh interceptor.
    final signal = ref.read(authLossSignalProvider);
    _lossSub = signal.stream.listen((_) {
      state = const AuthUnauthenticated(
        message: 'Your session has expired. Please sign in again.',
      );
    });
    ref.onDispose(() => _lossSub?.cancel());

    // Kick off hydration without blocking the constructor (Riverpod requires
    // build() to be sync). The router shows the splash while we read storage.
    Future.microtask(_hydrate);
    return const AuthInitial();
  }

  Future<void> _hydrate() async {
    try {
      // Keychain / EncryptedSharedPreferences can hang or throw on a fresh
      // install (esp. after a bundle-ID change moves the app to a new
      // Keychain access group). Cap the wait so we can't strand the user
      // on the splash screen if the OS never responds.
      final session = await _storage
          .readSession()
          .timeout(const Duration(seconds: 3));
      if (session == null || session.refreshExpired) {
        if (session?.refreshExpired ?? false) {
          try {
            await _storage.clear();
          } catch (_) {
            // Best-effort — expiry cleanup shouldn't block sign-in.
          }
        }
        state = const AuthUnauthenticated();
        return;
      }
      state = AuthAuthenticated(session);
    } catch (_) {
      // Any storage error → treat as unauthenticated so the router shows
      // the sign-in screen. The user can re-authenticate from there; a
      // fresh sign-in writes a clean session over whatever was corrupt.
      state = const AuthUnauthenticated();
    }
  }

  Future<void> signIn({
    required String email,
    required String password,
  }) async {
    try {
      final session = await _repo.login(email: email, password: password);
      await _storage.writeSession(session);
      state = AuthAuthenticated(session);
    } on ApiException catch (e) {
      state = AuthUnauthenticated(message: e.message);
      rethrow;
    }
  }

  Future<void> signOut() async {
    final current = state;
    if (current is AuthAuthenticated) {
      // Best-effort server revoke. We sign out locally regardless.
      await _repo.logout(refreshToken: current.session.refreshToken);
    }
    await _storage.clear();
    state = const AuthUnauthenticated();
  }

  /// Adopt a session issued outside the login flow — e.g. by /auth/verify
  /// after signup OTP confirmation. The caller is responsible for persisting
  /// the session to storage; this method only flips the in-memory state so
  /// the router redirect picks up the new user.
  void setSession(AuthSession session) {
    state = AuthAuthenticated(session);
  }
}

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);
