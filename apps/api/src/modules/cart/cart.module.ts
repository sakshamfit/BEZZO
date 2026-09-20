import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

/**
 * Cart module.
 *
 * The cart is the buyer's soft basket: it validates offers and live stock on every mutation but never
 * reserves inventory — reservations belong to checkout, which owns the hard guarantees.
 */
@Module({
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
