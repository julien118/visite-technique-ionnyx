// =============================================================
// Garde-fous de compte Costructor (MTC37) — module partagé
// =============================================================
// BASCULE PRODUCTION (02/07/2026) : un SEUL espace en prod, celui d'HENDRIX (MTC37).
// On y LIT tout (catalogue, bibliothèque, articles, devis passés, contacts) ET on y
// CRÉE les brouillons de devis.
//
//   - HENDRIX (défaut) : son compte MTC37. Lecture + écriture (brouillons de devis).
//   - JULIEN  (opt-in)  : ancien bac à sable de TEST. Ne sert QUE si l'on force
//     COSTRUCTOR_CIBLE=julien pour pousser un devis d'essai sans toucher sa prod.
//
// Source unique de vérité de la cible d'écriture : env COSTRUCTOR_CIBLE
// ('hendrix' par défaut). Toute écriture passe par assertCompteCible().
//
// Module volontairement sans dépendance runtime (lit seulement process.env) pour
// être importé partout sans cycle. CompteCostructor est un import de TYPE (effacé
// à la compilation).

import type { CompteCostructor } from './types'

// Clé de l'espace d'Hendrix (MTC37) — désormais LECTURE **et** ÉCRITURE : source du
// « déjà chiffré » (catalogue + devis passés) ET compte où l'on crée les brouillons.
export function cleHendrix(): string {
  const k = process.env.COSTRUCTOR_API_KEY_HENDRIX
  if (!k) throw new Error('COSTRUCTOR_API_KEY_HENDRIX manquante dans .env.local')
  return k
}

// Cible d'écriture courante. 'hendrix' (défaut) = son compte MTC37 (production) ;
// 'julien' = ancien bac à sable de test (opt-in explicite COSTRUCTOR_CIBLE=julien).
export function compteCibleCostructor(): CompteCostructor {
  return process.env.COSTRUCTOR_CIBLE === 'julien' ? 'julien' : 'hendrix'
}

// Clé du compte CIBLE (écriture + lecture de SES taxes/contacts). Selon la cible :
// 'hendrix' (défaut) → la clé d'Hendrix ; 'julien' → COSTRUCTOR_API_KEY (test).
export function cleCible(): string {
  if (compteCibleCostructor() === 'hendrix') return cleHendrix()
  const k = process.env.COSTRUCTOR_API_KEY
  if (!k)
    throw new Error(
      'COSTRUCTOR_API_KEY (bac à sable de Julien) manquante alors que COSTRUCTOR_CIBLE=julien',
    )
  return k
}

// Renvoie la clé d'ÉCRITURE après vérification de cohérence clé/cible. Toute
// fonction qui ÉCRIT (POST/DELETE) DOIT passer par là.
//   - Cible 'hendrix' (défaut, PRODUCTION) : on écrit sur son compte MTC37 — normal.
//   - Cible 'julien' (bac à sable) : la clé d'écriture NE DOIT PAS être celle
//     d'Hendrix. Si COSTRUCTOR_API_KEY == COSTRUCTOR_API_KEY_HENDRIX → STOP (sinon
//     un « test » écrirait dans sa prod).
export function assertCompteCible(): string {
  const cible = compteCibleCostructor()
  const keyHendrix = process.env.COSTRUCTOR_API_KEY_HENDRIX
  const keyCible = cleCible()
  if (cible !== 'hendrix' && keyHendrix && keyCible === keyHendrix) {
    throw new Error(
      "STOP : la clé d'écriture est celle d'HENDRIX alors que la cible n'est pas " +
        '« hendrix ». Aucune écriture autorisée sur son espace tant que la bascule ' +
        '(COSTRUCTOR_CIBLE=hendrix) n\'a pas été faite délibérément.',
    )
  }
  return keyCible
}

// Refuse de pousser un snapshot lu sur un compte vers un AUTRE compte (les ids
// produit/taxe sont propres au compte). En lignes libres ce risque n'existe pas,
// mais on garde la garde pour le jour où l'on référencera des ids.
export function assertSnapshotCoherentAvecCible(snapshot: { compte?: CompteCostructor }): void {
  const source = snapshot.compte ?? 'julien'
  const cible = compteCibleCostructor()
  if (source !== cible) {
    throw new Error(
      `Snapshot lu sur « ${source} » mais écriture visant « ${cible} ». ` +
        'Les ids produit/taxe sont propres au compte.',
    )
  }
}

export function bannerCompte(action: 'LECTURE' | 'ÉCRITURE'): void {
  const cible = compteCibleCostructor()
  const libelle = cible === 'hendrix' ? 'HENDRIX / MTC37 (production)' : 'JULIEN (bac à sable de test)'
  // eslint-disable-next-line no-console
  console.log(`[costructor] ${action} — compte cible : ${libelle}`)
}
