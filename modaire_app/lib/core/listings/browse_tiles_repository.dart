import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/dio_client.dart';
import 'taxonomy.dart';

/// One tile in the search landing's browse rows.
///
/// [image] is null when there's no artwork — the client renders a text-only
/// tile rather than a broken image.
class BrowseTile {
  const BrowseTile({required this.name, this.image, this.count});

  final String name;
  final String? image;

  /// Live listing count, present only for categories. Used to caption the
  /// tile; null for styles, which are a fixed set rather than inventory.
  final int? count;

  factory BrowseTile.fromJson(Map<String, dynamic> json) => BrowseTile(
        name: json['name'] as String,
        image: json['image'] as String?,
        count: (json['count'] as num?)?.toInt(),
      );
}

class BrowseTiles {
  const BrowseTiles({required this.styles, required this.categories});

  final List<BrowseTile> styles;
  final List<BrowseTile> categories;

  /// Artwork-free fallback covering the full taxonomy.
  ///
  /// The landing must never be blank — on a cold install or with the API
  /// unreachable the browse rows are the only working way in. Text tiles for
  /// every taxonomy value beat an empty screen; the server's version is
  /// better only because it can prune categories with no inventory.
  static BrowseTiles get fallback => BrowseTiles(
        styles: [
          for (final s in ModaireTaxonomy.styles) BrowseTile(name: s),
        ],
        categories: [
          for (final c in ModaireTaxonomy.categories) BrowseTile(name: c),
        ],
      );
}

class BrowseTilesRepository {
  BrowseTilesRepository(this._dio);
  final Dio _dio;

  Future<BrowseTiles> fetch() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/v1/meta/browse-tiles',
      );
      final body = res.data!;
      return BrowseTiles(
        styles: (body['styles'] as List<dynamic>? ?? const [])
            .map((e) => BrowseTile.fromJson(e as Map<String, dynamic>))
            .toList(),
        categories: (body['categories'] as List<dynamic>? ?? const [])
            .map((e) => BrowseTile.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final browseTilesRepositoryProvider = Provider<BrowseTilesRepository>((ref) {
  return BrowseTilesRepository(ref.read(dioProvider));
});

/// Tiles for the search landing.
///
/// Not autoDispose: the payload is small, changes only as inventory does, and
/// keeping it warm means reopening search doesn't re-fetch the artwork.
final browseTilesProvider = FutureProvider<BrowseTiles>((ref) {
  return ref.read(browseTilesRepositoryProvider).fetch();
});
