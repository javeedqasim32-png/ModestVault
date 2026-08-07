import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../app/theme.dart';
import 'modaire_brand_mark.dart';
import 'top_nav_actions.dart';

/// Universal top nav — mirrors the website's global Navbar: Modaire
/// logo on the left, heart / chat / bell / bag on the right.
///
/// Every screen's AppBar should use this rather than rolling its own
/// title so the brand mark and tap targets stay identical across
/// surfaces. Pass [bottom] for screens that need a TabBar (Sell,
/// Orders, Admin moderation), and [extraActions] when a screen needs
/// its own buttons (e.g. "Save") that should appear *before* the
/// standard nav icons.
class ModaireAppBar extends StatelessWidget implements PreferredSizeWidget {
  const ModaireAppBar({
    super.key,
    this.bottom,
    this.extraActions = const <Widget>[],
    this.backgroundColor,
    this.showBack,
  });

  /// Optional bottom widget (typically a [TabBar]).
  final PreferredSizeWidget? bottom;

  /// Extra widgets inserted to the *left* of the standard
  /// [TopNavActions] (heart / chat / bell / bag). Use this for
  /// per-screen actions like a "Save" text button.
  final List<Widget> extraActions;

  /// Override the AppBar background. Defaults to the page bg token so
  /// the nav blends with the screen behind it.
  final Color? backgroundColor;

  /// Force-show or force-hide the back chevron. By default we render it
  /// whenever the current route can pop — matching the system back gesture.
  final bool? showBack;

  @override
  Size get preferredSize {
    final bottomHeight = bottom?.preferredSize.height ?? 0;
    return Size.fromHeight(kToolbarHeight + bottomHeight);
  }

  @override
  Widget build(BuildContext context) {
    final canPop = showBack ?? Navigator.of(context).canPop();
    final bg = backgroundColor ?? ModaireColors.browsePageBg;
    return AppBar(
      backgroundColor: bg,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      automaticallyImplyLeading: false,
      leading: canPop
          ? IconButton(
              icon: const Icon(LucideIcons.chevronLeft,
                  color: ModaireColors.tileTextPrimary),
              onPressed: () => Navigator.of(context).maybePop(),
            )
          : null,
      leadingWidth: canPop ? 44 : 16,
      centerTitle: false,
      titleSpacing: canPop ? 0 : 16,
      title: const ModaireBrandMark(),
      actions: [
        ...extraActions,
        const TopNavActions(),
      ],
      bottom: bottom,
    );
  }
}
