import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/notifications/notification_repository.dart';

/// Bell icon that opens a 340-wide dropdown popover under itself with
/// the user's top 10 notifications. Mirrors NotificationsBellButton.tsx.
///
/// Row tap → mark-read + follow `linkUrl` and close. "See all" footer
/// pushes to the full `/notifications` screen.
class NotificationsBellButton extends ConsumerStatefulWidget {
  const NotificationsBellButton({super.key});

  @override
  ConsumerState<NotificationsBellButton> createState() =>
      _NotificationsBellButtonState();
}

class _NotificationsBellButtonState
    extends ConsumerState<NotificationsBellButton> {
  final GlobalKey _bellKey = GlobalKey();

  void _toggleOverlay() async {
    ref.invalidate(notificationsListProvider);
    final box = _bellKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;
    final origin = box.localToGlobal(Offset.zero);
    final mq = MediaQuery.of(context);
    final rightInset = mq.size.width - (origin.dx + box.size.width);
    // Capture the router on the bell's context so the navigation
    // doesn't depend on the popover's (which dies as the menu pops).
    final router = GoRouter.of(context);
    // Menu returns the nav target picked by the popover, or null when
    // dismissed without a row tap. Waiting on the Future means we only
    // navigate AFTER the menu's pop animation finishes — no half-popped
    // black-frame state.
    final target = await showMenu<String?>(
      context: context,
      position: RelativeRect.fromLTRB(
        mq.size.width - rightInset - 6,
        origin.dy + box.size.height + 4,
        rightInset.clamp(8, mq.size.width).toDouble(),
        0,
      ),
      color: ModaireColors.tileBg,
      elevation: 18,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xFFDDD3CB)),
      ),
      constraints: BoxConstraints(
        minWidth: 340,
        maxWidth: 340,
        maxHeight: mq.size.height * 0.6,
      ),
      items: [
        PopupMenuItem<String?>(
          enabled: false,
          padding: EdgeInsets.zero,
          // The popover's own BuildContext is what's inside the menu's
          // navigator. Popping THAT context (not rootNavigator) closes
          // only the menu route — popping rootNavigator was popping
          // the screen underneath, hence "no pages left" + black frame.
          child: Builder(
            builder: (popoverContext) => _NotificationsPopover(
              onPick: (pickedTarget) {
                Navigator.of(popoverContext).pop(pickedTarget);
              },
              onSeeAll: () {
                Navigator.of(popoverContext).pop('/notifications');
              },
            ),
          ),
        ),
      ],
    );
    if (!mounted) return;
    if (target != null && target.isNotEmpty) {
      router.go(target);
    }
  }

  @override
  Widget build(BuildContext context) {
    return IconButton(
      key: _bellKey,
      onPressed: _toggleOverlay,
      icon: const Icon(LucideIcons.bell, size: 22,
          color: ModaireColors.tileTextPrimary),
      tooltip: 'Notifications',
      visualDensity: VisualDensity.compact,
      padding: const EdgeInsets.symmetric(horizontal: 6),
      constraints: const BoxConstraints(minWidth: 34, minHeight: 34),
    );
  }
}

class _NotificationsPopover extends ConsumerStatefulWidget {
  const _NotificationsPopover({
    required this.onPick,
    required this.onSeeAll,
  });
  final ValueChanged<String?> onPick;
  final VoidCallback onSeeAll;

  @override
  ConsumerState<_NotificationsPopover> createState() =>
      _NotificationsPopoverState();
}

class _NotificationsPopoverState
    extends ConsumerState<_NotificationsPopover> {
  final Set<String> _locallyRead = {};

  void _onRowTap(NotificationRecord n) {
    if (n.isUnread && !_locallyRead.contains(n.id)) {
      setState(() => _locallyRead.add(n.id));
      ref.read(notificationRepositoryProvider).markRead(id: n.id).then((_) {
        ref.invalidate(sellTabBadgesProvider);
      }).catchError((_) {});
    }
    // Hand the resolved target up to the bell — it pops the menu with
    // the target as the return value, and only then navigates. We
    // never touch the navigator from inside the dying popover.
    widget.onPick(_translateLinkUrl(n.linkUrl));
  }

  /// Maps the website's notification link paths to the mobile app's
  /// route table. Unknown paths return null so we just dismiss the
  /// popover instead of routing to a blank screen.
  String? _translateLinkUrl(String? url) {
    if (url == null || url.isEmpty) return null;
    final raw = url.startsWith('/') ? url : null;
    if (raw == null) return null;
    final uri = Uri.parse(raw);
    final path = uri.path;
    // Website → mobile path rewrites
    if (path.startsWith('/dashboard/purchases')) return '/orders';
    if (path.startsWith('/dashboard/sales')) return '/sell';
    if (path.startsWith('/dashboard')) return '/account';
    if (path.startsWith('/messages')) return null; // no mobile messages yet
    if (path.startsWith('/favorites')) return '/account/favorites';
    // Pass-throughs that match a real Flutter route
    const known = {
      '/', '/browse', '/sell', '/orders', '/account',
      '/cart', '/checkout', '/notifications',
    };
    if (known.contains(path)) return path;
    if (path.startsWith('/listings/')) return path;
    if (path.startsWith('/orders/')) return path;
    if (path.startsWith('/sell/edit/')) return path;
    // Unrecognized — open the home tab rather than blank.
    return '/';
  }

  Future<void> _markAll(List<NotificationRecord> items) async {
    setState(() {
      for (final n in items) {
        if (n.isUnread) _locallyRead.add(n.id);
      }
    });
    try {
      await ref.read(notificationRepositoryProvider).markRead();
      ref.invalidate(sellTabBadgesProvider);
      ref.invalidate(notificationsListProvider);
    } catch (_) {/* leave locally-read state, user can retry */}
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(notificationsListProvider);
    final items = async.valueOrNull ?? const <NotificationRecord>[];
    final hasUnread =
        items.any((n) => n.isUnread && !_locallyRead.contains(n.id));
    // Preview is the top 10.
    final preview = items.take(10).toList();

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
          decoration: const BoxDecoration(
            border: Border(
              bottom: BorderSide(color: Color(0xFFEDE3D9)),
            ),
          ),
          child: Row(
            children: [
              Text(
                'Notifications',
                style: GoogleFonts.jost(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: ModaireColors.tileTextPrimary,
                ),
              ),
              const Spacer(),
              TextButton(
                onPressed:
                    hasUnread && items.isNotEmpty ? () => _markAll(items) : null,
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 6, vertical: 0),
                  minimumSize: const Size(0, 28),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Text(
                  'Mark all as read',
                  style: GoogleFonts.jost(
                    fontSize: 12,
                    color: hasUnread
                        ? ModaireColors.espresso
                        : ModaireColors.tileTextSubtle,
                  ),
                ),
              ),
            ],
          ),
        ),
        Flexible(
          child: async.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    color: ModaireColors.espresso,
                    strokeWidth: 2,
                  ),
                ),
              ),
            ),
            error: (_, __) => Padding(
              padding: const EdgeInsets.all(20),
              child: Text(
                'Couldn\'t load notifications.',
                textAlign: TextAlign.center,
                style: GoogleFonts.jost(
                  fontSize: 12,
                  color: ModaireColors.tileTextSubtle,
                ),
              ),
            ),
            data: (_) {
              if (preview.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 36),
                  child: Center(
                    child: Text(
                      "You're all caught up.",
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        color: ModaireColors.tileTextSubtle,
                      ),
                    ),
                  ),
                );
              }
              return ListView.separated(
                shrinkWrap: true,
                padding: EdgeInsets.zero,
                itemCount: preview.length,
                separatorBuilder: (_, __) =>
                    const Divider(color: Color(0xFFEDE3D9), height: 1),
                itemBuilder: (context, i) {
                  final n = preview[i];
                  final isRead = !n.isUnread || _locallyRead.contains(n.id);
                  return InkWell(
                    onTap: () => _onRowTap(n),
                    child: Container(
                      color: isRead
                          ? Colors.transparent
                          : const Color(0x14EFE7E2),
                      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            n.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.jost(
                              fontSize: 13,
                              fontWeight: isRead
                                  ? FontWeight.w400
                                  : FontWeight.w600,
                              height: 1.25,
                              color: ModaireColors.tileTextPrimary,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            n.body,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.jost(
                              fontSize: 12,
                              color: ModaireColors.tileTextSubtle,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _timeAgo(n.createdAt).toUpperCase(),
                            style: GoogleFonts.jost(
                              fontSize: 9,
                              letterSpacing: 0.6,
                              color: ModaireColors.tileTextSubtle
                                  .withValues(alpha: 0.7),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
        Container(
          decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: Color(0xFFEDE3D9))),
          ),
          child: TextButton(
            onPressed: widget.onSeeAll,
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 10),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(0),
              ),
            ),
            child: Text(
              'See all',
              style: GoogleFonts.jost(
                fontSize: 12,
                color: ModaireColors.tileTextSubtle,
              ),
            ),
          ),
        ),
      ],
    );
  }

  String _timeAgo(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inSeconds < 60) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${(diff.inDays / 7).floor()}w ago';
  }
}
