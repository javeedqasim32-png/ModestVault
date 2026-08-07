/// Mirrors the address payload accepted by /api/v1/checkout/rates +
/// /api/v1/checkout/payment-intent. snake_case keys because the
/// backend Zod schemas expect that shape (mirrors the website's
/// existing checkout server actions).
class ShippingAddress {
  const ShippingAddress({
    required this.name,
    required this.line1,
    this.line2,
    required this.city,
    required this.state,
    required this.postalCode,
    required this.phone,
    this.country = 'US',
  });

  final String name;
  final String line1;
  final String? line2;
  final String city;
  final String state;
  final String postalCode;
  final String phone;
  final String country;

  Map<String, dynamic> toJson() => {
        'name': name,
        'line1': line1,
        'line2': line2 ?? '',
        'city': city,
        'state': state,
        'postal_code': postalCode,
        'country': country,
        'phone': phone,
      };
}

/// One Shippo rate option as returned by /api/v1/checkout/rates.
/// `amount` arrives as a string (Shippo's native shape) so we keep
/// it that way for round-tripping back into payment-intent.
class ShippingRate {
  const ShippingRate({
    required this.rateId,
    required this.carrier,
    required this.serviceLevel,
    required this.amount,
    required this.currency,
    this.estimatedDays,
  });

  final String rateId;
  final String carrier;
  final String serviceLevel;
  final String amount;
  final String currency;
  final int? estimatedDays;

  double get amountDouble => double.tryParse(amount) ?? 0;

  factory ShippingRate.fromJson(Map<String, dynamic> json) => ShippingRate(
        rateId: json['rateId'] as String,
        carrier: json['carrier'] as String,
        serviceLevel: json['serviceLevel'] as String,
        amount: (json['amount'] as Object).toString(),
        currency: (json['currency'] as String?) ?? 'USD',
        estimatedDays: (json['estimatedDays'] as num?)?.toInt(),
      );

  Map<String, dynamic> toJson() => {
        'rateId': rateId,
        'carrier': carrier,
        'serviceLevel': serviceLevel,
        'amount': amount,
        if (currency.isNotEmpty) 'currency': currency,
        if (estimatedDays != null) 'estimatedDays': estimatedDays,
      };
}

class PaymentIntentParams {
  const PaymentIntentParams({
    required this.paymentIntentId,
    required this.clientSecret,
    required this.ephemeralKey,
    required this.customerId,
  });

  final String paymentIntentId;
  final String clientSecret;
  final String ephemeralKey;
  final String customerId;

  factory PaymentIntentParams.fromJson(Map<String, dynamic> json) =>
      PaymentIntentParams(
        paymentIntentId: json['paymentIntentId'] as String,
        clientSecret: json['clientSecret'] as String,
        ephemeralKey: json['ephemeralKey'] as String,
        customerId: json['customerId'] as String,
      );
}
