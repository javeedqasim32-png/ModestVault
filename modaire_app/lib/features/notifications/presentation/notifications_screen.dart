import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/notifications/notification_repository.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

/// Mirrors `NotificationsClient.tsx`: title row with "Mark all as read",
/// empty state with bell icon, list of rows with bold-unread + bg-tint
/// + per-row tap to mark-read and follow `linkUrl`.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  // Optimistic local-read overlay on top of the server list — tap
  // clears bold/tint instantly even before the API call returns.
  final Set<String> _locallyRead = {};

  Future<void> _onTap(NotificationRecord n) async {
    if (n.isUnread && !_locallyRead.contains(n.id)) {
      setState(() => _locallyRead.add(n.id));
      try {
        await ref
            .read(notificationRepositoryProvider)
            .markRead(id: n.id);
        // Refresh the Sell-badge counts in case this was an
        // ITEM_SOLD / LISTING_REJECTED row.
        ref.invalidate(sellTabBadgesProvider);
      } catch (_) {
        if (mounted) {
          setState(() => _locallyRead.remove(n.id));
        }
      }
    }
    if (n.linkUrl != null && n.linkUrl!.isNotEmpty) {
      _followLink(n.linkUrl!);
    }
  }

  void _followLink(String url) {
    // Server may emit absolute (https://...) or relative (/listings/abc)
    // links. We translate any web-only paths to their mobile equivalent
    // and use `go` so it can switch tabs as needed.
    if (!url.startsWith('/')) return;
    final translated = _translateLinkUrl(url);
    if (translated == null) return;
    context.go(translated);
  }

  /// Same mapping as NotificationsBellButton — kept in sync.
  String? _translateLinkUrl(String url) {
    final uri = Uri.parse(url);
    final path = uri.path;
    if (path.startsWith('/dashboard/purchases')) return '/orders';
    if (path.startsWith('/dashboard/sales')) return '/sell';
    if (path.startsWith('/dashboard')) return '/account';
    if (path.startsWith('/messages')) return null;
    if (path.startsWith('/favorites')) return '/account/favorites';
    const known = {
      '/', '/browse', '/sell', '/orders', '/account',
      '/cart', '/checkout', '/notifications',
    };
    if (known.contains(path)) return path;
    if (path.startsWith('/listings/')) return path;
    if (path.startsWith('/orders/')) return path;
    if (path.startsWith('/sell/edit/')) return path;
    return '/';
  }

  Future<void> _markAll() async {
    final list = ref.read(notificationsListProvider).valueOrNull ?? const [];
    setState(() {
      for (final n in list) {
        if (n.isUnread) _locallyRead.add(n.id);
      }
    });
    try {
      await ref.read(notificationRepositoryProvider).markRead();
      ref.invalidate(sellTabBadgesProvider);
      ref.invalidate(notificationsListProvider);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Couldn\'t mark all as read')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(notificationsListProvider);
    final items = async.valueOrNull ?? const <NotificationRecord>[];
    final hasUnread = items.any(
      (n) => n.isUnread && !_locallyRead.contains(n.id),
    );

    return Scaffold(
      backgroundColor: ModaireColors.browsePageBg,
      appBar: ModaireAppBar(
        extraActions: [
          TextButton(
            onPressed: hasUnread ? _markAll : null,
            child: Text(
              'Mark all as read',
              style: GoogleFonts.jost(
                fontSize: 13,
                color: hasUnread
                    ? ModaireColors.espresso
                    : ModaireColors.tileTextSubtle,
              ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: ModaireColors.espresso,
        backgroundColor: ModaireColors.cream,
        onRefresh: () async {
          ref.invalidate(notificationsListProvider);
          await ref.read(notificationsListProvider.future);
        },
        child: async.when(
          loading: () => const Center(
            child: CircularProgressIndicator(
              color: ModaireColors.espresso,
              strokeWidth: 2,
            ),
          ),
          error: (_, __) => ListView(
            children: [
              const SizedBox(height: 80),
              Center(
                child: Text(
                  'Couldn\'t load notifications',
                  style: GoogleFonts.jost(
                    fontSize: 14,
                    color: ModaireColors.tileTextSubtle,
                  ),
                ),
              ),
            ],
          ),
          data: (data) {
            if (data.isEmpty) return const _EmptyBody();
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              itemCount: data.length,
              separatorBuilder: (_, __) =>
                  const Divider(color: Color(0xFFEDE3D9), height: 1),
              itemBuilder: (context, i) {
                final n = data[i];
                final isRead = !n.isUnread || _locallyRead.contains(n.id);
                return _NotificationRow(
                  notification: n,
                  isRead: isRead,
                  onTap: () => _onTap(n),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _EmptyBody extends StatelessWidget {
  const _EmptyBody();
  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        const SizedBox(height: 100),
        Center(
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 24),
            padding: const EdgeInsets.fromLTRB(24, 36, 24, 36),
            decoration: BoxDecoration(
              border: Border.all(
                color: const Color(0xFFD4C7BB),
                style: BorderStyle.solid,
              ),
              borderRadius: BorderRadius.circular(24),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  LucideIcons.bell,
                  size: 40,
                  color: ModaireColors.tileTextSubtle,
                ),
                const SizedBox(height: 16),
                Text(
                  "You're all caught up",
                  style: GoogleFonts.cormorantGaramond(
                    fontSize: 22,
                    fontWeight: FontWeight.w500,
                    color: ModaireColors.tileTextPrimary,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'New sale and delivery alerts will show up here.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.jost(
                    fontSize: 13,
                    color: ModaireColors.tileTextSubtle,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _NotificationRow extends StatelessWidget {
  const _NotificationRow({
    required this.notification,
    required this.isRead,
    required this.onTap,
  });

  final NotificationRecord notification;
  final bool isRead;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final n = notification;
    return InkWell(
      onTap: onTap,
      child: Container(
        // Unread rows get a subtle warm tint background — same intent as
        // the website's `bg-secondary/30`.
        color: isRead ? Colors.transparent : const Color(0x14EFE7E2),
        padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Unread dot, hidden when read.
            Padding(
              padding: const EdgeInsets.only(top: 6, right: 10),
              child: Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: isRead
                      ? Colors.transparent
                      : const Color(0xFFA07C61),
                  shape: BoxShape.circle,
                ),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    n.title,
                    style: GoogleFonts.jost(
                      fontSize: 14,
                      fontWeight:
                          isRead ? FontWeight.w400 : FontWeight.w600,
                      color: isRead
                          ? ModaireColors.tileTextPrimary
                              .withValues(alpha: 0.8)
                          : ModaireColors.tileTextPrimary,
                      height: 1.3,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    n.body,
                    style: GoogleFonts.jost(
                      fontSize: 13,
                      color: ModaireColors.tileTextSubtle,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _timeAgo(n.createdAt),
                    style: GoogleFonts.jost(
                      fontSize: 11,
                      color: ModaireColors.tileTextSubtle,
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

  String _timeAgo(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inSeconds < 60) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${(diff.inDays / 7).floor()}w ago';
  }
}
