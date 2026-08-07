import 'package:flutter/material.dart';

import '../../core/listings/listing_models.dart';
import 'listing_tile.dart';

/// Geometry for the 2-column listing grid shared by Explore, Home,
/// Favorites and seller profiles.
///
/// [ListingTile] is a fixed-ratio card — a 3:4 image with a text block
/// underneath — and its Column uses `Expanded` to pin the price to the
/// bottom. That means every grid rendering it **must** hand it a bounded
/// height. Intrinsic-height grids (MasonryGridView and friends) lay children
/// out with `0.0 <= h <= Infinity`, which throws:
///
///   RenderFlex children have non-zero flex but incoming height constraints
///   are unbounded.
///
/// and leaves the whole page blank. That assertion is compiled out of
/// release builds, so the failure only ever shows up in debug — it shipped
/// unnoticed three separate times (Explore, Favorites, seller profiles)
/// before this was centralised. Derive the height from here rather than
/// letting a grid infer it.
class ListingGridMetrics {
  const ListingGridMetrics._();

  static const int crossAxisCount = 2;
  static const double crossAxisSpacing = 10;
  static const double mainAxisSpacing = 10;

  /// Height of the block under the image: category (11) + gap (2) + title
  /// (2 lines @ 12/1.3 = 32) + gap-to-price (~4) + price row (17) +
  /// vertical padding (8 top + 10 bottom). Totals ~84.
  static const double tileTextBlockHeight = 84;

  /// Width of one column given the width available to the grid itself
  /// (i.e. already minus any horizontal padding the caller applies).
  static double columnWidthFor(
    double availableWidth, {
    int columns = crossAxisCount,
  }) {
    final totalGap = crossAxisSpacing * (columns - 1);
    return (availableWidth - totalGap) / columns;
  }

  /// Full tile height for a column of [columnWidth]: the 3:4 image plus the
  /// text block.
  static double tileHeightFor(double columnWidth) =>
      columnWidth * 4 / 3 + tileTextBlockHeight;

  static double aspectRatioFor(
    double availableWidth, {
    int columns = crossAxisCount,
  }) {
    final columnWidth = columnWidthFor(availableWidth, columns: columns);
    return columnWidth / tileHeightFor(columnWidth);
  }

  /// Grid delegate with the tile height already solved for — use this
  /// instead of guessing a childAspectRatio.
  static SliverGridDelegate delegateFor(
    double availableWidth, {
    int columns = crossAxisCount,
  }) =>
      SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: columns,
        crossAxisSpacing: crossAxisSpacing,
        mainAxisSpacing: mainAxisSpacing,
        childAspectRatio: aspectRatioFor(availableWidth, columns: columns),
      );
}

/// Plain 2-column listing grid for screens that render a complete list.
///
/// Explore deliberately does not use this — it needs a scroll controller for
/// cursor pagination, so it builds its own CustomScrollView and shares
/// [ListingGridMetrics] instead.
class ListingGrid extends StatelessWidget {
  const ListingGrid({
    super.key,
    required this.items,
    required this.onTapListing,
    this.padding = EdgeInsets.zero,
    this.shrinkWrap = false,
    this.physics,
  });

  final List<ListingSummary> items;
  final void Function(ListingSummary listing) onTapListing;
  final EdgeInsets padding;

  /// True when the grid is nested inside another scrollable (a seller
  /// profile's page Column, say) rather than owning the scroll itself.
  final bool shrinkWrap;
  final ScrollPhysics? physics;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // Subtract our own padding: LayoutBuilder reports the width before
        // GridView insets it, and the tile height must be derived from the
        // width tiles actually get.
        final availableWidth = constraints.maxWidth - padding.horizontal;
        return GridView.builder(
          padding: padding,
          shrinkWrap: shrinkWrap,
          physics: physics,
          gridDelegate: ListingGridMetrics.delegateFor(availableWidth),
          itemCount: items.length,
          itemBuilder: (context, index) {
            final listing = items[index];
            return ListingTile(
              listing: listing,
              onTap: () => onTapListing(listing),
            );
          },
        );
      },
    );
  }
}
