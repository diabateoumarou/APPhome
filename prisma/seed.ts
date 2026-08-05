/**
 * Jeu de données initial : paramètres légaux, motifs de refus, équipements,
 * modèle de bail. Idempotent — exécutable plusieurs fois sans effet de bord.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1,
 *          DATACONNECT AFRICA · 05 août 2026
 */
import { PrismaClient, TypeModeleContrat } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Plafonds légaux — Côte d'Ivoire (loi n°2019-576) : 2 mois caution + 2 mois avance
  await prisma.parametreLegal.upsert({
    where: { pays: 'CI' },
    update: {},
    create: {
      pays: 'CI',
      cautionMaxMois: 2,
      avanceMaxMois: 2,
      totalEntreeMaxMois: 4,
      delaiRestitutionCautionJours: 30,
      preavisLocataireDefautJours: 30,
      preavisBailleurDefautJours: 90,
    },
  });

  // Motifs de refus licites (liste fermée — prévention des discriminations)
  const motifs = [
    ['dossier_incomplet', 'Dossier incomplet malgré relance'],
    ['revenus_insuffisants', 'Revenus insuffisants au regard du loyer'],
    ['garant_absent', 'Absence de garant exigé pour ce bien'],
    ['bien_plus_disponible', 'Bien plus disponible'],
    ['autre_candidat_retenu', 'Autre candidature retenue'],
  ] as const;

  for (const [code, libelle] of motifs) {
    await prisma.motifRefus.upsert({ where: { code }, update: { libelle }, create: { code, libelle } });
  }

  // Équipements filtrables
  const equipements = [
    ['climatisation', 'Climatisation'],
    ['forage', 'Forage / puits'],
    ['groupe_electrogene', 'Groupe électrogène'],
    ['gardien', 'Gardien'],
    ['parking', 'Parking'],
    ['ascenseur', 'Ascenseur'],
    ['piscine', 'Piscine'],
    ['cuisine_equipee', 'Cuisine équipée'],
  ] as const;

  for (const [code, libelle] of equipements) {
    await prisma.equipement.upsert({ where: { code }, update: { libelle }, create: { code, libelle } });
  }

  // Modèle de bail plateforme (gabarit à variables {{...}})
  const gabarit = readFileSync(join(__dirname, 'templates', 'bail-habitation.html'), 'utf8');
  const existant = await prisma.modeleContrat.findFirst({
    where: { agenceId: null, type: TypeModeleContrat.bail_habitation, version: 1 },
  });
  if (!existant) {
    await prisma.modeleContrat.create({
      data: {
        agenceId: null,
        type: TypeModeleContrat.bail_habitation,
        contenuTemplate: gabarit,
        version: 1,
        actif: true,
      },
    });
  }

  console.log('Jeu de données initial appliqué.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
