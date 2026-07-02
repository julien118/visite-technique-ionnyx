// =============================================================
// Proposer un devis structuré (moteur PLAT augmenté par « déjà chiffré »)
// =============================================================
// Croise : (1) ce que le maçon a observé (signal), (2) les ouvrages de ses devis
// passés similaires (référence forte = « déjà chiffré »), (3) sa bibliothèque
// (complément). Claude SÉLECTIONNE dans une liste fermée et RÉDIGE ; le code
// WHITELISTE (jamais d'id/prix inventé). Quantités laissées nulles (métrés après).

import { anthropic, MODELE_CLAUDE } from '../anthropic'
import { jetonsSignificatifs } from '../assistant/matching-nom'
import type {
  ArticleDevis,
  ArticleRemplacable,
  DevisReference,
  PropositionDevisIA,
  SectionDevis,
} from '../types'

// Un ouvrage présenté à Claude (liste fermée). `deja_chiffre` = vient d'un devis passé.
interface ArticleDisponible {
  id: string
  libelle: string
  unite: string
  prix: number
  description: string
  deja_chiffre: boolean
}

const MAX_CATALOGUE = 60 // nb d'ouvrages catalogue injectés (en plus du « déjà chiffré »)
const MAX_DESC = 200 // borne la taille des descriptions dans le prompt (allège l'appel Claude)

// Pré-sélection du catalogue par recouvrement de mots-clés avec le signal, complétée
// par les ouvrages les plus utilisés (filet). Évite d'injecter 660 ouvrages.
function preselectionnerCatalogue(signal: string, catalogue: ArticleRemplacable[]): ArticleRemplacable[] {
  const jetonsSignal = jetonsSignificatifs(signal) // tableau (itéré ci-dessous)
  const scored = catalogue.map((a) => {
    const motsArticle = new Set(
      jetonsSignificatifs(`${a.libelle} ${a.description_source ?? ''}`),
    )
    let score = 0
    for (const j of jetonsSignal) if (motsArticle.has(j)) score++
    return { a, score }
  })
  const pertinents = scored
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score || (y.a.uses ?? 0) - (x.a.uses ?? 0))
    .slice(0, MAX_CATALOGUE)
    .map((s) => s.a)

  // Filet : les ouvrages les + utilisés (installation chantier, etc.), même hors signal.
  const topUses = [...catalogue].sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0)).slice(0, 15)
  const parId = new Map<string, ArticleRemplacable>()
  for (const a of [...pertinents, ...topUses]) parId.set(a.costructor_article_id, a)
  return Array.from(parId.values())
}

// Construit la liste fermée d'ouvrages disponibles : « déjà chiffré » d'abord
// (prix du catalogue si connu, sinon prix du devis passé), puis catalogue.
function construireDisponibles(
  references: DevisReference[],
  catalogue: ArticleRemplacable[],
  preselection: ArticleRemplacable[],
): ArticleDisponible[] {
  const catalogueById = new Map(catalogue.map((a) => [a.costructor_article_id, a]))
  const parId = new Map<string, ArticleDisponible>()

  // 1) « déjà chiffré » : ouvrages des devis passés similaires (privilégiés).
  for (const ref of references) {
    for (const o of ref.ouvrages) {
      if (!o.product_id || parId.has(o.product_id)) continue
      const cat = catalogueById.get(o.product_id)
      parId.set(o.product_id, {
        id: o.product_id,
        libelle: (cat?.libelle || o.titre).slice(0, 90),
        unite: cat?.unite || o.unite,
        prix: cat?.prix_vente ?? o.prix_vente, // prix courant si connu, sinon prix passé
        description: (o.description || cat?.description_source || '').slice(0, MAX_DESC),
        deja_chiffre: true,
      })
    }
  }

  // 2) Complément : catalogue pré-sélectionné.
  for (const a of preselection) {
    if (parId.has(a.costructor_article_id)) continue
    parId.set(a.costructor_article_id, {
      id: a.costructor_article_id,
      libelle: a.libelle.slice(0, 90),
      unite: a.unite,
      prix: a.prix_vente,
      description: (a.description_source ?? '').slice(0, MAX_DESC),
      deja_chiffre: false,
    })
  }

  return Array.from(parId.values())
}

function buildPrompt(signal: string, disponibles: ArticleDisponible[]): string {
  const dispoJson = JSON.stringify(
    disponibles.map((d) => ({
      id: d.id,
      libelle: d.libelle,
      unite: d.unite,
      prix: d.prix,
      deja_chiffre: d.deja_chiffre,
      description: d.description,
    })),
  )

  return `Tu prépares la STRUCTURE d'un devis de MAÇONNERIE au style EXACT de l'entreprise (MTC37 / Hendrix).
Son style, observé sur ses vrais devis : chaque ouvrage = un TITRE court en MAJUSCULES, puis « La prestation comprend : » et des puces concrètes. Technique, précis, sobre.

CE QUE LE MAÇON A OBSERVÉ (visite terrain) :
---
${signal}
---

OUVRAGES DISPONIBLES (SEULE source autorisée — n'invente JAMAIS un ouvrage, un prix ou un id hors de cette liste).
Ceux marqués "deja_chiffre": true viennent de SES devis passés sur des chantiers similaires : PRIVILÉGIE-les, c'est sa façon habituelle de chiffrer ce type de travaux.
---
${dispoJson}
---

ÉTAPE 1 — STRUCTURE
- Sélectionne UNIQUEMENT les ouvrages correspondant à ce qui a été observé. Suis l'intention, ne devine pas (parpaing ≠ béton banché ; semelle filante ≠ radier ; rénovation ≠ neuf).
- Organise-les par PHASE de travaux, dans l'ordre d'intervention. Phases typiques (n'en crée pas sans ouvrage) : INSTALLATION DU CHANTIER, TERRASSEMENT, FONDATIONS, ÉLÉVATION / MAÇONNERIE, OUVERTURES, DALLE / PLANCHER, ENDUIT / ÉTANCHÉITÉ, ÉVACUATION / NETTOYAGE.
- AUCUNE quantité : "quantite": null (les métrés seront saisis par le pro ensuite).

ÉTAPE 2 — DESCRIPTION (adapte la sienne)
- Pars de la "description" de l'ouvrage choisi et ADAPTE-la au chantier observé (localisation, dimension, contrainte mentionnée). Conserve son format : titre + « La prestation comprend : » + puces courtes.
- N'invente AUCUNE dimension ni donnée non observée.
- INTERDIT : prix, durée, planning, nombre d'ouvriers, em-dash, remplissage générique ("dans les règles de l'art", "afin d'assurer").

FORMAT DE SORTIE : réponds STRICTEMENT en JSON valide, sans markdown, sans texte avant/après :
{
  "sections": [
    {
      "nom": "FONDATIONS",
      "articles": [
        {
          "costructor_article_id": "<id exact de la liste>",
          "libelle": "<libellé exact de la liste>",
          "unite": "<unité exacte de la liste>",
          "prix_vente": <prix exact de la liste>,
          "quantite": null,
          "description_technique": "Titre + La prestation comprend : …"
        }
      ]
    }
  ]
}`
}

export async function proposerDevis(args: {
  signal: string
  references: DevisReference[]
  catalogue: ArticleRemplacable[]
}): Promise<SectionDevis[]> {
  const { signal, references, catalogue } = args
  if (catalogue.length === 0) throw new Error('Catalogue Costructor vide (lecture /products).')
  if (!signal.trim()) throw new Error('Aucune observation à analyser.')

  const preselection = preselectionnerCatalogue(signal, catalogue)
  const disponibles = construireDisponibles(references, catalogue, preselection)
  const dispoById = new Map(disponibles.map((d) => [d.id, d]))

  const reponse = await anthropic.messages.create({
    model: MODELE_CLAUDE,
    max_tokens: 4500,
    messages: [{ role: 'user', content: buildPrompt(signal, disponibles) }],
  })
  const texte = reponse.content[0]?.type === 'text' ? (reponse.content[0].text ?? '') : ''
  const match = texte.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Aucun JSON trouvé dans la réponse Claude (proposer).')
  const parsed = JSON.parse(match[0]) as PropositionDevisIA

  // Whitelist serveur : on ne garde que les ouvrages d'id connu. unité/prix/libellé
  // recollés depuis la liste fermée (source de vérité), description conservée.
  const sections: SectionDevis[] = (parsed.sections ?? []).map((s) => ({
    nom: (s.nom ?? '').toString().trim() || 'TRAVAUX',
    articles: (s.articles ?? [])
      .map((a): ArticleDevis | null => {
        const dispo = dispoById.get(a.costructor_article_id)
        if (!dispo) {
          console.warn(`[proposer] ouvrage hors liste ignoré : ${a.libelle} (${a.costructor_article_id})`)
          return null
        }
        const desc = (a.description_technique ?? '').trim()
        return {
          costructor_article_id: dispo.id,
          libelle: dispo.libelle,
          unite: dispo.unite,
          prix_vente: dispo.prix,
          quantite: null,
          description_technique: desc || dispo.description || dispo.libelle,
          origine: dispo.deja_chiffre ? 'devis_passe' : 'catalogue',
        }
      })
      .filter((a): a is ArticleDevis => a !== null),
  }))

  // On élimine les sections vidées par la whitelist (pas de titre orphelin).
  return sections.filter((s) => s.articles.length > 0)
}
