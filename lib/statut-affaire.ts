// =============================================================
// Statut affiché d'une affaire — SOURCE DE VÉRITÉ UNIQUE
// =============================================================
// On NE modifie PAS l'ENUM `chantier_statut` en base. Le statut affiché (parmi 5)
// est DÉRIVÉ à la volée, en combinant trois signaux qui existent déjà :
//   - `chantierStatut` : l'ENUM existant (planifie | en_cours | termine | rapport_genere) ;
//   - `aCompteRendu`   : un compte rendu a-t-il été généré ? (côté MTC37 pré-Phase 3,
//                        on l'approxime par `statut === 'rapport_genere'`) ;
//   - `devisStatut`    : le statut du devis lié, ou null (Phase 3 ; null d'ici là).
//
// Fonction PURE (aucun accès base, aucun effet de bord) : l'unique endroit où la
// règle vit, pour éviter toute divergence. Tout l'affichage (badges, onglets)
// doit l'utiliser. Portée verbatim depuis ATG.

import type { ChantierStatut, DevisStatut } from './types'

// Les 5 statuts AFFICHÉS (distincts de l'ENUM base `chantier_statut`).
export type StatutAffiche =
  | 'planifie'
  | 'en_cours'
  | 'rapport_genere'
  | 'devis_en_cours'
  | 'devis_envoye'

// Les 2 grandes sections d'accueil.
export type SectionAffaire = 'visite_technique' | 'devis'

export interface EntreeStatut {
  chantierStatut: ChantierStatut
  aCompteRendu: boolean
  devisStatut: DevisStatut | null | undefined
}

// Dérive le statut affiché selon la cascade (du plus avancé au moins avancé) :
//   1. devis envoyé à Costructor           -> 'devis_envoye'
//   2. un devis existe (en cours/échec...)  -> 'devis_en_cours'
//   3. le compte rendu a été généré         -> 'rapport_genere'
//   4. la visite a démarré (en_cours/termine, ou legacy rapport_genere) -> 'en_cours'
//   5. sinon (juste planifié)               -> 'planifie'
export function deriverStatutAffiche(entree: EntreeStatut): StatutAffiche {
  const { chantierStatut, aCompteRendu, devisStatut } = entree
  if (devisStatut === 'pousse_costructor') return 'devis_envoye'
  if (devisStatut) return 'devis_en_cours'
  if (aCompteRendu) return 'rapport_genere'
  if (chantierStatut !== 'planifie') return 'en_cours'
  return 'planifie'
}

// À quelle section d'accueil appartient un statut affiché :
//   - Visite technique : Planifié, En cours, Rapport généré (les 3 premiers) ;
//   - Devis            : Devis en cours, Devis envoyé (les 2 derniers).
export function sectionDe(statut: StatutAffiche): SectionAffaire {
  return statut === 'devis_en_cours' || statut === 'devis_envoye'
    ? 'devis'
    : 'visite_technique'
}
