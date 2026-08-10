/**
 * Tests unitaires du service de gabarit.
 *
 * La conversion des montants en toutes lettres figure dans un acte juridique :
 * une erreur d'accord y est visible et décrédibilise le document. Les règles
 * du français sur « cent », « vingt » et « mille » sont donc testées une à une.
 *
 * Auteur : DIABATE Oumarou — Chef de Service Customer Support N1, DATACONNECT AFRICA
 * Date   : 10 août 2026
 */
import { InternalServerErrorException } from '@nestjs/common';
import { GabaritService } from '../../apps/api/src/modules/contrats/gabarit.service';

describe('GabaritService', () => {
  let service: GabaritService;

  beforeEach(() => {
    service = new GabaritService();
  });

  describe('formatage des montants', () => {
    it('groupe les milliers par espaces', () => {
      expect(service.formaterMontant(150000n)).toBe('150 000');
      expect(service.formaterMontant(45000000n)).toBe('45 000 000');
    });

    it('laisse intacts les montants courts', () => {
      expect(service.formaterMontant(0n)).toBe('0');
      expect(service.formaterMontant(750n)).toBe('750');
    });

    it('préserve la précision au-delà de 2^53', () => {
      // Un Number perdrait ici en précision ; le BigInt doit être exact.
      expect(service.formaterMontant(9007199254740993n)).toBe('9 007 199 254 740 993');
    });
  });

  describe('montants en toutes lettres', () => {
    it('gère zéro et les unités', () => {
      expect(service.montantEnLettres(0n)).toBe('zéro');
      expect(service.montantEnLettres(1n)).toBe('un');
      expect(service.montantEnLettres(17n)).toBe('dix-sept');
    });

    it('applique la liaison « et un »', () => {
      expect(service.montantEnLettres(21n)).toBe('vingt et un');
      expect(service.montantEnLettres(31n)).toBe('trente et un');
    });

    it('gère les irrégularités de 70 et 90', () => {
      expect(service.montantEnLettres(70n)).toBe('soixante-dix');
      expect(service.montantEnLettres(71n)).toBe('soixante-onze');
      expect(service.montantEnLettres(90n)).toBe('quatre-vingt-dix');
      expect(service.montantEnLettres(91n)).toBe('quatre-vingt-onze');
    });

    it('accorde « quatre-vingts » seulement en fin de nombre', () => {
      expect(service.montantEnLettres(80n)).toBe('quatre-vingts');
      expect(service.montantEnLettres(81n)).toBe('quatre-vingt-un');
      // Devant un multiplicateur, « vingt » redevient invariable.
      expect(service.montantEnLettres(80000n)).toBe('quatre-vingt mille');
    });

    it('accorde « cent » seulement quand il termine le nombre', () => {
      expect(service.montantEnLettres(100n)).toBe('cent');
      expect(service.montantEnLettres(200n)).toBe('deux cents');
      // Suivi d'un autre nombre, « cent » reste invariable.
      expect(service.montantEnLettres(250n)).toBe('deux cent cinquante');
      expect(service.montantEnLettres(300000n)).toBe('trois cent mille');
    });

    it('laisse « mille » invariable et sans « un » devant', () => {
      expect(service.montantEnLettres(1000n)).toBe('mille');
      expect(service.montantEnLettres(2000n)).toBe('deux mille');
    });

    it('compose les montants réalistes de loyers et cautions', () => {
      expect(service.montantEnLettres(150000n)).toBe('cent cinquante mille');
      expect(service.montantEnLettres(750000n)).toBe('sept cent cinquante mille');
    });

    it('gère millions et milliards pour les prix de vente', () => {
      expect(service.montantEnLettres(1000000n)).toBe('un million');
      expect(service.montantEnLettres(45000000n)).toBe('quarante-cinq millions');
      expect(service.montantEnLettres(1000000000n)).toBe('un milliard');
    });
  });

  describe('formatage des dates', () => {
    it('rend une date en toutes lettres françaises', () => {
      expect(service.formaterDate(new Date('2026-09-01T00:00:00Z'))).toMatch(/septembre 2026/);
    });

    it('remplace une date absente par un tiret', () => {
      expect(service.formaterDate(null)).toBe('—');
      expect(service.formaterDate(undefined)).toBe('—');
    });
  });

  describe('rendu du gabarit', () => {
    it('substitue les variables déclarées', () => {
      const rendu = service.rendre('Bail {{ref}} — loyer {{loyer}} FCFA', {
        ref: 'CTR-2026-000001',
        loyer: '150 000',
      });
      expect(rendu).toBe('Bail CTR-2026-000001 — loyer 150 000 FCFA');
    });

    it('substitue toutes les occurrences d’une même variable', () => {
      const rendu = service.rendre('{{nom}} et encore {{nom}}', { nom: 'Awa' });
      expect(rendu).toBe('Awa et encore Awa');
    });

    it('échappe le HTML pour ne pas casser le document', () => {
      const rendu = service.rendre('<p>{{adresse}}</p>', { adresse: 'Rue <A> & B "C"' });
      expect(rendu).toBe('<p>Rue &lt;A&gt; &amp; B &quot;C&quot;</p>');
    });

    it("refuse de générer si une variable manque", () => {
      // Un bail comportant « {{loyer_montant}} » serait contestable :
      // mieux vaut échouer à la génération.
      expect(() => service.rendre('Loyer {{loyer_montant}} FCFA', {})).toThrow(
        InternalServerErrorException,
      );
    });

    it('nomme les variables manquantes dans l’erreur', () => {
      expect(() => service.rendre('{{a}} {{b}} {{a}}', { b: 'ok' })).toThrow(/a/);
    });

    it('accepte un gabarit sans variable', () => {
      expect(service.rendre('Texte figé.', {})).toBe('Texte figé.');
    });
  });
});
