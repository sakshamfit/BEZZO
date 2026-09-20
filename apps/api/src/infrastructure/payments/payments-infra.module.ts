/**
 * Payment provider wiring.
 *
 * Selecting a provider without its credentials is a fatal configuration error: BEZZO never accepts a
 * payment it cannot verify server-side.
 */
import { Global, Module } from '@nestjs/common';
import type { AppConfig } from '@bezzo/config';
import { APP_CONFIG } from '../config/config.module';
import { MockPaymentProvider, RazorpayPaymentProvider, type PaymentProvider } from './payment-provider';

export const PAYMENT_PROVIDER = 'BEZZO_PAYMENT_PROVIDER';

export const paymentProviderFactory = {
  provide: PAYMENT_PROVIDER,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): PaymentProvider => {
    switch (config.PAYMENTS_PROVIDER) {
      case 'razorpay': {
        const missing = [
          ['RAZORPAY_KEY_ID', config.RAZORPAY_KEY_ID],
          ['RAZORPAY_KEY_SECRET', config.RAZORPAY_KEY_SECRET],
          ['RAZORPAY_WEBHOOK_SECRET', config.RAZORPAY_WEBHOOK_SECRET],
        ]
          .filter(([, value]) => !value)
          .map(([key]) => key);
        if (missing.length > 0) {
          throw new Error(
            `PAYMENTS_PROVIDER=razorpay requires: ${missing.join(', ')}. ` +
              'Provide the credentials through the secret manager, or use PAYMENTS_PROVIDER=mock for local work.',
          );
        }
        return new RazorpayPaymentProvider({
          keyId: config.RAZORPAY_KEY_ID as string,
          keySecret: config.RAZORPAY_KEY_SECRET as string,
          webhookSecret: config.RAZORPAY_WEBHOOK_SECRET as string,
        });
      }
      case 'cashfree':
        throw new Error(
          'PAYMENTS_PROVIDER=cashfree is declared in configuration but the Cashfree adapter is NOT IMPLEMENTED yet. ' +
            'Use razorpay or mock. (Roadmap: implement CashfreePaymentProvider against the same PaymentProvider contract.)',
        );
      default:
        return new MockPaymentProvider(config.JWT_REFRESH_SECRET);
    }
  },
};

@Global()
@Module({
  providers: [paymentProviderFactory],
  exports: [paymentProviderFactory],
})
export class PaymentsInfraModule {}
