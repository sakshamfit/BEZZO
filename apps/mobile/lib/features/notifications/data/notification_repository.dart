import '../../../core/network/bezzo_api_client.dart';

class BezzoNotification {
  const BezzoNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.read,
    required this.createdAt,
    this.referenceType,
    this.referenceId,
  });

  factory BezzoNotification.fromApi(Map<String, dynamic> data) {
    final id = data['id'];
    final title = data['title'];
    final body = data['body'];
    if (id is! String || title is! String || body is! String) {
      throw const FormatException('Notification response is incomplete.');
    }
    return BezzoNotification(
      id: id,
      type: data['type'] as String? ?? 'GENERAL',
      title: title,
      body: body,
      read: data['read'] == true,
      createdAt:
          DateTime.tryParse(data['createdAt'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      referenceType: data['referenceType'] as String?,
      referenceId: data['referenceId'] as String?,
    );
  }

  final String id;
  final String type;
  final String title;
  final String body;
  final bool read;
  final DateTime createdAt;
  final String? referenceType;
  final String? referenceId;
}

class NotificationPage {
  const NotificationPage({required this.items, required this.totalItems});

  final List<BezzoNotification> items;
  final int totalItems;
}

class NotificationRepository {
  NotificationRepository(this._api);

  final BezzoApiClient _api;

  Future<NotificationPage> list({
    int page = 1,
    int pageSize = 50,
    bool unreadOnly = false,
  }) async {
    final data = await _api.get('notifications', query: {
      'page': '$page',
      'pageSize': '$pageSize',
      if (unreadOnly) 'unreadOnly': 'true',
    });
    final rows = data['items'];
    if (rows is! List) {
      throw const FormatException('Notification response is incomplete.');
    }
    final pagination = data['pagination'];
    final totalItems = pagination is Map && pagination['totalItems'] is num
        ? (pagination['totalItems'] as num).toInt()
        : rows.length;
    return NotificationPage(
      items: rows
          .whereType<Map<String, dynamic>>()
          .map(BezzoNotification.fromApi)
          .toList(growable: false),
      totalItems: totalItems,
    );
  }

  Future<int> unreadCount() async =>
      (await list(pageSize: 1, unreadOnly: true)).totalItems;

  Future<void> markRead(String notificationId) async {
    await _api.patch('notifications/$notificationId/read', body: const {});
  }

  Future<void> markAllRead() async {
    await _api.post('notifications/read-all');
  }
}
