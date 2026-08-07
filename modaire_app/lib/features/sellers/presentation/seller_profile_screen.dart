import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/messages/message_repository.dart';
import '../../../core/sellers/seller_profile_repository.dart';
import '../../../shared/utils/asset_url.dart';
import '../../../shared/widgets/listing_grid.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

/// Public seller profile — mirrors src/app/[id]/page.tsx mobile layout.
/// Header band (#ECE5DC) with avatar + name + member-since + 3-stat
/// row (sales/followers/rating) + Message CTA; then a Listings grid
/// and a Reviews section.
class SellerProfileScreen extends ConsumerWidget {
  const SellerProfileScreen({super.key, required this.sellerId});
  final String sellerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(sellerProfileProvider(sellerId));

    return Scaffold(
      backgroundColor: const Color(0xFFFBF8F4),
      appBar: const ModaireAppBar(),
      body: async.when(
        loading: () => const Center(
          child: CircularProgressIndicator(
            color: ModaireColors.espresso,
            strokeWidth: 2,
          ),
        ),
        error: (_, __) => Center(
          child: Text(
            'Couldn\'t load profile',
            style: GoogleFonts.jost(
              fontSize: 14,
              color: const Color(0xFF8A7667),
            ),
          ),
        ),
        data: (profile) => RefreshIndicator(
          color: ModaireColors.espresso,
          backgroundColor: ModaireColors.cream,
          onRefresh: () async {
            ref.invalidate(sellerProfileProvider(sellerId));
            await ref.read(sellerProfileProvider(sellerId).future);
          },
          child: _Body(profile: profile),
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.profile});
  final SellerProfile profile;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  late bool _isFollowing = widget.profile.isFollowing;
  late int _followersCount = widget.profile.stats.followers;
  bool _togglingFollow = false;

  SellerProfile get profile => widget.profile;

  Future<void> _messageSeller() async {
    try {
      final id = await ref
          .read(messageRepositoryProvider)
          .startWithSeller(sellerId: profile.id);
      if (!mounted) return;
      context.push('/messages/$id');
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }

  Future<void> _toggleFollow() async {
    if (_togglingFollow) return;
    final desired = !_isFollowing;
    setState(() {
      _togglingFollow = true;
      _isFollowing = desired;
      _followersCount += desired ? 1 : -1;
    });
    try {
      final result = await ref
          .read(sellerProfileRepositoryProvider)
          .setFollow(profile.id, desired);
      if (!mounted) return;
      setState(() {
        _isFollowing = result.isFollowing;
        _followersCount = result.followers;
        _togglingFollow = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _isFollowing = !desired;
        _followersCount += desired ? -1 : 1;
        _togglingFollow = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        _header(),
        const SizedBox(height: 18),
        _listingsSection(context),
        if (profile.reviews.isNotEmpty) ...[
          const SizedBox(height: 22),
          _reviewsSection(),
        ],
        const SizedBox(height: 28),
      ],
    );
  }

  Widget _header() {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFFECE5DC),
        border: Border(
          top: BorderSide(color: Color(0xFFDDD3CB)),
          bottom: BorderSide(color: Color(0xFFDDD3CB)),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 22),
      child: Column(
        children: [
          // Avatar
          Container(
            width: 84,
            height: 84,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: const Color(0xFFD2BAA3),
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0xFFDDD3CB), width: 2),
            ),
            clipBehavior: Clip.antiAlias,
            child: profile.profileImage != null
                ? CachedNetworkImage(
                    imageUrl: resolveAssetUrl(profile.profileImage!),
                    fit: BoxFit.cover,
                    errorWidget: (_, __, ___) => _initial(),
                  )
                : _initial(),
          ),
          const SizedBox(height: 12),
          Text(
            profile.displayName,
            style: GoogleFonts.cormorantGaramond(
              fontSize: 22,
              fontWeight: FontWeight.w600,
              height: 1.1,
              color: const Color(0xFF2F2925),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            profile.memberSinceLabel,
            style: GoogleFonts.jost(
              fontSize: 12,
              color: const Color(0xFF8A7667),
            ),
          ),
          const SizedBox(height: 16),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: Row(
              children: [
                Expanded(child: _stat('${profile.stats.sales}', 'SALES')),
                Expanded(child: _stat('$_followersCount', 'FOLLOWERS')),
                Expanded(child: _stat(
                  profile.stats.rating == 0
                      ? '—'
                      : profile.stats.rating.toString(),
                  'RATING',
                )),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (!profile.isOwnProfile)
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _messageButton(),
                const SizedBox(width: 10),
                _followButton(),
              ],
            ),
        ],
      ),
    );
  }

  Widget _messageButton() {
    return SizedBox(
      height: 42,
      child: ElevatedButton.icon(
        onPressed: _messageSeller,
        icon: const Icon(LucideIcons.messageCircle, size: 16),
        label: Text(
          'Message',
          style: GoogleFonts.jost(
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: Colors.white,
          ),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF4A3328),
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(99),
            side: const BorderSide(color: Color(0xFF4A3328)),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 24),
        ),
      ),
    );
  }

  Widget _followButton() {
    final following = _isFollowing;
    return SizedBox(
      height: 42,
      child: OutlinedButton.icon(
        onPressed: _togglingFollow ? null : _toggleFollow,
        icon: Icon(
          following ? LucideIcons.userCheck : LucideIcons.userPlus,
          size: 16,
          color: const Color(0xFF4A3328),
        ),
        label: Text(
          following ? 'Following' : 'Follow',
          style: GoogleFonts.jost(
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: const Color(0xFF4A3328),
          ),
        ),
        style: OutlinedButton.styleFrom(
          backgroundColor:
              following ? const Color(0xFFE6DACB) : Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(99),
          ),
          side: const BorderSide(color: Color(0xFF4A3328)),
          padding: const EdgeInsets.symmetric(horizontal: 24),
        ),
      ),
    );
  }

  Widget _initial() => Center(
        child: Text(
          profile.initial,
          style: GoogleFonts.cormorantGaramond(
            fontSize: 36,
            fontWeight: FontWeight.w600,
            color: const Color(0xFF7A6050),
          ),
        ),
      );

  Widget _stat(String value, String label) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            value,
            style: GoogleFonts.cormorantGaramond(
              fontSize: 17,
              fontWeight: FontWeight.w600,
              height: 1.0,
              color: const Color(0xFF2F2925),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: GoogleFonts.jost(
              fontSize: 10,
              letterSpacing: 0.8,
              color: const Color(0xFF8A7667),
            ),
          ),
        ],
      );

  Widget _listingsSection(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Listings',
            style: GoogleFonts.cormorantGaramond(
              fontSize: 23,
              fontWeight: FontWeight.w500,
              height: 1.05,
              color: const Color(0xFF2F2925),
            ),
          ),
          const SizedBox(height: 12),
          if (profile.listings.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 20,
                vertical: 24,
              ),
              decoration: BoxDecoration(
                color: const Color(0xFFF7F2ED),
                border: Border.all(color: const Color(0xFFDDD3CB)),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                'No live listings from this seller yet.',
                style: GoogleFonts.jost(
                  fontSize: 13,
                  color: const Color(0xFF8A7667),
                ),
              ),
            )
          else
            // Was MasonryGridView, which hands children unbounded height and
            // blanks the page against ListingTile's Expanded — see the note
            // on ListingGridMetrics. Nested in the page Column, so it
            // shrink-wraps and defers scrolling to the parent. The enclosing
            // Padding supplies the 16px gutter.
            ListingGrid(
              items: profile.listings,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              onTapListing: (listing) =>
                  context.push('/listings/${listing.id}'),
            ),
        ],
      ),
    );
  }

  Widget _reviewsSection() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                'Reviews',
                style: GoogleFonts.cormorantGaramond(
                  fontSize: 23,
                  fontWeight: FontWeight.w500,
                  height: 1.05,
                  color: const Color(0xFF2F2925),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${profile.stats.reviewCount}',
                style: GoogleFonts.jost(
                  fontSize: 13,
                  color: const Color(0xFF8A7667),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...profile.reviews.map((r) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _reviewCard(r),
              )),
        ],
      ),
    );
  }

  Widget _reviewCard(SellerReview r) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFFBF8F5),
        border: Border.all(color: const Color(0xFFDDD3CB)),
        borderRadius: BorderRadius.circular(14),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  r.reviewerName.isEmpty ? 'Anonymous' : r.reviewerName,
                  style: GoogleFonts.jost(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFF2F2925),
                  ),
                ),
              ),
              Text(
                r.dateLabel,
                style: GoogleFonts.jost(
                  fontSize: 12,
                  color: const Color(0xFF8A7667),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: List.generate(5, (i) {
              final filled = i < r.rating;
              return Padding(
                padding: const EdgeInsets.only(right: 2),
                child: Icon(
                  filled ? Icons.star : Icons.star_border,
                  size: 14,
                  color: const Color(0xFFC6AB6E),
                ),
              );
            }),
          ),
          if (r.text.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              r.text,
              style: GoogleFonts.jost(
                fontSize: 13,
                color: const Color(0xFF6F6054),
                height: 1.5,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
