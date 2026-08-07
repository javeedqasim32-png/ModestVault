import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_stripe/flutter_stripe.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';

/// Initializes the Stripe SDK once with the publishable key pulled from
/// /api/v1/meta/stripe-config. Watching this provider during app boot
/// (or right before showing CheckoutScreen) blocks until Stripe is ready
/// so PaymentSheet.init never fires against an uninitialized SDK.
///
/// Cached for the app lifetime — the publishable key doesn't change at
/// runtime, so subsequent reads are free.
class StripeConfig {
  const StripeConfig({
    required this.publishableKey,
    this.merchantIdentifier,
  });
  final String publishableKey;
  final String? merchantIdentifier;
}

final stripeInitProvider = FutureProvider<StripeConfig>((ref) async {
  // Use the bare Dio so we don't pay for the bearer/refresh dance on a
  // public config endpoint.
  final dio = ref.read(bareAuthDioProvider);
  try {
    final res = await dio.get<Map<String, dynamic>>(
      '/api/v1/meta/stripe-config',
    );
    final config = StripeConfig(
      publishableKey: res.data!['publishableKey'] as String,
      merchantIdentifier: res.data!['merchantIdentifier'] as String?,
    );
    Stripe.publishableKey = config.publishableKey;
    if (config.merchantIdentifier != null) {
      Stripe.merchantIdentifier = config.merchantIdentifier!;
    }
    await Stripe.instance.applySettings();
    return config;
  } on DioException catch (e) {
    throw ApiException.fromDio(e);
  }
});
