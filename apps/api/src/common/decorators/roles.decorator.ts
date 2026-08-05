import { SetMetadata } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';

export const CLE_ROLES = 'rolesRequis';
/** Restreint une route à certains rôles (RG-001 : un compte peut en cumuler). */
export const Roles = (...roles: RoleUtilisateur[]) => SetMetadata(CLE_ROLES, roles);
