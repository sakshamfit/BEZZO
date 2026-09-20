import { Module } from '@nestjs/common';
import { CheckoutController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * Orders module.
 *
 * Owns the hard guarantees of the marketplace flow — authoritative pricing, atomic reservation,
 * one fulfilment per supplier, guarded cancellation — and depends on the payment provider only
 * through the `PAYMENT_PROVIDER` token, so no gateway SDK leaks into the domain.
 */
@Module({
  controllers: [CheckoutController, OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
