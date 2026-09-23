/**
 * Order tracking — a visual narrative built strictly from the real state
 * machine. The domain keeps ORDER, FULFILMENT, PICKUP, HUB RECEIVING and
 * DELIVERY as distinct entities; this component renders exactly what the
 * server recorded (timestamps and statuses), invents no progress, and shows
 * a cancelled/failed stage as what it is.
 */
import { CheckIcon, CloseIcon } from './icons';
import { formatDateTime } from '../lib/format';
import type { OrderDetail, OrderFulfillment } from '../lib/types';

/**
 * Canonical fulfilment progress ladder. The enum is the DB CHECK constraint
 * (0006_cart_checkout_orders.sql); each rung maps to the timestamp the server
 * already records on the fulfilment row.
 */
const FULFILMENT_RUNGS: Array<{ status: string[]; label: string; sub?: string; at: keyof OrderFulfillment }> = [
  {
    status: ['CREATED', 'ALLOCATING', 'ALLOCATED'],
    label: 'Order routed to supplier',
    sub: 'The wholesaler receives this fulfilment',
    at: 'acceptedAt',
  },
  {
    status: ['PICKING'],
    label: 'Supplier preparing',
    sub: 'Picking your medicines from live stock',
    at: 'acceptedAt',
  },
  { status: ['PACKED'], label: 'Packed', sub: 'Packages sealed and labelled', at: 'packedAt' },
  {
    status: ['READY_FOR_PICKUP', 'READY_FOR_DISPATCH'],
    label: 'Ready for pickup',
    at: 'readyAt',
  },
  {
    status: ['PICKUP_ASSIGNED'],
    label: 'Picker assigned',
    sub: 'A Bezzo picker is on the way to the supplier',
    at: 'readyAt',
  },
  {
    status: ['COLLECTED'],
    label: 'Collected by picker',
    sub: 'Picker is collecting your order',
    at: 'collectedAt',
  },
  {
    status: ['AT_HUB'],
    label: 'At Bezzo collection hub',
    sub: 'Your order has reached the Bezzo collection hub',
    at: 'collectedAt',
  },
  {
    status: ['HANDED_TO_LOGISTICS', 'IN_TRANSIT'],
    label: 'Out for delivery',
    sub: 'On its way from the hub to your counter',
    at: 'collectedAt',
  },
  { status: ['DELIVERED'], label: 'Delivered', at: 'deliveredAt' },
];

function rungIndex(status: string): number {
  const index = FULFILMENT_RUNGS.findIndex((rung) => rung.status.includes(status));
  return index >= 0 ? index : 0;
}

export function fulfilmentProgress(status: string): number {
  if (status === 'DELIVERED') return 1;
  if (status === 'CANCELLED' || status === 'FAILED' || status === 'RETURNED') return 0;
  return rungIndex(status) / (FULFILMENT_RUNGS.length - 1);
}

function timeAt(fulfillment: OrderFulfillment, key: keyof OrderFulfillment): string | null {
  const value = fulfillment[key];
  return typeof value === 'string' ? value : null;
}

/** Per-supplier track: the physical journey of one fulfilment. */
export function FulfillmentTrack({ fulfillment }: { fulfillment: OrderFulfillment }) {
  const terminal = ['CANCELLED', 'FAILED', 'RETURNING', 'RETURNED'].includes(fulfillment.status);
  const delivered = fulfillment.status === 'DELIVERED';
  const currentRung = rungIndex(fulfillment.status);
  const terminalRung = terminal ? currentRung : delivered ? FULFILMENT_RUNGS.length - 1 : currentRung;

  return (
    <ol className="track" aria-label={`Journey of fulfilment ${fulfillment.fulfillmentReference}`}>
      {FULFILMENT_RUNGS.map((rung, index) => {
        const isDone = index < terminalRung || delivered;
        const isCurrent = !terminal && !delivered && index === terminalRung;
        const isTerminalHere = terminal && index === terminalRung;
        const timestamp = timeAt(fulfillment, rung.at);
        return (
          <li
            key={rung.label}
            className={
              isTerminalHere ? 'cancelled' : isDone ? 'done' : isCurrent ? 'current' : undefined
            }
          >
            <span className="ts-node" aria-hidden="true">
              {isTerminalHere ? <CloseIcon size={13} /> : isDone ? <CheckIcon size={13} /> : null}
            </span>
            <span className="ts-body">
              <span className="ts-title">{rung.label}</span>
              {rung.sub && (isDone || isCurrent || isTerminalHere) && <span className="ts-sub">{rung.sub}</span>}
              {isTerminalHere && (
                <span className="ts-sub" style={{ color: 'var(--danger)' }}>
                  This fulfilment was {fulfillment.status.toLowerCase()}.
                  {fulfillment.cancelledAt ? ` ${formatDateTime(fulfillment.cancelledAt)}.` : ''}
                </span>
              )}
            </span>
            <span className="ts-time">{isDone || isCurrent ? (timestamp ? formatDateTime(timestamp) : '') : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Order-level track: the commercial + payment spine above the fulfilments. */
export function OrderTrack({ order }: { order: OrderDetail }) {
  const cancelled = order.status === 'CANCELLED';
  const payment = order.payment;
  const paymentState =
    payment === null
      ? 'unknown'
      : payment.status === 'PAID' || payment.status === 'CAPTURED'
        ? 'paid'
        : payment.status === 'PENDING'
          ? order.paymentStatus === 'PENDING' && order.status === 'PENDING_PAYMENT'
            ? 'awaiting'
            : 'pending'
          : payment.status === 'FAILED'
            ? 'failed'
            : 'refunded';

  const steps: Array<{
    label: string;
    sub?: string;
    state: 'done' | 'current' | 'todo' | 'bad';
    time: string | null;
  }> = [
    {
      label: 'Order placed',
      sub: `${order.itemCount} items · ${order.supplierCount} supplier${order.supplierCount === 1 ? '' : 's'}`,
      state: 'done',
      time: order.placedAt ?? order.createdAt,
    },
    {
      label:
        paymentState === 'awaiting'
          ? 'Awaiting payment'
          : paymentState === 'failed'
            ? 'Payment failed — retry available'
            : paymentState === 'refunded'
              ? 'Payment refunded'
              : 'Payment confirmed',
      sub:
        paymentState === 'awaiting'
          ? 'Complete the payment to release preparation'
          : payment?.method
            ? `${payment.method} · ${payment.gateway}`
            : undefined,
      state:
        paymentState === 'paid' || order.paymentStatus === 'PAID'
          ? 'done'
          : paymentState === 'failed'
            ? 'bad'
            : order.status === 'PENDING_PAYMENT'
              ? 'current'
              : 'done',
      time: payment?.paidAt ?? null,
    },
    {
      label: 'Order confirmed',
      sub: 'Suppliers are accountable for their lines',
      state: order.confirmedAt ? 'done' : order.status === 'PENDING_PAYMENT' ? 'todo' : 'current',
      time: order.confirmedAt,
    },
    {
      label: cancelled ? 'Order cancelled' : order.completedAt ? 'Completed' : 'In progress',
      sub: cancelled
        ? order.cancellation
          ? `${order.cancellation.releasedUnits} reserved unit(s) returned to the suppliers' shelves`
          : undefined
        : 'Each supplier fulfilment is tracked separately below',
      state: cancelled ? 'bad' : order.completedAt ? 'done' : 'current',
      time: cancelled ? order.cancelledAt : order.completedAt,
    },
  ];

  return (
    <ol className="track" aria-label="Order progress">
      {steps.map((step) => (
        <li
          key={step.label}
          className={step.state === 'bad' ? 'cancelled' : step.state === 'done' ? 'done' : step.state === 'current' ? 'current' : undefined}
        >
          <span className="ts-node" aria-hidden="true">
            {step.state === 'bad' ? <CloseIcon size={13} /> : step.state === 'done' ? <CheckIcon size={13} /> : null}
          </span>
          <span className="ts-body">
            <span className="ts-title">{step.label}</span>
            {step.sub && step.state !== 'todo' && <span className="ts-sub">{step.sub}</span>}
          </span>
          <span className="ts-time">{step.time ? formatDateTime(step.time) : ''}</span>
        </li>
      ))}
    </ol>
  );
}

/** Compact progress meter for order cards. */
export function OrderProgressMeter({ fulfillments }: { fulfillments: { status: string }[] }) {
  if (fulfillments.length === 0) return null;
  const segments = 5;
  const progress =
    fulfillments.reduce((total, fulfillment) => total + fulfilmentProgress(fulfillment.status), 0) /
    fulfillments.length;
  const filled = Math.round(progress * segments);
  return (
    <div className="meter" role="img" aria-label={`Progress: ${Math.round(progress * 100)}%`}>
      {Array.from({ length: segments }, (_, index) => (
        <span key={index} className={`m-seg${index < filled ? ' done' : ''}`} />
      ))}
    </div>
  );
}
