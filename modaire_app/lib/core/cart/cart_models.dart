import '../listings/listing_models.dart';

class CartSellerRef {
  const CartSellerRef({
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
    final parts = [firstName, lastName]
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
    return parts.isEmpty ? 'Seller' : parts.join(' ');
  }

  String get initials {
    final f = firstName.trim();
    final l = lastName.trim();
    if (f.isEmpty && l.isEmpty) return 'M';
    if (f.isEmpty) return l[0].toUpperCase();
    if (l.isEmpty) return f[0].toUpperCase();
    return (f[0] + l[0]).toUpperCase();
  }

  factory CartSellerRef.fromJson(Map<String, dynamic> json) => CartSellerRef(
        id: json['id'] as String,
        firstName: json['firstName'] as String,
        lastName: json['lastName'] as String,
        profileImage: json['profileImage'] as String?,
      );
}

class CartItem {
  const CartItem({
    required this.cartItemId,
    required this.listing,
    required this.seller,
    required this.addedAt,
  });

  final String cartItemId;
  final ListingSummary listing;
  final CartSellerRef seller;
  final DateTime addedAt;

  factory CartItem.fromJson(Map<String, dynamic> json) => CartItem(
        cartItemId: json['cartItemId'] as String,
        listing:
            ListingSummary.fromJson(json['listing'] as Map<String, dynamic>),
        seller:
            CartSellerRef.fromJson(json['seller'] as Map<String, dynamic>),
        addedAt: DateTime.parse(json['addedAt'] as String),
      );
}

class Cart {
  const Cart({
    required this.items,
    required this.subtotal,
    required this.currency,
  });

  final List<CartItem> items;
  final double subtotal;
  final String currency;

  bool get isEmpty => items.isEmpty;
  int get count => items.length;

  factory Cart.fromJson(Map<String, dynamic> json) => Cart(
        items: (json['items'] as List<dynamic>)
            .map((e) => CartItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        subtotal: (json['subtotal'] as num).toDouble(),
        currency: (json['currency'] as String?) ?? 'USD',
      );
}
