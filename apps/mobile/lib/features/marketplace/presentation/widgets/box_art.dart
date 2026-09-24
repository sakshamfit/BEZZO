import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../catalog/domain/medicine.dart';

class BoxArt extends StatelessWidget {
  const BoxArt({super.key, required this.product, this.compact = false});
  final Medicine product;
  final bool compact;

  @override
  Widget build(BuildContext context) => Container(
    height: compact ? 64 : 132,
    width: double.infinity,
    color: Color(product.tint),
    child: Stack(
      alignment: Alignment.center,
      children: [
        Positioned(
          right: -18,
          top: -26,
          child: Container(
            width: 94,
            height: 94,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: .28),
              shape: BoxShape.circle,
            ),
          ),
        ),
        Container(
          width: compact ? 42 : 80,
          height: compact ? 48 : 74,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(5),
            boxShadow: [
              BoxShadow(
                color: navy.withValues(alpha: .16),
                blurRadius: 15,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                height: compact ? 6 : 12,
                decoration: const BoxDecoration(
                  color: navy,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(5)),
                ),
                child: Center(
                  child: Text(
                    compact ? 'BZ' : 'BEZZO DEMO',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: compact ? 4 : 6,
                      letterSpacing: .5,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ),
              const Spacer(),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: compact ? 3 : 8),
                child: Text(
                  product.name.toUpperCase(),
                  maxLines: compact ? 1 : 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: navy,
                    fontSize: compact ? 4 : 9,
                    height: 1.1,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              if (!compact)
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
                  child: Text(
                    product.strength.split(' · ').first,
                    style: const TextStyle(
                      color: muted,
                      fontSize: 7,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              const Spacer(),
              Container(height: compact ? 3 : 6, color: teal),
            ],
          ),
        ),
        if (!compact)
          Positioned(
            bottom: 12,
            right: 12,
            child: Icon(
              Icons.inventory_2_rounded,
              color: navy.withValues(alpha: .14),
              size: 24,
            ),
          ),
      ],
    ),
  );
}
