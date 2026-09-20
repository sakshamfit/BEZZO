/**
 * Payment routes.
 *
 * The webhook route is public by necessity — a gateway has no BEZZO session — and it is the only public
 * mutating route in the platform whose authorization is a signature rather than a bearer token. It is
 * therefore deliberately narrow: it accepts one provider (the configured one), it verifies an HMAC over
 * the raw bytes, it stores the call as evidence before interpreting it, and it never accepts an amount
 * or a status that contradicts what the platform already recorded.
 */
import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@bezzo/contracts';
import { CurrentActor, Idempotent, Public, RequirePermissions, Roles } from '../../common/decorators';
import type { AuthenticatedActor } from '../../common/context/request-context';
import { uuidParam, validate } from '../../common/pipes/zod-validation.pipe';
import {
  PaymentsService,
  adminPaymentListSchema,
  refundSchema,
  type AdminPaymentListQuery,
  type RefundInput,
} from './payments.service';

interface RawBodyRequest {
  rawBody?: Buffer;
  headers?: Record<string, string | string[] | undefined>;
}

@ApiTags('payments')
@Controller('webhooks/payments')
export class PaymentWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Post(':provider')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Inbound gateway webhook (signature-verified, replay-protected)',
    description:
      'Verifies the HMAC over the raw request bytes, stores the call as evidence, deduplicates it by the provider event id, and applies the reported payment state inside a transaction. Returns 200 for a first delivery, a duplicate and an event the platform ignores, so the gateway stops retrying; a forged signature is answered with 400 and is retained with signature_valid=false.',
  })
  async receive(
    @Param('provider') provider: string,
    @Req() request: RawBodyRequest,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    // `rawBody` is captured by the bootstrap (never re-serialised): the signature is over bytes.
    return this.payments.handleWebhook(provider, request.rawBody, headers);
  }
}

/**
 * The buyer's view of the money trail for one of their own orders.
 *
 * It shares the `/orders` prefix with the orders module deliberately — a refund belongs to an order as
 * far as a client is concerned — while the ownership rule lives with the payment code that owns the
 * rows.
 */
@ApiTags('payments')
@Controller('orders')
export class OrderRefundsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get(':orderId/refunds')
  // One path, two audiences: a buyer reads their own order's refunds, an operator with
  // `admin.payment.read` reads any order's. The decorators can only express a conjunction of
  // permissions, so the coarse role list lives here and the exact rule — owner, or operator with the
  // read permission — is enforced in the service, which is the only layer that knows the order's owner.
  @Roles(
    'BUYER',
    'BUYER_OWNER',
    'BUYER_STAFF',
    'ADMIN',
    'SUPER_ADMIN',
    'OPERATIONS_AGENT',
    'SUPPORT_AGENT',
    'FINANCE_AGENT',
    'COMPLIANCE_AGENT',
  )
  @ApiOperation({
    summary: 'Refunds recorded against an order — the caller’s own, or any order for payment-read operators',
  })
  async list(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('orderId', uuidParam('orderId')) orderId: string,
  ) {
    return this.payments.listOrderRefunds(actor, orderId);
  }
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':paymentId/retry')
  @Roles('BUYER', 'BUYER_OWNER', 'BUYER_STAFF')
  @RequirePermissions(Permission.BUYER_ORDER_WRITE)
  @Idempotent('payment.retry')
  @ApiOperation({
    summary: 'Retry the payment for an order that is still awaiting payment',
    description:
      'Reuses the same payment row (an order can never have two live payments), records a new gateway attempt and asks the provider for a fresh intent with an attempt-scoped idempotency key.',
  })
  async retry(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('paymentId', uuidParam('paymentId')) paymentId: string,
  ) {
    return this.payments.retry(actor, paymentId);
  }

  @Post(':paymentId/refund')
  @RequirePermissions(Permission.ADMIN_PAYMENT_REVIEW)
  @Idempotent('payment.refund')
  @ApiOperation({
    summary: 'Refund a captured payment in full or in part (backoffice)',
    description:
      'Records the refund before calling the gateway, refuses more than the captured amount minus what was already returned, and only moves `payments.refunded_amount` on the provider’s own answer.',
  })
  async refund(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('paymentId', uuidParam('paymentId')) paymentId: string,
    @Body(validate(refundSchema)) body: RefundInput,
  ) {
    return this.payments.refund(actor, paymentId, body);
  }
}

/**
 * Backoffice payment surfaces.
 *
 * Read and move are separate permissions on purpose: a support agent investigates a failed payment with
 * `admin.payment.read`, and only an administrator or an operations agent holds `admin.payment.review`,
 * which is what the refund command demands.
 */
@ApiTags('payments')
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions(Permission.ADMIN_PAYMENT_READ)
  @ApiOperation({
    summary: 'Search payments (order number, buyer, gateway reference, state)',
    description:
      'Read-only money trail for the operations backoffice. Provider payloads and buyer banking data are never returned — only the identifiers needed to talk to the gateway.',
  })
  async list(@Query(validate(adminPaymentListSchema)) query: AdminPaymentListQuery) {
    return this.payments.adminList(query);
  }

  @Get(':paymentId')
  @RequirePermissions(Permission.ADMIN_PAYMENT_READ)
  @ApiOperation({
    summary: 'One payment with its attempts, refunds and webhook evidence log',
    description:
      'The evidence log records every inbound webhook — its digest, whether the signature verified and how it was processed — so “the gateway told us X” is a stored fact rather than a recollection.',
  })
  async detail(@Param('paymentId', uuidParam('paymentId')) paymentId: string) {
    return this.payments.adminDetail(paymentId);
  }
}
