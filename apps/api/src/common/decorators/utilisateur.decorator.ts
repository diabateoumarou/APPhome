import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UtilisateurConnecte } from '../../modules/auth/jwt.strategy';

/** Injecte l'utilisateur authentifié dans le contrôleur. */
export const Utilisateur = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UtilisateurConnecte =>
    ctx.switchToHttp().getRequest<{ user: UtilisateurConnecte }>().user,
);
