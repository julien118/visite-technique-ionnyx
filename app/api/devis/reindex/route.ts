// =============================================================
// POST /api/devis/reindex
// =============================================================
// Construit (ou rafraîchit) l'index « déjà chiffré » des devis passés d'Hendrix
// HORS du chemin critique (l'indexation expand de nombreux devis → coûteuse à
// cause du rate-limit Costructor). À appeler une fois (dev) ou via un cron.
// MULTI-USER : nécessite une session (toute écriture Costructor exclue ici : lecture
// seule de l'espace d'Hendrix). Body : { max? }.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { construireIndexDevisPasses, persistIndex, statsIndex } from '@/lib/devis/index-devis-passes'
import { reportError } from '@/lib/monitoring'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'non_authentifie' }, { status: 401 })

    const { max } = (await request.json().catch(() => ({}))) as { max?: number }
    const refs = await construireIndexDevisPasses({ max: max ?? 200, force: true })
    await persistIndex(refs)
    return NextResponse.json({ ok: true, count: refs.length, stats: statsIndex() })
  } catch (e) {
    console.error('[api/devis/reindex]', e)
    await reportError('Reindex devis', e)
    return NextResponse.json({ error: 'Erreur indexation' }, { status: 500 })
  }
}
