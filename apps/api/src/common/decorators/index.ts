import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
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

/** Requires an `Idempotency-Key` header and makes the operation replay-safe. */
export const Idempotent = (operation?: string) =>
  SetMetadata(IDEMPOTENT_KEY, { operation: operation ?? null });

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
