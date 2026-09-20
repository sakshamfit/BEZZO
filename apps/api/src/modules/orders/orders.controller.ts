import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@bezzo/contracts';
import { CurrentActor, Idempotent, RequirePermissions, Roles } from '../../common/decorators';
import type { AuthenticatedActor } from '../../common/context/request-context';
import { getRequestContext } from '../../common/context/request-context';
import { uuidParam, validate } from '../../common/pipes/zod-validation.pipe';
import {
  OrdersService,
  cancelOrderSchema,
  checkoutQuoteSchema,
  orderListQuerySchema,
  placeOrderSchema,
} from './orders.service';
import type { CheckoutQuoteInput, OrderListQuery, PlaceOrderInput } from './orders.service';

/* Buyers own the marketplace flow; suppliers, pickers and operations agents must never reach it. */
const BUYER_ROLES = ['BUYER', 'BUYER_OWNER', 'BUYER_STAFF'] as const;

@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly orders: OrdersService) {}

  @Post('quote')
  @Roles(...BUYER_ROLES)
  @RequirePermissions(Permission.BUYER_ORDER_WRITE)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Price the basket and validate the address, delivery mode, slot and serviceability (read-only)',
    description:
      'The same validation and pricing the order endpoint runs, without reserving stock, writing an order or touching the gateway. A preview must never hold the last unit.',
  })
  async quote(@CurrentActor() actor: AuthenticatedActor, @Body(validate(checkoutQuoteSchema)) body: CheckoutQuoteInput) {
    return this.orders.quote(actor, body);
  }
}

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Roles(...BUYER_ROLES)
  @RequirePermissions(Permission.BUYER_ORDER_WRITE)
  @Idempotent('order.create')
  @ApiOperation({
    summary: 'Place an order: price, reserve stock, split into per-supplier fulfilments, then create the payment intent',
    description:
      'Server-authoritative pricing and a guarded reservation per line (`available - reserved >= quantity`), so the last unit can only ever be sold once. The gateway is called after the commit; a provider failure is recorded on the payment and returned with the order instead of faking a failure.',
  })
  async placeOrder(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(validate(placeOrderSchema)) body: PlaceOrderInput,
    @Req() _request: unknown,
  ) {
    const requestId = getRequestContext()?.requestId ?? null;
    return this.orders.placeOrder(actor, body, requestId);
  }

  @Get()
  @Roles(...BUYER_ROLES)
  @RequirePermissions(Permission.BUYER_ORDER_READ)
  @ApiOperation({ summary: "The buyer's own orders with filters and bounded pagination" })
  async list(@CurrentActor() actor: AuthenticatedActor, @Query(validate(orderListQuerySchema)) query: OrderListQuery) {
    return this.orders.list(actor, query);
  }

  @Get(':orderId')
  @Roles(...BUYER_ROLES)
  @RequirePermissions(Permission.BUYER_ORDER_READ)
  @ApiOperation({ summary: 'Order detail: lines, per-supplier fulfilments, payment and status timeline' })
  async detail(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('orderId', uuidParam('orderId')) orderId: string,
  ) {
    return this.orders.detail(actor, orderId);
  }

  @Post(':orderId/cancel')
  @Roles(...BUYER_ROLES)
  @RequirePermissions(Permission.BUYER_ORDER_WRITE)
  @Idempotent('order.cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancel an order while it is still cancellable and release its reservations',
    description:
      'Idempotent in effect: the release only matches ACTIVE reservations, so a retried cancel can never restock twice. A paid order is refused — money movement needs the refund command, not a cancel.',
  })
  async cancel(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('orderId', uuidParam('orderId')) orderId: string,
    @Body(validate(cancelOrderSchema)) body: { reason?: string },
  ) {
    const requestId = getRequestContext()?.requestId ?? null;
    return this.orders.cancel(actor, orderId, body.reason, requestId);
  }
}
