/**
 * Development-only gateway simulator.
 *
 * The mock provider is a real adapter with a real HMAC contract, so an end-to-end payment can be
 * exercised locally without Razorpay credentials. This route is what closes that loop: it reads the
 * payment *from the database* (the caller cannot invent an amount or a reference), builds a correctly
 * signed body with the provider's own signer, and then hands the bytes to the production webhook path —
 * signature verification, evidence row, deduplication and state transition all run exactly as they do for
 * a live gateway. Nothing here is a shortcut around the controls; it is a second signer.
 *
 * It is registered only outside production (see `payments.module.ts`), requires an authenticated caller
 * who either owns the payment or holds `admin.payment.read`, and refuses any provider other than `mock`.
 */
import { Body, Controller, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Permission, ErrorCode, PaymentStatus } from '@bezzo/contracts';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import { CurrentActor } from '../../common/decorators';
import type { AuthenticatedActor } from '../../common/context/request-context';
import { DomainError } from '../../common/errors/domain-error';
import { uuidParam, validate } from '../../common/pipes/zod-validation.pipe';
import { DATABASE } from '../../infrastructure/database/database.module';
import { PAYMENT_PROVIDER } from '../../infrastructure/payments/payments-infra.module';
import { MockPaymentProvider, type PaymentProvider } from '../../infrastructure/payments/payment-provider';
import { PaymentsService } from './payments.service';

const simulationSchema = z.object({
  outcome: z.enum(['PAID', 'FAILED', 'AUTHORIZED']).default('PAID'),
  eventId: z.string().trim().min(6).max(120).optional(),
});

type SimulationInput = z.infer<typeof simulationSchema>;

@ApiTags('payments')
@Controller('dev/payments')
export class MockPaymentsController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseType,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly payments: PaymentsService,
  ) {}

  @Post(':paymentId/mock-webhook')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Development only: sign and deliver a mock gateway webhook for a payment',
    description:
      'Builds the payload with the mock provider’s signer and delivers it through the production webhook handler, so the whole verification pipeline is exercised rather than bypassed.',
  })
  async simulate(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('paymentId', uuidParam('paymentId')) paymentId: string,
    @Body(validate(simulationSchema)) body: SimulationInput,
  ) {
    if (!(this.provider instanceof MockPaymentProvider)) {
      throw new DomainError(
        ErrorCode.PAYMENT_VERIFICATION_FAILED,
        'The development simulator is only available when PAYMENTS_PROVIDER=mock',
        { details: { configuredProvider: this.provider.name } },
      );
    }

    const payment = await this.database.row<{
      id: string;
      buyer_id: string;
      amount: string;
      gateway: string;
      gateway_payment_reference: string | null;
    }>(
      `SELECT id, buyer_id, amount, gateway, gateway_payment_reference FROM payments WHERE id = $1`,
      [paymentId],
    );
    if (!payment) throw new DomainError(ErrorCode.PAYMENT_NOT_FOUND, 'Payment not found');

    const isOwner = actor.buyerId !== null && actor.buyerId === payment.buyer_id;
    const isOperator = actor.permissions.includes(Permission.ADMIN_PAYMENT_READ);
    if (!isOwner && !isOperator) {
      throw new DomainError(ErrorCode.FORBIDDEN, 'You cannot simulate a payment that is not yours');
    }
    if (payment.gateway !== 'mock') {
      throw new DomainError(
        ErrorCode.PAYMENT_VERIFICATION_FAILED,
        'This payment was taken with a different gateway and cannot be simulated',
        { details: { gateway: payment.gateway } },
      );
    }
    if (!payment.gateway_payment_reference) {
      throw new DomainError(
        ErrorCode.PAYMENT_PENDING,
        'This payment has no gateway reference yet — the order may still be being placed',
      );
    }

    const signed = this.provider.buildWebhookPayload({
      providerReference: payment.gateway_payment_reference,
      amount: Number(payment.amount),
      status: body.outcome,
      eventId: body.eventId,
    });

    const outcome = await this.payments.handleWebhook(
      this.provider.name,
      Buffer.from(signed.body, 'utf8'),
      { 'x-mock-signature': signed.signature },
    );

    return {
      ...outcome,
      simulatedOutcome: body.outcome,
      // A failure simulation is what makes the retry path demonstrable, so the state is echoed back.
      paymentStatus: body.outcome === PaymentStatus.PAID ? 'PAID' : body.outcome,
      signature: signed.signature.slice(0, 16) + '…',
    };
  }
}
