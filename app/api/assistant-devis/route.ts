// =============================================================
// POST /api/assistant-devis
// =============================================================
// Assistant de consultation (LECTURE SEULE). Body : { question, dernierClient?,
// clientForce?, domaineForce?, historique? }. Passe par l'orchestrateur qui aiguille
// la question vers le bon domaine puis délègue. Aucune écriture.
//
// MULTI-USER : on récupère l'utilisateur via la session (401 sinon) et on transmet
// son `userId` à l'orchestrateur → chaque artisan ne consulte QUE ses données.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { repondreAssistant } from '@/lib/assistant/orchestrateur'
import { reportError } from '@/lib/monitoring'
import type { DomaineAssistant } from '@/lib/assistant/aiguilleur'
import { nettoyerHistorique } from '@/lib/assistant/historique'
import { enregistrerInteraction } from '@/lib/assistant/apprentissage'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'non_authentifie' }, { status: 401 })

    const { question, dernierClient, clientForce, domaineForce, historique } = (await request
      .json()
      .catch(() => ({}))) as {
      question?: string
      dernierClient?: string | null
      clientForce?: string | null
      domaineForce?: string | null
      historique?: unknown
    }
    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: 'Question manquante' }, { status: 400 })
    }

    // Date du jour côté serveur, pour interpréter les périodes relatives.
    const aujourdhui = new Date().toISOString().slice(0, 10)
    const { reponse, domaine, nb, clientContexte, candidats } = await repondreAssistant(
      question.trim(),
      aujourdhui,
      {
        userId: user.id,
        dernierClient: typeof dernierClient === 'string' ? dernierClient : null,
        clientForce: typeof clientForce === 'string' ? clientForce : null,
        domaineForce: typeof domaineForce === 'string' ? (domaineForce as DomaineAssistant) : null,
        historique: nettoyerHistorique(historique),
      },
    )

    // Boucle d'apprentissage : on journalise l'échange (best-effort, ne bloque
    // jamais la réponse) et on renvoie l'id → l'UI peut y rattacher un 👍/👎.
    const interactionId = await enregistrerInteraction({
      userId: user.id,
      question: question.trim(),
      domaine,
      reponse,
    })

    return NextResponse.json({ reponse, domaine, nb, clientContexte, candidats, interactionId })
  } catch (e) {
    console.error('[api/assistant-devis]', e)
    await reportError('Assistant', e)
    return NextResponse.json(
      { error: 'Désolé, une erreur est survenue. Réessayez dans un instant.' },
      { status: 500 },
    )
  }
}
