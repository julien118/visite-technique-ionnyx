// =============================================================
// POST /api/assistant-devis/feedback
// =============================================================
// Pose un 👍 (+1) / 👎 (-1) sur un échange journalisé (table assistant_interactions).
// Body : { interactionId: string, feedback: 1 | -1 | 0 }. C'est le signal qui
// alimente la boucle d'apprentissage (réinjecté ensuite dans le prompt).
//
// MULTI-USER : session requise ; le garde-fou user_id (côté enregistrerFeedback)
// empêche de noter l'échange d'un autre compte. Best-effort côté UI (silencieux).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enregistrerFeedback } from '@/lib/assistant/apprentissage'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'non_authentifie' }, { status: 401 })

  const { interactionId, feedback } = (await request.json().catch(() => ({}))) as {
    interactionId?: string
    feedback?: number
  }
  if (!interactionId || typeof interactionId !== 'string') {
    return NextResponse.json({ error: 'interactionId manquant' }, { status: 400 })
  }
  if (feedback !== 1 && feedback !== -1 && feedback !== 0) {
    return NextResponse.json({ error: 'feedback invalide' }, { status: 400 })
  }

  const ok = await enregistrerFeedback({
    userId: user.id,
    interactionId,
    feedback: feedback as -1 | 0 | 1,
  })
  return NextResponse.json({ ok })
}
