import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/account/account_repository.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/auth/auth_controller.dart';
import '../../../core/favorites/favorites_repository.dart';
import '../../../core/messages/message_repository.dart';
import '../../../shared/utils/asset_url.dart';

/// Account hub — luxury financial-club treatment. Single-column grouped
/// rows with hairline rules instead of a tile grid; larger hero, gold
/// ornament, italic "Member since" line. Reads like a private members'
/// home rather than an admin dashboard.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  // Brand palette
  static const _bg = Color(0xFFFBF8F4);
  static const _ink = Color(0xFF2F2925);
  static const _muted = Color(0xFF8A7667);
  static const _hairline = Color(0xFFE3D9D1);
  static const _gold = Color(0xFFC6AB6E);
  static const _espresso = Color(0xFF4A3328);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final user = auth is AuthAuthenticated ? auth.session.user : null;
    final profileAsync = ref.watch(accountProfileProvider);
    final favoritesAsync = ref.watch(_favoritesIdsProvider);
    final favoritesCount = favoritesAsync.valueOrNull?.length ?? 0;
    final memberSinceLabel = profileAsync.valueOrNull?.memberSinceLabel;

    final isAdmin = user?.isAdmin ?? false;
    final isSeller = user?.sellerEnabled ?? false;

    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.only(bottom: 40),
          children: [
            _Hero(
              user: user,
              memberSinceLabel: memberSinceLabel,
            ),
            const SizedBox(height: 14),
            if (isAdmin)
              _Section(
                label: 'ADMINISTRATION',
                rows: [
                  _Row(
                    label: 'Marketplace control',
                    trailing: 'Admin',
                    onTap: () => context.push('/account/admin'),
                  ),
                ],
              ),
            _Section(
              label: 'ACTIVITY',
              rows: [
                _Row(
                  label: 'Purchase history',
                  onTap: () => context.go('/sell?tab=sold'),
                ),
                _Row(
                  label: 'Sales',
                  onTap: () => context.go('/sell'),
                ),
                _Row(
                  label: 'Earnings',
                  onTap: () => context.push('/account/earnings'),
                ),
                if (!isSeller)
                  _Row(
                    label: 'Set up payouts',
                    onTap: () => context.push('/account/payouts'),
                  ),
              ],
            ),
            _Section(
              label: 'MARKETPLACE',
              rows: [
                _Row(
                  label: 'Create a listing',
                  onTap: () => context.go('/sell/create'),
                ),
                _Row(
                  label: 'Your listings',
                  onTap: () => context.go('/sell'),
                ),
                _Row(
                  label: 'Favorites',
                  trailing:
                      favoritesCount == 0 ? null : '$favoritesCount',
                  onTap: () => context.push('/account/favorites'),
                ),
              ],
            ),
            _Section(
              label: 'CONCIERGE',
              rows: [
                _Row(
                  label: 'Live chat',
                  onTap: () => _openSupport(context, ref),
                ),
                _Row(
                  label: 'Support & FAQ',
                  onTap: () => _openWeb(
                      'https://shopmodaire.com/dashboard/support'),
                ),
              ],
            ),
            _Section(
              label: 'LEGAL',
              rows: [
                _Row(
                  label: 'Privacy Policy',
                  onTap: () => context.push('/legal/privacy'),
                ),
                _Row(
                  label: 'Terms & Conditions',
                  onTap: () => context.push('/legal/terms'),
                ),
              ],
            ),
            _Section(
              label: 'ACCOUNT',
              rows: [
                _Row(
                  label: 'Edit profile & shipping address',
                  onTap: () => context.push('/account/settings'),
                ),
                _Row(
                  label: 'Delete account',
                  onTap: () => context.push('/account/delete'),
                ),
              ],
            ),
            const SizedBox(height: 36),
            Center(
              child: TextButton(
                onPressed: () =>
                    ref.read(authControllerProvider.notifier).signOut(),
                style: TextButton.styleFrom(
                  foregroundColor: _espresso,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 24, vertical: 12),
                ),
                child: Text(
                  'Log out',
                  style: GoogleFonts.jost(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 2.2,
                    color: _espresso,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: Container(
                width: 28,
                height: 1,
                color: _gold.withValues(alpha: 0.5),
              ),
            ),
            const SizedBox(height: 14),
            Center(
              child: Text(
                'MODAIRE',
                style: GoogleFonts.jost(
                  fontSize: 10,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 3.2,
                  color: _muted,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openSupport(BuildContext context, WidgetRef ref) async {
    try {
      final id = await ref.read(messageRepositoryProvider).startWithSupport();
      if (!context.mounted) return;
      context.push('/messages/$id');
    } on ApiException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }

  Future<void> _openWeb(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.user, required this.memberSinceLabel});
  final dynamic user;
  final String? memberSinceLabel;

  @override
  Widget build(BuildContext context) {
    final name = (user?.displayName as String?) ?? 'Modaire';
    final email = (user?.email as String?) ?? '';
    final profileImage = user?.profileImage as String?;
    final initials = _initialsOf(name);

    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 32, 28, 24),
      child: Column(
        children: [
          // 104px gradient avatar, slightly larger than before to anchor
          // the page as a hero element.
          Container(
            width: 104,
            height: 104,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0xFFE1D6CD), width: 4),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFD5C1B1), Color(0xFFC8AD9C)],
              ),
            ),
            child: profileImage != null && profileImage.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: resolveAssetUrl(profileImage),
                    fit: BoxFit.cover,
                    errorWidget: (_, __, ___) => _initialAvatar(initials),
                  )
                : _initialAvatar(initials),
          ),
          const SizedBox(height: 22),
          Text(
            name,
            textAlign: TextAlign.center,
            style: GoogleFonts.cormorantGaramond(
              fontSize: 38,
              height: 1.0,
              fontWeight: FontWeight.w500,
              color: AccountScreen._ink,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            email,
            style: GoogleFonts.jost(
              fontSize: 13,
              color: AccountScreen._muted,
            ),
          ),
          const SizedBox(height: 20),
          // Gold hairline ornament with a tiny center diamond.
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 28,
                height: 1,
                color:
                    AccountScreen._gold.withValues(alpha: 0.55),
              ),
              const SizedBox(width: 8),
              Transform.rotate(
                angle: 0.785398, // 45°
                child: Container(
                  width: 4,
                  height: 4,
                  color: AccountScreen._gold,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                width: 28,
                height: 1,
                color:
                    AccountScreen._gold.withValues(alpha: 0.55),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (memberSinceLabel != null)
            Text(
              memberSinceLabel!,
              style: GoogleFonts.cormorantGaramond(
                fontSize: 14,
                fontStyle: FontStyle.italic,
                fontWeight: FontWeight.w400,
                color: AccountScreen._muted,
              ),
            )
          else
            // Reserve the line height so the page doesn't jump when the
            // profile fetch lands.
            const SizedBox(height: 18),
          const SizedBox(height: 22),
          if (user != null)
            SizedBox(
              height: 44,
              child: OutlinedButton(
                onPressed: () => context.push('/sellers/${user.id}'),
                style: OutlinedButton.styleFrom(
                  backgroundColor: AccountScreen._bg,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(999),
                  ),
                  side: BorderSide(
                      color: AccountScreen._gold.withValues(alpha: 0.55)),
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                ),
                child: Text(
                  'View public profile',
                  style: GoogleFonts.jost(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0.4,
                    color: AccountScreen._espresso,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _initialAvatar(String initials) => Center(
        child: Text(
          initials,
          style: GoogleFonts.cormorantGaramond(
            fontSize: 38,
            fontWeight: FontWeight.w400,
            color: const Color(0xFF7A6050),
          ),
        ),
      );

  String _initialsOf(String name) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((s) => s.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'M';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return (parts.first[0] + parts[1][0]).toUpperCase();
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.label, required this.rows});
  final String label;
  final List<_Row> rows;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 26),
          Text(
            label,
            style: GoogleFonts.jost(
              fontSize: 10,
              fontWeight: FontWeight.w500,
              letterSpacing: 2.6,
              color: AccountScreen._muted,
            ),
          ),
          const SizedBox(height: 12),
          for (int i = 0; i < rows.length; i++) ...[
            rows[i],
            if (i < rows.length - 1)
              const Divider(
                height: 1,
                thickness: 1,
                color: AccountScreen._hairline,
              ),
          ],
          const SizedBox(height: 2),
          // Bottom hairline closes the section for clean visual rhythm.
          const Divider(
            height: 1,
            thickness: 1,
            color: AccountScreen._hairline,
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.label,
    required this.onTap,
    this.trailing,
  });
  final String label;
  final String? trailing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: GoogleFonts.jost(
                  fontSize: 16,
                  fontWeight: FontWeight.w400,
                  color: AccountScreen._ink,
                  letterSpacing: 0.1,
                ),
              ),
            ),
            if (trailing != null) ...[
              Text(
                trailing!,
                style: GoogleFonts.jost(
                  fontSize: 14,
                  color: AccountScreen._muted,
                ),
              ),
              const SizedBox(width: 10),
            ],
            const Icon(
              LucideIcons.chevronRight,
              size: 16,
              color: AccountScreen._gold,
            ),
          ],
        ),
      ),
    );
  }
}

/// Light-weight count provider — only IDs so the response stays small.
final _favoritesIdsProvider = FutureProvider.autoDispose<Set<String>>((ref) {
  return ref.read(favoritesRepositoryProvider).listIds();
});
