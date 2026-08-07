class MessageOtherUser {
  const MessageOtherUser({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.profileImage,
    required this.isAdmin,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String? profileImage;
  final bool isAdmin;

  String get displayName {
    final f = firstName.trim();
    final l = lastName.trim();
    final lastInitial = l.isNotEmpty ? '${l[0].toUpperCase()}.' : '';
    return [f, lastInitial].where((s) => s.isNotEmpty).join(' ');
  }

  String get initial =>
      firstName.isNotEmpty ? firstName[0].toUpperCase() : 'M';

  factory MessageOtherUser.fromJson(Map<String, dynamic> json) =>
      MessageOtherUser(
        id: json['id'] as String,
        firstName: json['firstName'] as String,
        lastName: json['lastName'] as String,
        profileImage: json['profileImage'] as String?,
        isAdmin: (json['isAdmin'] as bool?) ?? false,
      );
}

class ConversationListingRef {
  const ConversationListingRef({required this.id, required this.title});
  final String id;
  final String title;

  factory ConversationListingRef.fromJson(Map<String, dynamic> json) =>
      ConversationListingRef(
        id: json['id'] as String,
        title: json['title'] as String,
      );
}

class ConversationSummary {
  const ConversationSummary({
    required this.id,
    required this.otherUser,
    this.listing,
    this.latestBody,
    required this.latestHasImage,
    required this.latestAt,
    required this.unreadCount,
    required this.isSupport,
  });

  final String id;
  final MessageOtherUser otherUser;
  final ConversationListingRef? listing;
  final String? latestBody;
  final bool latestHasImage;
  final DateTime latestAt;
  final int unreadCount;
  final bool isSupport;

  String get latestPreview {
    if (latestBody != null && latestBody!.trim().isNotEmpty) return latestBody!;
    if (latestHasImage) return '📷 Photo';
    return 'Open conversation';
  }

  factory ConversationSummary.fromJson(Map<String, dynamic> json) =>
      ConversationSummary(
        id: json['id'] as String,
        otherUser:
            MessageOtherUser.fromJson(json['otherUser'] as Map<String, dynamic>),
        listing: json['listing'] == null
            ? null
            : ConversationListingRef.fromJson(
                json['listing'] as Map<String, dynamic>),
        latestBody: json['latestBody'] as String?,
        latestHasImage: (json['latestHasImage'] as bool?) ?? false,
        latestAt: DateTime.parse(json['latestAt'] as String),
        unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
        isSupport: (json['isSupport'] as bool?) ?? false,
      );
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.body,
    this.imageUrl,
    required this.createdAt,
    this.readAt,
    required this.mine,
  });

  final String id;
  final String body;
  final String? imageUrl;
  final DateTime createdAt;
  final DateTime? readAt;
  final bool mine;

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id'] as String,
        body: json['body'] as String,
        imageUrl: json['imageUrl'] as String?,
        createdAt: DateTime.parse(json['createdAt'] as String),
        readAt: json['readAt'] == null
            ? null
            : DateTime.parse(json['readAt'] as String),
        mine: (json['mine'] as bool?) ?? false,
      );
}

class ConversationThread {
  const ConversationThread({
    required this.id,
    required this.otherUser,
    this.listing,
    required this.messages,
  });

  final String id;
  final MessageOtherUser otherUser;
  final ConversationListingRef? listing;
  final List<ChatMessage> messages;

  factory ConversationThread.fromJson(Map<String, dynamic> json) =>
      ConversationThread(
        id: json['id'] as String,
        otherUser:
            MessageOtherUser.fromJson(json['otherUser'] as Map<String, dynamic>),
        listing: json['listing'] == null
            ? null
            : ConversationListingRef.fromJson(
                json['listing'] as Map<String, dynamic>),
        messages: (json['messages'] as List<dynamic>)
            .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
