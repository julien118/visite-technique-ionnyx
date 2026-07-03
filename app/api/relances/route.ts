// =============================================================
// /api/relances — relances automatiques + watchdog « zéro demande perdue »
// =============================================================
// Appelée TOUTES LES HEURES par un cron EXTERNE gratuit (cron-job.org / UptimeRobot),
// parce que Vercel Hobby ne permet qu'un cron/jour. Ce même appel sert aussi de
// SONDE DE VIE : si l'app est down, le cron externe reçoit un non-200 et alerte.
//
// À chaque passage (uniquement 8h→20h, heure de Paris — pas de bruit la nuit) :
//   1) RELANCE les fils ouverts, non pris, sans réponse depuis > 2h (toutes les ~2h).
//   2) WATCHDOG A — rattrape les demandes dont la notif Telegram a échoué (jamais
//      arrivée à Julien) : on re-notifie automatiquement. → aucune demande perdue.
//   3) WATCHDOG B — surveille le webhook Telegram (getWebhookInfo) : si Telegram
//      n'arrive plus à livrer (erreurs / messages en attente), on alerte.
//
// Accès DB en service-role (pas de session). Répond TOUJOURS 200 (sauf secret invalide)
// pour que la sonde de vie externe reste fiable. Best-effort partout : ne throw jamais.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  sendTelegram,
  sendTelegramAvecId,
  getWebhookInfo,
  nomContact,
  echapperHtml,
} from '@/lib/notify'
import { formaterOuverture, formaterRelanceClient, clavierTicket } from '@/lib/ticket-telegram'
import { reportError } from '@/lib/monitoring'
import type { TicketContexte } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DEUX_HEURES_MS = 2 * 60 * 60 * 1000

// Heure courante à Paris (0–23), robuste aux fuseaux/DST.
function heureParis(now: Date): number {
  const p = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const h = p.find((x) => x.type === 'hour')?.value ?? '0'
  const n = parseInt(h, 10)
  return Number.isFinite(n) ? n % 24 : 0
}

export async function GET(request: NextRequest) {
  // Fail-closed : on EXIGE RELANCES_SECRET (header Bearer OU ?key=). Le cron externe
  // (cron-job.org) doit l'envoyer ; sans secret configuré, on refuse tout accès.
  const secret = process.env.RELANCES_SECRET?.trim()
  const bearer = !!secret && request.headers.get('authorization') === `Bearer ${secret}`
  const query = !!secret && request.nextUrl.searchParams.get('key') === secret
  if (!secret || (!bearer && !query)) {
    return NextResponse.json({ ok: false, error: 'non_autorise' }, { status: 401 })
  }

  const now = new Date()
  const heure = heureParis(now)

  // Fenêtre de travail 8h→20h : la nuit, on confirme juste qu'on est en vie (la sonde
  // externe voit un 200) mais on n'envoie NI relance NI alerte (Hendrix ne sollicite
  // pas la nuit ; une panne vue à 8h ne fait rien perdre).
  if (heure < 8 || heure >= 20) {
    return NextResponse.json({ ok: true, skipped: 'hors-horaires', heure })
  }

  const admin = createAdminClient()
  const resume: Record<string, unknown> = { heure }

  // ---- 1) RELANCES ----
  try {
    resume.relances = await envoyerRelances(admin, now)
  } catch (e) {
    await reportError('Relances — envoi', e)
  }

  // ---- 2) WATCHDOG A : notifs Telegram ratées (demandes jamais arrivées à Julien) ----
  try {
    resume.notifs_rattrapees = await rattraperNotifsRatees(admin, now)
  } catch (e) {
    await reportError('Watchdog — notifs ratées', e)
  }

  // ---- 3) WATCHDOG B : santé du webhook Telegram ----
  try {
    resume.webhook = await surveillerWebhook(now)
  } catch (e) {
    await reportError('Watchdog — webhook', e)
  }

  return NextResponse.json({ ok: true, ...resume })
}

// --- 1) Relances : fils ouverts, non pris, en attente d'une réponse depuis > 2h ---
async function envoyerRelances(
  admin: ReturnType<typeof createAdminClient>,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - DEUX_HEURES_MS).toISOString()
  // Candidats : non résolus, NON pris (sinon = quelqu'un s'en occupe), inactifs > 2h.
  const { data: candidats } = await admin
    .from('tickets')
    .select('id, titre, message, derniere_relance_le, relances_envoyees')
    .neq('statut', 'resolu')
    .is('pris_par', null)
    .lt('derniere_activite_le', cutoff)
    .order('derniere_activite_le', { ascending: true })
    .limit(20)

  let envoyees = 0
  for (const t of candidats ?? []) {
    // Throttle : au plus une relance toutes les 2h.
    if (t.derniere_relance_le && new Date(t.derniere_relance_le).getTime() > now.getTime() - DEUX_HEURES_MS) {
      continue
    }
    // On ne relance QUE si la balle est dans le camp de Julien (dernier message = Hendrix).
    const { data: dernier } = await admin
      .from('ticket_messages')
      .select('auteur')
      .eq('ticket_id', t.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (dernier?.auteur !== 'client') continue

    // On relie la relance au message d'origine (thread) si on le retrouve.
    const { data: ouverture } = await admin
      .from('ticket_messages')
      .select('telegram_message_id')
      .eq('ticket_id', t.id)
      .not('telegram_message_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const titre = (t.titre as string | null)?.trim() || null
    const texte =
      `⏰ <b>Relance</b> — la demande de ${echapperHtml(nomContact())} attend une réponse depuis plus de 2h ` +
      `et personne ne l'a encore prise.\n` +
      formaterRelanceClient(titre, (t.message as string) || '')
    await sendTelegramAvecId(
      texte,
      (ouverture?.telegram_message_id as number | undefined) ?? undefined,
      clavierTicket(t.id), // boutons pour la prendre/clore directement depuis la relance
    )
    await admin
      .from('tickets')
      .update({
        relances_envoyees: ((t.relances_envoyees as number) || 0) + 1,
        derniere_relance_le: now.toISOString(),
      })
      .eq('id', t.id)
    envoyees++
  }
  return envoyees
}

// --- 2) Watchdog A : la notif d'ouverture n'a jamais atteint Julien (message_id null) ---
async function rattraperNotifsRatees(
  admin: ReturnType<typeof createAdminClient>,
  now: Date,
): Promise<number> {
  const depuis = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  // 1er message d'un fil (auteur = client) SANS telegram_message_id = notif ratée.
  const { data: ratees } = await admin
    .from('ticket_messages')
    .select('id, ticket_id, texte')
    .eq('auteur', 'client')
    .is('telegram_message_id', null)
    .gte('created_at', depuis)
    .order('created_at', { ascending: true })
    .limit(10)

  let rattrapees = 0
  for (const m of ratees ?? []) {
    const { data: t } = await admin
      .from('tickets')
      .select('id, titre, message, contexte')
      .eq('id', m.ticket_id)
      .maybeSingle()
    if (!t) continue
    const titre = (t.titre as string | null)?.trim() || null
    const contexte = (t.contexte as TicketContexte) || {}
    // On retente la notif, avec un préfixe pour signaler le rattrapage.
    const messageId = await sendTelegramAvecId(
      `🔁 <i>(rattrapage — cette demande n'était pas passée)</i>\n` +
        formaterOuverture(titre, (t.message as string) || (m.texte as string) || '', contexte),
      undefined,
      clavierTicket(t.id),
    )
    if (messageId !== null) {
      // On patche le message d'ouverture pour que les réponses de Julien matchent ce fil.
      await admin.from('ticket_messages').update({ telegram_message_id: messageId }).eq('id', m.id)
      rattrapees++
    }
  }
  return rattrapees
}

// --- 3) Watchdog B : Telegram n'arrive plus à livrer au webhook ? ---
async function surveillerWebhook(now: Date): Promise<string> {
  const info = await getWebhookInfo()
  if (!info) return 'inconnu'

  const erreurRecente =
    typeof info.last_error_date === 'number' &&
    now.getTime() / 1000 - info.last_error_date < 90 * 60 // erreur dans les 90 dernières min
  const filEngorge = info.pending_update_count > 10

  if (erreurRecente || filEngorge) {
    const name = process.env.DEPLOYMENT_NAME || 'MTC37'
    const lignes = [
      `🚨 <b>${echapperHtml(name)}</b> — le canal des demandes d'${echapperHtml(nomContact())} est PERTURBÉ`,
      filEngorge ? `📨 ${info.pending_update_count} message(s) en attente de livraison` : '',
      erreurRecente && info.last_error_message
        ? `💬 Dernière erreur Telegram : ${echapperHtml(info.last_error_message)}`
        : '',
      `🔧 À vérifier : le webhook est-il toujours configuré ? (setWebhook), Vercel est-il en ligne, le secret est-il bon ?`,
      `ℹ️ Tant que ce n'est pas réglé, certaines demandes peuvent ne pas remonter.`,
    ].filter(Boolean)
    await sendTelegram(lignes.join('\n'))
    return 'ALERTE'
  }
  return 'ok'
}
