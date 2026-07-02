// =============================================================
// Totaux du devis — CALCUL DÉTERMINISTE (jamais par l'IA)
// =============================================================
// Étape « code calcule » de la chaîne anti-hallucination : les montants sont
// toujours calculés ici à partir des quantités saisies et des prix du catalogue,
// jamais produits par Claude.

import type { SectionDevis } from '../types'

// Total HT en euros (somme quantité × prix unitaire sur les articles chiffrés).
export function calculerTotalHT(sections: SectionDevis[]): number {
  let total = 0
  for (const section of sections) {
    for (const article of section.articles) {
      if (article.quantite != null) total += article.quantite * article.prix_vente
    }
  }
  return Math.round(total * 100) / 100
}

// Total TTC depuis le taux de TVA en points de % (défaut 10).
export function calculerTotalTTC(totalHT: number, tvaTaux = 10): number {
  return Math.round(totalHT * (1 + tvaTaux / 100) * 100) / 100
}
