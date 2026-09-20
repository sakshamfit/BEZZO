import { Module } from '@nestjs/common';
import { MockPaymentsController } from './dev-payments.controller';
import {
  AdminPaymentsController,
  OrderRefundsController,
  PaymentWebhookController,
  PaymentsController,
} from './payments.controller';
import { PaymentsService } from './payments.service';

/**
 * Payments module.
 *
 * Exports the service so the worker can run provider reconciliation with the same transition code the
 * webhook handler uses — two inputs (a signed webhook, a status poll), one implementation, and no second
 * opinion about what "paid" means.
 *
 * The development simulator is always registered but checks its own preconditions per request: it refuses
 * unless the configured provider is `mock` (which production never is) and unless the caller either owns
 * the payment or holds the backoffice read permission. A route that answers 403 is a better failure mode
 * than a route that silently does not exist, because the reason is explicit in the response.
 */
@Module({
  controllers: [
    PaymentWebhookController,
    PaymentsController,
    OrderRefundsController,
    AdminPaymentsController,
    MockPaymentsController,
  ],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
