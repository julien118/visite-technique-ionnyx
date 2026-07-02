// Réordonnancement des sections d'un devis (pur, sans effet de bord).
import type { SectionDevis } from '../types'

// Déplace la section `from` vers l'index `to`. Renvoie le MÊME tableau (référence)
// si le déplacement est un no-op ou hors bornes (permet un court-circuit côté appelant).
export function deplacerSection(sections: SectionDevis[], from: number, to: number): SectionDevis[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= sections.length ||
    to >= sections.length
  ) {
    return sections
  }
  const copie = [...sections]
  const [item] = copie.splice(from, 1)
  copie.splice(to, 0, item)
  return copie
}
