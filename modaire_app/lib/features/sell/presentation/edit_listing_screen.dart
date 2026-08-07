import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/seller/seller_models.dart';
import '../../../core/seller/seller_repository.dart';
import '../../../shared/utils/asset_url.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

// Same taxonomy as the create wizard — kept inline so a missing
// category doesn't break the dropdowns when editing older listings.
const _kStyles = <String>[
  'Bridals', 'Festive Pret', 'Formals', 'Modest Wear', 'Western',
];
const _kCategories = <String>[
  'Abayas', 'Accessories', 'Dresses', 'Kaftans', 'Sarees', 'Suits',
];
const _kSubcategoriesByCategory = <String, List<String>>{
  'Accessories': [
    'Bags', 'Belts', 'Dupattas', 'Hair Accessories',
    'Hijabs', 'Jewelry', 'Pins',
  ],
  'Suits': [
    'Anarkali', 'Churidar', 'Co-Ord Set', 'Gharara',
    'Lehenga', 'Shalwar Kameez', 'Sharara',
  ],
};
const _kTypesBySubcategory = <String, List<String>>{
  'Shalwar Kameez': ['2 Piece', '3 Piece', '4 Piece'],
};
const _kConditions = <String>['New with tags', 'Like new', 'Good', 'Fair'];
const _kSizes = <String>['XS', 'Small', 'Medium', 'Large', 'XLarge', 'XXLarge'];

/// Edit-in-place screen for an existing listing the seller owns.
/// Photos are read-only here (photo replace lives in a separate flow);
/// every save bumps moderation_status back to PENDING on the backend so
/// admins re-review the new content.
class EditListingScreen extends ConsumerStatefulWidget {
  const EditListingScreen({super.key, required this.listingId});
  final String listingId;

  @override
  ConsumerState<EditListingScreen> createState() => _EditListingScreenState();
}

class _EditListingScreenState extends ConsumerState<EditListingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _price = TextEditingController();
  final _brand = TextEditingController();
  String? _style;
  String? _category;
  String? _subcategory;
  String? _type;
  String? _condition;
  String? _size;

  SellerListingDetail? _listing;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _price.dispose();
    _brand.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final detail =
          await ref.read(sellerRepositoryProvider).getListing(widget.listingId);
      if (!mounted) return;
      setState(() {
        _listing = detail;
        _title.text = detail.title;
        _description.text = detail.description;
        _price.text = detail.price.toStringAsFixed(2);
        _brand.text = detail.brand ?? '';
        _style = detail.style.isEmpty ? null : detail.style;
        _category = detail.category.isEmpty ? null : detail.category;
        _subcategory = detail.subcategory;
        _type = detail.type;
        _condition = detail.condition;
        _size = detail.size;
      });
    } on ApiException catch (e) {
      _setError(e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _setError(String msg) {
    if (!mounted) return;
    setState(() => _error = msg);
  }

  Future<void> _save() async {
    if (_saving) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(sellerRepositoryProvider).updateListing(
            id: widget.listingId,
            title: _title.text.trim(),
            description: _description.text.trim(),
            price: double.parse(_price.text.trim()),
            style: _style!,
            category: _category!,
            subcategory: _subcategory,
            type: _type,
            condition: _condition,
            brand: _brand.text.trim().isEmpty ? null : _brand.text.trim(),
            size: _size,
          );
      if (!mounted) return;
      ref.invalidate(sellerListingsProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saved — back in moderation review.')),
      );
      context.pop();
    } on ApiException catch (e) {
      _setError(e.message);
    } catch (_) {
      _setError('Couldn\'t save changes. Please try again.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  List<String> get _subcategoryOptions =>
      _category == null ? const [] : (_kSubcategoriesByCategory[_category] ?? const []);

  List<String> get _typeOptions =>
      _subcategory == null ? const [] : (_kTypesBySubcategory[_subcategory] ?? const []);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ModaireColors.browsePageBg,
      appBar: const ModaireAppBar(),
      body: SafeArea(
        child: _loading
            ? const Center(
                child: CircularProgressIndicator(
                  color: ModaireColors.espresso,
                  strokeWidth: 2,
                ),
              )
            : _listing == null
                ? _ErrorFill(message: _error ?? 'Couldn\'t load listing')
                : Column(
                    children: [
                      Expanded(child: _form()),
                      _saveBar(),
                    ],
                  ),
      ),
    );
  }

  Widget _form() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        _sectionLabel('PHOTOS'),
        const SizedBox(height: 8),
        _existingPhotos(),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          height: 42,
          child: OutlinedButton.icon(
            onPressed: () =>
                context.push('/sell/edit/${widget.listingId}/photos'),
            icon: const Icon(LucideIcons.images,
                size: 16, color: Color(0xFF4A3328)),
            label: Text(
              'Edit photos',
              style: GoogleFonts.jost(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: const Color(0xFF4A3328),
              ),
            ),
            style: OutlinedButton.styleFrom(
              backgroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(999),
              ),
              side: const BorderSide(color: Color(0xFFD9CFC7)),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Editing photos sends the listing back to admin for review.',
          style: GoogleFonts.jost(
            fontSize: 11,
            color: ModaireColors.tileTextSubtle,
            fontStyle: FontStyle.italic,
          ),
        ),
        const SizedBox(height: 22),
        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _sectionLabel('DETAILS'),
              const SizedBox(height: 10),
              _textField(_title, 'Title', required: true),
              const SizedBox(height: 10),
              _dropdown('Style', _kStyles, _style,
                  (v) => setState(() => _style = v),
                  required: true),
              const SizedBox(height: 10),
              _dropdown('Category', _kCategories, _category, (v) {
                setState(() {
                  _category = v;
                  _subcategory = null;
                  _type = null;
                });
              }, required: true),
              if (_subcategoryOptions.isNotEmpty) ...[
                const SizedBox(height: 10),
                _dropdown(
                  'Subcategory',
                  _subcategoryOptions,
                  _subcategory,
                  (v) => setState(() {
                    _subcategory = v;
                    _type = null;
                  }),
                ),
              ],
              if (_typeOptions.isNotEmpty) ...[
                const SizedBox(height: 10),
                _dropdown('Type', _typeOptions, _type,
                    (v) => setState(() => _type = v)),
              ],
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _dropdown('Size', _kSizes, _size,
                        (v) => setState(() => _size = v),
                        required: true),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _dropdown('Condition', _kConditions, _condition,
                        (v) => setState(() => _condition = v),
                        required: true),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              _textField(_brand, 'Brand (optional)'),
              const SizedBox(height: 10),
              _textField(
                _price,
                'Price (USD)',
                required: true,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                validator: (v) {
                  final s = v?.trim() ?? '';
                  if (s.isEmpty) return 'Required';
                  final n = double.tryParse(s);
                  if (n == null || n <= 0) return 'Enter a price greater than 0';
                  return null;
                },
              ),
              const SizedBox(height: 10),
              _textField(_description, 'Description', required: true, maxLines: 6),
            ],
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: ModaireColors.destructive.withValues(alpha: 0.08),
              border: Border.all(
                color: ModaireColors.destructive.withValues(alpha: 0.3),
              ),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              _error!,
              style: GoogleFonts.jost(
                fontSize: 13,
                color: ModaireColors.destructive,
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _existingPhotos() {
    final images = _listing!.images;
    if (images.isEmpty) {
      return Text(
        'No photos on this listing.',
        style: GoogleFonts.jost(
          fontSize: 13,
          color: ModaireColors.tileTextSubtle,
        ),
      );
    }
    return SizedBox(
      height: 88,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: images.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final img = images[i];
          return ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 70,
              height: 88,
              child: CachedNetworkImage(
                imageUrl: resolveAssetUrl(img.bestDisplayUrl),
                fit: BoxFit.cover,
                placeholder: (_, __) =>
                    Container(color: ModaireColors.tileImageBg),
                errorWidget: (_, __, ___) =>
                    Container(color: ModaireColors.tileImageBg),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _saveBar() {
    return Container(
      decoration: const BoxDecoration(
        color: ModaireColors.pillBg,
        border: Border(top: BorderSide(color: ModaireColors.pillBorder)),
      ),
      padding: EdgeInsets.fromLTRB(
        16, 12, 16,
        12 + MediaQuery.viewPaddingOf(context).bottom,
      ),
      child: SizedBox(
        height: 48,
        child: ElevatedButton(
          onPressed: _saving ? null : _save,
          style: ElevatedButton.styleFrom(
            backgroundColor: ModaireColors.espresso,
            disabledBackgroundColor:
                ModaireColors.espresso.withValues(alpha: 0.4),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(99),
            ),
          ),
          child: _saving
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: ModaireColors.cream,
                  ),
                )
              : Text(
                  'Save changes',
                  style: GoogleFonts.jost(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: ModaireColors.cream,
                  ),
                ),
        ),
      ),
    );
  }

  Widget _sectionLabel(String label) => Text(
        label,
        style: GoogleFonts.jost(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          letterSpacing: 2.2,
          color: ModaireColors.tileTextSubtle,
        ),
      );

  Widget _textField(
    TextEditingController controller,
    String label, {
    bool required = false,
    TextInputType? keyboardType,
    int maxLines = 1,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      maxLines: maxLines,
      textInputAction:
          maxLines > 1 ? TextInputAction.newline : TextInputAction.next,
      decoration: InputDecoration(labelText: label),
      validator: validator ??
          (required
              ? (v) => (v == null || v.trim().isEmpty) ? 'Required' : null
              : null),
    );
  }

  Widget _dropdown(
    String label,
    List<String> values,
    String? selected,
    ValueChanged<String?> onChanged, {
    bool required = false,
  }) {
    // If the listing's value isn't in our canonical list (e.g., old
    // taxonomy), prepend it so the user can still see + keep the value.
    final options = (selected != null && !values.contains(selected))
        ? [selected, ...values]
        : values;
    return DropdownButtonFormField<String>(
      initialValue: selected,
      decoration: InputDecoration(labelText: label),
      isExpanded: true,
      items: options
          .map((v) => DropdownMenuItem(
                value: v,
                child: Text(
                  v,
                  style: GoogleFonts.jost(
                    fontSize: 14,
                    color: ModaireColors.tileTextPrimary,
                  ),
                ),
              ))
          .toList(),
      onChanged: onChanged,
      validator: required ? (v) => v == null ? 'Required' : null : null,
    );
  }
}

class _ErrorFill extends StatelessWidget {
  const _ErrorFill({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: GoogleFonts.jost(
              fontSize: 14,
              color: ModaireColors.tileTextPrimary,
            ),
          ),
        ),
      );
}
