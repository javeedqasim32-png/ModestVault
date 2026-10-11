import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../app/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/auth/auth_controller.dart';
import '../../../core/comments/comment_models.dart';
import '../../../core/comments/comment_repository.dart';

// Mirrors src/components/listings/ListingComments.tsx: a tan "Have a question
// about this item?" banner with one Ask CTA, question cards, replies nested
// inside with seller answers on a tan panel, ⋮ menu for report / delete.
// Guests can read; any write routes to sign-in. The server enforces every
// rule (rate limit, blocked links / contact info, permissions) and its
// message is surfaced inline.

const _cardBg = Color(0xFFFDFBF9);
const _hairline = Color(0xFFECE3DC);
const _sellerPanel = Color(0xFFF3ECE6);
const _badgeBg = Color(0xFFE8DDD1);
const _badgeText = Color(0xFF7A6050);
const _ink = Color(0xFF2F2925);
const _muted = Color(0xFF8A7667);
const _faint = Color(0xFFB3A89E);
const _espresso = Color(0xFF4A3328);
const _previewCount = 3;
const _maxLen = 500;

class ListingCommentsSection extends ConsumerStatefulWidget {
  const ListingCommentsSection({super.key, required this.listingId});
  final String listingId;

  @override
  ConsumerState<ListingCommentsSection> createState() => _ListingCommentsSectionState();
}

class _ListingCommentsSectionState extends ConsumerState<ListingCommentsSection> {
  List<ListingComment> _comments = const [];
  bool _loading = true;
  bool _busy = false;
  bool _composerOpen = false;
  bool _showAll = false;
  String? _replyTo; // top-level comment id
  String? _error;
  final _ctrl = TextEditingController();
  final _replyCtrl = TextEditingController();
  final _reported = <String>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _replyCtrl.dispose();
    super.dispose();
  }

  bool get _signedIn => ref.read(authControllerProvider) is AuthAuthenticated;

  Future<void> _load() async {
    try {
      final c = await ref.read(commentRepositoryProvider).list(widget.listingId);
      if (mounted) setState(() { _comments = c; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool _requireSignIn() {
    if (_signedIn) return true;
    context.push('/sign-in');
    return false;
  }

  void _openComposer() {
    if (!_requireSignIn()) return;
    setState(() { _composerOpen = true; _replyTo = null; _error = null; });
  }

  void _startReply(String topLevelId) {
    if (!_requireSignIn()) return;
    setState(() { _composerOpen = false; _replyTo = topLevelId; _replyCtrl.clear(); _error = null; });
  }

  Future<void> _submit(String text, {String? parentId}) async {
    if (!_requireSignIn()) return;
    final body = text.trim();
    if (body.isEmpty) return;
    setState(() { _busy = true; _error = null; });
    try {
      final c = await ref.read(commentRepositoryProvider).post(widget.listingId, body, parentId: parentId);
      if (!mounted) return;
      setState(() {
        _comments = c;
        if (parentId != null) { _replyTo = null; _replyCtrl.clear(); } else { _ctrl.clear(); _composerOpen = false; }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(String id) async {
    setState(() { _busy = true; _error = null; });
    try {
      await ref.read(commentRepositoryProvider).delete(id);
      await _load();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _report(String id) async {
    if (!_requireSignIn()) return;
    try {
      await ref.read(commentRepositoryProvider).report(id);
    } on ApiException catch (e) {
      if (!e.message.toLowerCase().contains('already')) {
        if (mounted) setState(() => _error = e.message);
        return;
      }
    }
    if (!mounted) return;
    setState(() => _reported.add(id));
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Thanks — we'll take a look.")));
  }

  @override
  Widget build(BuildContext context) {
    final questionCount = _comments.where((c) => !c.deleted).length;
    final shown = _showAll ? _comments : _comments.take(_previewCount).toList();
    final hidden = _comments.length - shown.length;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Banner(onAsk: _openComposer),
          if (_composerOpen) ...[
            const SizedBox(height: 12),
            _Composer(
              controller: _ctrl,
              hint: 'What would you like to know? Measurements, fit, fabric, any flaws…',
              minLines: 3,
              busy: _busy,
              error: _error,
              submitLabel: 'Post Question',
              onCancel: () => setState(() { _composerOpen = false; _error = null; }),
              onSubmit: () => _submit(_ctrl.text),
            ),
          ] else if (_error != null && _replyTo == null) ...[
            const SizedBox(height: 8),
            _GuardNote(_error!),
          ],
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Center(child: CircularProgressIndicator(color: _espresso, strokeWidth: 2)),
            )
          else if (_comments.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Center(child: Text('No questions yet — be the first to ask.', style: GoogleFonts.jost(fontSize: 13, color: _muted))),
            )
          else ...[
            Padding(
              padding: const EdgeInsets.only(top: 20, bottom: 8),
              child: Text(
                '$questionCount ${questionCount == 1 ? 'QUESTION' : 'QUESTIONS'}',
                style: GoogleFonts.jost(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 2, color: _muted),
              ),
            ),
            for (final c in shown)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _QuestionCard(
                  c: c,
                  busy: _busy,
                  reported: _reported,
                  replying: _replyTo == c.id,
                  replyCtrl: _replyCtrl,
                  error: _replyTo == c.id ? _error : null,
                  onReply: () => _startReply(c.id),
                  onCancelReply: () => setState(() { _replyTo = null; _error = null; }),
                  onSendReply: () => _submit(_replyCtrl.text, parentId: c.id),
                  onDelete: _delete,
                  onReport: _report,
                ),
              ),
            if (hidden > 0)
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => setState(() => _showAll = true),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: _ink,
                    backgroundColor: ModaireColors.pillBg,
                    side: const BorderSide(color: ModaireColors.pillBorder),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  child: Text('View all $questionCount questions', style: GoogleFonts.jost(fontSize: 13)),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.onAsk});
  final VoidCallback onAsk;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ModaireColors.sellerCardBg, // same fill + hairline as the seller card above
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ModaireColors.pillBorder),
      ),
      child: Row(
        children: [
          Container(
            width: 48, height: 48,
            decoration: const BoxDecoration(color: Color(0xFFFAF6F2), shape: BoxShape.circle),
            child: const Icon(LucideIcons.messageCircle, size: 20, color: _espresso),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Have a question about this item?',
                    style: GoogleFonts.cormorantGaramond(fontSize: 21, fontWeight: FontWeight.w500, height: 1.15, color: _ink)),
                const SizedBox(height: 3),
                Text('Ask about sizing, condition, or any other details.',
                    style: GoogleFonts.jost(fontSize: 13, height: 1.35, color: _muted)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          ElevatedButton(
            onPressed: onAsk,
            style: ElevatedButton.styleFrom(
              backgroundColor: _espresso,
              elevation: 0,
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
            ),
            child: Text('Ask a Question',
                style: GoogleFonts.cormorantGaramond(fontSize: 17, fontWeight: FontWeight.w500, color: ModaireColors.cream)),
          ),
        ],
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.hint,
    required this.busy,
    required this.submitLabel,
    required this.onCancel,
    required this.onSubmit,
    this.minLines = 2,
    this.error,
  });
  final TextEditingController controller;
  final String hint;
  final bool busy;
  final String submitLabel;
  final VoidCallback onCancel;
  final VoidCallback onSubmit;
  final int minLines;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 6, 14, 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: controller,
            autofocus: true,
            minLines: minLines,
            maxLines: minLines + 3,
            maxLength: _maxLen,
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: GoogleFonts.jost(fontSize: 14, color: _faint),
              border: InputBorder.none,
              counterText: '',
              isDense: true,
            ),
            style: GoogleFonts.jost(fontSize: 15, height: 1.5, color: _ink),
          ),
          if (error != null) _GuardNote(error!),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(child: Text('Visible to everyone', style: GoogleFonts.jost(fontSize: 11, color: _faint))),
              TextButton(
                onPressed: onCancel,
                child: Text('Cancel', style: GoogleFonts.jost(fontSize: 13, color: _muted)),
              ),
              ElevatedButton(
                onPressed: busy ? null : onSubmit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _espresso,
                  elevation: 0,
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
                  minimumSize: Size.zero,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
                ),
                child: Text(busy ? 'Posting…' : submitLabel,
                    style: GoogleFonts.jost(fontSize: 13, fontWeight: FontWeight.w500, color: ModaireColors.cream)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _QuestionCard extends StatelessWidget {
  const _QuestionCard({
    required this.c,
    required this.busy,
    required this.reported,
    required this.replying,
    required this.replyCtrl,
    required this.error,
    required this.onReply,
    required this.onCancelReply,
    required this.onSendReply,
    required this.onDelete,
    required this.onReport,
  });
  final ListingComment c;
  final bool busy;
  final Set<String> reported;
  final bool replying;
  final TextEditingController replyCtrl;
  final String? error;
  final VoidCallback onReply;
  final VoidCallback onCancelReply;
  final VoidCallback onSendReply;
  final void Function(String id) onDelete;
  final void Function(String id) onReport;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _cardBg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Avatar(author: c.author, size: 44),
              const SizedBox(width: 12),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(c.deleted ? 'Removed' : c.author.name,
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.jost(fontSize: 15, fontWeight: FontWeight.w500, height: 1.1, color: _ink)),
                      const SizedBox(height: 3),
                      Text(_when(c.createdAt), style: GoogleFonts.jost(fontSize: 12, color: _muted)),
                    ],
                  ),
                ),
              ),
              if (!c.deleted)
                _Kebab(
                  canDelete: c.canDelete,
                  reported: reported.contains(c.id),
                  busy: busy,
                  onDelete: () => onDelete(c.id),
                  onReport: () => onReport(c.id),
                ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(left: 56),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 8),
                if (c.deleted)
                  Text('This question was removed.', style: GoogleFonts.jost(fontSize: 14, fontStyle: FontStyle.italic, color: _faint))
                else
                  Text(c.body, style: GoogleFonts.jost(fontSize: 15, height: 1.5, color: _ink)),
                for (final r in c.replies)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: _ReplyPanel(
                      r: r,
                      busy: busy,
                      reported: reported.contains(r.id),
                      onDelete: () => onDelete(r.id),
                      onReport: () => onReport(r.id),
                    ),
                  ),
                if (!c.deleted && !replying)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: InkWell(
                      onTap: onReply,
                      borderRadius: BorderRadius.circular(6),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(LucideIcons.cornerDownRight, size: 14, color: _muted),
                            const SizedBox(width: 4),
                            Text('Reply', style: GoogleFonts.jost(fontSize: 12, color: _muted)),
                          ],
                        ),
                      ),
                    ),
                  ),
                if (replying)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: _Composer(
                      controller: replyCtrl,
                      hint: 'Write a reply…',
                      busy: busy,
                      error: error,
                      submitLabel: 'Reply',
                      onCancel: onCancelReply,
                      onSubmit: onSendReply,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReplyPanel extends StatelessWidget {
  const _ReplyPanel({required this.r, required this.busy, required this.reported, required this.onDelete, required this.onReport});
  final ListingComment r;
  final bool busy;
  final bool reported;
  final VoidCallback onDelete;
  final VoidCallback onReport;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: r.isSeller ? _sellerPanel : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: r.isSeller ? null : Border.all(color: _hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _Avatar(author: r.author, size: 32),
              const SizedBox(width: 10),
              Expanded(
                child: Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 8,
                  runSpacing: 2,
                  children: [
                    Text(r.deleted ? 'Removed' : r.author.name,
                        style: GoogleFonts.jost(fontSize: 14, fontWeight: FontWeight.w500, color: _ink)),
                    if (r.isSeller && !r.deleted)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(color: _badgeBg, borderRadius: BorderRadius.circular(99)),
                        child: Text('Seller', style: GoogleFonts.jost(fontSize: 11, height: 1, color: _badgeText)),
                      ),
                    Text(_when(r.createdAt), style: GoogleFonts.jost(fontSize: 12, color: _muted)),
                  ],
                ),
              ),
              if (!r.deleted)
                _Kebab(canDelete: r.canDelete, reported: reported, busy: busy, onDelete: onDelete, onReport: onReport, small: true),
            ],
          ),
          const SizedBox(height: 6),
          if (r.deleted)
            Text('This reply was removed.', style: GoogleFonts.jost(fontSize: 13, fontStyle: FontStyle.italic, color: _faint))
          else
            Text(r.body, style: GoogleFonts.jost(fontSize: 14, height: 1.5, color: _ink)),
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.author, required this.size});
  final CommentAuthor author;
  final double size;

  @override
  Widget build(BuildContext context) {
    final initial = (author.name.isNotEmpty ? author.name[0] : 'M').toUpperCase();
    return ClipOval(
      child: SizedBox(
        width: size, height: size,
        child: author.avatarUrl != null
            ? CachedNetworkImage(imageUrl: author.avatarUrl!, fit: BoxFit.cover)
            : Container(
                color: _badgeBg,
                alignment: Alignment.center,
                child: Text(initial,
                    style: GoogleFonts.cormorantGaramond(fontSize: size * 0.46, fontWeight: FontWeight.w500, color: _badgeText)),
              ),
      ),
    );
  }
}

class _Kebab extends StatelessWidget {
  const _Kebab({required this.canDelete, required this.reported, required this.busy, required this.onDelete, required this.onReport, this.small = false});
  final bool canDelete;
  final bool reported;
  final bool busy;
  final VoidCallback onDelete;
  final VoidCallback onReport;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final dim = small ? 28.0 : 32.0;
    return SizedBox(
      width: dim, height: dim,
      child: PopupMenuButton<String>(
        padding: EdgeInsets.zero,
        iconSize: 18,
        icon: const Icon(LucideIcons.ellipsisVertical, color: _muted),
        color: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: _hairline)),
        onSelected: (v) => v == 'delete' ? onDelete() : onReport(),
        itemBuilder: (_) => [
          if (canDelete)
            PopupMenuItem(value: 'delete', enabled: !busy, child: Text('Delete', style: GoogleFonts.jost(fontSize: 13, color: const Color(0xFFB4463A))))
          else
            PopupMenuItem(value: 'report', enabled: !reported, child: Text(reported ? 'Reported' : 'Report', style: GoogleFonts.jost(fontSize: 13, color: _ink))),
        ],
      ),
    );
  }
}

class _GuardNote extends StatelessWidget {
  const _GuardNote(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(padding: EdgeInsets.only(top: 2), child: Icon(LucideIcons.lock, size: 14, color: _badgeText)),
          const SizedBox(width: 6),
          Expanded(child: Text(text, style: GoogleFonts.jost(fontSize: 13, height: 1.4, color: _badgeText))),
        ],
      ),
    );
  }
}

String _when(DateTime? d) {
  if (d == null) return '';
  final diff = DateTime.now().difference(d);
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes} ${diff.inMinutes == 1 ? 'minute' : 'minutes'} ago';
  if (diff.inHours < 24) return '${diff.inHours} ${diff.inHours == 1 ? 'hour' : 'hours'} ago';
  if (diff.inDays < 30) return '${diff.inDays} ${diff.inDays == 1 ? 'day' : 'days'} ago';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final l = d.toLocal();
  return '${months[l.month - 1]} ${l.day}';
}
