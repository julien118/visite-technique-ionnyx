// =============================================================
// Analyse IA d'un ticket : thématique + titre court (serveur uniquement)
// =============================================================
// Un seul appel Claude qui renvoie la catégorie ET un titre court (3-6 mots),
// utilisés pour le tri par rubrique et l'aperçu des cartes. Best-effort : timeout
// court, repli modèle (MODEL_CHAIN), défaut {categorie:'autre', titre:''}, ne
// throw JAMAIS.
//
// MTC37 appelle l'API Anthropic en `fetch` brut (pas le SDK) — on réutilise la
// même chaîne de repli (MODEL_CHAIN) que la génération de rapport.

import { MODEL_CHAIN } from './openai'
import { normaliserCategorie, type CategorieCle } from './ticket-categories'

const SYSTEME = `Tu analyses un message de support envoyé par un artisan (utilisateur d'une app métier) à son développeur.

Réponds STRICTEMENT en JSON compact : {"categorie":"...","titre":"..."}
- categorie ∈ "probleme" | "amelioration" | "question" | "autre"
  · probleme : un bug, une erreur, quelque chose qui ne marche pas.
  · amelioration : une idée d'optimisation, une suggestion, une évolution/fonctionnalité.
  · question : une demande d'information ou d'aide.
  · autre : le reste.
- titre : un résumé TRÈS court du sujet, 3 à 6 mots, sans ponctuation finale, en français (ex. "Lenteur de connexion", "Photo qui ne s'upload pas").

Réponds UNIQUEMENT le JSON, rien d'autre.`

export async function analyserMessage(
  message: string,
): Promise<{ categorie: CategorieCle; titre: string }> {
  const texte = (message ?? '').trim()
  if (!texte) return { categorie: 'autre', titre: '' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    for (const model of MODEL_CHAIN) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 80,
          temperature: 0,
          system: SYSTEME,
          messages: [{ role: 'user', content: texte.slice(0, 1500) }],
        }),
        signal: controller.signal,
      })
      // Modèle retiré → on tente le suivant de la chaîne.
      if (res.status === 404) continue
      // Autre erreur → fail-open (le ticket part quand même, sans catégorie IA).
      if (!res.ok) return { categorie: 'autre', titre: '' }

      const data = await res.json().catch(() => null)
      const brut = data?.content?.[0]?.text ?? ''
      const m = typeof brut === 'string' ? brut.match(/\{[\s\S]*\}/) : null
      const obj = m ? (JSON.parse(m[0]) as { categorie?: string; titre?: string }) : {}
      const titre = (obj.titre ?? '').toString().trim().slice(0, 80)
      return { categorie: normaliserCategorie(obj.categorie), titre }
    }
    return { categorie: 'autre', titre: '' }
  } catch {
    return { categorie: 'autre', titre: '' }
  } finally {
    clearTimeout(timer)
  }
}
