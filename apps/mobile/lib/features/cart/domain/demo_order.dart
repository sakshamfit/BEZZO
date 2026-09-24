class DemoOrder {
  DemoOrder({
    required this.number,
    required this.items,
    required this.total,
    required this.time,
  });
  final String number;
  final int items;
  final int total;
  final DateTime time;
  String status = 'Order received';
}
