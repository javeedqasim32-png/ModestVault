/// Canonical listing taxonomy, mirroring `src/lib/taxonomy.ts` on the web.
///
/// Bundled rather than fetched: the whole vocabulary is 5 styles, 6
/// categories and two short attribute lists, and the browse/search surfaces
/// need it before any network call resolves — the search landing renders its
/// chips on a cold install with no connection.
///
/// Kept in sync by hand. `create_listing_screen.dart` and
/// `edit_listing_screen.dart` still carry their own copies (they also need
/// the subcategory/type maps, which nothing here uses yet); the comment at
/// the top of `create_listing_screen.dart` names a `/api/v1/meta/taxonomy`
/// endpoint as the eventual fix for that drift.
class ModaireTaxonomy {
  const ModaireTaxonomy._();

  /// Alphabetical, matching `getStyles()` on the web.
  static const List<String> styles = [
    'Bridals',
    'Festive Pret',
    'Formals',
    'Modest Wear',
    'Western',
  ];

  static const List<String> categories = [
    'Abayas',
    'Accessories',
    'Dresses',
    'Kaftans',
    'Sarees',
    'Suits',
  ];

  /// NOT taxonomy.ts — sizes live in the seller wizard on the web and the
  /// vocabularies differ slightly between surfaces. These are the values the
  /// app actually writes, so they're the ones worth filtering on.
  static const List<String> sizes = [
    'XS',
    'Small',
    'Medium',
    'Large',
    'XLarge',
    'XXLarge',
  ];

  static const List<String> conditions = [
    'New with tags',
    'Like new',
    'Good',
    'Fair',
  ];

  /// Bounds for the price filter's range slider, matching PRICE_MIN/PRICE_MAX
  /// in `src/lib/listingFilters.ts`.
  static const double priceMin = 0;
  static const double priceMax = 2000;
}
