import 'package:flutter/material.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../data/notification_repository.dart';

class NotificationInboxPage extends StatefulWidget {
  const NotificationInboxPage({
    super.key,
    required this.repository,
    required this.onUnreadCountChanged,
  });

  final NotificationRepository repository;
  final ValueChanged<int> onUnreadCountChanged;

  @override
  State<NotificationInboxPage> createState() => _NotificationInboxPageState();
}

class _NotificationInboxPageState extends State<NotificationInboxPage> {
  List<BezzoNotification> _items = const [];
  String? _error;
  bool _loading = true;
  bool _markingAll = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        widget.repository.list(),
        widget.repository.unreadCount(),
      ]);
      final page = results[0] as NotificationPage;
      final unreadCount = results[1] as int;
      if (!mounted) return;
      setState(() {
        _items = page.items;
        _loading = false;
      });
      widget.onUnreadCountChanged(unreadCount);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    } on FormatException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  Future<void> _markRead(BezzoNotification notification) async {
    if (notification.read) return;
    try {
      await widget.repository.markRead(notification.id);
      if (!mounted) return;
      setState(() {
        _items = [
          for (final item in _items)
            if (item.id == notification.id)
              BezzoNotification(
                id: item.id,
                type: item.type,
                title: item.title,
                body: item.body,
                read: true,
                createdAt: item.createdAt,
                referenceType: item.referenceType,
                referenceId: item.referenceId,
              )
            else
              item,
        ];
      });
      widget.onUnreadCountChanged(await widget.repository.unreadCount());
    } on ApiException catch (error) {
      if (mounted) _showError(error.message);
    }
  }

  Future<void> _markAllRead() async {
    if (_markingAll) return;
    setState(() => _markingAll = true);
    try {
      await widget.repository.markAllRead();
      if (!mounted) return;
      setState(() {
        _items = [
          for (final item in _items)
            BezzoNotification(
              id: item.id,
              type: item.type,
              title: item.title,
              body: item.body,
              read: true,
              createdAt: item.createdAt,
              referenceType: item.referenceType,
              referenceId: item.referenceId,
            ),
        ];
        _markingAll = false;
      });
      widget.onUnreadCountChanged(0);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _markingAll = false);
      _showError(error.message);
    }
  }

  void _showError(String message) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: canvas,
    appBar: AppBar(
      title: const Text('Notifications'),
      backgroundColor: brandYellow,
      actions: [
        TextButton(
          onPressed: _markingAll || !_items.any((item) => !item.read)
              ? null
              : _markAllRead,
          child: _markingAll
              ? const SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Mark all read'),
        ),
      ],
    ),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : _error != null
        ? Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(_error!, textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: _load,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Try again'),
                  ),
                ],
              ),
            ),
          )
        : _items.isEmpty
        ? RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              children: const [
                SizedBox(height: 120),
                Icon(Icons.notifications_none_rounded, size: 52, color: muted),
                SizedBox(height: 12),
                Center(
                  child: Text(
                    'You’re all caught up',
                    style: TextStyle(color: muted, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          )
        : RefreshIndicator(
            onRefresh: _load,
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
              itemCount: _items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 4),
              itemBuilder: (context, index) {
                final item = _items[index];
                return Card(
                  color: Colors.white,
                  child: ListTile(
                    onTap: () => _markRead(item),
                    leading: CircleAvatar(
                      backgroundColor: item.read
                          ? const Color(0xFFF0F2F4)
                          : const Color(0xFFE4F4E8),
                      child: Icon(
                        _iconFor(item.type),
                        color: item.read ? muted : teal,
                      ),
                    ),
                    title: Text(
                      item.title,
                      style: TextStyle(
                        color: ink,
                        fontWeight: item.read ? FontWeight.w600 : FontWeight.w800,
                      ),
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        '${item.body}\n${_dateLabel(item.createdAt)}',
                        style: const TextStyle(color: muted, height: 1.35),
                      ),
                    ),
                    isThreeLine: true,
                    trailing: item.read
                        ? null
                        : const Icon(Icons.circle, color: teal, size: 10),
                  ),
                );
              },
            ),
          ),
  );

  IconData _iconFor(String type) {
    final normalized = type.toUpperCase();
    if (normalized.contains('ORDER')) return Icons.inventory_2_outlined;
    if (normalized.contains('PAYMENT')) return Icons.payments_outlined;
    if (normalized.contains('DELIVERY')) return Icons.local_shipping_outlined;
    if (normalized.contains('ACCOUNT') || normalized.contains('VERIFY')) {
      return Icons.verified_user_outlined;
    }
    return Icons.notifications_outlined;
  }

  String _dateLabel(DateTime date) {
    if (date.millisecondsSinceEpoch == 0) return '';
    final local = date.toLocal();
    final now = DateTime.now();
    final isToday = local.year == now.year &&
        local.month == now.month &&
        local.day == now.day;
    final time =
        '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
    return isToday
        ? 'Today · $time'
        : '${local.day.toString().padLeft(2, '0')}/${local.month.toString().padLeft(2, '0')}/${local.year} · $time';
  }
}
