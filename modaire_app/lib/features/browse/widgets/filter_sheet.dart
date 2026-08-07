import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/listings/listing_repository.dart';

// Same taxonomy as the seller wizard / website BrowseFiltersClient.
const _kStyles = <String>[
  'Bridals', 'Festive Pret', 'Formals', 'Modest Wear', 'Western',
];
const _kCategories = <String>[
  'Abayas', 'Accessories', 'Dresses', 'Kaftans', 'Sarees', 'Suits',
];
const _kSizes = <String>[
  'XS', 'Small', 'Medium', 'Large', 'XLarge', 'XXLarge',
];
const _kConditions = <String>[
  'New with tags', 'Like new', 'Good', 'Fair',
];
const double _kPriceMin = 0;
const double _kPriceMax = 2000;

/// Bottom-sheet filter panel. Mirrors BrowseFiltersClient.tsx:
///  - "Refine Results" header + X close
///  - Tap-to-expand multi-select dropdowns (Style / Category / Size /
///    Condition), each row collapsed shows "Label" + selected preview
///    chips, expanded shows a checkable list
///  - Price range section in a rounded cream panel with min/max pill
///    labels and a two-thumb range slider
///  - Apply pill at the bottom, Reset link in header
class FilterSheet extends ConsumerStatefulWidget {
  const FilterSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: ModaireColors.browsePageBg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const FilterSheet(),
    );
  }

  @override
  ConsumerState<FilterSheet> createState() => _FilterSheetState();
}

enum _Facet { style, category, size, condition }

class _FilterSheetState extends ConsumerState<FilterSheet> {
  late ExploreFilters _draft;
  late RangeValues _priceRange;
  _Facet? _openFacet;

  @override
  void initState() {
    super.initState();
    _draft = ref.read(exploreFiltersProvider);
    _priceRange = RangeValues(
      _draft.minPrice ?? _kPriceMin,
      _draft.maxPrice ?? _kPriceMax,
    );
  }

  void _toggleFacet(_Facet facet) {
    setState(() => _openFacet = _openFacet == facet ? null : facet);
  }

  void _toggleValue(Set<String> current, String value,
      void Function(Set<String>) onChanged) {
    final next = {...current};
    if (next.contains(value)) {
      next.remove(value);
    } else {
      next.add(value);
    }
    onChanged(next);
  }

  void _apply() {
    final usePrice =
        _priceRange.start > _kPriceMin || _priceRange.end < _kPriceMax;
    ref.read(exploreFiltersProvider.notifier).state = _draft.copyWith(
      minPrice: usePrice ? _priceRange.start : null,
      maxPrice: usePrice ? _priceRange.end : null,
    );
    Navigator.of(context).pop();
  }

  void _reset() {
    setState(() {
      _draft = ExploreFilters(search: _draft.search);
      _priceRange = const RangeValues(_kPriceMin, _kPriceMax);
      _openFacet = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      minChildSize: 0.55,
      builder: (context, scrollController) {
        return Column(
          children: [
            _grabber(),
            _header(),
            const Divider(color: ModaireColors.pillBorder, height: 1),
            Expanded(
              child: SingleChildScrollView(
                controller: scrollController,
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _facetDropdown(
                      facet: _Facet.style,
                      label: 'Style',
                      values: _kStyles,
                      selected: _draft.styles,
                      onChanged: (next) =>
                          setState(() => _draft = _draft.copyWith(styles: next)),
                    ),
                    const SizedBox(height: 10),
                    _facetDropdown(
                      facet: _Facet.category,
                      label: 'Category',
                      values: _kCategories,
                      selected: _draft.categories,
                      onChanged: (next) => setState(
                          () => _draft = _draft.copyWith(categories: next)),
                    ),
                    const SizedBox(height: 10),
                    _facetDropdown(
                      facet: _Facet.size,
                      label: 'Size',
                      values: _kSizes,
                      selected: _draft.sizes,
                      onChanged: (next) =>
                          setState(() => _draft = _draft.copyWith(sizes: next)),
                    ),
                    const SizedBox(height: 10),
                    _facetDropdown(
                      facet: _Facet.condition,
                      label: 'Condition',
                      values: _kConditions,
                      selected: _draft.conditions,
                      onChanged: (next) => setState(
                          () => _draft = _draft.copyWith(conditions: next)),
                    ),
                    const SizedBox(height: 20),
                    _priceSection(),
                  ],
                ),
              ),
            ),
            _footer(),
          ],
        );
      },
    );
  }

  Widget _grabber() => Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 4),
        child: Container(
          width: 40,
          height: 4,
          decoration: BoxDecoration(
            color: ModaireColors.pillBorder,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
      );

  Widget _header() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 8, 12),
      child: Row(
        children: [
          Expanded(
            child: Text(
              'REFINE RESULTS',
              style: GoogleFonts.jost(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                letterSpacing: 2.2,
                color: ModaireColors.tileTextSubtle,
              ),
            ),
          ),
          TextButton(
            onPressed: _reset,
            child: Text(
              'Reset',
              style: GoogleFonts.jost(
                fontSize: 13,
                color: ModaireColors.espresso,
              ),
            ),
          ),
          GestureDetector(
            onTap: () => Navigator.of(context).pop(),
            child: Container(
              width: 32,
              height: 32,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                border: Border.all(color: ModaireColors.pillBorder),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                LucideIcons.x,
                size: 14,
                color: ModaireColors.tileTextSubtle,
              ),
            ),
          ),
          const SizedBox(width: 12),
        ],
      ),
    );
  }

  /// One facet row: collapsed button on top showing label + selected
  /// preview chips, expandable list below.
  Widget _facetDropdown({
    required _Facet facet,
    required String label,
    required List<String> values,
    required Set<String> selected,
    required void Function(Set<String>) onChanged,
  }) {
    final open = _openFacet == facet;
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ModaireColors.pillBorder),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          GestureDetector(
            onTap: () => _toggleFacet(facet),
            behavior: HitTestBehavior.opaque,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
              child: Row(
                children: [
                  Text(
                    label,
                    style: GoogleFonts.jost(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: ModaireColors.tileTextPrimary,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: _previewChips(selected),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Icon(
                    open ? LucideIcons.chevronUp : LucideIcons.chevronDown,
                    size: 18,
                    color: ModaireColors.tileTextSubtle,
                  ),
                ],
              ),
            ),
          ),
          if (open) ...[
            const Divider(color: ModaireColors.pillBorder, height: 1),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
              child: Column(
                children: values
                    .map((v) => _optionRow(
                          v,
                          selected.contains(v),
                          () => _toggleValue(selected, v, onChanged),
                        ))
                    .toList(),
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// Replicates the website's `PreviewChips`: up to 2 chips inline,
  /// then a "+N" pill for overflow. "All" when nothing selected.
  Widget _previewChips(Set<String> selected) {
    if (selected.isEmpty) {
      return Text(
        'All',
        style: GoogleFonts.jost(
          fontSize: 13,
          color: ModaireColors.tileTextSubtle,
        ),
      );
    }
    final values = selected.toList();
    final preview = values.take(2).toList();
    final overflow = values.length - preview.length;
    final chips = <Widget>[
      for (final v in preview)
        Padding(
          padding: const EdgeInsets.only(left: 6),
          child: _miniChip(v, filled: true),
        ),
      if (overflow > 0)
        Padding(
          padding: const EdgeInsets.only(left: 6),
          child: _miniChip('+$overflow', filled: false),
        ),
    ];
    return Row(mainAxisSize: MainAxisSize.min, children: chips);
  }

  Widget _miniChip(String label, {required bool filled}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: filled ? ModaireColors.sellerCardBg : Colors.transparent,
        borderRadius: BorderRadius.circular(99),
        border: Border.all(
          color: filled
              ? Colors.transparent
              : ModaireColors.pillBorder,
        ),
      ),
      child: Text(
        label,
        style: GoogleFonts.jost(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          color: ModaireColors.tileTextPrimary,
        ),
      ),
    );
  }

  Widget _optionRow(String value, bool selected, VoidCallback onTap) {
    return Material(
      color: selected
          ? ModaireColors.sellerCardBg.withValues(alpha: 0.6)
          : Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  value,
                  style: GoogleFonts.jost(
                    fontSize: 14,
                    fontWeight: selected ? FontWeight.w500 : FontWeight.w400,
                    color: selected
                        ? ModaireColors.espresso
                        : ModaireColors.tileTextPrimary,
                  ),
                ),
              ),
              if (selected)
                const Icon(
                  LucideIcons.check,
                  size: 16,
                  color: ModaireColors.espresso,
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _priceSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            'Price range',
            style: GoogleFonts.jost(
              fontSize: 14,
              color: ModaireColors.tileTextPrimary,
            ),
          ),
        ),
        const SizedBox(height: 10),
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFFF8F3EF),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: const Color(0xFFD8CDC4)),
          ),
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _priceLabelPill('Min \$${_priceRange.start.round()}'),
                  _priceLabelPill(
                    'Max \$${_priceRange.end.round()}${_priceRange.end >= _kPriceMax ? '+' : ''}',
                  ),
                ],
              ),
              const SizedBox(height: 4),
              SliderTheme(
                data: SliderTheme.of(context).copyWith(
                  trackHeight: 6,
                  activeTrackColor: const Color(0xFFA07C61),
                  inactiveTrackColor: const Color(0xFFDED3CB),
                  thumbColor: const Color(0xFFA07C61),
                  overlayColor: const Color(0xFFA07C61).withValues(alpha: 0.15),
                  rangeThumbShape:
                      const RoundRangeSliderThumbShape(enabledThumbRadius: 10),
                  rangeTrackShape: const RoundedRectRangeSliderTrackShape(),
                  showValueIndicator: ShowValueIndicator.never,
                ),
                child: RangeSlider(
                  values: _priceRange,
                  min: _kPriceMin,
                  max: _kPriceMax,
                  divisions: 80,
                  onChanged: (v) => setState(() => _priceRange = v),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _priceLabelPill(String text) {
    return Container(
      constraints: const BoxConstraints(minHeight: 34),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFFF8F3EF),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: const Color(0xFFD8CDC4)),
      ),
      child: Text(
        text,
        style: GoogleFonts.jost(
          fontSize: 13,
          color: ModaireColors.tileTextSubtle,
        ),
      ),
    );
  }

  Widget _footer() {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 14),
        child: SizedBox(
          height: 48,
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _apply,
            style: ElevatedButton.styleFrom(
              backgroundColor: ModaireColors.espresso,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            child: Text(
              'Apply',
              style: GoogleFonts.jost(
                fontSize: 15,
                fontWeight: FontWeight.w500,
                color: ModaireColors.cream,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
