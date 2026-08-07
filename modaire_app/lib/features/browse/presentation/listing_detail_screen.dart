import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'package:go_router/go_router.dart';

import '../../../app/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/cart/cart_controller.dart';
import '../../../core/favorites/favorites_controller.dart';
import '../../../core/listings/listing_models.dart';
import '../../../core/listings/listing_repository.dart';
import '../../../core/messages/message_repository.dart';
import '../../../core/recently_viewed/recently_viewed_store.dart';
import '../../../shared/utils/asset_url.dart';
import '../../../shared/utils/share_listing.dart';
import '../../../shared/widgets/modaire_app_bar.dart';
import 'lightbox_screen.dart';

/// Mirrors src/app/listings/[id]/page.tsx — same #EFE7DE page bg, serif
/// title, price, rounded seller card, meta pills, and pinned bottom CTA
/// row. Reviews / message-seller / add-to-bag are stubbed until their
/// backends ship in W7c / W9.
class ListingDetailScreen extends ConsumerWidget {
  const ListingDetailScreen({super.key, required this.listingId});

  final String listingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(listingDetailProvider(listingId));
    // Fire-and-forget: record this view into the local recently-viewed
    // cache so the Home screen surfaces it next time. The store
    // dedupes/reorders by id so re-builds for the same listing don't
    // pollute the list.
    ref.read(recentlyViewedStoreProvider.future).then(
          (store) => store.record(listingId),
        );
    return Scaffold(
      backgroundColor: ModaireColors.detailPageBg,
      appBar: ModaireAppBar(
        backgroundColor: ModaireColors.detailPageBg,
      ),
      body: detailAsync.when(
        loading: () => const _ScaffoldedCenter(child: CircularProgressIndicator(
          color: ModaireColors.espresso,
          strokeWidth: 2,
        )),
        error: (err, _) => _ScaffoldedCenter(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.cloud_off_outlined,
                size: 48,
                color: ModaireColors.tileTextSubtle,
              ),
              const SizedBox(height: 12),
              Text(
                'Couldn\'t load this listing',
                style: GoogleFonts.jost(
                  fontSize: 14,
                  color: ModaireColors.tileTextPrimary,
                ),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () =>
                    ref.invalidate(listingDetailProvider(listingId)),
                child: const Text('Try again'),
              ),
            ],
          ),
        ),
        data: (detail) => _DetailBody(detail: detail),
      ),
    );
  }
}

class _ScaffoldedCenter extends StatelessWidget {
  const _ScaffoldedCenter({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Center(child: child),
      ),
    );
  }
}

class _DetailBody extends ConsumerStatefulWidget {
  const _DetailBody({required this.detail});
  final ListingDetail detail;

  @override
  ConsumerState<_DetailBody> createState() => _DetailBodyState();
}

class _DetailBodyState extends ConsumerState<_DetailBody> {
  final _pageController = PageController();
  int _currentImage = 0;

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  Future<void> _messageSeller(ListingDetail d) async {
    final seller = d.seller;
    if (seller == null) return;
    try {
      final conversationId =
          await ref.read(messageRepositoryProvider).startWithSeller(
                sellerId: seller.id,
                listingId: d.id,
              );
      if (!mounted) return;
      context.push('/messages/$conversationId');
    } on ApiException catch (e) {
      if (mounted) _toast(e.message);
    } catch (_) {
      if (mounted) _toast('Couldn\'t open conversation');
    }
  }

  void _openLightbox(List<ListingImage> images, int index) {
    Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder(
        opaque: false,
        barrierColor: Colors.black54,
        transitionDuration: const Duration(milliseconds: 220),
        pageBuilder: (_, __, ___) => LightboxScreen(
          images: images.map((e) => e.bestDisplayUrl).toList(),
          initialIndex: index,
        ),
        transitionsBuilder: (_, anim, __, child) =>
            FadeTransition(opacity: anim, child: child),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.detail;
    final images = d.images.isEmpty
        ? <ListingImage>[]
        : (List<ListingImage>.from(d.images)
          ..sort((a, b) => a.imageOrder.compareTo(b.imageOrder)));

    return Stack(
      children: [
        Positioned.fill(
          child: SafeArea(
            bottom: false,
            child: ListView(
              padding: const EdgeInsets.only(bottom: 120),
              children: [
                _gallery(images, d.isSold),
                _titleAndPrice(d),
                _sellerCard(d.seller),
                _metaPills(d),
                _section('Description', d.description),
                const SizedBox(height: 32),
              ],
            ),
          ),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: _actionBar(d),
        ),
      ],
    );
  }

  Widget _gallery(List<ListingImage> images, bool isSold) {
    if (images.isEmpty) {
      return AspectRatio(
        aspectRatio: 3 / 4,
        child: Container(
          color: ModaireColors.tileImageBg,
          child: const Center(
            child: Icon(
              Icons.image_outlined,
              color: ModaireColors.tileBorder,
              size: 48,
            ),
          ),
        ),
      );
    }
    return AspectRatio(
      aspectRatio: 3 / 4,
      child: Stack(
        children: [
          PageView.builder(
            controller: _pageController,
            itemCount: images.length,
            onPageChanged: (i) => setState(() => _currentImage = i),
            itemBuilder: (context, i) => GestureDetector(
              onTap: () => _openLightbox(images, i),
              behavior: HitTestBehavior.opaque,
              child: CachedNetworkImage(
                imageUrl: resolveAssetUrl(images[i].bestDisplayUrl),
                fit: BoxFit.cover,
                placeholder: (_, __) =>
                    Container(color: ModaireColors.tileImageBg),
                errorWidget: (_, __, ___) =>
                    Container(color: ModaireColors.tileImageBg),
              ),
            ),
          ),
          if (images.length > 1)
            Positioned(
              bottom: 12,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(images.length, (i) {
                  final active = i == _currentImage;
                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: active ? 22 : 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: active
                          ? ModaireColors.tileTextPrimary
                          : Colors.white.withValues(alpha: 0.8),
                      borderRadius: BorderRadius.circular(3),
                    ),
                  );
                }),
              ),
            ),
          if (isSold)
            Positioned(
              top: 16,
              left: 16,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: ModaireColors.destructive,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  'SOLD',
                  style: GoogleFonts.jost(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: ModaireColors.cream,
                    letterSpacing: 0.6,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _titleAndPrice(ListingDetail d) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            d.title,
            style: GoogleFonts.cormorantGaramond(
              fontSize: 24,
              fontWeight: FontWeight.w600,
              height: 1.2,
              color: ModaireColors.tileTextPrimary,
            ),
          ),
          const SizedBox(height: 4),
          // Discounted price leads, original struck through beside it, with
          // a "% OFF" pill — same promo treatment as the browse tile so the
          // number doesn't change when you tap through from Explore.
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Flexible(
                child: Text(
                  _formatPrice(d.displayPrice),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.jost(
                    fontSize: 22,
                    fontWeight: FontWeight.w600,
                    height: 1.0,
                    color: ModaireColors.detailPrice,
                  ),
                ),
              ),
              if (d.hasPromo) ...[
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    _formatPrice(d.effectivePrice!.originalPrice),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jost(
                      fontSize: 15,
                      height: 1.0,
                      color: ModaireColors.tileTextSubtle,
                      decoration: TextDecoration.lineThrough,
                      decorationColor: ModaireColors.tileTextSubtle,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: ModaireColors.promoBadgeBg,
                    borderRadius: BorderRadius.circular(100),
                  ),
                  child: Text(
                    '${d.effectivePrice!.discountPercent}% OFF',
                    style: GoogleFonts.jost(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: ModaireColors.cream,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _sellerCard(ListingSeller? seller) {
    if (seller == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: GestureDetector(
        onTap: () => context.push('/sellers/${seller.id}'),
        child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
        decoration: BoxDecoration(
          color: ModaireColors.sellerCardBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: ModaireColors.pillBorder),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: ModaireColors.sellerAvatarBg,
                shape: BoxShape.circle,
                border: Border.all(color: ModaireColors.pillBorder, width: 1.5),
              ),
              child: Text(
                seller.displayName.isNotEmpty
                    ? seller.displayName[0].toUpperCase()
                    : 'M',
                style: GoogleFonts.cormorantGaramond(
                  fontSize: 16,
                  color: const Color(0xFF7A6050),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                seller.displayName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.jost(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: ModaireColors.tileTextPrimary,
                ),
              ),
            ),
            const Icon(
              Icons.chevron_right,
              size: 20,
              color: ModaireColors.tileTextSubtle,
            ),
          ],
        ),
      ),
      ),
    );
  }

  Widget _metaPills(ListingDetail d) {
    final pills = <MapEntry<String, String>>[
      MapEntry('Size', d.size ?? 'M'),
      MapEntry('Condition', d.condition ?? 'Like new'),
      MapEntry('Category', d.category),
      if (d.subcategory != null && d.subcategory!.isNotEmpty)
        MapEntry('', d.subcategory!),
      if (d.brand != null && d.brand!.isNotEmpty) MapEntry('Brand', d.brand!),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: pills.map((p) {
          return Container(
            constraints: const BoxConstraints(minHeight: 44),
            padding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: ModaireColors.pillBg,
              borderRadius: BorderRadius.circular(99),
              border: Border.all(color: ModaireColors.pillBorder),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (p.key.isNotEmpty)
                  Text(
                    '${p.key}: ',
                    style: GoogleFonts.jost(
                      fontSize: 12,
                      color: ModaireColors.tileTextSubtle,
                      height: 1.0,
                    ),
                  ),
                Text(
                  p.value,
                  style: GoogleFonts.jost(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: ModaireColors.tileTextPrimary,
                    height: 1.0,
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _section(String label, String body) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: GoogleFonts.jost(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 2.2, // ~ 0.18em on 12px
              color: ModaireColors.tileTextSubtle,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            body,
            style: GoogleFonts.jost(
              fontSize: 13,
              height: 1.65,
              color: ModaireColors.tileTextSubtle,
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionBar(ListingDetail d) {
    final isAvailable = !d.isSold;
    final isFavorited = ref
            .watch(favoriteIdsProvider)
            .valueOrNull
            ?.contains(d.id) ??
        false;
    return Container(
      decoration: BoxDecoration(
        color: ModaireColors.pillBg.withValues(alpha: 0.95),
        border: const Border(
          top: BorderSide(color: ModaireColors.pillBorder),
        ),
      ),
      padding: EdgeInsets.fromLTRB(
        16,
        12,
        16,
        12 + MediaQuery.viewPaddingOf(context).bottom,
      ),
      child: Row(
        children: [
          _roundIconButton(
            icon: isFavorited ? Icons.favorite : LucideIcons.heart,
            iconColor: isFavorited
                ? ModaireColors.destructive
                : ModaireColors.tileTextPrimary,
            onTap: () async {
              try {
                await ref
                    .read(favoriteIdsProvider.notifier)
                    .setFavorite(d.id, !isFavorited);
              } catch (_) {
                if (mounted) _toast('Couldn\'t update favorite');
              }
            },
          ),
          const SizedBox(width: 12),
          _roundIconButton(
            icon: LucideIcons.messageCircle,
            iconColor: ModaireColors.tileTextPrimary,
            onTap: d.seller == null ? null : () => _messageSeller(d),
          ),
          const SizedBox(width: 12),
          Builder(
            builder: (buttonContext) => _roundIconButton(
              icon: LucideIcons.share2,
              iconColor: ModaireColors.tileTextPrimary,
              onTap: () => shareListing(buttonContext, d.id),
            ),
          ),
          const Spacer(),
          _AddToBagButton(listingId: d.id, isAvailable: isAvailable),
        ],
      ),
    );
  }

  Widget _roundIconButton({
    required IconData icon,
    required Color iconColor,
    required VoidCallback? onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: ModaireColors.pillBg,
          shape: BoxShape.circle,
          border: Border.all(color: ModaireColors.pillBorder),
        ),
        child: Icon(icon, size: 20, color: iconColor),
      ),
    );
  }

  String _formatPrice(double price) {
    if (price == price.roundToDouble()) return '\$${price.toStringAsFixed(0)}';
    return '\$${price.toStringAsFixed(2)}';
  }
}

/// "Add to Bag" pill that flips to "Go to Bag" once the item is in the
/// cart, matching the website's UX where the action button + cart icon
/// stay in lockstep with the live cart contents.
class _AddToBagButton extends ConsumerWidget {
  const _AddToBagButton({
    required this.listingId,
    required this.isAvailable,
  });

  final String listingId;
  final bool isAvailable;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inCart = ref
            .watch(cartIdsProvider)
            .valueOrNull
            ?.contains(listingId) ??
        false;

    if (!isAvailable) {
      return SizedBox(
        width: 170,
        height: 36,
        child: ElevatedButton(
          onPressed: null,
          style: ElevatedButton.styleFrom(
            disabledBackgroundColor: const Color(0xFFCDBFB3),
            disabledForegroundColor: ModaireColors.cream,
            padding: EdgeInsets.zero,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(99),
            ),
          ),
          child: Text(
            'Sold Out',
            style: GoogleFonts.jost(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: ModaireColors.cream,
            ),
          ),
        ),
      );
    }

    return SizedBox(
      width: 170,
      height: 36,
      child: ElevatedButton(
        onPressed: () async {
          if (inCart) {
            context.push('/cart');
            return;
          }
          try {
            await ref
                .read(cartIdsProvider.notifier)
                .setInCart(listingId, true);
            if (context.mounted) context.push('/cart');
          } catch (_) {
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Couldn\'t add to bag')),
              );
            }
          }
        },
        style: ElevatedButton.styleFrom(
          backgroundColor: ModaireColors.espresso,
          padding: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(99),
          ),
        ),
        child: Text(
          inCart ? 'Go to Bag' : 'Add to Bag',
          style: GoogleFonts.jost(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: ModaireColors.cream,
          ),
        ),
      ),
    );
  }
}
