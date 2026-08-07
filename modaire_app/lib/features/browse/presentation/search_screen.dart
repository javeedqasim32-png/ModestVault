import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/listings/listing_models.dart';
import '../../../core/listings/listing_repository.dart';
import '../../../shared/widgets/listing_tile.dart';
import 'explore_screen.dart' show SearchPalette;

/// Dedicated search page reached by tapping the floating search pill on
/// the Explore tab. Auto-focused input, debounced live results (300ms
/// after last keystroke), and a lightweight results grid. On mount the
/// search field is blank — a friendly empty-state prompts the user.
///
/// Uses its own [_searchQueryProvider] instead of the Explore filter
/// state so typing here doesn't pollute the Explore grid's filters.
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  Timer? _debounce;
  String _query = '';

  @override
  void initState() {
    super.initState();
    // Autofocus after first frame so the keyboard opens as the screen
    // slides in — feels snappier than a focus-on-mount that races with
    // the route transition animation.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (!mounted) return;
      setState(() => _query = value.trim());
    });
  }

  void _clear() {
    _controller.clear();
    setState(() => _query = '');
    _focusNode.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ModaireColors.browsePageBg,
      body: SafeArea(
        child: Column(
          children: [
            _buildSearchHeader(context),
            Expanded(
              child: _query.isEmpty
                  ? _buildEmptyState()
                  : _SearchResults(query: _query),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchHeader(BuildContext context) {
    final hasQuery = _controller.text.trim().isNotEmpty;
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            color: ModaireColors.tileTextPrimary,
            onPressed: () => context.pop(),
          ),
          Expanded(
            child: Container(
              height: 44,
              decoration: BoxDecoration(
                color: SearchPalette.background,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: SearchPalette.border, width: 1),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Row(
                children: [
                  Icon(
                    LucideIcons.search,
                    size: 18,
                    color: SearchPalette.foreground,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      focusNode: _focusNode,
                      textInputAction: TextInputAction.search,
                      onChanged: _onChanged,
                      onSubmitted: (v) {
                        _debounce?.cancel();
                        setState(() => _query = v.trim());
                      },
                      // Typed text uses the same warm foreground brown as the
                      // icon/hint — reinforces the palette instead of falling
                      // back to the default input theme's darker charcoal.
                      style: GoogleFonts.jost(
                        fontSize: 14,
                        color: SearchPalette.foreground,
                      ),
                      cursorColor: SearchPalette.foreground,
                      decoration: InputDecoration(
                        filled: false,
                        isCollapsed: true,
                        contentPadding: const EdgeInsets.symmetric(vertical: 12),
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        disabledBorder: InputBorder.none,
                        errorBorder: InputBorder.none,
                        focusedErrorBorder: InputBorder.none,
                        hintText: 'Search Modaire',
                        hintStyle: GoogleFonts.jost(
                          fontSize: 14,
                          color: SearchPalette.foreground.withValues(alpha: 0.65),
                        ),
                      ),
                    ),
                  ),
                  if (hasQuery)
                    GestureDetector(
                      onTap: _clear,
                      child: Icon(
                        LucideIcons.x,
                        size: 16,
                        color: SearchPalette.foreground,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 60),
        Center(
          child: Icon(
            LucideIcons.search,
            size: 48,
            color: ModaireColors.tileBorder,
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Search Modaire',
          textAlign: TextAlign.center,
          style: GoogleFonts.jost(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: ModaireColors.tileTextPrimary,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Search by keyword, brand, or style.\nExamples: Kaftan, Bridals, Chiffon',
          textAlign: TextAlign.center,
          style: GoogleFonts.jost(
            fontSize: 13,
            color: ModaireColors.tileTextSubtle,
            height: 1.4,
          ),
        ),
      ],
    );
  }
}

/// Isolated search-results widget so its FutureProvider only mounts once
/// the user has actually typed. Prevents empty "no items" flicker when
/// the screen first opens with a blank query.
class _SearchResults extends ConsumerWidget {
  const _SearchResults({required this.query});
  final String query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final resultsAsync = ref.watch(_searchListingsProvider(query));
    return resultsAsync.when(
      loading: () => const Center(
        child: CircularProgressIndicator(
          color: ModaireColors.espresso,
          strokeWidth: 2,
        ),
      ),
      error: (_, __) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Couldn\'t load results.',
            style: GoogleFonts.jost(
              fontSize: 14,
              color: ModaireColors.tileTextSubtle,
            ),
          ),
        ),
      ),
      data: (page) {
        if (page.listings.isEmpty) {
          return ListView(
            children: [
              const SizedBox(height: 100),
              Center(
                child: Text(
                  'No matches for "$query".',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.jost(
                    fontSize: 14,
                    color: ModaireColors.tileTextSubtle,
                    height: 1.4,
                  ),
                ),
              ),
            ],
          );
        }
        return _SearchResultsGrid(items: page.listings);
      },
    );
  }
}

/// FutureProvider.family keyed on the trimmed query string. Riverpod
/// dedups identical queries automatically — flip the query back and
/// forth and the second hit comes from cache.
final _searchListingsProvider =
    FutureProvider.family<ListingPage, String>((ref, query) {
  return ref.read(listingRepositoryProvider).list(
        limit: 24,
        search: query,
      );
});

/// Same layout math as _ExploreGrid on the Explore screen — fixed 2-col
/// grid with a precomputed tile height that matches the ListingTile
/// (3:4 image + 84px text block). Kept inline instead of shared to
/// avoid coupling; if a third caller ever needs this, extract.
class _SearchResultsGrid extends StatelessWidget {
  const _SearchResultsGrid({required this.items});
  final List<ListingSummary> items;

  static const double _tileTextBlockHeight = 84;
  static const double _crossAxisSpacing = 10;
  static const double _mainAxisSpacing = 10;
  static const double _horizontalPadding = 16;
  static const int _crossAxisCount = 2;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final availableWidth =
            constraints.maxWidth - (_horizontalPadding * 2);
        final totalGap = _crossAxisSpacing * (_crossAxisCount - 1);
        final columnWidth = (availableWidth - totalGap) / _crossAxisCount;
        final imageHeight = columnWidth * 4 / 3;
        final tileHeight = imageHeight + _tileTextBlockHeight;
        final aspectRatio = columnWidth / tileHeight;

        return GridView.builder(
          padding: const EdgeInsets.fromLTRB(
            _horizontalPadding,
            4,
            _horizontalPadding,
            24,
          ),
          physics: const AlwaysScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: _crossAxisCount,
            crossAxisSpacing: _crossAxisSpacing,
            mainAxisSpacing: _mainAxisSpacing,
            childAspectRatio: aspectRatio,
          ),
          itemCount: items.length,
          itemBuilder: (context, index) {
            final listing = items[index];
            return ListingTile(
              listing: listing,
              onTap: () => context.push('/browse/listings/${listing.id}'),
            );
          },
        );
      },
    );
  }
}
