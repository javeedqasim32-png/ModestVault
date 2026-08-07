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

/// Admin photo-reorder screen. Mirrors the website's "Rearrange Photos"
/// gallery (AdminListingsClient.renderGallery). Reorder via drag or the
/// per-tile ◀ / ▶ arrow buttons; Save commits the full new id order in
/// a single transaction via PUT /api/v1/admin/listings/[id]/images.
class AdminListingImagesScreen extends ConsumerStatefulWidget {
  const AdminListingImagesScreen({super.key, required this.listingId});
  final String listingId;

  @override
  ConsumerState<AdminListingImagesScreen> createState() =>
      _AdminListingImagesScreenState();
}

class _AdminListingImagesScreenState
    extends ConsumerState<AdminListingImagesScreen> {
  List<AdminListingImage>? _local;
  bool _saving = false;
  bool _dirty = false;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(adminListingImagesProvider(widget.listingId));
    async.whenData((p) {
      _local ??= List.of(p.images);
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
        data: (payload) {
          final imgs = _local ?? const <AdminListingImage>[];
          if (imgs.isEmpty) {
            return Center(
              child: Text(
                'No photos on this listing.',
                style: GoogleFonts.jost(
                  fontSize: 14,
                  color: const Color(0xFF8A7667),
                ),
              ),
            );
          }
          return Column(
            children: [
              _hint(payload.title),
              Expanded(
                child: ReorderableListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: imgs.length,
                  buildDefaultDragHandles: false,
                  onReorderItem: (oldIndex, newIndex) {
                    setState(() {
                      final item = _local!.removeAt(oldIndex);
                      _local!.insert(newIndex, item);
                      _dirty = true;
                    });
                  },
                  itemBuilder: (context, i) {
                    final img = imgs[i];
                    return Padding(
                      key: ValueKey(img.id),
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _PhotoRow(
                        image: img,
                        position: i,
                        total: imgs.length,
                        dragIndex: i,
                        onUp: i == 0 ? null : () => _swap(i, i - 1),
                        onDown: i == imgs.length - 1
                            ? null
                            : () => _swap(i, i + 1),
                      ),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _hint(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFFFBF8F5),
          border: Border.all(color: const Color(0xFFE3D9D1)),
          borderRadius: BorderRadius.circular(16),
        ),
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(LucideIcons.images,
                size: 18, color: Color(0xFF7A5A45)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.jost(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF2F2925),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Drag a row by the handle, or use ▲ / ▼ to swap. Position 1 is the cover photo.',
                    style: GoogleFonts.jost(
                      fontSize: 12,
                      color: const Color(0xFF8A7667),
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

  void _swap(int a, int b) {
    setState(() {
      final tmp = _local![a];
      _local![a] = _local![b];
      _local![b] = tmp;
      _dirty = true;
    });
  }

  Future<void> _save() async {
    if (_local == null) return;
    setState(() => _saving = true);
    try {
      final ids = _local!.map((i) => i.id).toList();
      await ref
          .read(adminRepositoryProvider)
          .reorderListingImages(widget.listingId, ids);
      ref.invalidate(adminListingImagesProvider(widget.listingId));
      // Invalidate every listings tab so the cover thumb updates everywhere.
      ref.invalidate(adminListingsProvider);
      if (!mounted) return;
      setState(() {
        _saving = false;
        _dirty = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Photo order saved')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }
}

class _PhotoRow extends StatelessWidget {
  const _PhotoRow({
    required this.image,
    required this.position,
    required this.total,
    required this.dragIndex,
    required this.onUp,
    required this.onDown,
  });
  final AdminListingImage image;
  final int position;
  final int total;
  final int dragIndex;
  final VoidCallback? onUp;
  final VoidCallback? onDown;

  @override
  Widget build(BuildContext context) {
    final isCover = position == 0;
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFFBF8F5),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isCover
              ? const Color(0xFF7A5A45)
              : const Color(0xFFDDD3CB),
          width: isCover ? 1.5 : 1,
        ),
      ),
      padding: const EdgeInsets.all(10),
      child: Row(
        children: [
          ReorderableDragStartListener(
            index: dragIndex,
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 4),
              child: Icon(
                LucideIcons.gripVertical,
                size: 20,
                color: Color(0xFF8A7667),
              ),
            ),
          ),
          Stack(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  width: 78,
                  height: 104,
                  color: const Color(0xFFF2EBE4),
                  child: CachedNetworkImage(
                    imageUrl: resolveAssetUrl(
                        image.mediumUrl ?? image.imageUrl),
                    fit: BoxFit.cover,
                    errorWidget: (_, __, ___) =>
                        Container(color: const Color(0xFFF2EBE4)),
                  ),
                ),
              ),
              if (isCover)
                Positioned(
                  left: 4,
                  top: 4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFF4A3328),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      'COVER',
                      style: GoogleFonts.jost(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.6,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Position ${position + 1} of $total',
                  style: GoogleFonts.jost(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFF2F2925),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  isCover ? 'Cover photo' : '',
                  style: GoogleFonts.jost(
                    fontSize: 12,
                    color: const Color(0xFF7A5A45),
                  ),
                ),
              ],
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                visualDensity: VisualDensity.compact,
                onPressed: onUp,
                icon: const Icon(LucideIcons.chevronUp, size: 18),
                color: onUp == null
                    ? const Color(0xFFB3A698)
                    : const Color(0xFF4A3328),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                onPressed: onDown,
                icon: const Icon(LucideIcons.chevronDown, size: 18),
                color: onDown == null
                    ? const Color(0xFFB3A698)
                    : const Color(0xFF4A3328),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
