import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { RoleCode } from '@bezzo/contracts';
import { getRequestContext, type AuthenticatedActor } from '../context/request-context';

export const IS_PUBLIC_KEY = 'bezzo:isPublic';
export const ROLES_KEY = 'bezzo:roles';
export const PERMISSIONS_KEY = 'bezzo:permissions';
export const IDEMPOTENT_KEY = 'bezzo:idempotent';
export const AUDIT_KEY = 'bezzo:audit';

/** Marks a route as reachable without authentication (registration, login, public catalog). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to users holding at least one of the given roles. */
export const Roles = (...roles: RoleCode[]) => SetMetadata(ROLES_KEY, roles);

/** Restricts a route to users holding every listed permission. */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Requires an `Idempotency-Key` header and makes the operation replay-safe.
 *
 * Used on the mutations where a duplicate execution is harmful (adding to the basket, stock
 * movements, document uploads, device registration) — see `IdempotencyInterceptor` for the
 * enforcement semantics. The header is part of the published contract, so it is documented on the
 * route as well: a client that reads the OpenAPI document must not have to discover it by failing.
 */
export function Idempotent(operation?: string): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    SetMetadata(IDEMPOTENT_KEY, { operation: operation ?? null })(target, propertyKey, descriptor);
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description:
        'Client-generated key (8-255 characters) that makes this command replay-safe. ' +
        'Reusing a key with a different body is rejected with IDEMPOTENCY_KEY_CONFLICT.',
    })(target, propertyKey, descriptor);
    return descriptor;
  };
}

/** Records an audit entry for the route (admin and sensitive operations). */
export const Audited = (action: string, resourceType: string) =>
  SetMetadata(AUDIT_KEY, { action, resourceType });

export const CurrentActor = createParamDecorator((_data: unknown, _context: ExecutionContext): AuthenticatedActor => {
  const actor = getRequestContext()?.actor ?? null;
  if (!actor) {
    throw new Error('CurrentActor used on an unauthenticated route — check the guard configuration');
  }
  return actor;
});

export const CorrelationId = createParamDecorator(
  (_data: unknown, _context: ExecutionContext): string => getRequestContext()?.correlationId ?? crypto.randomUUID(),
);

export const ClientPlatform = createParamDecorator(
  (_data: unknown, _context: ExecutionContext): string | null => getRequestContext()?.clientPlatform ?? null,
);
