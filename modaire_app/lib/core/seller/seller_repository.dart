import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import 'seller_models.dart';

class SellerRepository {
  SellerRepository(this._dio);
  final Dio _dio;

  Future<List<SellerListing>> listings() async {
    try {
      final res =
          await _dio.get<Map<String, dynamic>>('/api/v1/seller/listings');
      return (res.data!['listings'] as List<dynamic>)
          .map((e) => SellerListing.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<List<SellerDraft>> drafts() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/v1/seller/drafts');
      return (res.data!['drafts'] as List<dynamic>)
          .map((e) => SellerDraft.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  /// Upsert a draft. The client generates [id] up-front so it can upload
  /// photos under `drafts/<userId>/<draftId>/` before the row exists.
  Future<SellerDraft> saveDraft({
    required String id,
    String? title,
    String? style,
    String? category,
    String? subcategory,
    String? type,
    String? price,
    String? brand,
    String? description,
    String? condition,
    String? size,
    String? measurements,
  }) async {
    try {
      final res = await _dio.put<Map<String, dynamic>>(
        '/api/v1/seller/drafts',
        data: {
          'id': id,
          if (title != null) 'title': title,
          if (style != null) 'style': style,
          if (category != null) 'category': category,
          if (subcategory != null) 'subcategory': subcategory,
          if (type != null) 'type': type,
          if (price != null) 'price': price,
          if (brand != null) 'brand': brand,
          if (description != null) 'description': description,
          if (condition != null) 'condition': condition,
          if (size != null) 'size': size,
          if (measurements != null) 'measurements': measurements,
        },
      );
      return SellerDraft.fromJson(res.data!['draft'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> deleteDraft(String id) async {
    try {
      await _dio.delete('/api/v1/seller/drafts/$id');
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<SellerListingDetail> getListing(String id) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/v1/seller/listings/$id',
      );
      return SellerListingDetail.fromJson(
        res.data!['listing'] as Map<String, dynamic>,
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  /// Updates an existing listing's metadata. Backend resets the
  /// moderation_status to PENDING so admin review re-runs.
  Future<void> updateListing({
    required String id,
    required String title,
    required String description,
    required double price,
    required String style,
    required String category,
    String? subcategory,
    String? type,
    String? condition,
    String? brand,
    String? size,
  }) async {
    try {
      await _dio.put(
        '/api/v1/seller/listings/$id',
        data: {
          'title': title,
          'description': description,
          'price': price,
          'style': style,
          'category': category,
          'subcategory': subcategory,
          'type': type,
          'condition': condition,
          'brand': brand,
          'size': size,
        },
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> deleteListing(String id) async {
    try {
      await _dio.delete('/api/v1/seller/listings/$id');
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<SellerAnalytics> analytics() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/v1/seller/analytics',
      );
      return SellerAnalytics.fromJson(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  /// Returns the new listing id on success.
  Future<String> publishDraft(String id) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/v1/seller/drafts/$id/publish',
      );
      return res.data!['listingId'] as String;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  /// Replace a listing's photos with the supplied ordered set. Each
  /// entry is either an existing listingImage row (kept) or a new URL
  /// the client just uploaded via [UploadRepository.uploadListingPhoto].
  /// Server-side this resets the moderation_status to PENDING so admin
  /// re-reviews the listing after the photo change.
  Future<void> replaceListingImages(
    String listingId,
    List<ListingImageEntry> order,
  ) async {
    try {
      await _dio.put(
        '/api/v1/seller/listings/$listingId/images',
        data: {
          'order': order.map((e) => e.toJson()).toList(),
        },
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

/// One slot in the final ordered photo grid sent to
/// PUT /api/v1/seller/listings/[id]/images. Either reuses an existing
/// row by id, or supplies the URLs of a fresh upload that just finalized.
sealed class ListingImageEntry {
  const ListingImageEntry();
  Map<String, dynamic> toJson();
}

class KeptListingImage extends ListingImageEntry {
  const KeptListingImage(this.id);
  final String id;
  @override
  Map<String, dynamic> toJson() => {'kind': 'existing', 'id': id};
}

class NewListingImage extends ListingImageEntry {
  const NewListingImage({
    required this.imageUrl,
    this.thumbUrl,
    this.mediumUrl,
  });
  final String imageUrl;
  final String? thumbUrl;
  final String? mediumUrl;
  @override
  Map<String, dynamic> toJson() => {
        'kind': 'new',
        'imageUrl': imageUrl,
        if (thumbUrl != null) 'thumbUrl': thumbUrl,
        if (mediumUrl != null) 'mediumUrl': mediumUrl,
      };
}

final sellerRepositoryProvider = Provider<SellerRepository>((ref) {
  return SellerRepository(ref.read(dioProvider));
});

final sellerListingsProvider =
    FutureProvider.autoDispose<List<SellerListing>>((ref) {
  return ref.read(sellerRepositoryProvider).listings();
});

final sellerDraftsProvider =
    FutureProvider.autoDispose<List<SellerDraft>>((ref) {
  return ref.read(sellerRepositoryProvider).drafts();
});

final sellerAnalyticsProvider =
    FutureProvider.autoDispose<SellerAnalytics>((ref) {
  return ref.read(sellerRepositoryProvider).analytics();
});
