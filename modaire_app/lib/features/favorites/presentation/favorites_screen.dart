import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme.dart';
import '../../../core/favorites/favorites_controller.dart';
import '../../../shared/widgets/listing_grid.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

class FavoritesScreen extends ConsumerWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final favoritesAsync = ref.watch(favoritesListProvider);
    return Scaffold(
      backgroundColor: ModaireColors.browsePageBg,
      appBar: const ModaireAppBar(),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Page heading — sits below the brand nav so users know
          // exactly which surface they're on. Same pattern other
          // screens can adopt for a title without changing ModaireAppBar.
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Text(
              'Favorites',
              style: GoogleFonts.jost(
                fontSize: 24,
                fontWeight: FontWeight.w600,
                color: ModaireColors.tileTextPrimary,
                height: 1.15,
              ),
            ),
          ),
          Expanded(
            child: favoritesAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(
            color: ModaireColors.espresso,
            strokeWidth: 2,
          ),
        ),
        error: (err, _) => Center(
          child: Text(
            'Couldn\'t load favorites',
            style: GoogleFonts.jost(
              fontSize: 14,
              color: ModaireColors.tileTextSubtle,
            ),
          ),
        ),
        data: (favorites) {
          if (favorites.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.favorite_border,
                      size: 56,
                      color: ModaireColors.tileTextSubtle,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'No favorites yet',
                      style: GoogleFonts.jost(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        color: ModaireColors.tileTextPrimary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Tap the heart on any listing to save it here.',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        color: ModaireColors.tileTextSubtle,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }
          // Bounded-height grid, never MasonryGridView — see the note on
          // ListingGridMetrics for why intrinsic-height grids blank the page.
          return ListingGrid(
            items: favorites,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            physics: const AlwaysScrollableScrollPhysics(),
            onTapListing: (listing) =>
                context.push('/account/favorites/listings/${listing.id}'),
          );
        },
      ),
          ),
        ],
      ),
    );
  }
}

