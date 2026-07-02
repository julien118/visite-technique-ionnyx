// =============================================================
// POST /api/devis/tva
// =============================================================
// Persiste le taux de TVA choisi sur le récapitulatif. MULTI-USER (session + RLS).
// Body : { devisId, tva_taux } (points de %, 0-100).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reportError } from '@/lib/monitoring'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'non_authentifie' }, { status: 401 })

    const { devisId, tva_taux } = (await request.json().catch(() => ({}))) as {
      devisId?: string
      tva_taux?: number
    }
    if (!devisId || typeof tva_taux !== 'number') {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }
    const taux = Math.round(Math.min(100, Math.max(0, tva_taux)) * 10) / 10
    const { error } = await supabase
      .from('devis')
      .update({ tva_taux: taux })
      .eq('id', devisId)
      .eq('user_id', user.id)
    if (error) throw error
    return NextResponse.json({ ok: true, tva_taux: taux })
  } catch (e) {
    console.error('[api/devis/tva]', e)
    await reportError('TVA devis', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
