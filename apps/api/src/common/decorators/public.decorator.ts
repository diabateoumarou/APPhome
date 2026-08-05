import { SetMetadata } from '@nestjs/common';

export const CLE_PUBLIC = 'estPublic';
/** Ouvre une route sans authentification (l'API est protégée par défaut). */
export const Public = () => SetMetadata(CLE_PUBLIC, true);
