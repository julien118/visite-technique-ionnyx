// =============================================================
// Métrés vocaux — mapping dictée → quantités (anti-hallucination)
// =============================================================
// Adapté à la maçonnerie PLATE d'Hendrix (pas de rôles « façade » d'ATG) : on donne
// à Claude la liste indexée des postes du devis (libellé + unité) et la dictée ; il
// renvoie, POUR DES POSTES EXISTANTS UNIQUEMENT, une quantité. Le CODE applique
// (validation index + nombre ≥ 0). Claude ne calcule aucun total.

import { anthropic, MODELE_CLAUDE } from '../anthropic'
import type { SectionDevis } from '../types'

interface ItemPoste {
  index: number
  sIdx: number
  aIdx: number
  libelle: string
  unite: string
}

export async function parserMetresVocal(
  transcription: string,
  sections: SectionDevis[],
): Promise<SectionDevis[]> {
  if (!transcription.trim()) return sections

  const items: ItemPoste[] = []
  sections.forEach((s, sIdx) =>
    s.articles.forEach((a, aIdx) => {
      items.push({ index: items.length, sIdx, aIdx, libelle: a.libelle, unite: a.unite })
    }),
  )
  if (items.length === 0) return sections

  const liste = items.map((it) => ({ index: it.index, libelle: it.libelle, unite: it.unite }))
  const prompt = `Tu remplis les QUANTITÉS (métrés) des postes d'un devis de maçonnerie, à partir d'une dictée faite sur le chantier par l'artisan. Ton objectif : remplir le PLUS de postes possible sans jamais inventer.

DICTÉE (transcription brute, peut être approximative) :
---
${transcription}
---

POSTES DU DEVIS (index, libellé, unité — SEULS postes autorisés) :
${JSON.stringify(liste)}

RÈGLES (importantes) :
1. Associe chaque mesure dite au(x) poste(s) correspondant(s) en te basant sur le SENS du libellé (correspondance souple, tolère fautes/abréviations).
2. UNE mesure peut concerner PLUSIEURS postes. Ex : « un ensemble pour l'escalier et le panneau » → escalier = 1 ET panneau = 1. « 30 m² de dalle » où deux postes de dalle existent → applique 30 aux deux si la dictée les vise tous les deux.
3. FORFAITS (unité 'u', 'ens', 'fft') : si le poste est NOMMÉ ou clairement évoqué, mets la quantité dite ; si l'artisan dit « un »/« une »/« un ensemble » ou nomme le poste sans chiffre → quantité = 1. NE PAS ignorer un forfait qui est mentionné.
4. SURFACES/LONGUEURS/VOLUMES (m², ml, m, m³) : mets la valeur numérique dite (ex : « la terrasse fait 30 mètres carrés » → 30).
5. « les deux », « tout », « pareil pour… » → reporte la même valeur sur les postes visés.
6. Ne mets RIEN sur un poste que la dictée n'évoque pas (le laisser tel quel). Ne renvoie que des index de la liste. Ne calcule aucun total.

Réponds STRICTEMENT en JSON valide, sans aucun texte avant ou après :
{ "metres": [ { "index": <entier>, "quantite": <nombre> } ] }`

  const rep = await anthropic.messages.create({
    model: MODELE_CLAUDE,
    max_tokens: 2000,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })
  const texte = rep.content[0]?.type === 'text' ? (rep.content[0].text ?? '') : ''
  const match = texte.match(/\{[\s\S]*\}/)
  if (!match) return sections

  let parsed: { metres?: Array<{ index?: number; quantite?: number }> }
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return sections
  }

  const copie = sections.map((s) => ({ ...s, articles: s.articles.map((a) => ({ ...a })) }))
  for (const m of parsed.metres ?? []) {
    if (typeof m.index !== 'number') continue
    const it = items[m.index]
    if (!it) continue
    const q = m.quantite
    if (typeof q === 'number' && Number.isFinite(q) && q >= 0) {
      copie[it.sIdx].articles[it.aIdx].quantite = q
    }
  }
  return copie
}
