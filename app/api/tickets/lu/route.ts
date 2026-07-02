// =============================================================
// /api/tickets/lu — marquer les réponses comme lues
// =============================================================
// Appelée quand le client ouvre « Mes demandes » (ou une conversation). Repasse
// ses réponses non lues à `lu_par_olivier = true` (éteint la pastille). Route
// dédiée pour que GET /api/tickets reste pur. MULTI-USER : client session + RLS.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reportError } from '@/lib/monitoring'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: unknown }
    const id = typeof body.id === 'string' ? body.id : null

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    // RLS limite déjà aux tickets du user.
    let q = supabase
      .from('tickets')
      .update({ lu_par_olivier: true })
      .eq('lu_par_olivier', false)
    if (id) q = q.eq('id', id)
    await q
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/tickets/lu POST]', e)
    await reportError('Marquage tickets lus', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
