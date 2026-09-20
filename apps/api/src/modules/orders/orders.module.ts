/**
 * Checkout & Orders module.
 *
 * Depends only on infrastructure (database, config, audit, events, payments) — the picker, delivery and
 * settlement flows will attach to the fulfillment records this module creates rather than to the order.
 */
import { Module } from '@nestjs/common';
import { CheckoutController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [CheckoutController, OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
