// =============================================================
// Boucle d'auto-apprentissage de l'assistant
// =============================================================
// Trois briques, autour de la table `assistant_interactions` (migration 012) :
//   1. enregistrerInteraction  → journalise CHAQUE échange (question + domaine +
//      réponse), renvoie l'id (pour rattacher le feedback côté UI).
//   2. enregistrerFeedback     → pose le 👍 (+1) / 👎 (-1) sur un échange.
//   3. memoireApprentissage    → construit un bloc texte réinjecté dans le prompt
//      de rédaction : ce que l'artisan a apprécié / pas apprécié / consulte le plus.
//      C'est CE bloc qui rend l'assistant « de plus en plus pertinent » avec l'usage.
//
// ⚠️ La mémoire porte sur la FORME et la PERTINENCE (préférences), JAMAIS sur les
// faits : la chaîne anti-hallucination reste intacte (les faits viennent du code).
//
// Écritures via le service-role (pas de dépendance à la session dans les domaines),
// AVEC un garde-fou `user_id` explicite → isolation multi-user préservée. Tout est
// best-effort : si la table n'existe pas encore (migration non appliquée) ou qu'une
// requête échoue, on renvoie null/'' et l'assistant continue de répondre normalement.

import { createAdminClient } from '../supabase/admin'

const LIBELLE_DOMAINE: Record<string, string> = {
  comptes_rendus: 'comptes rendus de visite',
  devis: 'devis',
  clients: 'coordonnées clients',
  recap_client: 'récaps clients',
}

// --- 1) Journaliser un échange -------------------------------------------------
export async function enregistrerInteraction(a: {
  userId: string
  question: string
  domaine: string
  reponse: string
}): Promise<string | null> {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('assistant_interactions')
      .insert({
        user_id: a.userId,
        question: a.question.slice(0, 2000),
        domaine: a.domaine,
        reponse: a.reponse.slice(0, 4000),
      })
      .select('id')
      .single()
    if (error) return null
    return (data?.id as string | undefined) ?? null
  } catch {
    return null
  }
}

// --- 2) Poser un feedback 👍 / 👎 ----------------------------------------------
export async function enregistrerFeedback(a: {
  userId: string
  interactionId: string
  feedback: -1 | 0 | 1
}): Promise<boolean> {
  try {
    const sb = createAdminClient()
    const { error } = await sb
      .from('assistant_interactions')
      .update({ feedback: a.feedback })
      .eq('id', a.interactionId)
      .eq('user_id', a.userId) // garde-fou : on ne modifie QUE ses propres échanges
    return !error
  } catch {
    return false
  }
}

// --- 3) Mémoire réinjectée dans le prompt --------------------------------------
function court(s: string | null | undefined, n: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n).trimEnd()}…` : t
}

export async function memoireApprentissage(userId: string): Promise<string> {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('assistant_interactions')
      .select('question, reponse, domaine, feedback, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(150)
    if (error || !data || data.length === 0) return ''

    type Ligne = { question: string | null; reponse: string | null; domaine: string | null; feedback: number | null }
    const rows = data as Ligne[]

    const aimees = rows.filter((d) => d.feedback === 1).slice(0, 6)
    const rejetees = rows.filter((d) => d.feedback === -1).slice(0, 6)

    // Sujets les plus consultés (hors « inconnu »).
    const parDomaine = new Map<string, number>()
    for (const d of rows) {
      const k = String(d.domaine ?? 'inconnu')
      if (k === 'inconnu') continue
      parDomaine.set(k, (parDomaine.get(k) ?? 0) + 1)
    }
    const topSujets = Array.from(parDomaine.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, n]) => `${LIBELLE_DOMAINE[k] ?? k} (${n})`)

    const lignes: string[] = []
    if (aimees.length) {
      lignes.push(
        "Réponses qu'il a APPRÉCIÉES (👍) — reproduis ce niveau d'utilité, de concision et de structure :",
        ...aimees.map((d) => `  • à « ${court(d.question, 80)} » → « ${court(d.reponse, 130)} »`),
      )
    }
    if (rejetees.length) {
      lignes.push(
        "Réponses qu'il N'A PAS aimées (👎) — sur ce type de demande, fais MIEUX (plus précis, plus court, mieux ciblé) :",
        ...rejetees.map((d) => `  • à « ${court(d.question, 80)} » → « ${court(d.reponse, 130)} »`),
      )
    }
    if (topSujets.length) {
      lignes.push(`Sujets qu'il consulte le plus souvent : ${topSujets.join(', ')}.`)
    }
    if (lignes.length === 0) return ''

    return `MÉMOIRE D'APPRENTISSAGE (préférences de FORME et de PERTINENCE de l'artisan — ne t'en sers JAMAIS pour inventer une donnée, uniquement pour mieux formuler) :
${lignes.join('\n')}`
  } catch {
    return ''
  }
}
