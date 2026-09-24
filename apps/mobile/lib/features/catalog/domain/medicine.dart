class Medicine {
  const Medicine({
    required this.id,
    required this.name,
    required this.generic,
    required this.strength,
    required this.category,
    required this.price,
    required this.mrp,
    required this.moq,
    required this.stockBoxes,
    required this.supplier,
    required this.tint,
  });

  final String id;
  final String name;
  final String generic;
  final String strength;
  final String category;
  final int price;
  final int mrp;
  final int moq;
  final int stockBoxes;
  final String supplier;
  final int tint;
}
