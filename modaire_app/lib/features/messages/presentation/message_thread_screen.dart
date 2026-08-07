import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../shared/widgets/modaire_app_bar.dart';

import '../../../app/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/messages/message_models.dart';
import '../../../core/messages/message_repository.dart';
import '../../../shared/utils/asset_url.dart';

/// Thread view — mirrors src/app/messages/[id]/page.tsx. Header with
/// avatar + name + listing context, scrolling list of bubbles (mine
/// right + espresso, theirs left + cream), composer pinned to bottom.
class MessageThreadScreen extends ConsumerStatefulWidget {
  const MessageThreadScreen({super.key, required this.conversationId});
  final String conversationId;

  @override
  ConsumerState<MessageThreadScreen> createState() =>
      _MessageThreadScreenState();
}

class _MessageThreadScreenState extends ConsumerState<MessageThreadScreen> {
  final _input = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _send(ConversationThread thread) async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await ref.read(messageRepositoryProvider).send(
            conversationId: thread.id,
            body: text,
          );
      _input.clear();
      // reverse:true ListView keeps the visual bottom anchored to the
      // newest message automatically — no manual scroll needed.
      ref.invalidate(threadProvider(thread.id));
      ref.invalidate(inboxProvider);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Couldn\'t send message')),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(threadProvider(widget.conversationId));
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
            'Couldn\'t load conversation',
            style: GoogleFonts.jost(
              fontSize: 14,
              color: const Color(0xFF8A7667),
            ),
          ),
        ),
        data: (thread) {
          // Canonical Flutter chat pattern: reverse:true ListView with
          // messages reversed (newest first at index 0). Bottom edge IS
          // the scroll origin, so opening the thread always lands on
          // the latest message — no jump-to-bottom hacks, and new
          // sends naturally push older ones up the screen.
          final reversed = thread.messages.reversed.toList(growable: false);
          return Column(
            children: [
              // Who you're chatting with — used to live in the AppBar
              // title; lifted into the body so the AppBar can host the
              // brand mark consistently with the rest of the app.
              _Header(thread: thread),
              const Divider(height: 1, color: Color(0xFFDDD3CB)),
              Expanded(
                child: ListView.builder(
                  reverse: true,
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                  itemCount: reversed.length,
                  itemBuilder: (context, i) {
                    final m = reversed[i];
                    return _MessageBubble(
                      message: m,
                      otherInitial: thread.otherUser.initial,
                    );
                  },
                ),
              ),
              _Composer(
                controller: _input,
                sending: _sending,
                onSend: () => _send(thread),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.thread});
  final ConversationThread thread;

  @override
  Widget build(BuildContext context) {
    final o = thread.otherUser;
    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: const Color(0xFFD2BAA3),
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0xFFDDD3CB)),
          ),
          clipBehavior: Clip.antiAlias,
          child: o.profileImage != null
              ? CachedNetworkImage(
                  imageUrl: resolveAssetUrl(o.profileImage!),
                  fit: BoxFit.cover,
                  errorWidget: (_, __, ___) => _initial(o.initial),
                )
              : _initial(o.initial),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                o.displayName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.jost(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF2F2925),
                ),
              ),
              if (thread.listing != null)
                GestureDetector(
                  onTap: () =>
                      context.push('/listings/${thread.listing!.id}'),
                  child: Text(
                    thread.listing!.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jost(
                      fontSize: 12,
                      color: const Color(0xFF8A7667),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _initial(String label) => Center(
        child: Text(
          label,
          style: GoogleFonts.cormorantGaramond(
            fontSize: 18,
            color: const Color(0xFF7A6050),
          ),
        ),
      );
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, required this.otherInitial});
  final ChatMessage message;
  final String otherInitial;

  @override
  Widget build(BuildContext context) {
    final isMine = message.mine;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment:
            isMine ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!isMine) ...[
            Container(
              width: 28,
              height: 28,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: const Color(0xFFD2BAA3),
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFFDDD3CB)),
              ),
              child: Text(
                otherInitial,
                style: GoogleFonts.cormorantGaramond(
                  fontSize: 14,
                  color: const Color(0xFF7A6050),
                ),
              ),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.sizeOf(context).width * 0.72,
              ),
              padding: const EdgeInsets.symmetric(
                  horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: isMine
                    ? ModaireColors.espresso
                    : const Color(0xFFFBF8F5),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isMine ? 16 : 4),
                  bottomRight: Radius.circular(isMine ? 4 : 16),
                ),
                border: isMine
                    ? null
                    : Border.all(color: const Color(0xFFDDD3CB)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (message.imageUrl != null) ...[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: CachedNetworkImage(
                        imageUrl: resolveAssetUrl(message.imageUrl!),
                        fit: BoxFit.cover,
                        width: 220,
                      ),
                    ),
                    if (message.body.isNotEmpty) const SizedBox(height: 6),
                  ],
                  if (message.body.isNotEmpty)
                    Text(
                      message.body,
                      style: GoogleFonts.jost(
                        fontSize: 14,
                        height: 1.35,
                        color: isMine
                            ? ModaireColors.cream
                            : const Color(0xFF2F2925),
                      ),
                    ),
                  const SizedBox(height: 4),
                  Text(
                    _hhmm(message.createdAt),
                    style: GoogleFonts.jost(
                      fontSize: 10,
                      color: isMine
                          ? ModaireColors.cream.withValues(alpha: 0.6)
                          : const Color(0xFF8A7667),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _hhmm(DateTime t) {
    final local = t.toLocal();
    final h = local.hour;
    final m = local.minute.toString().padLeft(2, '0');
    final ampm = h >= 12 ? 'PM' : 'AM';
    final hh = ((h + 11) % 12) + 1;
    return '$hh:$m $ampm';
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.sending,
    required this.onSend,
  });
  final TextEditingController controller;
  final bool sending;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xFFFBF8F5),
          border: Border(
            top: BorderSide(color: Color(0xFFDDD3CB)),
          ),
        ),
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.newline,
                style: GoogleFonts.jost(
                  fontSize: 14,
                  color: const Color(0xFF2F2925),
                ),
                decoration: InputDecoration(
                  filled: true,
                  fillColor: Colors.white,
                  hintText: 'Write a message…',
                  hintStyle: GoogleFonts.jost(
                    fontSize: 14,
                    color: const Color(0xFF8A7667),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                    borderSide:
                        const BorderSide(color: Color(0xFFDDD3CB)),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                    borderSide:
                        const BorderSide(color: Color(0xFFDDD3CB)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                    borderSide: const BorderSide(
                        color: ModaireColors.espresso, width: 1.5),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 44,
              height: 44,
              child: ElevatedButton(
                onPressed: sending ? null : onSend,
                style: ElevatedButton.styleFrom(
                  backgroundColor: ModaireColors.espresso,
                  disabledBackgroundColor:
                      ModaireColors.espresso.withValues(alpha: 0.4),
                  shape: const CircleBorder(),
                  padding: EdgeInsets.zero,
                ),
                child: sending
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: ModaireColors.cream,
                        ),
                      )
                    : const Icon(
                        LucideIcons.send,
                        size: 18,
                        color: ModaireColors.cream,
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
