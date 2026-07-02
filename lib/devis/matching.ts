// =============================================================
// Matching de typologie — retrouve le « déjà chiffré » similaire
// =============================================================
// À partir du SIGNAL (objet des travaux + dictée + observations du rapport), on
// retrouve dans l'index des devis passés ceux qui traitent une typologie proche,
// par recouvrement de mots-clés. Robuste aux variantes de saisie (normalisation).
// Aucun appel réseau ni IA : pur calcul.

import { jetonsSignificatifs } from '../assistant/matching-nom'
import type { DevisReference } from '../types'

export interface ChoixDevisReference {
  meilleur: DevisReference | null // le plus proche
  meilleurs: DevisReference[] // top des plus proches (seed du prompt, score > 0)
  score: number // recouvrement du meilleur
  ambigu: boolean // vrai si 2 devis ex æquo en tête
  alternatives: Array<{ id: string; nom: string; score: number }>
}

const MAX_SEED = 3 // nb de devis de référence injectés dans le prompt

// Choisit les devis passés les plus proches du signal. Le score = nombre de jetons
// significatifs du signal présents dans les mots-clés du devis (typologie + ouvrages),
// départage par richesse (nb d'ouvrages).
export function choisirDevisReference(
  signal: string,
  references: DevisReference[],
): ChoixDevisReference {
  const jetonsSignal = Array.from(new Set(jetonsSignificatifs(signal)))
  if (jetonsSignal.length === 0 || references.length === 0) {
    return { meilleur: null, meilleurs: [], score: 0, ambigu: false, alternatives: [] }
  }

  const scored = references
    .map((ref) => {
      const motsRef = new Set(ref.mots_cles)
      let inter = 0
      for (const j of jetonsSignal) if (motsRef.has(j)) inter++
      return { ref, score: inter }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.ref.ouvrages.length - a.ref.ouvrages.length)

  const meilleur = scored[0] ?? null
  const second = scored[1] ?? null

  return {
    meilleur: meilleur?.ref ?? null,
    meilleurs: scored.slice(0, MAX_SEED).map((s) => s.ref),
    score: meilleur?.score ?? 0,
    ambigu: !!second && !!meilleur && second.score === meilleur.score,
    alternatives: scored.slice(0, 5).map((s) => ({ id: s.ref.id, nom: s.ref.nom, score: s.score })),
  }
}
