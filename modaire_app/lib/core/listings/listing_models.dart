// Mirrors the shape returned by src/lib/api/mobile-serializers.ts.
// Keep these in sync when the backend serializer changes.

/// Promotional pricing resolved server-side by getEffectivePricesForListings —
/// the same helper checkout uses, so what the tile shows is what the buyer is
/// charged. Only present when a campaign is actually discounting the listing;
/// the serializer sends null otherwise, so a non-null value always implies
/// discountPercent > 0.
class EffectivePrice {
  const EffectivePrice({
    required this.originalCents,
    required this.effectiveCents,
    required this.discountPercent,
  });

  final int originalCents;
  final int effectiveCents;
  final int discountPercent;

  double get originalPrice => originalCents / 100;
  double get effectivePrice => effectiveCents / 100;

  factory EffectivePrice.fromJson(Map<String, dynamic> json) => EffectivePrice(
        originalCents: (json['originalCents'] as num).toInt(),
        effectiveCents: (json['effectiveCents'] as num).toInt(),
        discountPercent: (json['discountPercent'] as num).toInt(),
      );
}

class ListingSummary {
  const ListingSummary({
    required this.id,
    required this.title,
    required this.price,
    this.brand,
    this.size,
    this.condition,
    required this.category,
    required this.style,
    required this.status,
    required this.isFeatured,
    required this.thumbUrl,
    required this.mediumUrl,
    required this.createdAt,
    this.effectivePrice,
  });

  final String id;
  final String title;
  final double price;
  final String? brand;
  final String? size;
  final String? condition;
  final String category;
  final String style;
  final String status;
  final bool isFeatured;
  final String thumbUrl;
  final String mediumUrl;
  final DateTime createdAt;
  final EffectivePrice? effectivePrice;

  bool get isSold => status == 'SOLD';

  /// True when an active campaign is discounting this listing.
  bool get hasPromo => effectivePrice != null;

  /// The price to actually display — discounted when a campaign applies,
  /// otherwise the listing's own price.
  double get displayPrice => effectivePrice?.effectivePrice ?? price;

  factory ListingSummary.fromJson(Map<String, dynamic> json) => ListingSummary(
        id: json['id'] as String,
        title: json['title'] as String,
        price: (json['price'] as num).toDouble(),
        brand: json['brand'] as String?,
        size: json['size'] as String?,
        condition: json['condition'] as String?,
        category: json['category'] as String,
        style: json['style'] as String,
        status: json['status'] as String,
        isFeatured: (json['isFeatured'] as bool?) ?? false,
        thumbUrl: json['thumbUrl'] as String,
        mediumUrl: json['mediumUrl'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
        // Null on older server builds that predate promo-aware summaries,
        // so read defensively rather than casting a missing key.
        effectivePrice: json['effectivePrice'] == null
            ? null
            : EffectivePrice.fromJson(
                json['effectivePrice'] as Map<String, dynamic>,
              ),
      );
}

class ListingImage {
  const ListingImage({
    this.id,
    required this.imageUrl,
    this.thumbUrl,
    this.mediumUrl,
    required this.imageOrder,
  });

  /// Database id — populated when the server returns it (seller-detail +
  /// public-detail endpoints both include it). Nullable so older models
  /// without ids still parse.
  final String? id;
  final String imageUrl;
  final String? thumbUrl;
  final String? mediumUrl;
  final int imageOrder;

  /// Highest-quality variant that still makes sense over cellular.
  /// We prefer mediumUrl; fall back to the original if it wasn't generated
  /// (older listings created before the sharp pipeline shipped).
  String get bestDisplayUrl => mediumUrl ?? imageUrl;

  factory ListingImage.fromJson(Map<String, dynamic> json) => ListingImage(
        id: json['id'] as String?,
        imageUrl: json['imageUrl'] as String,
        thumbUrl: json['thumbUrl'] as String?,
        mediumUrl: json['mediumUrl'] as String?,
        imageOrder: (json['imageOrder'] as num).toInt(),
      );
}

class ListingSeller {
  const ListingSeller({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.profileImage,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String? profileImage;

  String get displayName {
    final f = firstName.trim();
    final l = lastName.trim();
    if (f.isEmpty && l.isEmpty) return 'Seller';
    return [f, l].where((s) => s.isNotEmpty).join(' ');
  }

  factory ListingSeller.fromJson(Map<String, dynamic> json) => ListingSeller(
        id: json['id'] as String,
        firstName: json['firstName'] as String,
        lastName: json['lastName'] as String,
        profileImage: json['profileImage'] as String?,
      );
}

class ListingDetail {
  const ListingDetail({
    required this.id,
    required this.title,
    required this.description,
    required this.price,
    this.brand,
    this.size,
    this.condition,
    required this.category,
    this.subcategory,
    this.type,
    required this.style,
    required this.status,
    required this.isFeatured,
    required this.viewCount,
    required this.createdAt,
    required this.images,
    this.seller,
    this.effectivePrice,
  });

  final String id;
  final String title;
  final String description;
  final double price;
  final String? brand;
  final String? size;
  final String? condition;
  final String category;
  final String? subcategory;
  final String? type;
  final String style;
  final String status;
  final bool isFeatured;
  final int viewCount;
  final DateTime createdAt;
  final List<ListingImage> images;
  final ListingSeller? seller;
  final EffectivePrice? effectivePrice;

  bool get isSold => status == 'SOLD';

  bool get hasPromo => effectivePrice != null;

  double get displayPrice => effectivePrice?.effectivePrice ?? price;

  factory ListingDetail.fromJson(Map<String, dynamic> json) => ListingDetail(
        id: json['id'] as String,
        title: json['title'] as String,
        description: json['description'] as String,
        price: (json['price'] as num).toDouble(),
        brand: json['brand'] as String?,
        size: json['size'] as String?,
        condition: json['condition'] as String?,
        category: json['category'] as String,
        subcategory: json['subcategory'] as String?,
        type: json['type'] as String?,
        style: json['style'] as String,
        status: json['status'] as String,
        isFeatured: (json['isFeatured'] as bool?) ?? false,
        viewCount: (json['viewCount'] as num?)?.toInt() ?? 0,
        createdAt: DateTime.parse(json['createdAt'] as String),
        images: (json['images'] as List<dynamic>)
            .map((e) => ListingImage.fromJson(e as Map<String, dynamic>))
            .toList(),
        seller: json['seller'] == null
            ? null
            : ListingSeller.fromJson(json['seller'] as Map<String, dynamic>),
        effectivePrice: json['effectivePrice'] == null
            ? null
            : EffectivePrice.fromJson(
                json['effectivePrice'] as Map<String, dynamic>,
              ),
      );
}

class ListingPage {
  const ListingPage({required this.listings, this.nextCursor});
  final List<ListingSummary> listings;
  final String? nextCursor;
}
