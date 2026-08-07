import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';

/// Mobile-side mirror of the website's admin moderation row.
class AdminListing {
  const AdminListing({
    required this.id,
    required this.title,
    required this.price,
    required this.category,
    required this.style,
    this.subcategory,
    this.type,
    this.size,
    this.brand,
    this.condition,
    required this.status,
    required this.moderationStatus,
    this.rejectionReason,
    required this.isFeatured,
    this.featuredOrder,
    required this.createdAt,
    required this.sellerId,
    required this.sellerName,
    required this.thumbUrl,
    required this.mediumUrl,
  });

  final String id;
  final String title;
  final double price;
  final String category;
  final String style;
  final String? subcategory;
  final String? type;
  final String? size;
  final String? brand;
  final String? condition;
  final String status;
  final String moderationStatus;
  final String? rejectionReason;
  final bool isFeatured;
  final int? featuredOrder;
  final DateTime createdAt;
  final String sellerId;
  final String sellerName;
  final String thumbUrl;
  final String mediumUrl;

  AdminListing copyWith({
    bool? isFeatured,
    String? moderationStatus,
    String? rejectionReason,
  }) =>
      AdminListing(
        id: id,
        title: title,
        price: price,
        category: category,
        style: style,
        subcategory: subcategory,
        type: type,
        size: size,
        brand: brand,
        condition: condition,
        status: status,
        moderationStatus: moderationStatus ?? this.moderationStatus,
        rejectionReason: rejectionReason ?? this.rejectionReason,
        isFeatured: isFeatured ?? this.isFeatured,
        featuredOrder: featuredOrder,
        createdAt: createdAt,
        sellerId: sellerId,
        sellerName: sellerName,
        thumbUrl: thumbUrl,
        mediumUrl: mediumUrl,
      );

  factory AdminListing.fromJson(Map<String, dynamic> json) => AdminListing(
        id: json['id'] as String,
        title: json['title'] as String,
        price: (json['price'] as num).toDouble(),
        category: json['category'] as String,
        style: json['style'] as String,
        subcategory: json['subcategory'] as String?,
        type: json['type'] as String?,
        size: json['size'] as String?,
        brand: json['brand'] as String?,
        condition: json['condition'] as String?,
        status: json['status'] as String,
        moderationStatus: json['moderationStatus'] as String,
        rejectionReason: json['rejectionReason'] as String?,
        isFeatured: json['isFeatured'] as bool,
        featuredOrder: (json['featuredOrder'] as num?)?.toInt(),
        createdAt: DateTime.parse(json['createdAt'] as String),
        sellerId: json['sellerId'] as String,
        sellerName: json['sellerName'] as String,
        thumbUrl: json['thumbUrl'] as String,
        mediumUrl: json['mediumUrl'] as String,
      );
}

class AdminListingImage {
  const AdminListingImage({
    required this.id,
    required this.imageUrl,
    this.thumbUrl,
    this.mediumUrl,
    required this.imageOrder,
  });
  final String id;
  final String imageUrl;
  final String? thumbUrl;
  final String? mediumUrl;
  final int imageOrder;

  factory AdminListingImage.fromJson(Map<String, dynamic> json) =>
      AdminListingImage(
        id: json['id'] as String,
        imageUrl: json['imageUrl'] as String,
        thumbUrl: json['thumbUrl'] as String?,
        mediumUrl: json['mediumUrl'] as String?,
        imageOrder: (json['imageOrder'] as num).toInt(),
      );
}

class AdminListingImagesPayload {
  const AdminListingImagesPayload({
    required this.id,
    required this.title,
    required this.images,
  });
  final String id;
  final String title;
  final List<AdminListingImage> images;

  factory AdminListingImagesPayload.fromJson(Map<String, dynamic> json) =>
      AdminListingImagesPayload(
        id: json['id'] as String,
        title: json['title'] as String,
        images: (json['images'] as List<dynamic>)
            .map((e) => AdminListingImage.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class AdminOrderParty {
  const AdminOrderParty({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.email,
  });
  final String id;
  final String firstName;
  final String lastName;
  final String email;

  String get displayName {
    final l = lastName.trim();
    final initial = l.isNotEmpty ? ' ${l[0].toUpperCase()}.' : '';
    return '${firstName.trim()}$initial';
  }

  factory AdminOrderParty.fromJson(Map<String, dynamic> json) =>
      AdminOrderParty(
        id: json['id'] as String,
        firstName: json['firstName'] as String,
        lastName: json['lastName'] as String,
        email: json['email'] as String,
      );
}

class AdminOrderListing {
  const AdminOrderListing({
    required this.id,
    required this.title,
    required this.thumbUrl,
    required this.mediumUrl,
  });
  final String id;
  final String title;
  final String thumbUrl;
  final String mediumUrl;

  factory AdminOrderListing.fromJson(Map<String, dynamic> json) =>
      AdminOrderListing(
        id: json['id'] as String,
        title: json['title'] as String,
        thumbUrl: json['thumbUrl'] as String,
        mediumUrl: json['mediumUrl'] as String,
      );
}

class AdminOrder {
  const AdminOrder({
    required this.id,
    required this.amount,
    required this.orderStatus,
    required this.shippingStatus,
    required this.shippingStage,
    this.carrier,
    this.trackingNumber,
    this.labelUrl,
    required this.createdAt,
    this.refundId,
    this.refundedAt,
    this.refundReason,
    required this.listing,
    this.buyer,
    required this.seller,
  });

  final String id;
  final double amount;
  final String orderStatus;
  final String shippingStatus;
  final String shippingStage;
  final String? carrier;
  final String? trackingNumber;
  final String? labelUrl;
  final DateTime createdAt;
  final String? refundId;
  final DateTime? refundedAt;
  final String? refundReason;
  final AdminOrderListing listing;
  final AdminOrderParty? buyer;
  final AdminOrderParty seller;

  bool get isRefunded => refundId != null && refundId!.isNotEmpty;

  factory AdminOrder.fromJson(Map<String, dynamic> json) => AdminOrder(
        id: json['id'] as String,
        amount: (json['amount'] as num).toDouble(),
        orderStatus: json['orderStatus'] as String,
        shippingStatus: json['shippingStatus'] as String,
        shippingStage: json['shippingStage'] as String,
        carrier: json['carrier'] as String?,
        trackingNumber: json['trackingNumber'] as String?,
        labelUrl: json['labelUrl'] as String?,
        createdAt: DateTime.parse(json['createdAt'] as String),
        refundId: json['refundId'] as String?,
        refundedAt: json['refundedAt'] == null
            ? null
            : DateTime.parse(json['refundedAt'] as String),
        refundReason: json['refundReason'] as String?,
        listing: AdminOrderListing.fromJson(
          json['listing'] as Map<String, dynamic>,
        ),
        buyer: json['buyer'] == null
            ? null
            : AdminOrderParty.fromJson(json['buyer'] as Map<String, dynamic>),
        seller: AdminOrderParty.fromJson(
          json['seller'] as Map<String, dynamic>,
        ),
      );
}

/// Mirrors `MODAIRE_REFUND_REASONS` in src/lib/refund-reasons.ts.
class ModaireRefundReason {
  const ModaireRefundReason(this.value, this.label);
  final String value;
  final String label;

  bool get requiresNote => value == 'OTHER';
}

const kModaireRefundReasons = <ModaireRefundReason>[
  ModaireRefundReason('BUYER_REQUESTED_CANCELLATION', 'Buyer requested cancellation'),
  ModaireRefundReason('ITEM_UNAVAILABLE', 'Item unavailable'),
  ModaireRefundReason('ITEM_NOT_AS_DESCRIBED', 'Item not as described'),
  ModaireRefundReason('ITEM_ARRIVED_DAMAGED', 'Item arrived damaged'),
  ModaireRefundReason('SHIPPING_DELIVERY_ISSUE', 'Shipping / delivery issue'),
  ModaireRefundReason('OTHER', 'Other'),
];

class AdminRepository {
  AdminRepository(this._dio);
  final Dio _dio;

  Future<List<AdminListing>> listings(String moderationStatus) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/v1/admin/listings',
        queryParameters: {'status': moderationStatus},
      );
      return (res.data!['listings'] as List<dynamic>)
          .map((e) => AdminListing.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> approve(String id, {bool feature = false}) async {
    try {
      await _dio.post('/api/v1/admin/listings/$id/approve',
          data: {'feature': feature});
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> partialApprove(String id) async {
    try {
      await _dio.post('/api/v1/admin/listings/$id/partial-approve');
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> reject(String id, {String? reason}) async {
    try {
      await _dio.post(
        '/api/v1/admin/listings/$id/reject',
        data: {if (reason != null) 'reason': reason},
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> setFeatured(String id, bool featured) async {
    try {
      await _dio.put(
        '/api/v1/admin/listings/$id/featured',
        data: {'featured': featured},
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<AdminListingImagesPayload> listingImages(String id) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/v1/admin/listings/$id/images',
      );
      return AdminListingImagesPayload.fromJson(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> reorderListingImages(
    String listingId,
    List<String> imageIds,
  ) async {
    try {
      await _dio.put(
        '/api/v1/admin/listings/$listingId/images',
        data: {'imageIds': imageIds},
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<List<AdminListing>> featuredList() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/v1/admin/featured');
      return (res.data!['featured'] as List<dynamic>)
          .map((e) => AdminListing.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> reorderFeatured(List<String> ids) async {
    try {
      await _dio.put('/api/v1/admin/featured', data: {'ids': ids});
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<List<AdminOrder>> orders() async {
    try {
      final res =
          await _dio.get<Map<String, dynamic>>('/api/v1/admin/orders');
      return (res.data!['orders'] as List<dynamic>)
          .map((e) => AdminOrder.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> updateShipping(
    String orderId, {
    String? shippingStatus,
    String? carrier,
    String? trackingNumber,
  }) async {
    try {
      await _dio.put(
        '/api/v1/admin/orders/$orderId/shipping',
        data: {
          if (shippingStatus != null) 'shippingStatus': shippingStatus,
          if (carrier != null) 'carrier': carrier,
          if (trackingNumber != null) 'trackingNumber': trackingNumber,
        },
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> refund(
    String orderId, {
    required String reason,
    String? note,
  }) async {
    try {
      await _dio.post(
        '/api/v1/admin/orders/$orderId/refund',
        data: {
          'reason': reason,
          if (note != null && note.isNotEmpty) 'note': note,
        },
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final adminRepositoryProvider = Provider<AdminRepository>((ref) {
  return AdminRepository(ref.read(dioProvider));
});

final adminListingsProvider =
    FutureProvider.autoDispose.family<List<AdminListing>, String>(
        (ref, status) => ref.read(adminRepositoryProvider).listings(status));

final adminFeaturedProvider =
    FutureProvider.autoDispose<List<AdminListing>>((ref) {
  return ref.read(adminRepositoryProvider).featuredList();
});

final adminOrdersProvider =
    FutureProvider.autoDispose<List<AdminOrder>>((ref) {
  return ref.read(adminRepositoryProvider).orders();
});

final adminListingImagesProvider = FutureProvider.autoDispose
    .family<AdminListingImagesPayload, String>(
        (ref, id) => ref.read(adminRepositoryProvider).listingImages(id));
