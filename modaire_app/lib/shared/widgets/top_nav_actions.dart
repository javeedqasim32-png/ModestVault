import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../app/theme.dart';
import '../../core/cart/cart_controller.dart';
import '../../core/favorites/favorites_controller.dart';
import '../../features/notifications/presentation/notifications_bell_button.dart';

/// Mirrors the four icons in the top-right of the website's Navbar.tsx:
/// Favorites · Messages · Notifications · Bag. Each is a small icon-only
/// button with a subtle hit area. Wired to the routes/features that exist
/// today; the rest show a stub SnackBar until the matching workstream
/// ships.
class TopNavActions extends ConsumerWidget {
  const TopNavActions({super.key, this.onFavoritesPath = '/account/favorites'});
  final String onFavoritesPath;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _FavoritesButton(onFavoritesPath: onFavoritesPath),
        _ActionButton(
          icon: LucideIcons.messageCircle,
          onTap: () => context.push('/messages'),
          tooltip: 'Messages',
        ),
        const NotificationsBellButton(),
        const _CartButton(),
        const SizedBox(width: 6),
      ],
    );
  }
}

/// Heart icon with an espresso count badge — mirrors
/// src/components/layout/FavoritesNavButton.tsx.
class _FavoritesButton extends ConsumerWidget {
  const _FavoritesButton({required this.onFavoritesPath});
  final String onFavoritesPath;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(favoriteIdsProvider).valueOrNull?.length ?? 0;
    return _BadgedIcon(
      icon: LucideIcons.heart,
      tooltip: 'Favorites',
      count: count,
      onTap: () => context.push(onFavoritesPath),
    );
  }
}

/// Cart icon with a small espresso badge in the top-right when the
/// user has anything in their bag — mirrors src/components/layout/
/// BagNavButton.tsx (bg-primary text-primary-foreground, 9px text,
/// 99+ ceiling).
class _CartButton extends ConsumerWidget {
  const _CartButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(cartIdsProvider).valueOrNull?.length ?? 0;
    return _BadgedIcon(
      icon: LucideIcons.shoppingBag,
      tooltip: 'Bag',
      count: count,
      onTap: () => context.push('/cart'),
    );
  }
}

/// Shared icon-with-badge used for the favorites + cart buttons.
/// Renders an espresso pill in the top-right when [count] > 0,
/// matching the website's `bg-primary text-primary-foreground` badge
/// style with a 99+ ceiling.
class _BadgedIcon extends StatelessWidget {
  const _BadgedIcon({
    required this.icon,
    required this.tooltip,
    required this.count,
    required this.onTap,
  });
  final IconData icon;
  final String tooltip;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        _ActionButton(icon: icon, onTap: onTap, tooltip: tooltip),
        if (count > 0)
          Positioned(
            top: 4,
            right: 2,
            child: IgnorePointer(
              child: Container(
                constraints: const BoxConstraints(
                  minWidth: 16,
                  minHeight: 16,
                ),
                padding: const EdgeInsets.symmetric(horizontal: 4),
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: ModaireColors.espresso,
                  shape: BoxShape.circle,
                ),
                child: Text(
                  count > 99 ? '99+' : '$count',
                  style: GoogleFonts.jost(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    height: 1.0,
                    color: ModaireColors.cream,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.onTap,
    required this.tooltip,
  });

  final IconData icon;
  final VoidCallback onTap;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onTap,
      icon: Icon(icon, size: 22, color: ModaireColors.tileTextPrimary),
      tooltip: tooltip,
      visualDensity: VisualDensity.compact,
      padding: const EdgeInsets.symmetric(horizontal: 6),
      constraints: const BoxConstraints(minWidth: 34, minHeight: 34),
    );
  }
}
