import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import '../listings/listing_models.dart';

class SellerStats {
  const SellerStats({
    required this.sales,
    required this.followers,
    required this.rating,
    required this.reviewCount,
  });
  final int sales;
  final int followers;
  final double rating;
  final int reviewCount;

  factory SellerStats.fromJson(Map<String, dynamic> json) => SellerStats(
        sales: (json['sales'] as num).toInt(),
        followers: (json['followers'] as num).toInt(),
        rating: (json['rating'] as num).toDouble(),
        reviewCount: (json['reviewCount'] as num).toInt(),
      );
}

class SellerReview {
  const SellerReview({
    required this.id,
    required this.rating,
    required this.text,
    required this.dateLabel,
    required this.reviewerName,
  });
  final String id;
  final int rating;
  final String text;
  final String dateLabel;
  final String reviewerName;

  factory SellerReview.fromJson(Map<String, dynamic> json) => SellerReview(
        id: json['id'] as String,
        rating: (json['rating'] as num).toInt(),
        text: json['text'] as String,
        dateLabel: json['dateLabel'] as String,
        reviewerName: json['reviewerName'] as String,
      );
}

class SellerProfile {
  const SellerProfile({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.profileImage,
    required this.memberSinceLabel,
    required this.isOwnProfile,
    required this.isFollowing,
    required this.stats,
    required this.listings,
    required this.reviews,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String? profileImage;
  final String memberSinceLabel;
  final bool isOwnProfile;
  final bool isFollowing;
  final SellerStats stats;
  final List<ListingSummary> listings;
  final List<SellerReview> reviews;

  SellerProfile copyWith({bool? isFollowing, SellerStats? stats}) =>
      SellerProfile(
        id: id,
        firstName: firstName,
        lastName: lastName,
        profileImage: profileImage,
        memberSinceLabel: memberSinceLabel,
        isOwnProfile: isOwnProfile,
        isFollowing: isFollowing ?? this.isFollowing,
        stats: stats ?? this.stats,
        listings: listings,
        reviews: reviews,
      );

  String get displayName {
    final f = firstName.trim();
    final l = lastName.trim();
    final lastInitial = l.isNotEmpty ? '${l[0].toUpperCase()}.' : '';
    return [f, lastInitial].where((s) => s.isNotEmpty).join(' ');
  }

  String get initial =>
      firstName.isNotEmpty ? firstName[0].toUpperCase() : 'M';

  factory SellerProfile.fromJson(Map<String, dynamic> json) => SellerProfile(
        id: json['id'] as String,
        firstName: json['firstName'] as String,
        lastName: json['lastName'] as String,
        profileImage: json['profileImage'] as String?,
        memberSinceLabel: json['memberSinceLabel'] as String,
        isOwnProfile: json['isOwnProfile'] as bool? ?? false,
        isFollowing: json['isFollowing'] as bool? ?? false,
        stats: SellerStats.fromJson(json['stats'] as Map<String, dynamic>),
        listings: (json['listings'] as List<dynamic>)
            .map((e) => ListingSummary.fromJson(e as Map<String, dynamic>))
            .toList(),
        reviews: (json['reviews'] as List<dynamic>)
            .map((e) => SellerReview.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class FollowResult {
  const FollowResult({required this.isFollowing, required this.followers});
  final bool isFollowing;
  final int followers;
}

class SellerProfileRepository {
  SellerProfileRepository(this._dio);
  final Dio _dio;

  Future<SellerProfile> get(String idOrSlug) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/v1/sellers/$idOrSlug',
      );
      return SellerProfile.fromJson(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<FollowResult> setFollow(String sellerId, bool follow) async {
    try {
      final res = follow
          ? await _dio.post<Map<String, dynamic>>(
              '/api/v1/sellers/$sellerId/follow',
            )
          : await _dio.delete<Map<String, dynamic>>(
              '/api/v1/sellers/$sellerId/follow',
            );
      final data = res.data!;
      return FollowResult(
        isFollowing: data['isFollowing'] as bool,
        followers: (data['followers'] as num).toInt(),
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final sellerProfileRepositoryProvider =
    Provider<SellerProfileRepository>((ref) {
  return SellerProfileRepository(ref.read(dioProvider));
});

final sellerProfileProvider =
    FutureProvider.family.autoDispose<SellerProfile, String>(
        (ref, id) => ref.read(sellerProfileRepositoryProvider).get(id));
