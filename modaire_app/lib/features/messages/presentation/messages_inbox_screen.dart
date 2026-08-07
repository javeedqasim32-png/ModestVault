import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

import '../../../app/theme.dart';
import '../../../core/messages/message_models.dart';
import '../../../core/messages/message_repository.dart';

/// Inbox screen — mirrors src/app/messages/page.tsx. Bg #EFE7DE, serif
/// title "Messages", list of rounded cards with name + timestamp +
/// latest preview. Unread rows show a count badge.
class MessagesInboxScreen extends ConsumerWidget {
  const MessagesInboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(inboxProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFFBF8F4),
      appBar: const ModaireAppBar(),
      body: RefreshIndicator(
        color: ModaireColors.espresso,
        backgroundColor: ModaireColors.cream,
        onRefresh: () async {
          ref.invalidate(inboxProvider);
          await ref.read(inboxProvider.future);
        },
        child: async.when(
          loading: () => const Center(
            child: CircularProgressIndicator(
              color: ModaireColors.espresso,
              strokeWidth: 2,
            ),
          ),
          error: (_, __) => ListView(children: [
            const SizedBox(height: 80),
            Center(
              child: Text(
                'Couldn\'t load messages',
                style: GoogleFonts.jost(
                  fontSize: 14,
                  color: const Color(0xFF8A7667),
                ),
              ),
            ),
          ]),
          data: (rows) {
            if (rows.isEmpty) return const _EmptyInbox();
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              itemCount: rows.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) => _ConversationRow(row: rows[i]),
            );
          },
        ),
      ),
    );
  }
}

class _EmptyInbox extends StatelessWidget {
  const _EmptyInbox();
  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
            decoration: BoxDecoration(
              color: const Color(0xFFF7F2ED),
              border: Border.all(color: const Color(0xFFDDD3CB)),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(
              'No messages yet.',
              textAlign: TextAlign.center,
              style: GoogleFonts.jost(
                fontSize: 14,
                color: const Color(0xFF8A7667),
              ),
            ),
          ),
        ],
      );
}

class _ConversationRow extends StatelessWidget {
  const _ConversationRow({required this.row});
  final ConversationSummary row;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => context.push('/messages/${row.id}'),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFFFBF8F5),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFDDD3CB)),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Row(
                    children: [
                      Flexible(
                        child: Text(
                          row.otherUser.displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.jost(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: const Color(0xFF2F2925),
                          ),
                        ),
                      ),
                      if (row.isSupport) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFEF3C7),
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: Text(
                            'SUPPORT',
                            style: GoogleFonts.jost(
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.8,
                              color: const Color(0xFF92400E),
                            ),
                          ),
                        ),
                      ],
                      if (row.unreadCount > 0) ...[
                        const SizedBox(width: 8),
                        Container(
                          constraints:
                              const BoxConstraints(minWidth: 18, minHeight: 18),
                          padding: const EdgeInsets.symmetric(horizontal: 5),
                          alignment: Alignment.center,
                          decoration: const BoxDecoration(
                            color: Color(0xFFEF4444),
                            shape: BoxShape.circle,
                          ),
                          child: Text(
                            row.unreadCount > 99 ? '99+' : '${row.unreadCount}',
                            style: GoogleFonts.jost(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  _timeAgo(row.latestAt),
                  style: GoogleFonts.jost(
                    fontSize: 12,
                    color: const Color(0xFF8A7667),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              row.latestPreview,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.jost(
                fontSize: 13,
                color: const Color(0xFF6F6054),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _timeAgo(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inSeconds < 60) return 'now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    if (diff.inDays < 7) return '${diff.inDays}d';
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return '${months[t.month - 1]} ${t.day}';
  }
}
