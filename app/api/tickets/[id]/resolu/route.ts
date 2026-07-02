// =============================================================
// POST /api/tickets/[id]/resolu — le client clôt un fil
// =============================================================
// Marque le fil comme résolu (archivé, toujours consultable) et prévient Julien
// sur Telegram. MULTI-USER : client session + RLS. (Julien, lui, clôt via
// « /resolu » en réponse sur Telegram, géré dans le webhook.)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTelegramAvecId, echapperHtml, nomContact } from '@/lib/notify'
import { reportError } from '@/lib/monitoring'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'non_authentifie' }, { status: 401 })

    const { data: ticket } = await supabase
      .from('tickets')
      .select('id, titre')
      .eq('id', id)
      .maybeSingle()
    if (!ticket) return NextResponse.json({ error: 'introuvable' }, { status: 404 })

    await supabase
      .from('tickets')
      .update({ statut: 'resolu', derniere_activite_le: new Date().toISOString() })
      .eq('id', ticket.id)

    const { data: dernier } = await supabase
      .from('ticket_messages')
      .select('telegram_message_id')
      .eq('ticket_id', ticket.id)
      .not('telegram_message_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const sujet = ticket.titre?.trim() ? `« ${ticket.titre.trim()} »` : 'cette demande'
    await sendTelegramAvecId(
      `✅ ${echapperHtml(nomContact())} a marqué ${echapperHtml(sujet)} comme résolue.`,
      dernier?.telegram_message_id ?? undefined,
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/tickets/[id]/resolu POST]', e)
    await reportError('Clôture ticket', e)
    return NextResponse.json({ error: 'erreur' }, { status: 500 })
  }
}
