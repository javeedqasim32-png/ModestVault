// Mirrors SerializedComment from src/lib/comments (the shape returned by
// /api/v1/listings/[id]/comments). Replies are at most one level deep.

DateTime? _date(dynamic v) => v == null ? null : DateTime.tryParse(v as String);

class CommentAuthor {
  const CommentAuthor({required this.id, required this.name, this.avatarUrl});
  final String id;
  final String name;
  final String? avatarUrl;

  factory CommentAuthor.fromJson(Map<String, dynamic> j) => CommentAuthor(
        id: j['id'] as String,
        name: j['name'] as String? ?? 'Member',
        avatarUrl: j['avatarUrl'] as String?,
      );
}

class ListingComment {
  const ListingComment({
    required this.id,
    required this.body,
    required this.deleted,
    required this.createdAt,
    required this.author,
    required this.isSeller,
    required this.canDelete,
    required this.replies,
  });

  final String id;
  final String body;
  final bool deleted;
  final DateTime? createdAt;
  final CommentAuthor author;
  final bool isSeller;
  final bool canDelete;
  final List<ListingComment> replies;

  factory ListingComment.fromJson(Map<String, dynamic> j) => ListingComment(
        id: j['id'] as String,
        body: j['body'] as String? ?? '',
        deleted: j['deleted'] as bool? ?? false,
        createdAt: _date(j['createdAt']),
        author: CommentAuthor.fromJson(j['author'] as Map<String, dynamic>),
        isSeller: j['isSeller'] as bool? ?? false,
        canDelete: j['canDelete'] as bool? ?? false,
        replies: ((j['replies'] as List<dynamic>?) ?? [])
            .map((e) => ListingComment.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
