import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/formatters.dart';
import '../../../catalog/domain/medicine.dart';
import 'box_art.dart';

class ProductCard extends StatelessWidget {
  const ProductCard({
    super.key,
    required this.product,
    required this.onViewOffers,
  });
  final Medicine product;
  final ValueChanged<Medicine> onViewOffers;

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: const Color(0xFFE9EDF0)),
    ),
    clipBehavior: Clip.antiAlias,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Stack(
          children: [
            BoxArt(product: product),
            Positioned(
              top: 9,
              left: 9,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: .9),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  'SEALED BOX',
                  style: TextStyle(
                    fontSize: 8,
                    color: navy,
                    fontWeight: FontWeight.w900,
                    letterSpacing: .4,
                  ),
                ),
              ),
            ),
            Positioned(
              top: 8,
              right: 8,
              child: Container(
                padding: const EdgeInsets.all(6),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.verified_rounded,
                  size: 15,
                  color: teal,
                ),
              ),
            ),
          ],
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(11, 9, 11, 0),
          child: Text(
            product.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: ink,
              fontWeight: FontWeight.w800,
              fontSize: 15,
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(11, 3, 11, 0),
          child: Text(
            product.strength,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: muted, fontSize: 10),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(11, 7, 11, 0),
          child: Text(
            product.supplier,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: muted, fontSize: 10),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(11, 4, 11, 0),
          child: Text(
            '${product.supplierCount} offers · ${product.stockBoxes} boxes available',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: muted, fontSize: 8),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(11, 6, 11, 0),
          child: Row(
            children: [
              Text(
                product.price > 0
                    ? 'From ${money(product.price)} / box'
                    : 'Price on offer',
                style: const TextStyle(
                  color: navy,
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const Spacer(),
            ],
          ),
        ),
        const Spacer(),
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 5, 10, 10),
          child: SizedBox(
            height: 36,
            width: double.infinity,
            child: FilledButton.tonal(
              onPressed: () => onViewOffers(product),
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFE8F5F1),
                foregroundColor: navy,
                padding: EdgeInsets.zero,
              ),
              child: const Text(
                'VIEW WHOLESALE OFFERS',
                style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900),
              ),
            ),
          ),
        ),
      ],
    ),
  );
}
