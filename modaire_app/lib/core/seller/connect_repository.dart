import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';

class ConnectStatus {
  const ConnectStatus({
    required this.hasAccount,
    required this.sellerEnabled,
    required this.detailsSubmitted,
    required this.payoutsEnabled,
    required this.chargesEnabled,
    required this.currentlyDue,
    required this.releasedDollars,
  });

  final bool hasAccount;
  final bool sellerEnabled;
  final bool detailsSubmitted;
  final bool payoutsEnabled;
  final bool chargesEnabled;
  final List<String> currentlyDue;
  final double releasedDollars;

  factory ConnectStatus.fromJson(Map<String, dynamic> json) => ConnectStatus(
        hasAccount: json['hasAccount'] as bool,
        sellerEnabled: json['sellerEnabled'] as bool,
        detailsSubmitted: json['detailsSubmitted'] as bool,
        payoutsEnabled: json['payoutsEnabled'] as bool,
        chargesEnabled: json['chargesEnabled'] as bool,
        currentlyDue:
            (json['currentlyDue'] as List<dynamic>).cast<String>(),
        releasedDollars: (json['releasedDollars'] as num).toDouble(),
      );
}

class SellerBalance {
  const SellerBalance({
    required this.available,
    required this.pending,
    required this.currency,
  });
  final double available;
  final double pending;
  final String currency;

  factory SellerBalance.fromJson(Map<String, dynamic> json) => SellerBalance(
        available: (json['available'] as num).toDouble(),
        pending: (json['pending'] as num).toDouble(),
        currency: json['currency'] as String,
      );
}

class SellerEarnings {
  const SellerEarnings({
    required this.hasStripeAccount,
    required this.balance,
    required this.awaitingCount,
    required this.awaitingDollars,
  });
  final bool hasStripeAccount;
  final SellerBalance balance;
  final int awaitingCount;
  final double awaitingDollars;

  factory SellerEarnings.fromJson(Map<String, dynamic> json) => SellerEarnings(
        hasStripeAccount: json['hasStripeAccount'] as bool,
        balance:
            SellerBalance.fromJson(json['balance'] as Map<String, dynamic>),
        awaitingCount: (json['awaitingCount'] as num).toInt(),
        awaitingDollars: (json['awaitingDollars'] as num).toDouble(),
      );
}

class ConnectRepository {
  ConnectRepository(this._dio);
  final Dio _dio;

  Future<SellerEarnings> earnings() async {
    try {
      final res = await _dio
          .get<Map<String, dynamic>>('/api/v1/seller/earnings');
      return SellerEarnings.fromJson(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<String> onboardLink() async {
    try {
      final res = await _dio
          .post<Map<String, dynamic>>('/api/v1/seller/connect/onboard');
      return res.data!['url'] as String;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<ConnectStatus> status() async {
    try {
      final res = await _dio
          .get<Map<String, dynamic>>('/api/v1/seller/connect/status');
      return ConnectStatus.fromJson(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<String> dashboardLink() async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/v1/seller/connect/dashboard-link',
      );
      return res.data!['url'] as String;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final connectRepositoryProvider = Provider<ConnectRepository>((ref) {
  return ConnectRepository(ref.read(dioProvider));
});

final connectStatusProvider =
    FutureProvider.autoDispose<ConnectStatus>((ref) {
  return ref.read(connectRepositoryProvider).status();
});

final sellerEarningsProvider =
    FutureProvider.autoDispose<SellerEarnings>((ref) {
  return ref.read(connectRepositoryProvider).earnings();
});
