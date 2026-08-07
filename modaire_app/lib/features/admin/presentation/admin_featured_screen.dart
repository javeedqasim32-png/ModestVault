import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/admin/admin_repository.dart';
import '../../../core/api/api_exception.dart';
import '../../../shared/utils/asset_url.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

/// Featured rail manager — admin reorders the Home "New In" rail by
/// dragging tiles. Local list is the source of truth while reordering;
/// on Save we PUT /api/v1/admin/featured with the new id order, which
/// runs setFeaturedListingsOrder inside a transaction.
class AdminFeaturedScreen extends ConsumerStatefulWidget {
  const AdminFeaturedScreen({super.key});

  @override
  ConsumerState<AdminFeaturedScreen> createState() =>
      _AdminFeaturedScreenState();
}

class _AdminFeaturedScreenState extends ConsumerState<AdminFeaturedScreen> {
  List<AdminListing>? _local;
  bool _saving = false;
  bool _dirty = false;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(adminFeaturedProvider);

    // Adopt server data first time; reordering updates _local only.
    async.whenData((rows) {
      _local ??= List.of(rows);
    });

    return Scaffold(
      backgroundColor: const Color(0xFFFBF8F4),
      appBar: ModaireAppBar(
        extraActions: [
          TextButton(
            onPressed: _dirty && !_saving ? _save : null,
            child: Text(
              _saving ? 'Saving…' : 'Save',
              style: GoogleFonts.jost(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: _dirty && !_saving
                    ? const Color(0xFF4A3328)
                    : const Color(0xFFB3A698),
              ),
            ),
          ),
        ],
      ),
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
              'Couldn\'t load: $e',
              textAlign: TextAlign.center,
              style: GoogleFonts.jost(
                fontSize: 13,
                color: const Color(0xFF8A7667),
              ),
            ),
          ),
        ),
        data: (_) {
          final list = _local ?? const <AdminListing>[];
          if (list.isEmpty) {
            return Center(
              child: Text(
                'No featured listings.',
                style: GoogleFonts.jost(
                  fontSize: 14,
                  color: const Color(0xFF8A7667),
                ),
              ),
            );
          }
          return ReorderableListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            itemCount: list.length,
            buildDefaultDragHandles: false,
            onReorderItem: (oldIndex, newIndex) {
              setState(() {
                final item = _local!.removeAt(oldIndex);
                _local!.insert(newIndex, item);
                _dirty = true;
              });
            },
            itemBuilder: (context, i) {
              final l = list[i];
              return Padding(
                key: ValueKey(l.id),
                padding: const EdgeInsets.only(bottom: 10),
                child: _FeaturedRow(
                  listing: l,
                  position: i + 1,
                  dragIndex: i,
                  onUnfeature: () => _unfeature(l),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Future<void> _save() async {
    if (_local == null) return;
    setState(() => _saving = true);
    try {
      final ids = _local!.map((l) => l.id).toList();
      await ref.read(adminRepositoryProvider).reorderFeatured(ids);
      ref.invalidate(adminFeaturedProvider);
      if (!mounted) return;
      setState(() {
        _saving = false;
        _dirty = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Featured order saved')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }

  Future<void> _unfeature(AdminListing l) async {
    try {
      await ref.read(adminRepositoryProvider).setFeatured(l.id, false);
      ref.invalidate(adminFeaturedProvider);
      if (!mounted) return;
      setState(() {
        _local!.removeWhere((x) => x.id == l.id);
        _dirty = true;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }
}

class _FeaturedRow extends StatelessWidget {
  const _FeaturedRow({
    required this.listing,
    required this.position,
    required this.dragIndex,
    required this.onUnfeature,
  });
  final AdminListing listing;
  final int position;
  final int dragIndex;
  final VoidCallback onUnfeature;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFFBF8F5),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFDDD3CB)),
      ),
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          ReorderableDragStartListener(
            index: dragIndex,
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 6),
              child: Icon(
                LucideIcons.gripVertical,
                size: 20,
                color: Color(0xFF8A7667),
              ),
            ),
          ),
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Container(
              width: 70,
              height: 92,
              color: const Color(0xFFF2EBE4),
              child: CachedNetworkImage(
                imageUrl: resolveAssetUrl(listing.mediumUrl),
                fit: BoxFit.cover,
                errorWidget: (_, __, ___) =>
                    Container(color: const Color(0xFFF2EBE4)),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEDE2D5),
                        borderRadius: BorderRadius.circular(99),
                      ),
                      child: Text(
                        '#$position',
                        style: GoogleFonts.jost(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF7A5A45),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  listing.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.jost(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFF2F2925),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  listing.sellerName,
                  style: GoogleFonts.jost(
                    fontSize: 12,
                    color: const Color(0xFF8A7667),
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Unfeature',
            icon: const Icon(LucideIcons.starOff,
                size: 18, color: Color(0xFFB91C1C)),
            onPressed: onUnfeature,
          ),
        ],
      ),
    );
  }
}
