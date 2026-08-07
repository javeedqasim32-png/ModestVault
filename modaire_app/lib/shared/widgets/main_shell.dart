import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../app/theme.dart';

/// Bottom-tab shell. Mirrors src/components/layout/MobileBottomNav.tsx —
/// Home, Explore, Sell, Orders, Account. The middle Sell button is the
/// FAB-styled pill (larger circle with a + icon).
///
/// Branch state is preserved by go_router's StatefulShellRoute, so scroll
/// position and async data persist when tabs switch.
class MainShell extends StatefulWidget {
  const MainShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  void _onTap(int index) {
    widget.navigationShell.goBranch(
      index,
      initialLocation: index == widget.navigationShell.currentIndex,
    );
  }

  // Mirrors src/components/layout/MobileBottomNav.tsx, which renders each
  // lucide icon with `fill={active ? "currentColor" : "none"}` — the selected
  // tab's glyph goes solid.
  //
  // We can't reproduce that with lucide_icons_flutter: it's an icon *font*,
  // so a glyph is a fixed stroke drawing with no fill to toggle, and Lucide
  // ships no solid variants (verified — there is no filled home/sparkle/
  // archive/user in the package). Material is used instead because it's the
  // one set that ships true outline/filled pairs, so selection changes only
  // the fill and never the silhouette. Sell keeps the lucide plus: the
  // website doesn't fill that one either, it just recolors the circle.
  static const _items = <_NavItem>[
    _NavItem(
      label: 'Home',
      icon: Icons.home_outlined,
      activeIcon: Icons.home,
    ),
    _NavItem(
      label: 'Explore',
      icon: Icons.auto_awesome_outlined,
      activeIcon: Icons.auto_awesome,
    ),
    _NavItem(
      label: 'Sell',
      icon: LucideIcons.plus,
      activeIcon: LucideIcons.plus,
      isSell: true,
    ),
    _NavItem(
      label: 'Orders',
      icon: Icons.archive_outlined,
      activeIcon: Icons.archive,
    ),
    _NavItem(
      label: 'Account',
      icon: Icons.person_outline,
      activeIcon: Icons.person,
    ),
  ];

  // Layout knobs — Sell circle floats above the pill.
  //
  // The icon slots are a fixed 49px tall (8 + 24 icon + 3 + 12 label + 2)
  // and the Row centers them, so _pillHeight controls how much air sits
  // above and below the icons. 62 splits ~6.5px to each side.
  // Raising this does not move the Sell FAB — the pill is bottom-anchored
  // and the FAB is offset from the pill's top by _sellOverflow.
  static const double _pillHeight = 62;

  /// Matches the website's `h-6 w-6` (24px) in MobileBottomNav.tsx. The app
  /// previously drew these at 20px, which read noticeably smaller than the
  /// mobile web nav side by side.
  static const double _navIconSize = 24;
  static const double _sellSize = 44;
  static const double _sellOverflow = 24; // px the Sell circle peeks above pill

  @override
  Widget build(BuildContext context) {
    // extendBody: true lets the page content scroll underneath the floating
    // bar so the blur has something to blur. The 24-blur over a translucent
    // cream tint gives that iOS-frosted-glass look.
    final bottomInset = MediaQuery.of(context).padding.bottom;
    final sellActive = widget.navigationShell.currentIndex == 2;
    // extendBody: false so scrollables end cleanly ABOVE the floating
    // nav — otherwise the last row of any grid/list gets hidden behind
    // the nav pill. We lose the "content shows through the blurred nav"
    // aesthetic, but no per-screen padding fixes required.
    return Scaffold(
      extendBody: false,
      backgroundColor: ModaireColors.browsePageBg,
      body: widget.navigationShell,
      // No outer Padding — the pill extends all the way to the actual
      // screen bottom so the cream fill covers the safe-area zone
      // (avoids the awkward empty strip between the icons and the
      // screen edge). Safe-area inset is applied INSIDE _buildPill so
      // the icons stay above the home-indicator area, but the fill
      // color continues to the edge behind the indicator.
      bottomNavigationBar: SizedBox(
        height: _pillHeight + _sellOverflow + bottomInset,
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: _buildPill(bottomInset),
            ),
            Positioned(
              // Sell FAB stays anchored 22px above the pill's TOP so it
              // pops the same amount regardless of safe-area size.
              top: 0,
              child: _buildSellFab(sellActive),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPill(double bottomInset) {
    // Rounded top corners + flush bottom edge. Container height =
    // pillHeight + safe-area inset so the cream fill extends behind
    // the home indicator. Icons stay at the top (pillHeight zone)
    // via inner padding — home-indicator area is empty cream.
    const topRadius = Radius.circular(20);
    const shape = BorderRadius.only(topLeft: topRadius, topRight: topRadius);
    return DecoratedBox(
      decoration: const BoxDecoration(
        borderRadius: shape,
        boxShadow: [
          BoxShadow(
            color: Color(0x146B4A35),
            blurRadius: 24,
            offset: Offset(0, -6),
          ),
          BoxShadow(
            color: Color(0x0A000000),
            blurRadius: 4,
            offset: Offset(0, -1),
          ),
        ],
      ),
      child: Container(
        height: _pillHeight + bottomInset,
        decoration: const BoxDecoration(
          // Match the page background so the nav visually blends into
          // the surface — no cream pill sitting on top, just icons
          // floating at the bottom of a continuous background. Because
          // fill is now opaque, the BackdropFilter+ClipRRect wrappers
          // that previously blurred content-behind-the-pill were
          // stripped — they'd have been a no-op GPU cost on solid fill.
          color: ModaireColors.browsePageBg,
          borderRadius: shape,
        ),
        // No explicit top padding — the Row centers the icon column in the
        // _pillHeight zone, so that constant alone tunes the vertical air.
        // Bottom `bottomInset` px stays empty background so no
        // page-background strip peeks through behind the home indicator.
        padding: EdgeInsets.fromLTRB(6, 0, 6, bottomInset),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(_items.length, (i) {
            final item = _items[i];
            final active = i == widget.navigationShell.currentIndex;
            return Expanded(
              child: InkResponse(
                onTap: () => _onTap(i),
                radius: 32,
                child: item.isSell
                    ? _buildSellSlot(active)
                    : _buildIconSlot(item, active),
              ),
            );
          }),
        ),
      ),
    );
  }

  /// Standard pill slot — small icon + label. The 8px SizedBox at top
  /// pushes the icon lower inside the pill so the FAB above (which
  /// extends into the pill's top) has clear breathing room from the
  /// Sell label below it. Total column height is 45px; _pillHeight is
  /// what centers it, so adjust that rather than these spacers.
  Widget _buildIconSlot(_NavItem item, bool active) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 8),
        Icon(
          active ? item.activeIcon : item.icon,
          size: _navIconSize,
          color: active ? ModaireColors.navActive : ModaireColors.navInactive,
        ),
        const SizedBox(height: 3),
        Text(
          item.label,
          style: GoogleFonts.jost(
            fontSize: 12,
            height: 1.0,
            fontWeight: active ? FontWeight.w600 : FontWeight.w500,
            // navLabelActive, not navActive — the website gives the active
            // label a slightly softer tone than the active icon.
            color: active
                ? ModaireColors.navLabelActive
                : ModaireColors.navInactive,
          ),
        ),
        const SizedBox(height: 2),
      ],
    );
  }

  /// Middle pill slot — same overall vertical footprint as the icon
  /// slots (invisible spacer where the icon would go) so the "Sell"
  /// label sits on the same baseline as Home/Explore/Orders/Account.
  /// The visual "icon" for this slot is the raised FAB above the pill.
  Widget _buildSellSlot(bool active) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 8),
        // Empty spacer matches the icon size on other slots so the label
        // baseline aligns visually across the row.
        const SizedBox(height: _navIconSize),
        const SizedBox(height: 3),
        Text(
          'Sell',
          style: GoogleFonts.jost(
            fontSize: 12,
            height: 1.0,
            fontWeight: active ? FontWeight.w600 : FontWeight.w500,
            color: active
                ? ModaireColors.navLabelActive
                : ModaireColors.navInactive,
          ),
        ),
        const SizedBox(height: 2),
      ],
    );
  }

  /// FAB-style circle that pops above the pill. Tappable in its own right;
  /// the pill's middle slot also triggers Sell so the whole region is hot.
  Widget _buildSellFab(bool active) {
    return GestureDetector(
      onTap: () => _onTap(2),
      child: Container(
        width: _sellSize,
        height: _sellSize,
        decoration: BoxDecoration(
          color: active
              ? ModaireColors.sellPillBgActive
              : ModaireColors.sellPillBg,
          shape: BoxShape.circle,
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.65),
            width: 1,
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x267A5A45),
              blurRadius: 14,
              offset: Offset(0, 6),
            ),
            BoxShadow(
              color: Color(0x14000000),
              blurRadius: 4,
              offset: Offset(0, 1),
            ),
          ],
        ),
        child: Icon(
          Icons.add,
          size: 26,
          color: active
              ? ModaireColors.sellPillIconActive
              : ModaireColors.sellPillIcon,
        ),
      ),
    );
  }
}

class _NavItem {
  const _NavItem({
    required this.label,
    required this.icon,
    required this.activeIcon,
    this.isSell = false,
  });
  final String label;
  final IconData icon;
  final IconData activeIcon;
  final bool isSell;
}
