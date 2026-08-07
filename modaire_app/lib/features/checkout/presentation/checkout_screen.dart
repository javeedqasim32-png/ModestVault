import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/account/account_repository.dart';
import '../../../core/cart/cart_controller.dart';
import '../../../core/cart/cart_models.dart';
import '../../../core/checkout/checkout_models.dart';
import '../../../core/checkout/checkout_repository.dart';
import '../../../core/checkout/stripe_init.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

/// Shipping & Payment screen — pixel mirror of the website's mobile
/// /buy/checkout flow (PreCheckoutClient.tsx). Two-step:
///   1. Address card → tap "Continue to Shipping Options"
///   2. Shipping method card + Pay
///
/// [itemsCsv] is the comma-separated list of cart-item listing IDs the
/// user ticked on the bag screen. Falls back to the whole cart when
/// unset (e.g. legacy deep-links into /checkout with no query). When the
/// resolved set has 2+ items the bundle PaymentIntent endpoint is used.
class CheckoutScreen extends ConsumerWidget {
  const CheckoutScreen({super.key, this.itemsCsv});
  final String? itemsCsv;

  static const _bg = Color(0xFFFBF8F4);
  static const _ink = Color(0xFF2F2925);
  static const _muted = Color(0xFF8A7667);

  /// Build the ordered list of cart items that match the selection
  /// query param, falling back to the whole cart when none was supplied.
  /// Filters out any selected IDs that have left the cart (the user
  /// removed them between the bag screen and now).
  List<CartItem> _resolveSelected(List<CartItem> all) {
    final csv = itemsCsv?.trim() ?? '';
    if (csv.isEmpty) return all;
    final ids = csv.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty);
    final byId = {for (final i in all) i.listing.id: i};
    return [for (final id in ids) if (byId.containsKey(id)) byId[id]!];
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cartAsync = ref.watch(cartProvider);
    // Stripe SDK init is deferred — it only needs to be ready by the
    // time the user taps Pay, not on screen entry. Gating the whole
    // page on it would mean an unconfigured `STRIPE_PUBLISHABLE_KEY`
    // blocks the address + rate selection too, even though neither of
    // those touch Stripe at all.

    return Scaffold(
      backgroundColor: _bg,
      appBar: const ModaireAppBar(backgroundColor: _bg),
      body: cartAsync.when(
        loading: () => const _Loading(),
        error: (e, _) => _Error(message: e.toString()),
        data: (cart) {
          if (cart.isEmpty) {
            return const _Error(
              message: 'Your bag is empty.',
              icon: LucideIcons.shoppingBag,
            );
          }
          final selected = _resolveSelected(cart.items);
          if (selected.isEmpty) {
            return const _Error(
              message: 'Selected items are no longer in your bag.',
              icon: LucideIcons.shoppingBag,
            );
          }
          return _CheckoutForm(items: selected);
        },
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) => const Center(
        child: CircularProgressIndicator(
          color: ModaireColors.espresso,
          strokeWidth: 2,
        ),
      );
}

class _Error extends StatelessWidget {
  const _Error({required this.message, this.icon = LucideIcons.cloudOff});
  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: CheckoutScreen._muted),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: GoogleFonts.jost(
                fontSize: 14,
                color: CheckoutScreen._ink,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CheckoutForm extends ConsumerStatefulWidget {
  const _CheckoutForm({required this.items});
  final List<CartItem> items;

  @override
  ConsumerState<_CheckoutForm> createState() => _CheckoutFormState();
}

class _CheckoutFormState extends ConsumerState<_CheckoutForm> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _line1 = TextEditingController();
  final _line2 = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _postal = TextEditingController();
  final _country = TextEditingController(text: 'US');
  final _phone = TextEditingController();

  List<ShippingRate>? _rates;
  ShippingRate? _selectedRate;
  bool _fetchingRates = false;
  bool _paying = false;
  String? _error;
  bool _seededFromProfile = false;

  /// One-shot copy from the user's saved profile into the form on first
  /// render. We only seed empty controllers so a user who started typing
  /// before the profile fetch landed never has their input clobbered.
  void _seedFromProfile(UserProfile profile) {
    if (_seededFromProfile) return;
    _seededFromProfile = true;
    String fallback(TextEditingController c, String value) {
      if (c.text.isNotEmpty) return c.text;
      c.text = value;
      return value;
    }
    final fullName = [profile.firstName, profile.lastName]
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .join(' ');
    fallback(_name, fullName);
    fallback(_line1, profile.street1);
    fallback(_line2, profile.street2);
    fallback(_city, profile.city);
    fallback(_state, profile.state);
    fallback(_postal, profile.zip);
    fallback(_country, profile.country.isEmpty ? 'US' : profile.country);
    fallback(_phone, profile.phone);
  }

  @override
  void dispose() {
    _name.dispose();
    _line1.dispose();
    _line2.dispose();
    _city.dispose();
    _state.dispose();
    _postal.dispose();
    _country.dispose();
    _phone.dispose();
    super.dispose();
  }

  ShippingAddress _addressFromForm() => ShippingAddress(
        name: _name.text.trim(),
        line1: _line1.text.trim(),
        line2: _line2.text.trim().isEmpty ? null : _line2.text.trim(),
        city: _city.text.trim(),
        state: _state.text.trim(),
        postalCode: _postal.text.trim(),
        country: _country.text.trim().isEmpty ? 'US' : _country.text.trim(),
        phone: _phone.text.trim(),
      );

  bool get _isBundle => widget.items.length >= 2;
  List<String> get _listingIds =>
      widget.items.map((i) => i.listing.id).toList();

  Future<void> _continueToShipping() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _fetchingRates = true;
      _error = null;
      _rates = null;
      _selectedRate = null;
    });
    try {
      final repo = ref.read(checkoutRepositoryProvider);
      final rates = await repo.getRates(
        listingId: _isBundle ? null : widget.items.first.listing.id,
        listingIds: _isBundle ? _listingIds : null,
        address: _addressFromForm(),
      );
      if (!mounted) return;
      setState(() {
        _rates = rates;
        _selectedRate = rates.isEmpty ? null : rates.first;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _fetchingRates = false);
    }
  }

  Future<void> _pay() async {
    if (_selectedRate == null) return;
    setState(() {
      _paying = true;
      _error = null;
    });
    try {
      // Lazy Stripe init — only fire on the way to PaymentSheet. If the
      // server is missing STRIPE_PUBLISHABLE_KEY the user sees the error
      // here on the page (not as a full-screen blocker), and the address
      // they already typed isn't lost.
      await ref.read(stripeInitProvider.future);

      final repo = ref.read(checkoutRepositoryProvider);
      final params = await repo.createPaymentIntent(
        listingId: _isBundle ? null : widget.items.first.listing.id,
        listingIds: _isBundle ? _listingIds : null,
        address: _addressFromForm(),
        selectedRate: _selectedRate!,
      );

      // Apple Pay only surfaces in the payment sheet when both:
      //   1. Stripe.merchantIdentifier was set at init time (via
      //      /api/v1/meta/stripe-config returning APPLE_PAY_MERCHANT_ID)
      //   2. `applePay:` param is passed here.
      // If the server returned no merchant id, we skip #2 so users don't
      // see a broken Apple Pay button. Card-only checkout still works.
      final hasApplePay = (Stripe.merchantIdentifier ?? '').trim().isNotEmpty;
      await Stripe.instance.initPaymentSheet(
        paymentSheetParameters: SetupPaymentSheetParameters(
          paymentIntentClientSecret: params.clientSecret,
          customerEphemeralKeySecret: params.ephemeralKey,
          customerId: params.customerId,
          merchantDisplayName: 'Modaire',
          allowsDelayedPaymentMethods: false,
          applePay: hasApplePay
              ? const PaymentSheetApplePay(merchantCountryCode: 'US')
              : null,
        ),
      );
      await Stripe.instance.presentPaymentSheet();
      await repo.finalize(params.paymentIntentId);
      ref.invalidate(cartIdsProvider);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Order placed — confirmation by email.')),
      );
      context.go('/');
    } on StripeException catch (e) {
      if (!mounted) return;
      if (e.error.code == FailureCode.Canceled) {
        setState(() => _paying = false);
        return;
      }
      setState(() {
        _error = e.error.localizedMessage ?? 'Payment failed.';
        _paying = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _paying = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // Pre-fill with the saved profile address if we have one — listen
    // (not watch) because seeding happens once; we don't want a rebuild
    // whenever the provider re-emits.
    ref.listen<AsyncValue<UserProfile>>(accountProfileProvider, (_, next) {
      next.whenData(_seedFromProfile);
    });
    final profileSnapshot = ref.read(accountProfileProvider);
    profileSnapshot.whenData(_seedFromProfile);

    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
        children: [
          _heroCard(),
          const SizedBox(height: 14),
          _addressCard(),
          if (_rates != null) ...[
            const SizedBox(height: 14),
            _shippingMethodCard(),
            const SizedBox(height: 14),
            _payCard(),
          ],
          if (_error != null) ...[
            const SizedBox(height: 14),
            _errorBanner(_error!),
          ],
        ],
      ),
    );
  }

  Widget _heroCard() {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Shipping & Payment',
            style: GoogleFonts.cormorantGaramond(
              fontSize: 34,
              height: 1.05,
              fontWeight: FontWeight.w600,
              color: CheckoutScreen._ink,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Enter shipping details and pick delivery speed before payment.',
            style: GoogleFonts.jost(
              fontSize: 14,
              height: 1.45,
              color: CheckoutScreen._muted,
            ),
          ),
        ],
      ),
    );
  }

  Widget _addressCard() {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Shipping Address',
            style: GoogleFonts.cormorantGaramond(
              fontSize: 22,
              fontWeight: FontWeight.w600,
              color: CheckoutScreen._ink,
            ),
          ),
          const SizedBox(height: 14),
          _Field(
            controller: _name,
            hint: 'Full name',
            required: true,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 10),
          _Field(
            controller: _line1,
            hint: 'Address line 1',
            required: true,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 10),
          _Field(
            controller: _line2,
            hint: 'Address Line 2 (Optional)',
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _Field(
                  controller: _city,
                  hint: 'City',
                  required: true,
                  textInputAction: TextInputAction.next,
                ),
              ),
              const SizedBox(width: 10),
              SizedBox(
                width: 110,
                child: _Field(
                  controller: _state,
                  hint: 'State',
                  required: true,
                  textInputAction: TextInputAction.next,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _Field(
                  controller: _postal,
                  hint: 'ZIP',
                  required: true,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(10),
                  ],
                  textInputAction: TextInputAction.next,
                ),
              ),
              const SizedBox(width: 10),
              SizedBox(
                width: 110,
                child: _Field(
                  controller: _country,
                  hint: 'Country',
                  required: true,
                  textInputAction: TextInputAction.next,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _Field(
            controller: _phone,
            hint: 'Phone',
            required: true,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.done,
          ),
          const SizedBox(height: 10),
          Text(
            'Tip: US numbers are normalized automatically (example: '
            '`8172627618` becomes `18172627618`).',
            style: GoogleFonts.jost(
              fontSize: 12,
              height: 1.45,
              color: CheckoutScreen._muted,
            ),
          ),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton(
              onPressed: _fetchingRates ? null : _continueToShipping,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF4A3328),
                foregroundColor: Colors.white,
                disabledBackgroundColor: const Color(0xFFB3A698),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              child: _fetchingRates
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          'Continue to Shipping Options',
                          style: GoogleFonts.jost(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Icon(
                          LucideIcons.chevronRight,
                          color: Colors.white,
                          size: 18,
                        ),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _shippingMethodCard() {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Shipping Method',
            style: GoogleFonts.cormorantGaramond(
              fontSize: 22,
              fontWeight: FontWeight.w600,
              color: CheckoutScreen._ink,
            ),
          ),
          const SizedBox(height: 12),
          if (_rates!.isEmpty)
            Text(
              'No shipping options for this address.',
              style: GoogleFonts.jost(
                fontSize: 13,
                color: CheckoutScreen._muted,
              ),
            )
          else
            ..._rates!.map(_rateOption),
        ],
      ),
    );
  }

  Widget _rateOption(ShippingRate r) {
    final selected = _selectedRate?.rateId == r.rateId;
    return InkWell(
      onTap: () => setState(() => _selectedRate = r),
      borderRadius: BorderRadius.circular(14),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: selected
              ? const Color(0xFFEDE2D5)
              : const Color(0xFFFBF8F5),
          border: Border.all(
            color: selected
                ? const Color(0xFF4A3328)
                : const Color(0xFFD9CFC7),
            width: selected ? 1.5 : 1,
          ),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            Container(
              width: 18,
              height: 18,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: selected
                    ? const Color(0xFF4A3328)
                    : Colors.transparent,
                border: Border.all(
                  color: selected
                      ? const Color(0xFF4A3328)
                      : const Color(0xFFB3A698),
                  width: 1.5,
                ),
              ),
              child: selected
                  ? const Icon(LucideIcons.check,
                      size: 12, color: Colors.white)
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    r.carrier,
                    style: GoogleFonts.jost(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: CheckoutScreen._ink,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    [
                      r.serviceLevel,
                      if (r.estimatedDays != null) '~${r.estimatedDays} days',
                    ].join(' · '),
                    style: GoogleFonts.jost(
                      fontSize: 12,
                      color: CheckoutScreen._muted,
                    ),
                  ),
                ],
              ),
            ),
            Text(
              '\$${r.amountDouble.toStringAsFixed(2)}',
              style: GoogleFonts.jost(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: CheckoutScreen._ink,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _payCard() {
    // Must be displayPrice: the PaymentIntent is built server-side from the
    // same effective price, so summing the raw price here would quote the
    // buyer a total higher than the sheet ends up charging.
    final itemsTotal = widget.items.fold<double>(
      0,
      (sum, it) => sum + it.listing.displayPrice,
    );
    final ship = _selectedRate?.amountDouble ?? 0;
    final total = itemsTotal + ship;
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _summary(
            _isBundle ? 'Items (${widget.items.length})' : 'Item',
            '\$${itemsTotal.toStringAsFixed(2)}',
          ),
          const SizedBox(height: 6),
          _summary(
            _selectedRate == null
                ? 'Shipping'
                : 'Shipping (${_selectedRate!.carrier})',
            '\$${ship.toStringAsFixed(2)}',
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Divider(height: 1, color: Color(0xFFE3D9D1)),
          ),
          _summary('Total', '\$${total.toStringAsFixed(2)}', bold: true),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton(
              onPressed: (_selectedRate == null || _paying) ? null : _pay,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF4A3328),
                foregroundColor: Colors.white,
                disabledBackgroundColor: const Color(0xFFB3A698),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              child: _paying
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(
                      _selectedRate == null
                          ? 'Pick a shipping method'
                          : 'Pay \$${total.toStringAsFixed(2)}',
                      style: GoogleFonts.jost(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _summary(String label, String value, {bool bold = false}) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: GoogleFonts.jost(
              fontSize: 14,
              fontWeight: bold ? FontWeight.w600 : FontWeight.w400,
              color: CheckoutScreen._ink,
            ),
          ),
        ),
        Text(
          value,
          style: GoogleFonts.jost(
            fontSize: 14,
            fontWeight: bold ? FontWeight.w600 : FontWeight.w500,
            color: CheckoutScreen._ink,
          ),
        ),
      ],
    );
  }

  Widget _errorBanner(String message) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        border: Border.all(color: const Color(0xFFFECACA)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(LucideIcons.circleAlert,
              size: 16, color: Color(0xFFB91C1C)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: GoogleFonts.jost(
                fontSize: 13,
                color: const Color(0xFFB91C1C),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Reusable rounded card shell matching the website's mobile mockup.
class _Card extends StatelessWidget {
  const _Card({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFFBF8F5),
        border: Border.all(color: const Color(0xFFE3D9D1)),
        borderRadius: BorderRadius.circular(22),
      ),
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
      child: child,
    );
  }
}

/// Form field styled as a soft rounded pill input — cream fill, hairline
/// border, placeholder-only labels (matches the screenshot's flat inputs).
class _Field extends StatelessWidget {
  const _Field({
    required this.controller,
    required this.hint,
    this.required = false,
    this.keyboardType,
    this.inputFormatters,
    this.textInputAction,
  });

  final TextEditingController controller;
  final String hint;
  final bool required;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final TextInputAction? textInputAction;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      inputFormatters: inputFormatters,
      textInputAction: textInputAction,
      validator: required
          ? (v) => (v == null || v.trim().isEmpty) ? 'Required' : null
          : null,
      style: GoogleFonts.jost(
        fontSize: 15,
        color: CheckoutScreen._ink,
      ),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: GoogleFonts.jost(
          fontSize: 15,
          color: const Color(0xFF8A7667),
        ),
        isDense: true,
        filled: true,
        fillColor: const Color(0xFFFBF6F0),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFD9CFC7)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFD9CFC7)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFF4A3328)),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFB91C1C)),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFB91C1C)),
        ),
        errorStyle: GoogleFonts.jost(
          fontSize: 11,
          color: const Color(0xFFB91C1C),
        ),
      ),
    );
  }
}
