import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme.dart';
import '../../../core/listings/related_repository.dart';
import '../../../shared/widgets/listing_tile.dart';

/// "Similar items" rail under a listing. Mirrors the home screen's
/// recently-viewed row (300px tall, 150px tiles) so the tiles look identical
/// across surfaces. Hides itself while loading, on error, or when empty —
/// recommendations are best-effort.
class SimilarListingsRail extends ConsumerWidget {
  const SimilarListingsRail({super.key, required this.listingId});
  final String listingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(similarListingsProvider(listingId)).valueOrNull ?? const [];
    if (items.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 12),
          child: Text(
            'SIMILAR ITEMS',
            style: GoogleFonts.jost(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 2,
              color: ModaireColors.tileTextSubtle,
            ),
          ),
        ),
        SizedBox(
          height: 300,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, i) => SizedBox(
              width: 150,
              child: ListingTile(
                listing: items[i],
                onTap: () => context.push('/listings/${items[i].id}'),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
