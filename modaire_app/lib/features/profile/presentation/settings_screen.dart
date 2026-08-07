import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/account/account_repository.dart';
import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

/// Mobile mirror of /dashboard/settings AddressSettingsForm.tsx. Edits
/// first/last name, phone, and the street address Shippo uses as the
/// seller's "from" address on label purchase.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(accountProfileProvider);
    return Scaffold(
      backgroundColor: ModaireColors.browsePageBg,
      appBar: const ModaireAppBar(),
      body: async.when(
        loading: () => const Center(
          child: CircularProgressIndicator(
            color: ModaireColors.espresso,
            strokeWidth: 2,
          ),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Couldn\'t load profile.\n$e',
              textAlign: TextAlign.center,
              style: GoogleFonts.jost(
                fontSize: 13,
                color: const Color(0xFF8A7667),
              ),
            ),
          ),
        ),
        data: (profile) => _SettingsForm(profile: profile),
      ),
    );
  }
}

class _SettingsForm extends ConsumerStatefulWidget {
  const _SettingsForm({required this.profile});
  final UserProfile profile;

  @override
  ConsumerState<_SettingsForm> createState() => _SettingsFormState();
}

class _SettingsFormState extends ConsumerState<_SettingsForm> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _firstName;
  late final TextEditingController _lastName;
  late final TextEditingController _phone;
  late final TextEditingController _street1;
  late final TextEditingController _street2;
  late final TextEditingController _city;
  late final TextEditingController _state;
  late final TextEditingController _zip;
  late final TextEditingController _country;

  bool _saving = false;
  String? _error;
  bool _saved = false;

  @override
  void initState() {
    super.initState();
    final p = widget.profile;
    _firstName = TextEditingController(text: p.firstName);
    _lastName = TextEditingController(text: p.lastName);
    _phone = TextEditingController(text: _formatPhoneDisplay(p.phone));
    _street1 = TextEditingController(text: p.street1);
    _street2 = TextEditingController(text: p.street2);
    _city = TextEditingController(text: p.city);
    _state = TextEditingController(text: p.state);
    _zip = TextEditingController(text: p.zip);
    _country = TextEditingController(
        text: p.country.isEmpty ? 'US' : p.country);
  }

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _phone.dispose();
    _street1.dispose();
    _street2.dispose();
    _city.dispose();
    _state.dispose();
    _zip.dispose();
    _country.dispose();
    super.dispose();
  }

  /// Pretty-print a 10-digit US number as (xxx) xxx-xxxx; fall through
  /// otherwise. The backend stores digits-only, so this is display only.
  String _formatPhoneDisplay(String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.length == 10) {
      return '(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}';
    }
    return raw;
  }

  Future<void> _save() async {
    if (_saving) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
      _saved = false;
    });
    try {
      await ref.read(accountRepositoryProvider).updateProfile(
            firstName: _firstName.text.trim(),
            lastName: _lastName.text.trim(),
            phone: _phone.text.trim(),
            street1: _street1.text.trim(),
            street2: _street2.text.trim().isEmpty ? null : _street2.text.trim(),
            city: _city.text.trim(),
            state: _state.text.trim(),
            zip: _zip.text.trim(),
            country: _country.text.trim(),
          );
      if (!mounted) return;
      ref.invalidate(accountProfileProvider);
      setState(() {
        _saving = false;
        _saved = true;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _headerBand(),
            const SizedBox(height: 20),
            Container(
              decoration: BoxDecoration(
                color: const Color(0xFFFBF8F5),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFFDDD3CB)),
              ),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sectionHeader(
                    icon: LucideIcons.mapPin,
                    title: 'Shipping origin',
                    subtitle:
                        'Used as the "From" address on every shipping label you print.',
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: _field(
                          controller: _firstName,
                          label: 'First name',
                          validator: _required,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _field(
                          controller: _lastName,
                          label: 'Last name',
                          validator: _required,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _field(
                    controller: _phone,
                    label: 'Phone number',
                    keyboardType: TextInputType.phone,
                    hint: '(123) 456-7890',
                    validator: _phoneValid,
                  ),
                  const SizedBox(height: 12),
                  _field(
                    controller: _street1,
                    label: 'Street address',
                    hint: '123 Luxury Lane',
                    validator: _required,
                  ),
                  const SizedBox(height: 12),
                  _field(
                    controller: _street2,
                    label: 'Apt, suite, etc. (optional)',
                    hint: 'Apt 4B',
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        flex: 3,
                        child: _field(
                          controller: _city,
                          label: 'City',
                          hint: 'Beverly Hills',
                          validator: _required,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        flex: 2,
                        child: _field(
                          controller: _state,
                          label: 'State',
                          hint: 'CA',
                          validator: _required,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        flex: 2,
                        child: _field(
                          controller: _zip,
                          label: 'ZIP',
                          hint: '90210',
                          keyboardType: TextInputType.number,
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                            LengthLimitingTextInputFormatter(10),
                          ],
                          validator: _required,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        flex: 2,
                        child: _field(
                          controller: _country,
                          label: 'Country',
                          validator: _required,
                        ),
                      ),
                    ],
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    _banner(
                      icon: LucideIcons.circleAlert,
                      text: _error!,
                      tone: _BannerTone.error,
                    ),
                  ],
                  if (_saved) ...[
                    const SizedBox(height: 14),
                    _banner(
                      icon: LucideIcons.circleCheckBig,
                      text: 'Profile updated.',
                      tone: _BannerTone.success,
                    ),
                  ],
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    height: 46,
                    child: ElevatedButton.icon(
                      onPressed: _saving ? null : _save,
                      icon: _saving
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : const SizedBox.shrink(),
                      label: Text(
                        _saving ? 'Saving…' : 'Save changes',
                        style: GoogleFonts.jost(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF4A3328),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(99),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _headerBand() {
    return Column(
      children: [
        Container(
          width: 78,
          height: 78,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: const Color(0xFFD2BAA3),
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0xFFDDD3CB), width: 2),
          ),
          child: Text(
            (widget.profile.firstName.isNotEmpty
                    ? widget.profile.firstName[0]
                    : '?')
                .toUpperCase(),
            style: GoogleFonts.cormorantGaramond(
              fontSize: 34,
              fontWeight: FontWeight.w600,
              color: const Color(0xFF7A6050),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          '${widget.profile.firstName} ${widget.profile.lastName}'.trim(),
          style: GoogleFonts.cormorantGaramond(
            fontSize: 20,
            fontWeight: FontWeight.w600,
            color: const Color(0xFF2F2925),
          ),
        ),
        Text(
          widget.profile.email,
          style: GoogleFonts.jost(
            fontSize: 13,
            color: const Color(0xFF8A7667),
          ),
        ),
      ],
    );
  }

  Widget _sectionHeader({
    required IconData icon,
    required String title,
    required String subtitle,
  }) {
    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: const Color(0xFFFBF8F5),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFFDDD3CB)),
          ),
          child: Icon(icon, size: 18, color: const Color(0xFF5F4A3C)),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title,
                style: GoogleFonts.jost(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF2F2925),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: GoogleFonts.jost(
                  fontSize: 12,
                  color: const Color(0xFF8A7667),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _field({
    required TextEditingController controller,
    required String label,
    String? hint,
    TextInputType? keyboardType,
    List<TextInputFormatter>? inputFormatters,
    String? Function(String?)? validator,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: GoogleFonts.jost(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: const Color(0xFF8A7667),
            letterSpacing: 0.3,
          ),
        ),
        const SizedBox(height: 6),
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          inputFormatters: inputFormatters,
          validator: validator,
          style: GoogleFonts.jost(
            fontSize: 14,
            color: const Color(0xFF2F2925),
          ),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: GoogleFonts.jost(
              fontSize: 14,
              color: const Color(0xFFB3A698),
            ),
            isDense: true,
            filled: true,
            fillColor: Colors.white,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFDDD3CB)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFDDD3CB)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF4A3328)),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFB91C1C)),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFB91C1C)),
            ),
          ),
        ),
      ],
    );
  }

  String? _required(String? v) {
    if (v == null || v.trim().isEmpty) return 'Required';
    return null;
  }

  String? _phoneValid(String? v) {
    if (v == null || v.trim().isEmpty) return 'Required';
    final digits = v.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 8 || digits.length > 15) {
      return 'Must be 8–15 digits';
    }
    return null;
  }

  Widget _banner({
    required IconData icon,
    required String text,
    required _BannerTone tone,
  }) {
    late final Color bg;
    late final Color fg;
    late final Color border;
    switch (tone) {
      case _BannerTone.success:
        bg = const Color(0xFFECFDF3);
        fg = const Color(0xFF067647);
        border = const Color(0xFFA6F4C5);
        break;
      case _BannerTone.error:
        bg = const Color(0xFFFEF2F2);
        fg = const Color(0xFFB91C1C);
        border = const Color(0xFFFECACA);
        break;
    }
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, size: 16, color: fg),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: GoogleFonts.jost(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: fg,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

enum _BannerTone { success, error }
