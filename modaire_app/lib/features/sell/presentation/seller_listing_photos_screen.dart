import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/seller/seller_models.dart';
import '../../../core/seller/seller_repository.dart';
import '../../../core/uploads/upload_repository.dart';
import '../../../shared/utils/asset_url.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

/// Seller-side photo editor for an existing listing. Add, remove, and
/// drag-reorder photos; Save commits the new ordered set via
/// PUT /api/v1/seller/listings/[id]/images. Mirrors the website's
/// replaceListingImages flow — photo changes flip the listing back to
/// PENDING for admin re-review.
class SellerListingPhotosScreen extends ConsumerStatefulWidget {
  const SellerListingPhotosScreen({super.key, required this.listingId});
  final String listingId;

  @override
  ConsumerState<SellerListingPhotosScreen> createState() =>
      _SellerListingPhotosScreenState();
}

/// Local in-memory slot representation while the user is editing —
/// either points to an existing listingImage row or to a freshly
/// uploaded URL that hasn't been persisted yet.
sealed class _Slot {
  const _Slot();
  String get displayUrl;
}

class _ExistingSlot extends _Slot {
  const _ExistingSlot(this.image);
  final SellerListingImage image;
  @override
  String get displayUrl => image.bestDisplayUrl;
}

class _UploadedSlot extends _Slot {
  const _UploadedSlot({
    required this.imageUrl,
    this.thumbUrl,
    this.mediumUrl,
  });
  final String imageUrl;
  final String? thumbUrl;
  final String? mediumUrl;
  @override
  String get displayUrl => mediumUrl ?? imageUrl;
}

const _kMaxListingPhotos = 6;

class _SellerListingPhotosScreenState
    extends ConsumerState<SellerListingPhotosScreen> {
  List<_Slot>? _slots;
  bool _loading = true;
  bool _saving = false;
  bool _dirty = false;
  String? _error;
  final ImagePicker _picker = ImagePicker();
  final Set<int> _uploadingSlots = <int>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final detail = await ref
          .read(sellerRepositoryProvider)
          .getListing(widget.listingId);
      if (!mounted) return;
      setState(() {
        _slots = detail.images.map((img) => _ExistingSlot(img) as _Slot).toList();
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  Future<void> _addPhoto() async {
    if (_slots == null) return;
    final remaining = _kMaxListingPhotos - _slots!.length;
    if (remaining <= 0) return;

    List<XFile> picked;
    try {
      if (remaining == 1) {
        // Only one space left — a multi-select sheet would just invite the
        // user to choose photos we'd have to throw away.
        final one = await _picker.pickImage(
          source: ImageSource.gallery,
          imageQuality: 88,
          maxWidth: 2048,
        );
        picked = one == null ? const [] : [one];
      } else {
        picked = await _picker.pickMultiImage(
          imageQuality: 88,
          maxWidth: 2048,
          limit: remaining,
        );
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Couldn\'t open your photos')),
      );
      return;
    }

    // `limit` is advisory on some platforms, so trim rather than trust it.
    final files = picked.take(remaining).toList();
    if (files.isEmpty || !mounted) return;

    final base = _slots!.length;
    setState(() => _uploadingSlots
        .addAll(List.generate(files.length, (i) => base + i)));
    try {
      // Future.wait resolves in argument order regardless of which upload
      // finishes first, so the photos land in the order the seller picked
      // them. That matters here: slot 0 is the listing's cover image.
      //
      // All-or-nothing by design. Appending only the successes would
      // silently reorder the rest, and on a screen whose whole purpose is
      // arranging photos that's worse than asking the seller to retry.
      final uploaded = await Future.wait(files.map((f) async {
        final bytes = await f.readAsBytes();
        final contentType = _contentTypeFor(f.path) ?? 'image/jpeg';
        final result =
            await ref.read(uploadRepositoryProvider).uploadListingPhoto(
                  listingId: widget.listingId,
                  bytes: bytes,
                  contentType: contentType,
                );
        return _UploadedSlot(
          imageUrl: result.publicUrl,
          thumbUrl: result.thumbUrl,
          mediumUrl: result.mediumUrl,
        );
      }));
      if (!mounted) return;
      setState(() {
        _slots!.addAll(uploaded);
        _dirty = true;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            files.length == 1
                ? 'Couldn\'t upload that photo'
                : 'Couldn\'t upload those photos',
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _uploadingSlots
            .removeAll(List.generate(files.length, (i) => base + i)));
      }
    }
  }

  String? _contentTypeFor(String path) {
    final lower = path.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/jpeg';
    return null;
  }

  void _remove(int index) {
    setState(() {
      _slots!.removeAt(index);
      _dirty = true;
    });
  }

  void _swap(int a, int b) {
    setState(() {
      final tmp = _slots![a];
      _slots![a] = _slots![b];
      _slots![b] = tmp;
      _dirty = true;
    });
  }

  Future<void> _save() async {
    if (_slots == null || _slots!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add at least one photo before saving.')),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      final order = <ListingImageEntry>[];
      for (final s in _slots!) {
        if (s is _ExistingSlot) {
          final id = s.image.id;
          if (id == null) {
            throw ApiException(
              code: 'NOT_FOUND',
              message: 'One of the existing photos is missing its id.',
            );
          }
          order.add(KeptListingImage(id));
        } else {
          final u = s as _UploadedSlot;
          order.add(NewListingImage(
            imageUrl: u.imageUrl,
            thumbUrl: u.thumbUrl,
            mediumUrl: u.mediumUrl,
          ));
        }
      }

      await ref
          .read(sellerRepositoryProvider)
          .replaceListingImages(widget.listingId, order);
      ref.invalidate(sellerListingsProvider);
      if (!mounted) return;
      setState(() {
        _saving = false;
        _dirty = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Photos saved')),
      );
      Navigator.of(context).maybePop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ModaireColors.browsePageBg,
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
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(
                color: ModaireColors.espresso,
                strokeWidth: 2,
              ),
            )
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        color: const Color(0xFF8A7667),
                      ),
                    ),
                  ),
                )
              : _body(),
    );
  }

  Widget _body() {
    final slots = _slots ?? const <_Slot>[];
    return Column(
      children: [
        _hint(),
        Expanded(
          child: ReorderableListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            itemCount: slots.length,
            buildDefaultDragHandles: false,
            onReorderItem: (oldIndex, newIndex) {
              setState(() {
                final item = _slots!.removeAt(oldIndex);
                _slots!.insert(newIndex, item);
                _dirty = true;
              });
            },
            itemBuilder: (context, i) {
              final s = slots[i];
              return Padding(
                key: ValueKey('slot-$i-${s.displayUrl}'),
                padding: const EdgeInsets.only(bottom: 10),
                child: _PhotoRow(
                  slot: s,
                  position: i,
                  total: slots.length,
                  dragIndex: i,
                  onUp: i == 0 ? null : () => _swap(i, i - 1),
                  onDown: i == slots.length - 1 ? null : () => _swap(i, i + 1),
                  onRemove: () => _remove(i),
                ),
              );
            },
          ),
        ),
        _addBar(slots.length),
      ],
    );
  }

  Widget _hint() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
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
                    'Edit photos',
                    style: GoogleFonts.jost(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF2F2925),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Drag to reorder. Position 1 is the cover. Saving sends the '
                    'listing back to admin for review.',
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

  Widget _addBar(int count) {
    final atCap = count >= _kMaxListingPhotos;
    return Container(
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: Color(0xFFE3D9D1))),
      ),
      padding: EdgeInsets.fromLTRB(
        16,
        12,
        16,
        12 + MediaQuery.viewPaddingOf(context).bottom,
      ),
      child: SizedBox(
        height: 48,
        child: OutlinedButton.icon(
          onPressed: atCap || _uploadingSlots.isNotEmpty ? null : _addPhoto,
          icon: _uploadingSlots.isNotEmpty
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    color: Color(0xFF4A3328),
                    strokeWidth: 2,
                  ),
                )
              : const Icon(LucideIcons.plus,
                  size: 18, color: Color(0xFF4A3328)),
          label: Text(
            atCap
                ? 'Maximum $_kMaxListingPhotos photos'
                : (_uploadingSlots.isNotEmpty
                    ? 'Uploading…'
                    : 'Add photo ($count/$_kMaxListingPhotos)'),
            style: GoogleFonts.jost(
              fontSize: 14,
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
    );
  }
}

class _PhotoRow extends StatelessWidget {
  const _PhotoRow({
    required this.slot,
    required this.position,
    required this.total,
    required this.dragIndex,
    required this.onUp,
    required this.onDown,
    required this.onRemove,
  });
  final _Slot slot;
  final int position;
  final int total;
  final int dragIndex;
  final VoidCallback? onUp;
  final VoidCallback? onDown;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final isCover = position == 0;
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFFBF8F5),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isCover ? const Color(0xFF7A5A45) : const Color(0xFFDDD3CB),
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
              child: Icon(LucideIcons.gripVertical,
                  size: 20, color: Color(0xFF8A7667)),
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
                    imageUrl: resolveAssetUrl(slot.displayUrl),
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
                  slot is _UploadedSlot ? 'Just added' : (isCover ? 'Cover photo' : ''),
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
              IconButton(
                visualDensity: VisualDensity.compact,
                onPressed: onRemove,
                icon: const Icon(LucideIcons.trash2, size: 16),
                color: const Color(0xFFB91C1C),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
