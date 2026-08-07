import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'auth_models.dart';

const String _kSession = 'modaire.session_v1';

/// Persists the full [AuthSession] as a single JSON blob in Keychain (iOS)
/// or EncryptedSharedPreferences (Android). One key = one keychain hit on
/// hydrate, one write on rotate.
///
/// Keychain accessibility is `first_unlock_this_device`: app can read after
/// reboot once the user unlocks, but tokens never sync to iCloud or other
/// devices.
class AuthStorage {
  AuthStorage(this._storage);
  final FlutterSecureStorage _storage;

  Future<AuthSession?> readSession() async {
    final raw = await _storage.read(key: _kSession);
    if (raw == null) return null;
    try {
      return AuthSession.fromJsonString(raw);
    } catch (_) {
      // Corrupt blob (older schema, partial write) — drop it and treat as
      // signed-out so the next sign-in writes a clean copy.
      await _storage.delete(key: _kSession);
      return null;
    }
  }

  Future<void> writeSession(AuthSession session) =>
      _storage.write(key: _kSession, value: session.toJsonString());

  Future<void> clear() => _storage.delete(key: _kSession);
}

final authStorageProvider = Provider<AuthStorage>((ref) {
  return AuthStorage(
    const FlutterSecureStorage(
      iOptions: IOSOptions(
        accessibility: KeychainAccessibility.first_unlock_this_device,
      ),
      aOptions: AndroidOptions(encryptedSharedPreferences: true),
    ),
  );
});
