enum SellerBucket { active, pending, sold }

SellerBucket _parseBucket(String raw) {
  switch (raw) {
    case 'active':
      return SellerBucket.active;
    case 'sold':
      return SellerBucket.sold;
    default:
      return SellerBucket.pending;
  }
}

class SellerListing {
  const SellerListing({
    required this.id,
    required this.title,
    required this.price,
    required this.category,
    this.size,
    this.brand,
    this.condition,
    required this.status,
    required this.moderationStatus,
    this.rejectionReason,
    required this.bucket,
    this.shippingStatus,
    required this.thumbUrl,
    required this.mediumUrl,
    required this.createdAt,
  });

  final String id;
  final String title;
  final double price;
  final String category;
  final String? size;
  final String? brand;
  final String? condition;
  final String status;
  final String moderationStatus;
  final String? rejectionReason;
  final SellerBucket bucket;
  final String? shippingStatus;
  final String thumbUrl;
  final String mediumUrl;
  final DateTime createdAt;

  bool get isRejected => moderationStatus == 'REJECTED';

  factory SellerListing.fromJson(Map<String, dynamic> json) => SellerListing(
        id: json['id'] as String,
        title: json['title'] as String,
        price: (json['price'] as num).toDouble(),
        category: json['category'] as String,
        size: json['size'] as String?,
        brand: json['brand'] as String?,
        condition: json['condition'] as String?,
        status: json['status'] as String,
        moderationStatus: json['moderationStatus'] as String,
        rejectionReason: json['rejectionReason'] as String?,
        bucket: _parseBucket(json['bucket'] as String),
        shippingStatus: json['shippingStatus'] as String?,
        thumbUrl: json['thumbUrl'] as String,
        mediumUrl: json['mediumUrl'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

class SellerListingImage {
  const SellerListingImage({
    this.id,
    required this.imageUrl,
    this.thumbUrl,
    this.mediumUrl,
    required this.imageOrder,
  });

  /// listingImage row id — needed by the seller photo editor to reference
  /// kept-existing slots when committing the new ordered set.
  final String? id;
  final String imageUrl;
  final String? thumbUrl;
  final String? mediumUrl;
  final int imageOrder;

  String get bestDisplayUrl => mediumUrl ?? imageUrl;

  factory SellerListingImage.fromJson(Map<String, dynamic> json) =>
      SellerListingImage(
        id: json['id'] as String?,
        imageUrl: json['imageUrl'] as String,
        thumbUrl: json['thumbUrl'] as String?,
        mediumUrl: json['mediumUrl'] as String?,
        imageOrder: (json['imageOrder'] as num).toInt(),
      );
}

class SellerListingDetail {
  const SellerListingDetail({
    required this.id,
    required this.title,
    required this.description,
    required this.price,
    required this.style,
    required this.category,
    this.subcategory,
    this.type,
    this.condition,
    this.brand,
    this.size,
    required this.status,
    required this.moderationStatus,
    this.rejectionReason,
    required this.images,
  });

  final String id;
  final String title;
  final String description;
  final double price;
  final String style;
  final String category;
  final String? subcategory;
  final String? type;
  final String? condition;
  final String? brand;
  final String? size;
  final String status;
  final String moderationStatus;
  final String? rejectionReason;
  final List<SellerListingImage> images;

  factory SellerListingDetail.fromJson(Map<String, dynamic> json) =>
      SellerListingDetail(
        id: json['id'] as String,
        title: json['title'] as String,
        description: json['description'] as String,
        price: (json['price'] as num).toDouble(),
        style: json['style'] as String,
        category: json['category'] as String,
        subcategory: json['subcategory'] as String?,
        type: json['type'] as String?,
        condition: json['condition'] as String?,
        brand: json['brand'] as String?,
        size: json['size'] as String?,
        status: json['status'] as String,
        moderationStatus: json['moderationStatus'] as String,
        rejectionReason: json['rejectionReason'] as String?,
        images: (json['images'] as List<dynamic>)
            .map((e) => SellerListingImage.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

/// Per-seller stats backing the Sell → Insights tab.
class SellerAnalytics {
  const SellerAnalytics({
    required this.totalListings,
    required this.activeListings,
    required this.soldListings,
    required this.pendingListings,
    required this.averagePrice,
    required this.deliveredRevenue,
  });

  final int totalListings;
  final int activeListings;
  final int soldListings;
  final int pendingListings;
  final double averagePrice;
  final double deliveredRevenue;

  factory SellerAnalytics.fromJson(Map<String, dynamic> json) =>
      SellerAnalytics(
        totalListings: (json['totalListings'] as num).toInt(),
        activeListings: (json['activeListings'] as num).toInt(),
        soldListings: (json['soldListings'] as num).toInt(),
        pendingListings: (json['pendingListings'] as num).toInt(),
        averagePrice: (json['averagePrice'] as num).toDouble(),
        deliveredRevenue: (json['deliveredRevenue'] as num).toDouble(),
      );
}

class SellerDraft {
  const SellerDraft({
    required this.id,
    required this.title,
    required this.style,
    required this.category,
    required this.subcategory,
    required this.type,
    required this.price,
    required this.brand,
    required this.description,
    required this.condition,
    required this.size,
    required this.measurements,
    required this.photoUrls,
    required this.generatedImageUrls,
    required this.updatedAt,
  });

  final String id;
  final String title;
  final String style;
  final String category;
  final String subcategory;
  final String type;
  final String price;
  final String brand;
  final String description;
  final String condition;
  final String size;
  final String measurements;
  final List<String> photoUrls;
  final List<String> generatedImageUrls;
  final DateTime updatedAt;

  String? get coverImage {
    if (generatedImageUrls.isNotEmpty) return generatedImageUrls.first;
    if (photoUrls.isNotEmpty) return photoUrls.first;
    return null;
  }

  String get displayTitle => title.trim().isNotEmpty ? title : 'Untitled draft';

  factory SellerDraft.fromJson(Map<String, dynamic> json) => SellerDraft(
        id: json['id'] as String,
        title: (json['title'] ?? '') as String,
        style: (json['style'] ?? '') as String,
        category: (json['category'] ?? '') as String,
        subcategory: (json['subcategory'] ?? '') as String,
        type: (json['type'] ?? '') as String,
        price: (json['price'] ?? '') as String,
        brand: (json['brand'] ?? '') as String,
        description: (json['description'] ?? '') as String,
        condition: (json['condition'] ?? '') as String,
        size: (json['size'] ?? '') as String,
        measurements: (json['measurements'] ?? '') as String,
        photoUrls: (json['photoUrls'] as List<dynamic>).cast<String>(),
        generatedImageUrls:
            (json['generatedImageUrls'] as List<dynamic>).cast<String>(),
        updatedAt: DateTime.parse(json['updatedAt'] as String),
      );
}
