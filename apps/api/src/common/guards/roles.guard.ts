import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleUtilisateur } from '@prisma/client';
import { CLE_ROLES } from '../decorators/roles.decorator';
import type { UtilisateurConnecte } from '../../modules/auth/jwt.strategy';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requis = this.reflector.getAllAndOverride<RoleUtilisateur[]>(CLE_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requis?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: UtilisateurConnecte }>();
    if (!user || !requis.some((r) => user.roles.includes(r))) {
      throw new ForbiddenException("Vous n'avez pas les droits nécessaires pour cette action.");
    }
    return true;
  }
}
