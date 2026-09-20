/**
 * Request-scoped context.
 *
 * BEZZO requires every important workflow to be observable and traceable (observability spec §33).
 * A single AsyncLocalStorage carries the correlation identifiers through services, repositories,
 * domain events and outbound provider calls without threading them through every function signature.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ClientPlatform, RoleCode } from '@bezzo/contracts';

export interface AuthenticatedActor {
  userId: string;
  sessionId: string;
  roles: RoleCode[];
  permissions: string[];
  organizationId: string | null;
  organizationType: string | null;
  supplierId: string | null;
  buyerId: string | null;
  pickerId: string | null;
  hubId: string | null;
}

export interface RequestContext {
  requestId: string;
  correlationId: string;
  clientPlatform: ClientPlatform | null;
  clientVersion: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  actor: AuthenticatedActor | null;
  /** Correlation identifiers that link one physical order journey end-to-end. */
  correlation: {
    orderId?: string | null;
    fulfillmentId?: string | null;
    pickupTaskId?: string | null;
    pickupRunId?: string | null;
    packageId?: string | null;
    hubReceivingId?: string | null;
    paymentId?: string | null;
    deliveryId?: string | null;
  };
}

const storage = new AsyncLocalStorage<RequestContext>();

export function createRequestContext(partial: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: partial.requestId ?? crypto.randomUUID(),
    correlationId: partial.correlationId ?? partial.requestId ?? crypto.randomUUID(),
    clientPlatform: partial.clientPlatform ?? null,
    clientVersion: partial.clientVersion ?? null,
    ipAddress: partial.ipAddress ?? null,
    userAgent: partial.userAgent ?? null,
    actor: partial.actor ?? null,
    correlation: partial.correlation ?? {},
  };
}

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Bind a context to the *current* async execution context.
 *
 * Required by the Fastify `onRequest` hook: a hook returns before the route handler runs, so the
 * callback-scoped `storage.run()` would have already exited by the time the handler executes.
 * `enterWith()` keeps the store attached to the request's async chain, which is exactly the lifetime
 * we want (request-scoped correlation without threading identifiers through every signature).
 */
export function enterWithContext(context: RequestContext): void {
  storage.enterWith(context);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Never throws: background jobs and workers legitimately run outside a request. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function currentActor(): AuthenticatedActor | null {
  return storage.getStore()?.actor ?? null;
}

export function setActor(actor: AuthenticatedActor | null): void {
  const context = storage.getStore();
  if (context) context.actor = actor;
}

export function setCorrelation(correlation: Partial<RequestContext['correlation']>): void {
  const context = storage.getStore();
  if (!context) return;
  context.correlation = { ...context.correlation, ...correlation };
}

/**
 * Run `fn` with a correlation identifier attached. Used by background workers processing an event
 * so their logs and audit rows stay linked to the originating order/pickup journey.
 */
export async function runWithCorrelation<T>(
  correlation: Partial<RequestContext['correlation']>,
  fn: () => Promise<T>,
  contextFactory: () => RequestContext = () => createRequestContext(),
): Promise<T> {
  const context = contextFactory();
  context.correlation = { ...context.correlation, ...correlation };
  return storage.run(context, fn);
}
