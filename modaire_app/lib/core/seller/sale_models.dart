/// Mirror of /api/v1/seller/sales row (mobile-serializers.ts:
/// serializeSellerSaleForMobile). Status is server-derived so the
/// client doesn't have to recompute the website's pill logic.
enum SaleStatus { delivered, shipped, processing, actionRequired }

SaleStatus _saleStatusFrom(String s) {
  switch (s) {
    case 'DELIVERED':
      return SaleStatus.delivered;
    case 'SHIPPED':
      return SaleStatus.shipped;
    case 'PROCESSING':
      return SaleStatus.processing;
    case 'ACTION_REQUIRED':
    default:
      return SaleStatus.actionRequired;
  }
}

class SaleListingRef {
  const SaleListingRef({
    required this.id,
    required this.title,
    required this.thumbUrl,
    required this.mediumUrl,
  });
  final String id;
  final String title;
  final String thumbUrl;
  final String mediumUrl;

  factory SaleListingRef.fromJson(Map<String, dynamic> json) => SaleListingRef(
        id: json['id'] as String,
        title: json['title'] as String,
        thumbUrl: json['thumbUrl'] as String,
        mediumUrl: json['mediumUrl'] as String,
      );
}

class SaleBuyerRef {
  const SaleBuyerRef({
    required this.id,
    required this.firstName,
    required this.lastName,
  });
  final String id;
  final String firstName;
  final String lastName;

  String get displayName {
    final l = lastName.trim();
    final initial = l.isNotEmpty ? ' ${l[0].toUpperCase()}.' : '';
    return '${firstName.trim()}$initial';
  }

  factory SaleBuyerRef.fromJson(Map<String, dynamic> json) => SaleBuyerRef(
        id: json['id'] as String,
        firstName: json['firstName'] as String,
        lastName: json['lastName'] as String,
      );
}

class SellerSale {
  const SellerSale({
    required this.id,
    required this.orderId,
    required this.amount,
    required this.status,
    required this.shippingStatus,
    required this.shippingStage,
    required this.trackingNumber,
    required this.carrier,
    required this.labelUrl,
    required this.createdAt,
    required this.listing,
    required this.buyer,
  });

  final String id;
  final String? orderId;
  final double amount;
  final SaleStatus status;
  final String? shippingStatus;
  final String? shippingStage;
  final String? trackingNumber;
  final String? carrier;
  final String? labelUrl;
  final DateTime createdAt;
  final SaleListingRef listing;
  final SaleBuyerRef buyer;

  bool get hasLabel => labelUrl != null && labelUrl!.isNotEmpty;

  factory SellerSale.fromJson(Map<String, dynamic> json) => SellerSale(
        id: json['id'] as String,
        orderId: json['orderId'] as String?,
        amount: (json['amount'] as num).toDouble(),
        status: _saleStatusFrom(json['status'] as String),
        shippingStatus: json['shippingStatus'] as String?,
        shippingStage: json['shippingStage'] as String?,
        trackingNumber: json['trackingNumber'] as String?,
        carrier: json['carrier'] as String?,
        labelUrl: json['labelUrl'] as String?,
        createdAt: DateTime.parse(json['createdAt'] as String),
        listing: SaleListingRef.fromJson(
          json['listing'] as Map<String, dynamic>,
        ),
        buyer: SaleBuyerRef.fromJson(json['buyer'] as Map<String, dynamic>),
      );
}

/// State machine returned by GET .../label — drives the "Generate label"
/// bottom sheet on the mobile sales screen.
class SaleLabelSelection {
  const SaleLabelSelection({
    required this.hasLabel,
    required this.shippingStage,
    required this.hasBuyerAddress,
    required this.hasBuyerSelection,
    required this.labelUrl,
    required this.trackingNumber,
    required this.carrier,
    required this.selection,
  });

  final bool hasLabel;
  final String? shippingStage;
  final bool hasBuyerAddress;
  final bool hasBuyerSelection;
  final String? labelUrl;
  final String? trackingNumber;
  final String? carrier;
  final SelectedRate? selection;

  factory SaleLabelSelection.fromJson(Map<String, dynamic> json) =>
      SaleLabelSelection(
        hasLabel: json['hasLabel'] as bool,
        shippingStage: json['shippingStage'] as String?,
        hasBuyerAddress: json['hasBuyerAddress'] as bool,
        hasBuyerSelection: json['hasBuyerSelection'] as bool,
        labelUrl: json['labelUrl'] as String?,
        trackingNumber: json['trackingNumber'] as String?,
        carrier: json['carrier'] as String?,
        selection: json['selection'] == null
            ? null
            : SelectedRate.fromJson(
                json['selection'] as Map<String, dynamic>,
              ),
      );
}

class SelectedRate {
  const SelectedRate({
    required this.rateId,
    required this.carrier,
    required this.serviceLevel,
    required this.amount,
    required this.currency,
  });
  final String? rateId;
  final String? carrier;
  final String? serviceLevel;
  final double? amount;
  final String? currency;

  factory SelectedRate.fromJson(Map<String, dynamic> json) => SelectedRate(
        rateId: json['rateId'] as String?,
        carrier: json['carrier'] as String?,
        serviceLevel: json['serviceLevel'] as String?,
        amount: json['amount'] == null
            ? null
            : (json['amount'] as num).toDouble(),
        currency: json['currency'] as String?,
      );
}

/// Returned by POST .../label — what the seller needs to print + share.
class PurchasedLabel {
  const PurchasedLabel({
    required this.labelUrl,
    required this.trackingNumber,
    required this.carrier,
  });
  final String? labelUrl;
  final String? trackingNumber;
  final String? carrier;

  factory PurchasedLabel.fromJson(Map<String, dynamic> json) => PurchasedLabel(
        labelUrl: json['labelUrl'] as String?,
        trackingNumber: json['trackingNumber'] as String?,
        carrier: json['carrier'] as String?,
      );
}
