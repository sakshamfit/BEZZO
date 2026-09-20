/**
 * Authorization guard.
 *
 * BEZZO authorizes on `role + permission + resource ownership + resource state` (API spec §6).
 * This guard enforces role and permission; resource ownership is enforced inside the domain services
 * because only they know the entity graph (buyer → order, supplier → listing, picker → task).
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, type RoleCode } from '@bezzo/contracts';
import { currentActor } from '../context/request-context';
import { DomainError } from '../errors/domain-error';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, ROLES_KEY } from '../decorators';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const actor = currentActor();
    if (!actor) {
      throw new DomainError(ErrorCode.AUTH_REQUIRED, 'Authentication is required for this resource');
    }

    const requiredRoles = this.reflector.getAllAndOverride<RoleCode[]>([ROLES_KEY], [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.some((role) => actor.roles.includes(role));
      if (!hasRole) {
        throw new DomainError(ErrorCode.ROLE_NOT_ALLOWED, 'Your role does not permit this operation', {
          details: { requiredRoles },
        });
      }
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>([PERMISSIONS_KEY], [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredPermissions && requiredPermissions.length > 0) {
      const missing = requiredPermissions.filter((permission) => !actor.permissions.includes(permission));
      if (missing.length > 0) {
        throw new DomainError(ErrorCode.FORBIDDEN, 'You do not have permission to perform this operation', {
          details: { missingPermissions: missing },
        });
      }
    }

    return true;
  }
}
