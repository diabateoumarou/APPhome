/**
 * Relevé du coût d'entrée — signature de la plateforme.
 *
 * L'arithmétique est montrée plutôt que résumée : loyer × mois = caution,
 * loyer × mois = avance, frais, total. C'est la promesse « aucun frais caché »
 * rendue littérale, et le seul endroit où le détail du calcul apparaît.
 *
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 13 août 2026
 */
import { formaterFCFA, type Annonce } from '@/lib/api';

export function Releve({ annonce, reference }: { annonce: Annonce; reference?: string }) {
  const loyer = formaterFCFA(annonce.loyerMontant);
  const charges = annonce.chargesMontant !== '0' ? annonce.chargesMontant : null;

  const mensuel = charges
    ? String(BigInt(annonce.loyerMontant ?? '0') + BigInt(charges))
    : annonce.loyerMontant;

  return (
    <div className="releve">
      <div className="releve-entete">
        <span className="releve-titre">Ce qu&apos;il faut prévoir</span>
        {reference && <span className="releve-ref">{reference}</span>}
      </div>

      {annonce.cautionNbMois > 0 && (
        <div className="ligne">
          <span className="libelle">
            Caution
            <span className="calcul">
              {loyer} × {annonce.cautionNbMois} mois
              <span className="plafond">max légal</span>
            </span>
          </span>
          <span className="montant">{formaterFCFA(annonce.coutEntree.caution)}</span>
        </div>
      )}

      {annonce.avanceNbMois > 0 && (
        <div className="ligne">
          <span className="libelle">
            Avance sur loyer
            <span className="calcul">
              {loyer} × {annonce.avanceNbMois} mois
              <span className="plafond">max légal</span>
            </span>
          </span>
          <span className="montant">{formaterFCFA(annonce.coutEntree.avance)}</span>
        </div>
      )}

      {annonce.coutEntree.fraisAgence !== '0' && (
        <div className="ligne">
          <span className="libelle">
            Frais d&apos;agence
            <span className="calcul">forfait unique</span>
          </span>
          <span className="montant">{formaterFCFA(annonce.coutEntree.fraisAgence)}</span>
        </div>
      )}

      <div className="ligne ligne-total">
        <span className="libelle">À la signature</span>
        <span className="montant">{formaterFCFA(annonce.coutEntree.total)} F</span>
      </div>

      <p className="releve-note">
        Puis {formaterFCFA(mensuel)} F par mois
        {charges ? ', charges comprises' : ''}. Aucun autre frais ne peut vous être réclamé.
      </p>
    </div>
  );
}
