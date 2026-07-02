// =============================================================
// POST /api/tickets/[id]/messages — le client relance dans un fil
// =============================================================
// Ajoute un message du client au fil (texte + vocal OGG optionnel), rouvre le fil,
// et le transmet à Julien sur Telegram (en réponse au dernier message du fil pour
// le threader). Mémorise le message_id. MULTI-USER : client session + RLS.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTelegramAvecId, sendTelegramFichierAudio, sendTelegramPhoto } from '@/lib/notify'
import { uploadTicketPhoto } from '@/lib/ticket-photos'
import { formaterRelanceClient } from '@/lib/ticket-telegram'
import { reportError } from '@/lib/monitoring'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function lireCorps(request: Request): Promise<{ message: string; audio: Blob | null; photo: Blob | null }> {
  const ct = request.headers.get('content-type') || ''
  if (ct.includes('multipart/form-data')) {
    const form = await request.formData()
    const a = form.get('audio')
    const p = form.get('photo')
    return {
      message: String(form.get('message') ?? ''),
      audio: a instanceof Blob && a.size > 0 ? a : null,
      photo: p instanceof Blob && p.size > 0 ? p : null,
    }
  }
  const body = (await request.json().catch(() => ({}))) as { message?: unknown }
  return { message: String(body.message ?? ''), audio: null, photo: null }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { message: raw, audio, photo } = await lireCorps(request)
    let message = raw.trim().slice(0, 4000)
    if (!message && audio) message = '🎤 Message vocal'
    if (!message && photo) message = '📷 Photo'
    if (!message) return NextResponse.json({ error: 'message_vide' }, { status: 400 })

    // Photo jointe : upload dans le bucket public `photos`.
    let photoUrl: string | null = null
    if (photo) photoUrl = await uploadTicketPhoto(photo, ticket.id)

    // Dernier message du fil déjà posté sur Telegram → on y répond (threading).
    const { data: dernier } = await supabase
      .from('ticket_messages')
      .select('telegram_message_id')
      .eq('ticket_id', ticket.id)
      .not('telegram_message_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const replyTo = dernier?.telegram_message_id ?? undefined

    const messageId = await sendTelegramAvecId(formaterRelanceClient(ticket.titre, message), replyTo)
    await supabase.from('ticket_messages').insert({
      ticket_id: ticket.id,
      auteur: 'olivier',
      texte: message,
      telegram_message_id: messageId,
      image_url: photoUrl,
    })
    await supabase
      .from('tickets')
      .update({ statut: 'ouvert', derniere_activite_le: new Date().toISOString() })
      .eq('id', ticket.id)

    if (photoUrl) await sendTelegramPhoto(photoUrl, undefined, messageId ?? replyTo)

    if (audio) {
      const ext = (audio.type || '').includes('ogg') ? 'ogg' : 'webm'
      await sendTelegramFichierAudio(audio, `message-vocal.${ext}`, messageId ?? replyTo)
    }

    return NextResponse.json({ ok: true, notifEnvoyee: messageId !== null }, { status: 201 })
  } catch (e) {
    console.error('[api/tickets/[id]/messages POST]', e)
    await reportError('Relance ticket (client)', e)
    return NextResponse.json({ error: 'envoi_impossible' }, { status: 500 })
  }
}
