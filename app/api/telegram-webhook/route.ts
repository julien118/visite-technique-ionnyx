// =============================================================
// /api/telegram-webhook — réponses de Julien (Telegram → app)
// =============================================================
// Telegram appelle cette route quand un message arrive dans la discussion du bot.
// On ne traite que les RÉPONSES (reply) à un message de ticket : on retrouve le
// fil par message.reply_to_message.message_id == ticket_messages.telegram_message_id,
// et on y écrit la réponse de Julien. Le client la voit dans « Mes demandes ».
//
// Route PUBLIQUE (Telegram n'a pas de cookie de session ; côté MTC37 le matcher
// du middleware exclut déjà /api). Sa sécurité repose sur le secret token :
// Telegram renvoie TELEGRAM_WEBHOOK_SECRET dans l'en-tête
// x-telegram-bot-api-secret-token (configuré au setWebhook). On vérifie aussi que
// le message vient bien de TELEGRAM_CHAT_ID.
//
// Accès DB en SERVICE-ROLE (aucune session) → createAdminClient. On répond
// TOUJOURS 200 (sauf secret invalide) : un non-200 ferait re-essayer Telegram.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegram, nomContact, answerCallback, editClavier } from '@/lib/notify'
import { clavierTicketPris } from '@/lib/ticket-telegram'
import { uploadTicketPhoto } from '@/lib/ticket-photos'
import { fetchRetry } from '@/lib/fetch-retry'
import { reportError } from '@/lib/monitoring'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ok = () => NextResponse.json({ ok: true })

// Répond l'id du salon courant (+ l'id du fil/topic si on est dans un groupe forum).
// Aide au setup : envoyer « /chatid » DANS le fil dédié au client donne directement
// TELEGRAM_CHAT_ID (le groupe) et TELEGRAM_TOPIC_ID (le fil). Best-effort.
async function repondreChatId(chatId: string | number, threadId?: number): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) return
  const lignes = [`🆔 Chat ID (TELEGRAM_CHAT_ID) : ${chatId}`]
  if (threadId) lignes.push(`🧵 Topic ID (TELEGRAM_TOPIC_ID) : ${threadId}`)
  else lignes.push('(envoyez /chatid DANS un fil pour obtenir aussi le Topic ID)')
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        ...(threadId ? { message_thread_id: threadId } : {}),
        text: lignes.join('\n'),
      }),
    })
  } catch {
    // best-effort
  }
}

// Télécharge un vocal Telegram (file_id) et le transcrit (Groq Whisper). Renvoie
// le texte, ou '' en cas d'échec. Les vocaux Telegram sont en OGG/OPUS, acceptés
// par Whisper. Best-effort : ne throw jamais.
async function transcrireVocalTelegram(fileId: string): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token || !process.env.GROQ_API_KEY) return ''
  try {
    const infoRes = await fetchRetry(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    )
    const info = await infoRes.json().catch(() => null)
    const filePath = info?.result?.file_path
    if (!filePath) return ''
    const dl = await fetchRetry(`https://api.telegram.org/file/bot${token}/${filePath}`, {}, { timeoutMs: 20000 })
    if (!dl.ok) return ''
    const buf = new Uint8Array(await dl.arrayBuffer())
    const fichier = new File([buf], 'reponse.ogg', { type: 'audio/ogg' })
    const form = new FormData()
    form.append('file', fichier, 'reponse.ogg')
    form.append('model', 'whisper-large-v3-turbo')
    form.append('language', 'fr')
    form.append('response_format', 'json')
    const res = await fetchRetry(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      { method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: form },
      { timeoutMs: 25000 },
    )
    if (!res.ok) return ''
    const data = await res.json().catch(() => null)
    return (data?.text ?? '').toString().trim()
  } catch (e) {
    await reportError('Transcription réponse vocale', e)
    return ''
  }
}

// Télécharge une photo Telegram (file_id) et l'uploade dans le bucket `photos`.
// Renvoie l'URL publique, ou null. Best-effort : ne throw jamais.
async function telechargerPhotoTelegram(fileId: string, ticketId: string): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) return null
  try {
    const infoRes = await fetchRetry(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    )
    const info = await infoRes.json().catch(() => null)
    const filePath = info?.result?.file_path
    if (!filePath) return null
    const dl = await fetchRetry(`https://api.telegram.org/file/bot${token}/${filePath}`, {}, { timeoutMs: 20000 })
    if (!dl.ok) return null
    const buf = new Uint8Array(await dl.arrayBuffer())
    const blob = new Blob([buf], { type: 'image/jpeg' })
    return await uploadTicketPhoto(blob, ticketId)
  } catch (e) {
    await reportError('Téléchargement photo Telegram', e)
    return null
  }
}

// Traite un CLIC de bouton inline (« 🙋 Je prends » / « ✅ Résolu »).
// callback_data = « prendre:<ticketId> » | « resolu:<ticketId> ». On édite le clavier
// du message pour que TOUT LE MONDE dans le groupe voie l'état (qui traite / résolu).
async function traiterClic(cb: {
  id: string
  data?: string
  from?: { first_name?: string; username?: string }
  message?: { message_id?: number; chat?: { id?: number | string } }
}): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()
  if (String(cb.message?.chat?.id ?? '') !== chatId) {
    await answerCallback(cb.id)
    return
  }
  const data = cb.data ?? ''
  const sep = data.indexOf(':')
  const action = sep > 0 ? data.slice(0, sep) : ''
  const ticketId = sep > 0 ? data.slice(sep + 1) : ''
  const messageId = cb.message?.message_id
  if (!ticketId || !messageId) {
    await answerCallback(cb.id)
    return
  }
  const prenom = (cb.from?.first_name || cb.from?.username || 'Quelqu’un').trim()
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  // Met à jour le ticket en VÉRIFIANT que l'écriture a réussi (1 retry sur blip réseau).
  // Renvoie false si la base n'a rien enregistré → on ne ment PAS au cliqueur.
  const majTicket = async (patch: Record<string, unknown>): Promise<boolean> => {
    for (let essai = 0; essai < 2; essai++) {
      const { error } = await admin.from('tickets').update(patch).eq('id', ticketId)
      if (!error) return true
      if (essai === 0) await new Promise((r) => setTimeout(r, 600))
    }
    return false
  }

  if (action === 'prendre') {
    const ok = await majTicket({ pris_par: prenom, pris_le: nowIso })
    if (!ok) {
      await reportError('Bouton « Je prends »', new Error('écriture base échouée'), `ticket ${ticketId}`)
      await answerCallback(cb.id, '⚠️ Échec d’enregistrement — réessaie dans un instant.')
      return
    }
    await editClavier(messageId, clavierTicketPris(ticketId, prenom))
    await answerCallback(cb.id, `C'est toi qui traites cette demande ✅`)
    return
  }
  if (action === 'resolu') {
    const ok = await majTicket({ statut: 'resolu', derniere_activite_le: nowIso })
    if (!ok) {
      // On NE retire PAS les boutons et on NE confirme PAS : la demande reste visible.
      await reportError('Bouton « Résolu »', new Error('écriture base échouée'), `ticket ${ticketId}`)
      await answerCallback(cb.id, '⚠️ Échec d’enregistrement — la demande reste ouverte, réessaie.')
      return
    }
    // Retire les boutons + confirme dans le groupe (visible par les deux).
    await editClavier(messageId, { inline_keyboard: [] })
    await sendTelegram(`✅ Demande marquée comme résolue par ${prenom}.`)
    await answerCallback(cb.id, 'Marqué comme résolu ✅')
    return
  }
  await answerCallback(cb.id)
}

export async function POST(request: Request) {
  // 1) Sécurité : secret token (configuré au setWebhook, renvoyé par Telegram).
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  const recu = request.headers.get('x-telegram-bot-api-secret-token')
  if (!secret || recu !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  try {
    const update = (await request.json().catch(() => ({}))) as {
      message?: {
        text?: string
        caption?: string
        chat?: { id?: number | string }
        message_thread_id?: number
        reply_to_message?: { message_id?: number }
        voice?: { file_id?: string }
        audio?: { file_id?: string }
        photo?: { file_id?: string }[]
      }
      callback_query?: {
        id: string
        data?: string
        from?: { first_name?: string; username?: string }
        message?: { message_id?: number; chat?: { id?: number | string } }
      }
    }

    // Clic sur un bouton inline (« Je prends » / « Résolu ») → traitement dédié.
    if (update?.callback_query) {
      await traiterClic(update.callback_query)
      return ok()
    }

    const msg = update?.message
    if (!msg) return ok()

    // Aide au setup : « /chatid » renvoie l'id du salon (le secret est déjà validé).
    if ((msg.text ?? '').trim().toLowerCase().startsWith('/chatid')) {
      await repondreChatId(msg.chat?.id ?? '', msg.message_thread_id)
      return ok()
    }

    const chatId = process.env.TELEGRAM_CHAT_ID?.trim()
    // 2) Garde-fous : bon chat, et c'est bien un reply.
    if (String(msg.chat?.id ?? '') !== chatId) return ok()
    const replyToId = msg.reply_to_message?.message_id
    if (!replyToId) return ok()

    // 3) Matching du fil par le message_id du message d'origine.
    const admin = createAdminClient()
    const { data: mm } = await admin
      .from('ticket_messages')
      .select('ticket_id')
      .eq('telegram_message_id', replyToId)
      .maybeSingle()
    if (!mm) return ok()
    const ticketId = mm.ticket_id as string
    const nowIso = new Date().toISOString()

    // 4) Commande de clôture : « /resolu » en réponse à un message du fil.
    const texteReply = (msg.text ?? '').trim()
    if (/^\/(resolu|resolue|ferme|close)\b/i.test(texteReply)) {
      await admin
        .from('tickets')
        .update({ statut: 'resolu', derniere_activite_le: nowIso })
        .eq('id', ticketId)
      await sendTelegram('✅ Demande marquée comme résolue.')
      return ok()
    }

    // 5) Réponse = texte/caption, OU vocal transcrit, OU photo. On AJOUTE au fil.
    // Photo de Julien ? On prend la plus grande taille (dernier élément du tableau).
    let photoUrl: string | null = null
    const photoFileId =
      Array.isArray(msg.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1]?.file_id : undefined
    if (photoFileId) photoUrl = await telechargerPhotoTelegram(photoFileId, ticketId)

    let reponseTexte = texteReply || (msg.caption ?? '').trim()
    let estVocal = false
    let vocalTranscrit = false
    const fileId = msg.voice?.file_id || msg.audio?.file_id
    if (!reponseTexte && fileId) {
      estVocal = true
      reponseTexte = await transcrireVocalTelegram(fileId)
      vocalTranscrit = !!reponseTexte
      // Transcription échouée (réseau) : on n'ABANDONNE PAS la réponse — on insère un
      // repli pour qu'Hendrix sache que Julien a répondu vocalement (message jamais perdu).
      if (!reponseTexte) reponseTexte = '🎤 Réponse vocale de Julien (transcription momentanément indisponible).'
    }
    // Rien d'exploitable (ni texte/vocal, ni photo) → on ignore.
    if (!reponseTexte && !photoUrl) return ok()
    if (!reponseTexte) reponseTexte = '📷 Photo'

    await admin.from('ticket_messages').insert({
      ticket_id: ticketId,
      auteur: 'julien',
      texte: reponseTexte.slice(0, 8000),
      image_url: photoUrl,
    })
    // Le fil redevient ouvert (relance) + remonte + pastille non-lu côté client.
    await admin
      .from('tickets')
      .update({ statut: 'ouvert', lu_par_client: false, derniere_activite_le: nowIso })
      .eq('id', ticketId)

    // 6) Accusé de réception à Julien (best-effort).
    await sendTelegram(
      photoUrl
        ? `✅ Photo transmise à ${nomContact()}.`
        : estVocal
          ? vocalTranscrit
            ? `✅ Réponse vocale transcrite et transmise à ${nomContact()}.`
            : `⚠️ Vocal transmis à ${nomContact()} (transcription indisponible cette fois).`
          : `✅ Réponse transmise à ${nomContact()}.`,
    )
    return ok()
  } catch (e) {
    console.error('[api/telegram-webhook]', e)
    await reportError('Webhook Telegram', e)
    // 200 quand même : sinon Telegram retry en boucle.
    return ok()
  }
}
