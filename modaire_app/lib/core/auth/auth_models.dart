import 'dart:convert';

/// Mirrors the `user` object returned by `/api/v1/auth/login` (and `/refresh`).
class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    this.firstName,
    this.lastName,
    required this.isAdmin,
    required this.sellerEnabled,
    this.profileImage,
  });

  final String id;
  final String email;
  final String? firstName;
  final String? lastName;
  final bool isAdmin;
  final bool sellerEnabled;
  final String? profileImage;

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as String,
        email: json['email'] as String,
        firstName: json['firstName'] as String?,
        lastName: json['lastName'] as String?,
        isAdmin: (json['isAdmin'] as bool?) ?? false,
        sellerEnabled: (json['sellerEnabled'] as bool?) ?? false,
        profileImage: json['profileImage'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'firstName': firstName,
        'lastName': lastName,
        'isAdmin': isAdmin,
        'sellerEnabled': sellerEnabled,
        'profileImage': profileImage,
      };

  String get displayName {
    final parts = [firstName, lastName]
        .whereType<String>()
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
    if (parts.isEmpty) return email;
    return parts.join(' ');
  }
}

/// The full auth context held in memory + secure storage after sign-in.
class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.refreshExpiresAt,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;
  final DateTime refreshExpiresAt;
  final AuthUser user;

  bool get refreshExpired => DateTime.now().isAfter(refreshExpiresAt);

  AuthSession copyWith({
    String? accessToken,
    String? refreshToken,
    DateTime? refreshExpiresAt,
    AuthUser? user,
  }) =>
      AuthSession(
        accessToken: accessToken ?? this.accessToken,
        refreshToken: refreshToken ?? this.refreshToken,
        refreshExpiresAt: refreshExpiresAt ?? this.refreshExpiresAt,
        user: user ?? this.user,
      );

  factory AuthSession.fromJson(Map<String, dynamic> json) => AuthSession(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        refreshExpiresAt: _parseExpiresAt(json['refreshExpiresAt']),
        user: AuthUser.fromJson(json['user'] as Map<String, dynamic>),
      );

  // Backend serializes refreshExpiresAt as ISO 8601 today, but we accept
  // numeric millisecondsSinceEpoch too so older locally-cached sessions
  // (early dev builds) still hydrate cleanly.
  static DateTime _parseExpiresAt(dynamic raw) {
    if (raw is String) return DateTime.parse(raw);
    if (raw is num) return DateTime.fromMillisecondsSinceEpoch(raw.toInt());
    throw FormatException('Unsupported refreshExpiresAt: $raw');
  }

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'refreshExpiresAt': refreshExpiresAt.toIso8601String(),
        'user': user.toJson(),
      };

  String toJsonString() => jsonEncode(toJson());

  static AuthSession fromJsonString(String raw) =>
      AuthSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
}
