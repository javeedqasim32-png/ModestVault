// Mirrors the offer JSON from /api/v1/offers (src/lib/offers/serialize.ts).
// Money arrives as a number; deadlines as ISO strings.

double? _num(dynamic v) => v == null ? null : (v as num).toDouble();
DateTime? _date(dynamic v) => v == null ? null : DateTime.tryParse(v as String);

class OfferListingRef {
  const OfferListingRef({required this.id, required this.title, this.price, this.imageUrl});
  final String id;
  final String title;
  final double? price;
  final String? imageUrl;

  factory OfferListingRef.fromJson(Map<String, dynamic> j) => OfferListingRef(
        id: j['id'] as String,
        title: j['title'] as String? ?? '',
        price: _num(j['price']),
        imageUrl: j['imageUrl'] as String?,
      );
}

class OfferEvent {
  const OfferEvent({required this.id, required this.actor, required this.type, this.amount, required this.createdAt});
  final String id;
  final String actor; // BUYER | SELLER | SYSTEM
  final String type; // OFFER | COUNTER | ACCEPT | REJECT | EXPIRE | WITHDRAW | PAID
  final double? amount;
  final DateTime? createdAt;

  factory OfferEvent.fromJson(Map<String, dynamic> j) => OfferEvent(
        id: j['id'] as String,
        actor: j['actor'] as String,
        type: j['type'] as String,
        amount: _num(j['amount']),
        createdAt: _date(j['createdAt']),
      );
}

class OfferSummary {
  const OfferSummary({
    required this.id,
    required this.status,
    required this.currentAmount,
    required this.currentTurn,
    required this.viewerRole,
    required this.expiresAt,
    this.paymentState,
    this.payWindowExpiresAt,
    required this.listing,
    this.buyerName,
    this.sellerName,
  });

  final String id;
  final String status; // PENDING, COUNTERED, ACCEPTED, REJECTED, EXPIRED, WITHDRAWN, COMPLETED
  final double? currentAmount;
  final String currentTurn; // SELLER | BUYER
  final String viewerRole; // BUYER | SELLER
  final DateTime? expiresAt;
  final String? paymentState;
  final DateTime? payWindowExpiresAt;
  final OfferListingRef listing;
  final String? buyerName;
  final String? sellerName;

  bool get isActive => status == 'PENDING' || status == 'COUNTERED';
  bool get isMyTurn => isActive && currentTurn == viewerRole;
  bool get awaitingPayment => status == 'ACCEPTED' && viewerRole == 'BUYER' && paymentState == 'AWAITING_PAYMENT';

  factory OfferSummary.fromJson(Map<String, dynamic> j) => OfferSummary(
        id: j['id'] as String,
        status: j['status'] as String,
        currentAmount: _num(j['currentAmount']),
        currentTurn: j['currentTurn'] as String,
        viewerRole: j['viewerRole'] as String,
        expiresAt: _date(j['expiresAt']),
        paymentState: j['paymentState'] as String?,
        payWindowExpiresAt: _date(j['payWindowExpiresAt']),
        listing: OfferListingRef.fromJson(j['listing'] as Map<String, dynamic>),
        buyerName: j['buyerName'] as String?,
        sellerName: j['sellerName'] as String?,
      );
}

class OfferThread extends OfferSummary {
  const OfferThread({
    required super.id,
    required super.status,
    required super.currentAmount,
    required super.currentTurn,
    required super.viewerRole,
    required super.expiresAt,
    super.paymentState,
    super.payWindowExpiresAt,
    required super.listing,
    super.buyerName,
    super.sellerName,
    required this.events,
  });

  final List<OfferEvent> events;

  factory OfferThread.fromJson(Map<String, dynamic> j) {
    final s = OfferSummary.fromJson(j);
    return OfferThread(
      id: s.id,
      status: s.status,
      currentAmount: s.currentAmount,
      currentTurn: s.currentTurn,
      viewerRole: s.viewerRole,
      expiresAt: s.expiresAt,
      paymentState: s.paymentState,
      payWindowExpiresAt: s.payWindowExpiresAt,
      listing: s.listing,
      buyerName: s.buyerName,
      sellerName: s.sellerName,
      events: ((j['events'] as List<dynamic>?) ?? [])
          .map((e) => OfferEvent.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// Button state from /api/v1/listings/[id]/offer-eligibility.
class OfferEligibility {
  const OfferEligibility({required this.eligible, this.reason, this.hasActiveOffer = false, this.activeOfferId});
  final bool eligible;
  final String? reason;
  final bool hasActiveOffer;
  final String? activeOfferId;

  factory OfferEligibility.fromJson(Map<String, dynamic> j) => OfferEligibility(
        eligible: j['eligible'] as bool? ?? false,
        reason: j['reason'] as String?,
        hasActiveOffer: j['hasActiveOffer'] as bool? ?? false,
        activeOfferId: j['activeOfferId'] as String?,
      );
}
