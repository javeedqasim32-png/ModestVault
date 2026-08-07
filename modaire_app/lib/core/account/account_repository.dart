import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';

/// Mirror of /api/v1/account/profile response. These are the editable
/// fields in the Settings screen; the address fields double as the
/// seller's Shippo "from" address.
class UserProfile {
  const UserProfile({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.phone,
    required this.street1,
    required this.street2,
    required this.city,
    required this.state,
    required this.zip,
    required this.country,
    this.profileImage,
    this.memberSinceLabel,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String email;
  final String phone;
  final String street1;
  final String street2;
  final String city;
  final String state;
  final String zip;
  final String country;
  final String? profileImage;
  final String? memberSinceLabel;

  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
        id: json['id'] as String,
        firstName: json['firstName'] as String,
        lastName: json['lastName'] as String,
        email: json['email'] as String,
        phone: json['phone'] as String? ?? '',
        street1: json['street1'] as String? ?? '',
        street2: json['street2'] as String? ?? '',
        city: json['city'] as String? ?? '',
        state: json['state'] as String? ?? '',
        zip: json['zip'] as String? ?? '',
        country: json['country'] as String? ?? 'US',
        profileImage: json['profileImage'] as String?,
        memberSinceLabel: json['memberSinceLabel'] as String?,
      );
}

class AccountRepository {
  AccountRepository(this._dio);
  final Dio _dio;

  Future<UserProfile> getProfile() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/v1/account/profile',
      );
      return UserProfile.fromJson(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> updateProfile({
    required String firstName,
    required String lastName,
    required String phone,
    required String street1,
    String? street2,
    required String city,
    required String state,
    required String zip,
    required String country,
  }) async {
    try {
      await _dio.put<Map<String, dynamic>>(
        '/api/v1/account/profile',
        data: {
          'firstName': firstName,
          'lastName': lastName,
          'phone': phone,
          'street1': street1,
          'street2': street2 ?? '',
          'city': city,
          'state': state,
          'zip': zip,
          'country': country,
        },
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final accountRepositoryProvider = Provider<AccountRepository>((ref) {
  return AccountRepository(ref.read(dioProvider));
});

final accountProfileProvider =
    FutureProvider.autoDispose<UserProfile>((ref) {
  return ref.read(accountRepositoryProvider).getProfile();
});
