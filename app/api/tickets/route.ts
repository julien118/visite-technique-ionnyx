// =============================================================
// /api/tickets — fils de discussion support « Demander à Julien »
// =============================================================
// POST : le client ouvre une demande (texte + vocal OGG optionnel). On analyse
//   (catégorie + titre IA), on crée le ticket + le 1er message du fil, on notifie
//   Julien sur Telegram (en mémorisant le message_id pour matcher ses réponses),
//   et on lui transmet le vocal (bulle vocale native si OGG).
// GET  : liste compacte pour « Mes demandes » + compteur nonLus.
//
// MULTI-USER : accès via le CLIENT SESSION (RLS) → chaque user ne voit que ses
// propres tickets. On lit l'utilisateur via getUser (401 si pas de session) ;
// le webhook, lui, écrit en service-role (cf. /api/telegram-webhook).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { livrerTicketTelegram, sendTelegramFichierAudio, sendTelegramPhoto } from '@/lib/notify'
import { livrerNotifsEnAttente } from '@/lib/ticket-outbox'
import { uploadTicketPhoto } from '@/lib/ticket-photos'
import { formaterOuverture, clavierTicket } from '@/lib/ticket-telegram'
import { analyserMessage } from '@/lib/ticket-classifier'
import { reportError } from '@/lib/monitoring'
import type { TicketContexte, TicketResume, TicketStatut } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function nettoyerContexte(brut: unknown): TicketContexte {
  const c = (brut ?? {}) as Record<string, unknown>
  const str = (v: unknown, max: number): string | undefined => {
    const s = typeof v === 'string' ? v.trim() : ''
    return s ? s.slice(0, max) : undefined
  }
  const out: TicketContexte = {}
  const path = str(c.path, 200)
  const chantierId = str(c.chantierId, 36)
  const viewport = str(c.viewport, 20)
  const userAgent = str(c.userAgent, 200)
  if (path) out.path = path
  if (chantierId && UUID_RE.test(chantierId)) out.chantierId = chantierId
  if (viewport) out.viewport = viewport
  if (userAgent) out.userAgent = userAgent
  return out
}

function normaliserStatut(s: string | null): TicketStatut {
  return s === 'resolu' ? 'resolu' : 'ouvert'
}

// Lecture commune JSON / multipart (message + contexte + audio).
async function lireCorps(
  request: Request,
): Promise<{ message: string; contexte: unknown; audio: Blob | null; photo: Blob | null }> {
  const ct = request.headers.get('content-type') || ''
  if (ct.includes('multipart/form-data')) {
    const form = await request.formData()
    let contexte: unknown = {}
    try {
      contexte = JSON.parse(String(form.get('contexte') ?? '{}'))
    } catch {
      contexte = {}
    }
    const a = form.get('audio')
    const p = form.get('photo')
    return {
      message: String(form.get('message') ?? ''),
      contexte,
      audio: a instanceof Blob && a.size > 0 ? a : null,
      photo: p instanceof Blob && p.size > 0 ? p : null,
    }
  }
  const body = (await request.json().catch(() => ({}))) as { message?: unknown; contexte?: unknown }
  return { message: String(body.message ?? ''), contexte: body.contexte, audio: null, photo: null }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'non_authentifie' }, { status: 401 })

    const { message: messageRaw, contexte: contexteRaw, audio, photo } = await lireCorps(request)
    let message = messageRaw.trim().slice(0, 4000)
    if (!message && audio) message = '🎤 Message vocal'
    if (!message && photo) message = '📷 Photo'
    if (!message) return NextResponse.json({ error: 'message_vide' }, { status: 400 })

    const contexte = nettoyerContexte(contexteRaw)

    // Libellé du chantier courant (le client n'a que l'id). RLS : ne renvoie que
    // les chantiers du user → pas de fuite inter-comptes.
    if (contexte.chantierId) {
      const { data: chantier } = await supabase
        .from('chantiers')
        .select('client_nom')
        .eq('id', contexte.chantierId)
        .maybeSingle()
      if (chantier?.client_nom) contexte.chantierLabel = chantier.client_nom
    }

    // Analyse IA : rubrique + titre court (best-effort).
    const { categorie, titre } = await analyserMessage(message)
    const nowIso = new Date().toISOString()

    // Backlog : tout bug / toute amélioration entre automatiquement dans le backlog
    // produit (statut 'nouveau', priorité 'normale') → jamais perdu, géré dans Supabase.
    const versBacklog = categorie === 'probleme' || categorie === 'amelioration'

    const { data: ticket, error } = await supabase
      .from('tickets')
      .insert({
        user_id: user.id,
        chantier_id: contexte.chantierId ?? null,
        message,
        contexte,
        categorie,
        titre: titre || null,
        statut: 'ouvert',
        derniere_activite_le: nowIso,
        backlog_statut: versBacklog ? 'nouveau' : null,
        priorite: versBacklog ? 'normale' : null,
      })
      .select('id')
      .single()
    if (error || !ticket) {
      await reportError('Création ticket', error)
      return NextResponse.json({ error: 'creation_impossible' }, { status: 500 })
    }

    // Photo jointe : upload dans le bucket public `photos`, on garde l'URL.
    let photoUrl: string | null = null
    if (photo) photoUrl = await uploadTicketPhoto(photo, ticket.id)

    // Notif Telegram (avec titre + boutons « Je prends » / « Résolu ») et
    // mémorisation du message_id sur le 1er message du fil. Envoi résilient : fil dédié
    // puis repli dans le groupe si le fil pose problème.
    const messageId = await livrerTicketTelegram(
      formaterOuverture(titre || null, message, contexte),
      { clavier: clavierTicket(ticket.id) },
    )
    // Échec de l'envoi immédiat → la demande reste en file (message sans telegram_message_id)
    // et sera ré-expédiée automatiquement (GET suivant / cron). On alerte pour ne JAMAIS
    // échouer en silence — c'est ce qui manquait.
    if (messageId === null) {
      await reportError(
        'Notif ticket non livrée',
        new Error('Telegram injoignable à l’envoi immédiat'),
        `ticket ${ticket.id} — demande MISE EN FILE, re-livraison auto`,
      )
    }
    await supabase.from('ticket_messages').insert({
      ticket_id: ticket.id,
      auteur: 'client',
      texte: message,
      telegram_message_id: messageId,
      image_url: photoUrl,
    })

    // Photo → Telegram (en réponse au message du fil pour la rattacher).
    if (photoUrl) await sendTelegramPhoto(photoUrl, undefined, messageId ?? undefined)

    // Vocal du client → Telegram (bulle vocale si OGG ; sinon fichier).
    if (audio) {
      const ext = (audio.type || '').includes('ogg') ? 'ogg' : 'webm'
      await sendTelegramFichierAudio(audio, `message-vocal.${ext}`, messageId ?? undefined)
    }

    return NextResponse.json(
      { ok: true, id: ticket.id, notifEnvoyee: messageId !== null },
      { status: 201 },
    )
  } catch (e) {
    console.error('[api/tickets POST]', e)
    await reportError('Création ticket', e)
    return NextResponse.json({ error: 'creation_impossible' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ tickets: [], nonLus: 0 }, { status: 401 })

    // Filet de sécurité opportuniste : à chaque consultation (le widget « ? » poll ~30 s),
    // on ré-expédie les demandes qui n'auraient pas atterri sur Telegram. Best-effort et
    // borné (cas courant : 0 en attente → une requête indexée). Service-role car la
    // re-livraison sort du périmètre RLS de l'utilisateur.
    await livrerNotifsEnAttente(createAdminClient()).catch(() => {})

    // RLS filtre déjà par user → pas de .eq('user_id').
    const { data: tks } = await supabase
      .from('tickets')
      .select('id, categorie, statut, titre, message, lu_par_client, derniere_activite_le, created_at')
      .order('derniere_activite_le', { ascending: false, nullsFirst: false })
      .limit(80)

    const tickets = tks ?? []
    const ids = tickets.map((t) => t.id)

    // Agrégat des messages par fil (nombre + dernier auteur).
    const agg = new Map<string, { nb: number; last: string; auteur: 'client' | 'julien' }>()
    if (ids.length) {
      const { data: msgs } = await supabase
        .from('ticket_messages')
        .select('ticket_id, auteur, created_at')
        .in('ticket_id', ids)
      for (const m of msgs ?? []) {
        const e = agg.get(m.ticket_id)
        if (!e) {
          agg.set(m.ticket_id, { nb: 1, last: m.created_at, auteur: m.auteur })
        } else {
          e.nb += 1
          if (m.created_at > e.last) {
            e.last = m.created_at
            e.auteur = m.auteur
          }
        }
      }
    }

    const resumes: TicketResume[] = tickets.map((t) => {
      const a = agg.get(t.id)
      const apercu = t.titre?.trim() ? t.titre.trim() : (t.message ?? '').slice(0, 90)
      return {
        id: t.id,
        categorie: t.categorie,
        statut: normaliserStatut(t.statut),
        titre: t.titre,
        apercu,
        lu_par_client: t.lu_par_client,
        derniere_activite_le: t.derniere_activite_le ?? t.created_at,
        nb_messages: a?.nb ?? 0,
        dernier_auteur: a?.auteur ?? null,
      }
    })
    const nonLus = tickets.filter((t) => !t.lu_par_client).length
    return NextResponse.json(
      { tickets: resumes, nonLus },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch (e) {
    console.error('[api/tickets GET]', e)
    await reportError('Liste tickets', e)
    return NextResponse.json({ tickets: [], nonLus: 0 }, { status: 500 })
  }
}
