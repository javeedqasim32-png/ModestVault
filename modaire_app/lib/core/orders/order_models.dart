class OrderListingSummary {
  const OrderListingSummary({
    required this.id,
    required this.title,
    required this.category,
    this.size,
    this.brand,
    required this.thumbUrl,
    required this.mediumUrl,
    required this.status,
  });

  final String id;
  final String title;
  final String category;
  final String? size;
  final String? brand;
  final String thumbUrl;
  final String mediumUrl;
  final String status;

  factory OrderListingSummary.fromJson(Map<String, dynamic> json) =>
      OrderListingSummary(
        id: json['id'] as String,
        title: json['title'] as String,
        category: json['category'] as String,
        size: json['size'] as String?,
        brand: json['brand'] as String?,
        thumbUrl: json['thumbUrl'] as String,
        mediumUrl: json['mediumUrl'] as String,
        status: json['status'] as String,
      );
}

class OrderSeller {
  const OrderSeller({
    required this.id,
    required this.firstName,
    required this.lastName,
  });

  final String id;
  final String firstName;
  final String lastName;

  String get displayName {
    final parts = [firstName, lastName]
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
    return parts.isEmpty ? 'Seller' : parts.join(' ');
  }

  factory OrderSeller.fromJson(Map<String, dynamic> json) => OrderSeller(
        id: json['id'] as String,
        firstName: json['firstName'] as String,
        lastName: json['lastName'] as String,
      );
}

class OrderSummary {
  const OrderSummary({
    required this.id,
    required this.status,
    required this.total,
    required this.itemPrice,
    this.shippingAmount,
    this.trackingNumber,
    this.carrier,
    this.shippedAt,
    this.deliveredAt,
    required this.createdAt,
    required this.listing,
    required this.seller,
  });

  final String id;
  final String status;
  final double total;
  final double itemPrice;
  final double? shippingAmount;
  final String? trackingNumber;
  final String? carrier;
  final DateTime? shippedAt;
  final DateTime? deliveredAt;
  final DateTime createdAt;
  final OrderListingSummary listing;
  final OrderSeller seller;

  factory OrderSummary.fromJson(Map<String, dynamic> json) => OrderSummary(
        id: json['id'] as String,
        status: json['status'] as String,
        total: (json['total'] as num).toDouble(),
        itemPrice: (json['itemPrice'] as num).toDouble(),
        shippingAmount: (json['shippingAmount'] as num?)?.toDouble(),
        trackingNumber: json['trackingNumber'] as String?,
        carrier: json['carrier'] as String?,
        shippedAt: json['shippedAt'] == null
            ? null
            : DateTime.parse(json['shippedAt'] as String),
        deliveredAt: json['deliveredAt'] == null
            ? null
            : DateTime.parse(json['deliveredAt'] as String),
        createdAt: DateTime.parse(json['createdAt'] as String),
        listing: OrderListingSummary.fromJson(
            json['listing'] as Map<String, dynamic>),
        seller: OrderSeller.fromJson(json['seller'] as Map<String, dynamic>),
      );
}
