// =============================================================
// POST /api/devis/nom
// =============================================================
// Enregistre le nom (titre) du devis choisi par Hendrix sur le récapitulatif.
// MULTI-USER (session + RLS). Body : { devisId, nom }.

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

    const { devisId, nom } = (await request.json().catch(() => ({}))) as {
      devisId?: string
      nom?: string
    }
    if (!devisId) return NextResponse.json({ error: 'devisId manquant' }, { status: 400 })

    const valeur = (nom ?? '').trim().slice(0, 200) || null
    const { error } = await supabase
      .from('devis')
      .update({ nom: valeur })
      .eq('id', devisId)
      .eq('user_id', user.id)
    if (error) throw error
    return NextResponse.json({ ok: true, nom: valeur })
  } catch (e) {
    console.error('[api/devis/nom]', e)
    await reportError('Nom devis', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
