/**
 * Service Profil — informations personnelles de l'utilisateur.
 *
 * L'adresse a une portée contractuelle : elle figure au bail comme élection de
 * domicile (art. 16) et conditionne l'opposabilité des notifications. Elle est
 * donc exigée avant toute candidature, au même titre que les justificatifs.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 *          Ingénieur Système & Infrastructure Cloud / System Architect
 *          Expert Solutions ICT (Cloud, Système, Cybersécurité)
 * Date   : 11 août 2026
 */
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import type { UtilisateurConnecte } from '../auth/jwt.strategy';
import { ModifierProfilDto } from './dto/profil.dto';

@Injectable()
export class ProfilService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async consulter(utilisateur: UtilisateurConnecte) {
    const profil = await this.prisma.utilisateur.findUnique({
      where: { id: utilisateur.id },
      select: {
        id: true,
        nomComplet: true,
        telephone: true,
        email: true,
        adresse: true,
        commune: true,
        telephoneVerifieLe: true,
        emailVerifieLe: true,
        langue: true,
        createdAt: true,
        roles: { select: { role: true, agenceId: true } },
      },
    });

    if (!profil) throw new NotFoundException('Profil introuvable.');

    // Le profil est complet lorsqu'il permet de contractualiser.
    return {
      ...profil,
      complet: Boolean(profil.adresse && profil.commune),
      mentionsManquantes: [
        ...(profil.adresse ? [] : ['adresse']),
        ...(profil.commune ? [] : ['commune']),
      ],
    };
  }

  async modifier(dto: ModifierProfilDto, utilisateur: UtilisateurConnecte) {
    if (dto.email) {
      const occupe = await this.prisma.utilisateur.findFirst({
        where: { email: dto.email, id: { not: utilisateur.id } },
        select: { id: true },
      });
      if (occupe) {
        throw new ConflictException('Cette adresse e-mail est déjà utilisée.');
      }
    }

    const modifie = await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: {
        nomComplet: dto.nomComplet,
        // Changer d'e-mail invalide la vérification précédente.
        email: dto.email,
        emailVerifieLe: dto.email ? null : undefined,
        adresse: dto.adresse,
        commune: dto.commune,
      },
      select: {
        id: true, nomComplet: true, telephone: true, email: true,
        adresse: true, commune: true,
      },
    });

    await this.audit.enregistrer({
      utilisateurId: utilisateur.id,
      action: 'profil.modification',
      entiteType: 'utilisateur',
      entiteId: utilisateur.id,
      donneesApres: {
        champsModifies: Object.keys(dto).filter(
          (c) => dto[c as keyof ModifierProfilDto] !== undefined,
        ),
      },
    });

    return modifie;
  }
}
