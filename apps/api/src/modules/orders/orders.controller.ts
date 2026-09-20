import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@bezzo/contracts';
import { CurrentActor, Idempotent, RequirePermissions, Roles } from '../../common/decorators';
import type { AuthenticatedActor } from '../../common/context/request-context';
import { validate } from '../../common/pipes/zod-validation.pipe';
import {
  OrdersService,
  cancelOrderSchema,
  checkoutQuoteSchema,
  orderListQuerySchema,
  placeOrderSchema,
} from './orders.service';
import type { CheckoutQuoteInput, OrderListQuery, PlaceOrderInput } from './orders.service';

const BUYER_ROLES = ['BUYER', 'BUYER_OWNER', 'BUYER_STAFF'] as const;

/**
 * Checkout preview. Read-only and side-effect free: it prices the live basket for a chosen address and
 * delivery mode so the buyer sees the real total (and every blocking reason) before committing.
 */
@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly orders: OrdersService) {}

  @Post('quote')
  @Roles(...BUYER_ROLES)
  @RequirePermissions(Permission.BUYER_ORDER_READ)
  @HttpCode(200)
  @ApiOperation({ summary: 'Server-calculated totals and validation for the current basket' })
  async quote(@CurrentActor() actor: AuthenticatedActor, @Body(validate(checkoutQuoteSchema)) body: CheckoutQuoteInput) {
    return this.orders.quote(actor, body);
  }
}

/**
 * Orders. `POST /orders` is the single command that turns a basket into a commitment — it is
 * idempotent, server-priced, and reserves stock with a guarded update, so a retry or a race can never
 * create a duplicate order or oversell the last unit.
 */
@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Roles(...BUYER_ROLES)
  @RequirePermissions(Permission.BUYER_ORDER_WRITE)
  @Idempotent('order.create')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Retrying with the same key returns the original order instead of placing a second one.',
  })
  @ApiOperation({ summary: 'Place an order from the current basket (reserves stock, creates payments)' })
  async place(@CurrentActor() actor: AuthenticatedActor, @Body(validate(placeOrderSchema)) body: PlaceOrderInput) {
    return this.orders.place(actor, body);
  }

  @Get()
  @Roles(...BUYER_ROLES)
  @RequirePermissions(Permission.BUYER_ORDER_READ)
  @ApiOperation({ summary: "The buyer's own order history" })
  async list(@CurrentActor() actor: AuthenticatedActor, @Query(validate(orderListQuerySchema)) query: OrderListQuery) {
    return this.orders.list(actor, query);
  }

  @Get(':orderId')
  @Roles(...BUYER_ROLES)
  @RequirePermissions(Permission.BUYER_ORDER_READ)
  @ApiOperation({ summary: 'Order detail with lines, per-supplier fulfillments, payment and timeline' })
  async detail(@CurrentActor() actor: AuthenticatedActor, @Param('orderId') orderId: string) {
    return this.orders.detail(actor, orderId);
  }

  @Post(':orderId/cancel')
  @Roles(...BUYER_ROLES)
  @RequirePermissions(Permission.BUYER_ORDER_WRITE)
  @Idempotent('order.cancel')
  @ApiOperation({ summary: 'Cancel an order that has not been fulfilled and release its reservations' })
  async cancel(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('orderId') orderId: string,
    @Body(validate(cancelOrderSchema)) body: { reason?: string },
  ) {
    return this.orders.cancel(actor, orderId, body?.reason);
  }
}
