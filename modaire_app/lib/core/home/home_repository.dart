import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import '../listings/listing_models.dart';

class HomeCategory {
  const HomeCategory({
    required this.style,
    required this.label,
    required this.imageUrl,
  });

  final String style;
  final String label;
  final String imageUrl;

  factory HomeCategory.fromJson(Map<String, dynamic> json) => HomeCategory(
        style: json['style'] as String,
        label: json['label'] as String,
        imageUrl: json['imageUrl'] as String,
      );
}

class FeaturedSeller {
  const FeaturedSeller({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.profileImage,
    required this.activeCount,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String? profileImage;
  final int activeCount;

  String get displayName {
    final f = firstName.trim();
    final l = lastName.trim();
    final lastInitial = l.isNotEmpty ? '${l[0].toUpperCase()}.' : '';
    return [f, lastInitial].where((s) => s.isNotEmpty).join(' ');
  }

  String get initials {
    final f = firstName.isNotEmpty ? firstName[0].toUpperCase() : '';
    final l = lastName.isNotEmpty ? lastName[0].toUpperCase() : '';
    final v = '$f$l';
    return v.isEmpty ? 'M' : v;
  }

  factory FeaturedSeller.fromJson(Map<String, dynamic> json) => FeaturedSeller(
        id: json['id'] as String,
        firstName: json['firstName'] as String,
        lastName: json['lastName'] as String,
        profileImage: json['profileImage'] as String?,
        activeCount: (json['activeCount'] as num).toInt(),
      );
}

class HomeContent {
  const HomeContent({
    required this.heroImageUrl,
    required this.categories,
    required this.trending,
    required this.featured,
    required this.featuredSellers,
  });

  final String heroImageUrl;
  final List<HomeCategory> categories;
  final List<ListingSummary> trending;
  final List<ListingSummary> featured;
  final List<FeaturedSeller> featuredSellers;

  factory HomeContent.fromJson(Map<String, dynamic> json) => HomeContent(
        heroImageUrl: (json['hero'] as Map<String, dynamic>)['imageUrl'] as String,
        categories: (json['categories'] as List<dynamic>)
            .map((e) => HomeCategory.fromJson(e as Map<String, dynamic>))
            .toList(),
        trending: (json['trending'] as List<dynamic>)
            .map((e) => ListingSummary.fromJson(e as Map<String, dynamic>))
            .toList(),
        featured: (json['featured'] as List<dynamic>)
            .map((e) => ListingSummary.fromJson(e as Map<String, dynamic>))
            .toList(),
        featuredSellers: ((json['featuredSellers'] as List<dynamic>?) ?? const [])
            .map((e) => FeaturedSeller.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class HomeRepository {
  HomeRepository(this._dio);
  final Dio _dio;

  Future<HomeContent> fetch() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/v1/home');
      return HomeContent.fromJson(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final homeRepositoryProvider = Provider<HomeRepository>((ref) {
  return HomeRepository(ref.read(dioProvider));
});

final homeContentProvider = FutureProvider.autoDispose<HomeContent>((ref) {
  return ref.read(homeRepositoryProvider).fetch();
});
