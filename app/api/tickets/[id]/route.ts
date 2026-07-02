// =============================================================
// GET /api/tickets/[id] — détail d'un fil de discussion
// =============================================================
// Renvoie la meta du ticket + tous ses messages triés du plus ancien au plus
// récent. MULTI-USER : client session + RLS (le user ne lit que ses fils).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reportError } from '@/lib/monitoring'
import type { TicketDetail, TicketMessage, TicketStatut } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normaliserStatut(s: string | null): TicketStatut {
  return s === 'resolu' ? 'resolu' : 'ouvert'
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'non_authentifie' }, { status: 401 })

    const { data: t } = await supabase
      .from('tickets')
      .select('id, categorie, statut, titre, created_at')
      .eq('id', id)
      .maybeSingle()
    if (!t) return NextResponse.json({ error: 'introuvable' }, { status: 404 })

    const { data: msgs } = await supabase
      .from('ticket_messages')
      .select('id, auteur, texte, image_url, created_at')
      .eq('ticket_id', t.id)
      .order('created_at', { ascending: true })

    const detail: TicketDetail = {
      id: t.id,
      categorie: t.categorie,
      statut: normaliserStatut(t.statut),
      titre: t.titre,
      created_at: t.created_at,
      messages: (msgs ?? []) as TicketMessage[],
    }
    return NextResponse.json(
      { ticket: detail },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch (e) {
    console.error('[api/tickets/[id] GET]', e)
    await reportError('Détail ticket', e)
    return NextResponse.json({ error: 'erreur' }, { status: 500 })
  }
}
