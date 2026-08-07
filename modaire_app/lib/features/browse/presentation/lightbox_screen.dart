import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:photo_view/photo_view.dart';
import 'package:photo_view/photo_view_gallery.dart';

import '../../../app/theme.dart';
import '../../../shared/utils/asset_url.dart';

/// Full-screen image viewer that mirrors the website's ListingLightbox:
/// cream backdrop, swipe between images, pinch + double-tap zoom, "N / M"
/// counter top-right, X close top-right corner. Buyer always sees the
/// uncropped image regardless of aspect ratio.
class LightboxScreen extends StatefulWidget {
  const LightboxScreen({
    super.key,
    required this.images,
    required this.initialIndex,
  });

  /// Resolved (absolute) image URLs.
  final List<String> images;
  final int initialIndex;

  @override
  State<LightboxScreen> createState() => _LightboxScreenState();
}

class _LightboxScreenState extends State<LightboxScreen> {
  late final PageController _controller =
      PageController(initialPage: widget.initialIndex);
  late int _current = widget.initialIndex;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F1E8),
      body: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(
              child: PhotoViewGallery.builder(
                pageController: _controller,
                itemCount: widget.images.length,
                onPageChanged: (i) => setState(() => _current = i),
                backgroundDecoration: const BoxDecoration(
                  color: Color(0xFFF6F1E8),
                ),
                scrollPhysics: const BouncingScrollPhysics(),
                builder: (context, index) {
                  final url = widget.images[index];
                  return PhotoViewGalleryPageOptions.customChild(
                    minScale: PhotoViewComputedScale.contained,
                    maxScale: PhotoViewComputedScale.covered * 3,
                    initialScale: PhotoViewComputedScale.contained,
                    heroAttributes: PhotoViewHeroAttributes(tag: 'lightbox-$url'),
                    child: CachedNetworkImage(
                      imageUrl: resolveAssetUrl(url),
                      fit: BoxFit.contain,
                      placeholder: (_, __) => const Center(
                        child: CircularProgressIndicator(
                          color: ModaireColors.espresso,
                          strokeWidth: 2,
                        ),
                      ),
                      errorWidget: (_, __, ___) => Center(
                        child: Icon(
                          LucideIcons.imageOff,
                          color: ModaireColors.tileTextSubtle,
                          size: 48,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            // Counter "N / M" — top-right, with the X to its right
            Positioned(
              top: 12,
              right: 56,
              child: Text(
                '${_current + 1} / ${widget.images.length}',
                style: GoogleFonts.jost(
                  fontSize: 14,
                  color: const Color(0xFF2F2925),
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            // X close button — top-right corner
            Positioned(
              top: 4,
              right: 8,
              child: IconButton(
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(
                  LucideIcons.x,
                  size: 24,
                  color: Color(0xFF2F2925),
                ),
                tooltip: 'Close',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
